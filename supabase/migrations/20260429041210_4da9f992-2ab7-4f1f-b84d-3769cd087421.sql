CREATE OR REPLACE FUNCTION public.create_print_job_for_order(
    p_order_id uuid,
    p_source text,
    p_reason text DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
    v_job_id uuid;
    v_tenant_id uuid;
    v_restaurant_id uuid;
    v_payload jsonb;
    v_payload_hash text;
BEGIN
    -- Obter metadados do pedido e do restaurante
    SELECT 
        o.tenant_id, 
        o.restaurant_id,
        jsonb_build_object(
            'order_id', o.id,
            'customer_name', o.customer_name,
            'customer_phone', o.customer_phone,
            'order_type', o.order_type,
            'items', (
                SELECT jsonb_agg(jsonb_build_object(
                    'name', p.name,
                    'quantity', oi.quantity,
                    'unit_price', oi.unit_price_cents,
                    'total_price', oi.total_price_cents,
                    'note', oi.note
                ))
                FROM order_items oi
                JOIN products p ON p.id = oi.product_id
                WHERE oi.order_id = o.id
            ),
            'total_cents', o.total_cents,
            'delivery_fee', o.delivery_fee_cents,
            'address', o.address,
            'notes', o.notes,
            'created_at', o.created_at,
            'reason', p_reason
        )
    INTO v_tenant_id, v_restaurant_id, v_payload
    FROM orders o
    WHERE o.id = p_order_id;

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Pedido não encontrado';
    END IF;

    -- Gerar hash do payload para evitar duplicidade automática
    v_payload_hash := encode(digest(v_payload::text::bytea, 'sha256'::text), 'hex');

    INSERT INTO public.print_jobs (
        tenant_id,
        restaurant_id,
        order_id,
        source,
        payload,
        payload_hash,
        status
    ) VALUES (
        v_tenant_id,
        v_restaurant_id,
        p_order_id,
        p_source,
        v_payload,
        v_payload_hash,
        'pending'
    )
    RETURNING id INTO v_job_id;

    RETURN v_job_id;
EXCEPTION 
    WHEN unique_violation THEN
        SELECT id INTO v_job_id 
        FROM public.print_jobs 
        WHERE order_id = p_order_id 
          AND payload_hash = v_payload_hash 
          AND source = 'auto' 
          AND status = 'pending'
        LIMIT 1;
        
        RETURN v_job_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;