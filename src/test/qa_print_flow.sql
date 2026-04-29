
-- QA Test Script for Printing Flow
DO $$
DECLARE
    v_tenant_id uuid;
    v_restaurant_id uuid;
    v_owner_id uuid;
    v_order1_id uuid;
    v_order2_id uuid;
    v_job1_id uuid;
    v_job2_id uuid;
    v_reprint_job_id uuid;
    v_idempotency_key1 text := 'qa-print-1-' || extract(epoch from now());
    v_idempotency_key2 text := 'qa-print-2-' || extract(epoch from now());
BEGIN
    -- 0. Setup
    SELECT id INTO v_tenant_id FROM tenants LIMIT 1;
    
    INSERT INTO restaurants (tenant_id, name, slug) 
    VALUES (v_tenant_id, 'QA Restaurant', 'qa-res-' || extract(epoch from now()))
    RETURNING id INTO v_restaurant_id;

    -- Create an owner user (simulated)
    v_owner_id := gen_random_uuid();
    INSERT INTO restaurant_members (restaurant_id, user_id, role)
    VALUES (v_restaurant_id, v_owner_id, 'owner');

    RAISE NOTICE '--- INICIANDO QA FLUXO FELIZ ---';

    -- 1. Criar pedido pelo checkout (status new)
    -- Simulamos o checkout público (auth.uid() is null)
    INSERT INTO orders (tenant_id, restaurant_id, customer_name, customer_phone, order_type, total_cents, idempotency_key, status)
    VALUES (v_tenant_id, v_restaurant_id, 'Customer QA', '11999999999', 'pickup', 1500, v_idempotency_key1, 'new')
    RETURNING id INTO v_order1_id;

    -- 2. Confirmar que aparece em /pedidos e NÃO tem print_job (ainda em 'new')
    IF EXISTS (SELECT 1 FROM print_jobs WHERE order_id = v_order1_id) THEN
        RAISE EXCEPTION 'ERRO: print_job criado prematuramente para pedido em status NEW';
    END IF;
    RAISE NOTICE 'Passo 1-2: Pedido criado em status NEW, sem print_job automático. OK.';

    -- 3. Mudar status para preparing (como owner)
    -- Simulamos o login do owner
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner_id)::text, true);
    
    UPDATE orders SET status = 'preparing' WHERE id = v_order1_id;

    -- 4. Confirmar que foi criado exatamente 1 print_job
    SELECT id INTO v_job1_id FROM print_jobs WHERE order_id = v_order1_id;
    IF v_job1_id IS NULL THEN
        RAISE EXCEPTION 'ERRO: print_job não foi criado ao mudar para status PREPARING';
    END IF;
    
    IF (SELECT count(*) FROM print_jobs WHERE order_id = v_order1_id) > 1 THEN
        RAISE EXCEPTION 'ERRO: Mais de um print_job criado para o mesmo pedido';
    END IF;
    RAISE NOTICE 'Passo 3-4: Status para PREPARING gerou exatamente 1 print_job. OK.';

    -- 5-8. Simular Agent (Claim -> Success)
    PERFORM public.claim_print_job(v_job1_id, 'agent-qa-1');
    IF (SELECT status FROM print_jobs WHERE id = v_job1_id) != 'printing' THEN
        RAISE EXCEPTION 'ERRO: Falha ao capturar (claim) o job';
    END IF;

    PERFORM public.complete_print_job(v_job1_id, 'agent-qa-1');
    
    -- 9. Confirmar estados finais
    IF (SELECT status FROM print_jobs WHERE id = v_job1_id) != 'printed' THEN
        RAISE EXCEPTION 'ERRO: Job status não é PRINTED';
    END IF;
    
    -- Nota: v_order.print_status deve ser atualizado pelo agente na vida real, 
    -- mas o contrato exige que validemos print_jobs.status.
    
    RAISE NOTICE 'Passo 5-9: Fluxo feliz (Capture -> Success) concluído. OK.';

    RAISE NOTICE '--- INICIANDO QA FLUXO COM FALHA ---';

    -- 10. Repetir com simulação de falha
    INSERT INTO orders (tenant_id, restaurant_id, customer_name, customer_phone, order_type, total_cents, idempotency_key, status)
    VALUES (v_tenant_id, v_restaurant_id, 'Customer Fail QA', '11888888888', 'delivery', 2500, v_idempotency_key2, 'preparing')
    RETURNING id INTO v_order2_id;

    SELECT id INTO v_job2_id FROM print_jobs WHERE order_id = v_order2_id AND source = 'auto';
    
    PERFORM public.claim_print_job(v_job2_id, 'agent-qa-1');
    PERFORM public.fail_print_job(v_job2_id, 'agent-qa-1', 'Out of paper');

    IF (SELECT status FROM print_jobs WHERE id = v_job2_id) != 'failed' THEN
        RAISE EXCEPTION 'ERRO: Job status não é FAILED';
    END IF;

    -- Verificar que NÃO há retry automático (não deve existir outro pending job)
    IF EXISTS (SELECT 1 FROM print_jobs WHERE order_id = v_order2_id AND status = 'pending') THEN
        RAISE EXCEPTION 'ERRO: Retry automático detectado (não permitido)';
    END IF;
    RAISE NOTICE 'Passo 10: Fluxo com falha simulado, sem retry automático. OK.';

    -- 11. Reimprimir Manual (Reprint)
    v_reprint_job_id := public.reprint_order(v_order2_id, 'Reimpressão manual após troca de papel');
    
    IF v_reprint_job_id IS NULL THEN
        RAISE EXCEPTION 'ERRO: Falha ao criar job de reimpressão';
    END IF;

    IF (SELECT source FROM print_jobs WHERE id = v_reprint_job_id) != 'reprint' THEN
        RAISE EXCEPTION 'ERRO: Job de reimpressão não tem source=reprint';
    END IF;

    -- Verificar audit_log
    IF NOT EXISTS (SELECT 1 FROM audit_log WHERE target_id = v_order2_id AND action = 'reprint_order') THEN
        RAISE EXCEPTION 'ERRO: Audit log não registrado para reimpressão';
    END IF;
    RAISE NOTICE 'Passo 11: Reimpressão manual com motivo e auditoria. OK.';

    -- Segurança Final
    RAISE NOTICE '--- VALIDANDO SEGURANÇA (RLS) ---';
    
    -- Reset to anon
    PERFORM set_config('role', 'anon', true);
    PERFORM set_config('request.jwt.claims', '{}', true);

    -- Anônimo não deve ver print_jobs (SELECT empty)
    -- We'll check this via psql count in the next step.
    
    RAISE NOTICE 'QA FINALIZADO COM SUCESSO.';
END $$;
