-- Update create_print_job_for_order to ensure user is authenticated
CREATE OR REPLACE FUNCTION public.create_print_job_for_order(p_order_id UUID, p_source TEXT)
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
    -- Force authentication
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    -- Check if user is a member of the restaurant
    SELECT r.id, r.tenant_id, r.name INTO v_restaurant
    FROM public.restaurants r
    JOIN public.orders o ON o.restaurant_id = r.id
    WHERE o.id = p_order_id;

    IF v_restaurant.id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.restaurant_members
        WHERE restaurant_id = v_restaurant.id
        AND user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;

    -- Fetch order details
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;

    -- Fetch items with product names
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

    -- Build payload
    v_payload := jsonb_build_object(
        'fingerprint', jsonb_build_object(
            'APP_BUILD', '1.0.0',
            'PRINT_ENGINE', 'lovable-v1',
            'PRINT_PATH', '/print/order',
            'ORDER', p_order_id,
            'SERVICE', 'checkout-print'
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
        'items', v_items
    );

    v_payload_hash := md5(v_payload::text);

    INSERT INTO public.print_jobs (
        tenant_id, restaurant_id, order_id, status, source, payload, payload_hash
    ) VALUES (
        v_order.tenant_id, v_order.restaurant_id, p_order_id, 'pending', p_source, v_payload, v_payload_hash
    )
    ON CONFLICT (order_id, payload_hash) WHERE (source = 'auto' AND status = 'pending')
    DO UPDATE SET status = 'pending' WHERE print_jobs.status = 'failed'
    RETURNING id INTO v_job_id;

    IF v_job_id IS NULL THEN
        SELECT id INTO v_job_id FROM public.print_jobs 
        WHERE order_id = p_order_id AND payload_hash = v_payload_hash AND status = 'pending' LIMIT 1;
    END IF;

    RETURN v_job_id;
END;
$$;

-- RPC: claim_print_job with auth check
CREATE OR REPLACE FUNCTION public.claim_print_job(p_job_id UUID, p_agent_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    -- Ensure member can only claim jobs for their restaurant
    UPDATE public.print_jobs
    SET status = 'printing',
        agent_id = p_agent_id,
        claimed_at = NOW(),
        attempts = attempts + 1
    WHERE id = p_job_id 
    AND status = 'pending'
    AND EXISTS (
        SELECT 1 FROM public.restaurant_members rm
        WHERE rm.restaurant_id = print_jobs.restaurant_id
        AND rm.user_id = auth.uid()
    );
    
    RETURN FOUND;
END;
$$;

-- RPC: complete_print_job with auth check
CREATE OR REPLACE FUNCTION public.complete_print_job(p_job_id UUID, p_agent_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    UPDATE public.print_jobs
    SET status = 'printed',
        printed_at = NOW()
    WHERE id = p_job_id 
    AND status = 'printing'
    AND agent_id = p_agent_id
    AND EXISTS (
        SELECT 1 FROM public.restaurant_members rm
        WHERE rm.restaurant_id = print_jobs.restaurant_id
        AND rm.user_id = auth.uid()
    );
    
    RETURN FOUND;
END;
$$;

-- RPC: fail_print_job with auth check
CREATE OR REPLACE FUNCTION public.fail_print_job(p_job_id UUID, p_agent_id TEXT, p_error TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    UPDATE public.print_jobs
    SET status = 'failed',
        last_error = p_error
    WHERE id = p_job_id 
    AND status = 'printing'
    AND agent_id = p_agent_id
    AND EXISTS (
        SELECT 1 FROM public.restaurant_members rm
        WHERE rm.restaurant_id = print_jobs.restaurant_id
        AND rm.user_id = auth.uid()
    );
    
    RETURN FOUND;
END;
$$;
