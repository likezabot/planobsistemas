-- Fix: payload_hash for 'auto' source must be stable (no timestamp), so the unique
-- index (order_id, payload_hash) WHERE source='auto' AND status='pending' actually
-- deduplicates as intended. Manual/reprint keep volatile hash so they always create
-- a new job.

CREATE OR REPLACE FUNCTION public.create_print_job_for_order(p_order_id uuid, p_source text, p_reason text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_order RECORD;
    v_restaurant RECORD;
    v_items JSONB;
    v_payload JSONB;
    v_payload_hash TEXT;
    v_job_id UUID;
BEGIN
    SELECT r.id, r.tenant_id, r.name INTO v_restaurant
    FROM public.restaurants r
    JOIN public.orders o ON o.restaurant_id = r.id
    WHERE o.id = p_order_id;

    IF v_restaurant.id IS NULL THEN
        RAISE EXCEPTION 'Restaurante não encontrado para o pedido %', p_order_id;
    END IF;

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

    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;

    SELECT jsonb_agg(jsonb_build_object(
        'product_name', p.name,
        'quantity', oi.quantity,
        'unit_price', oi.unit_price_cents,
        'total_price', oi.total_price_cents,
        'note', oi.note,
        'customization', oi.customization
    )) INTO v_items
    FROM public.order_items oi
    JOIN public.products p ON p.id = oi.product_id
    WHERE oi.order_id = p_order_id;

    v_payload := jsonb_build_object(
        'fingerprint', jsonb_build_object(
            'APP_BUILD', '1.1.0',
            'PRINT_ENGINE', 'lovable-v1',
            'ORDER', p_order_id,
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
            'created_at', v_order.created_at
        ),
        'items', v_items,
        'reprint_reason', p_reason
    );

    -- STABLE hash for 'auto': based only on order content, not timestamp.
    -- This ensures the unique partial index dedupes pending auto jobs.
    -- Manual/reprint use volatile hash so they always create a new row.
    IF p_source = 'auto' THEN
        v_payload_hash := md5(
            'auto:' || p_order_id::text || ':' ||
            COALESCE(v_items::text, '[]') || ':' ||
            COALESCE(v_order.total_cents::text, '0') || ':' ||
            COALESCE(v_order.notes, '') || ':' ||
            COALESCE(v_order.address, '')
        );
    ELSE
        v_payload_hash := md5(v_payload::text || ':' || clock_timestamp()::text || ':' || gen_random_uuid()::text);
    END IF;

    -- For auto: try to find existing pending job first (idempotent).
    IF p_source = 'auto' THEN
        SELECT id INTO v_job_id
        FROM public.print_jobs
        WHERE order_id = p_order_id
          AND payload_hash = v_payload_hash
          AND source = 'auto'
          AND status = 'pending'
        LIMIT 1;

        IF v_job_id IS NOT NULL THEN
            RETURN v_job_id;
        END IF;
    END IF;

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
        WHERE order_id = p_order_id AND payload_hash = v_payload_hash AND source = 'auto' AND status = 'pending'
        LIMIT 1;
    END IF;

    RETURN v_job_id;
END;
$function$;