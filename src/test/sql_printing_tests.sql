
-- TEST SUITE FOR PRINTING CONTRACT
DO $$
DECLARE
    v_tenant_id UUID;
    v_restaurant_id UUID;
    v_restaurant_b_id UUID;
    v_user_manager UUID := '00000000-0000-0000-0000-000000000001';
    v_user_waiter UUID := '00000000-0000-0000-0000-000000000002';
    v_user_other UUID := '00000000-0000-0000-0000-000000000003';
    v_order_id UUID;
    v_job_id UUID;
    v_job_id_2 UUID;
    v_res BOOLEAN;
BEGIN
    -- 1. Setup
    INSERT INTO tenants (name) VALUES ('Test Tenant') RETURNING id INTO v_tenant_id;
    INSERT INTO restaurants (tenant_id, name, slug) VALUES (v_tenant_id, 'Rest A', 'rest-a') RETURNING id INTO v_restaurant_id;
    INSERT INTO restaurants (tenant_id, name, slug) VALUES (v_tenant_id, 'Rest B', 'rest-b') RETURNING id INTO v_restaurant_b_id;
    
    -- Mock members (using actual IDs or gen_random_uuid())
    -- We'll use gen_random_uuid() for users to avoid conflicts but we need to set them in auth.uid()
    v_user_manager := gen_random_uuid();
    v_user_waiter := gen_random_uuid();
    v_user_other := gen_random_uuid();
    
    INSERT INTO restaurant_members (tenant_id, restaurant_id, user_id, role) VALUES 
    (v_tenant_id, v_restaurant_id, v_user_manager, 'manager'),
    (v_tenant_id, v_restaurant_id, v_user_waiter, 'waiter'),
    (v_tenant_id, v_restaurant_b_id, v_user_other, 'owner');

    -- Create an order
    INSERT INTO orders (tenant_id, restaurant_id, customer_name, customer_phone, order_type, idempotency_key, total_cents)
    VALUES (v_tenant_id, v_restaurant_id, 'Test Client', '123', 'pickup', 'idemp-1', 1000)
    RETURNING id INTO v_order_id;
    
    INSERT INTO order_items (order_id, product_id, quantity, unit_price_cents, total_price_cents)
    SELECT v_order_id, id, 1, price_cents, price_cents FROM products WHERE restaurant_id = v_restaurant_id LIMIT 1;

    -- 2. Test Duplicity (Auto)
    -- Set auth context to manager
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_manager::text)::text, true);
    
    v_job_id := create_print_job_for_order(v_order_id, 'auto');
    v_job_id_2 := create_print_job_for_order(v_order_id, 'auto');
    
    IF v_job_id != v_job_id_2 THEN
        RAISE EXCEPTION 'Test Failed: Duplicity check failed, expected same Job ID but got % and %', v_job_id, v_job_id_2;
    END IF;
    
    -- 3. Test Permissions (Waiter Reprint)
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_waiter::text)::text, true);
    BEGIN
        PERFORM reprint_order(v_order_id, 'Because I want');
        RAISE EXCEPTION 'Test Failed: Waiter should not be able to reprint';
    EXCEPTION WHEN OTHERS THEN
        -- Expected
    END;

    -- 4. Test Reprint (Manager)
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_manager::text)::text, true);
    v_job_id_2 := reprint_order(v_order_id, 'Paper jammed');
    
    IF v_job_id = v_job_id_2 THEN
        RAISE EXCEPTION 'Test Failed: Reprint should create a NEW job ID, but got same %', v_job_id;
    END IF;
    
    -- Verify audit log
    IF NOT EXISTS (SELECT 1 FROM audit_log WHERE action = 'order_reprint' AND entity_id = v_order_id) THEN
        RAISE EXCEPTION 'Test Failed: Audit log not created for reprint';
    END IF;

    -- 5. Test Agent Mismatch
    v_res := claim_print_job(v_job_id_2, 'agent-1');
    IF NOT v_res THEN RAISE EXCEPTION 'Test Failed: Manager should be able to claim job'; END IF;
    
    v_res := complete_print_job(v_job_id_2, 'agent-2'); -- Wrong agent
    IF v_res THEN RAISE EXCEPTION 'Test Failed: Should NOT complete job with wrong agent_id'; END IF;

    -- 6. Test Cross-Restaurant
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_other::text)::text, true);
    v_res := claim_print_job(v_job_id, 'agent-other');
    IF v_res THEN RAISE EXCEPTION 'Test Failed: Member of Rest B should NOT claim job of Rest A'; END IF;

    -- 7. Test Cancelled Order Auto-Print
    UPDATE orders SET status = 'cancelled' WHERE id = v_order_id;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_manager::text)::text, true);
    
    -- Create a new order that is already cancelled or just test current one
    -- Re-triggering auto for cancelled should return null
    v_job_id := create_print_job_for_order(v_order_id, 'auto');
    IF v_job_id IS NOT NULL THEN
        RAISE EXCEPTION 'Test Failed: Cancelled order should NOT generate auto print job';
    END IF;

    RAISE NOTICE 'ALL PRINTING CONTRACT TESTS PASSED';
END $$;
