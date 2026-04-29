CREATE OR REPLACE FUNCTION public.create_print_job_for_order(
    p_order_id UUID, 
    p_source TEXT, 
    p_reason TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order RECORD;
    v_restaurant RECORD;
    v_items JSONB;
    v_payload JSONB;
    v_payload_hash TEXT;
    v_job_id UUID;
BEGIN
    -- Buscar metadados básicos
    SELECT r.id, r.tenant_id, r.name INTO v_restaurant
    FROM public.restaurants r
    JOIN public.orders o ON o.restaurant_id = r.id
    WHERE o.id = p_order_id;

    IF v_restaurant.id IS NULL THEN
        RAISE EXCEPTION 'Restaurante não encontrado para o pedido %', p_order_id;
    END IF;

    -- Verificação de Permissão:
    -- - Bypass se for service_role
    -- - Bypass se for auto E auth.uid() is null (gatilho de sistema)
    -- - Caso contrário, exige ser membro
    IF auth.role() != 'service_role' THEN
        IF p_source != 'auto' OR auth.uid() IS NOT NULL THEN
            IF NOT EXISTS (
                SELECT 1 FROM public.restaurant_members
                WHERE restaurant_id = v_restaurant.id
                AND user_id = auth.uid()
            ) THEN
                RAISE EXCEPTION 'Não autorizado a criar job de impressão para este restaurante';
            END IF;
        END IF;
    END IF;

    -- Buscar detalhes do pedido
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;

    -- Buscar itens
    SELECT jsonb_agg(jsonb_build_object(
        'product_name', p.name,
        'quantity', oi.quantity,
        'unit_price', oi.unit_price_cents,
        'total_price', oi.total_price_cents,
        'note', oi.note
    )) INTO v_items
    FROM public.order_items oi
    JOIN public.products p ON p.id = oi.product_id
    WHERE oi.order_id = p_order_id;

    -- Montar Payload
    v_payload := jsonb_build_object(
        'fingerprint', jsonb_build_object(
            'APP_BUILD', '1.0.0',
            'PRINT_ENGINE', 'lovable-v1',
            'PRINT_PATH', '/print/order',
            'ORDER', p_order_id,
            'SERVICE', 'checkout-print',
            'SOURCE', p_source,
            'TIMESTAMP', now()
        ),
        'restaurant', jsonb_build_object(
            'id', v_restaurant.id,
            'name', v_restaurant.name
        ),
        'order', jsonb_build_object(
            'id', v_order.id,
            'customer_name', v_order.customer_name,
            'customer_phone', v_order.customer_phone,
            'order_type', v_order.order_type,
            'address', v_order.address,
            'payment_method', v_order.payment_method,
            'notes', v_order.notes,
            'total_cents', v_order.total_cents,
            'created_at', v_order.created_at,
            'status', v_order.status
        ),
        'items', v_items,
        'reprint_reason', p_reason
    );

    v_payload_hash := md5(v_payload::text);

    INSERT INTO public.print_jobs (
        tenant_id, restaurant_id, order_id, status, source, payload, payload_hash
    ) VALUES (
        v_order.tenant_id, v_order.restaurant_id, p_order_id, 'pending', p_source, v_payload, v_payload_hash
    )
    ON CONFLICT (order_id, payload_hash) WHERE (source = 'auto' AND status = 'pending')
    DO UPDATE SET status = 'pending'
    RETURNING id INTO v_job_id;

    IF v_job_id IS NULL THEN
        SELECT id INTO v_job_id FROM public.print_jobs 
        WHERE order_id = p_order_id AND payload_hash = v_payload_hash AND source = 'auto' AND status = 'pending' LIMIT 1;
    END IF;

    RETURN v_job_id;
END;
$$;
