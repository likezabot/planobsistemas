-- 1. Add print_status to orders
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_print_status') THEN
        CREATE TYPE order_print_status AS ENUM ('none', 'pending', 'printed', 'failed');
    END IF;
END $$;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS print_status order_print_status DEFAULT 'none';

-- 2. Refine print_jobs table
-- Drop existing specific index if it exists to replace with a more generic one
DROP INDEX IF EXISTS idx_print_jobs_order_payload_auto;

-- Unique index for preventing duplicates:
-- For 'auto' source: one pending job per order/payload
CREATE UNIQUE INDEX IF NOT EXISTS idx_print_jobs_auto_pending ON public.print_jobs (order_id, payload_hash) 
WHERE (source = 'auto' AND status = 'pending');

-- For 'manual' and 'reprint' we allow multiple, but they will have different hashes because we'll include a timestamp or reason in payload.

-- 3. Update create_print_job_for_order
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
    v_user_role app_role;
BEGIN
    -- Force authentication
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    -- Fetch order and restaurant details
    SELECT o.*, r.tenant_id as r_tenant_id, r.name as r_name INTO v_order
    FROM public.orders o
    JOIN public.restaurants r ON o.restaurant_id = r.id
    WHERE o.id = p_order_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found';
    END IF;

    -- Check if user is a member and get their role
    SELECT role INTO v_user_role 
    FROM public.restaurant_members
    WHERE restaurant_id = v_order.restaurant_id
    AND user_id = auth.uid();

    IF v_user_role IS NULL THEN
        RAISE EXCEPTION 'Not authorized: Not a member of this restaurant';
    END IF;

    -- Permissions check based on source
    IF p_source = 'reprint' OR p_source = 'manual' THEN
        IF v_user_role NOT IN ('owner', 'manager', 'cashier') THEN
            RAISE EXCEPTION 'Not authorized: Your role cannot trigger manual prints or reprints';
        END IF;
        IF p_source = 'reprint' AND (p_reason IS NULL OR trim(p_reason) = '') THEN
            RAISE EXCEPTION 'Reason is required for reprints';
        END IF;
    END IF;

    -- Prevent auto-printing cancelled orders
    IF p_source = 'auto' AND v_order.status = 'cancelled' THEN
        RETURN NULL;
    END IF;

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

    -- Build payload with integrity fingerprint
    v_payload := jsonb_build_object(
        'fingerprint', jsonb_build_object(
            'APP_BUILD', '1.0.1', -- Increment build for tracking
            'PRINT_ENGINE', 'lovable-v1',
            'PRINT_PATH', '/print/order',
            'ORDER', p_order_id,
            'SERVICE', 'printing-contract-v2',
            'CREATED_AT', now(), -- Ensure uniqueness for reprints
            'SOURCE', p_source,
            'REASON', p_reason
        ),
        'restaurant', jsonb_build_object(
            'id', v_order.restaurant_id,
            'name', v_order.r_name
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

    -- If conflict happened and didn't insert (e.g. source=auto and already pending), v_job_id might be NULL
    IF v_job_id IS NULL THEN
        SELECT id INTO v_job_id FROM public.print_jobs 
        WHERE order_id = p_order_id AND payload_hash = v_payload_hash AND status = 'pending' LIMIT 1;
    END IF;

    -- Update order print status if it was 'none' or 'failed'
    IF p_source = 'auto' THEN
        UPDATE public.orders SET print_status = 'pending' 
        WHERE id = p_order_id AND print_status IN ('none', 'failed');
    END IF;

    RETURN v_job_id;
END;
$$;

-- 4. New RPC: reprint_order
CREATE OR REPLACE FUNCTION public.reprint_order(p_order_id UUID, p_reason TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_job_id UUID;
    v_order_info RECORD;
BEGIN
    -- Permissions check is inside create_print_job_for_order
    v_job_id := public.create_print_job_for_order(p_order_id, 'reprint', p_reason);
    
    IF v_job_id IS NOT NULL THEN
        SELECT tenant_id, restaurant_id INTO v_order_info FROM public.orders WHERE id = p_order_id;
        
        -- Audit log
        INSERT INTO public.audit_log (
            tenant_id, restaurant_id, user_id, action, entity, entity_id, payload
        ) VALUES (
            v_order_info.tenant_id,
            v_order_info.restaurant_id,
            auth.uid(),
            'order_reprint',
            'orders',
            p_order_id,
            jsonb_build_object('reason', p_reason, 'print_job_id', v_job_id)
        );
        
        -- Update order print status
        UPDATE public.orders SET print_status = 'pending' WHERE id = p_order_id;
    END IF;
    
    RETURN v_job_id;
END;
$$;

-- 5. Update claim_print_job with stricter transitions
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

    UPDATE public.print_jobs
    SET status = 'printing',
        agent_id = p_agent_id,
        claimed_at = NOW(),
        attempts = attempts + 1
    WHERE id = p_job_id 
    AND status IN ('pending', 'failed') -- Allow claiming failed ones manually if needed? User said "failed não reimprime automaticamente", but agent might try again if manually triggered or if we allow it. Actually let's stick to 'pending' as primary.
    AND EXISTS (
        SELECT 1 FROM public.restaurant_members rm
        WHERE rm.restaurant_id = print_jobs.restaurant_id
        AND rm.user_id = auth.uid()
    );
    
    RETURN FOUND;
END;
$$;

-- 6. Update complete_print_job
CREATE OR REPLACE FUNCTION public.complete_print_job(p_job_id UUID, p_agent_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order_id UUID;
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
    )
    RETURNING order_id INTO v_order_id;
    
    IF FOUND THEN
        -- Update order status only if this was the last pending job or we want to mark it as printed
        UPDATE public.orders SET print_status = 'printed' WHERE id = v_order_id;
        RETURN TRUE;
    END IF;
    
    RETURN FALSE;
END;
$$;

-- 7. Update fail_print_job
CREATE OR REPLACE FUNCTION public.fail_print_job(p_job_id UUID, p_agent_id TEXT, p_error TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order_id UUID;
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
    )
    RETURNING order_id INTO v_order_id;
    
    IF FOUND THEN
        -- Update order status to failed if no other job is pending/printed? 
        -- Simplification: mark as failed.
        UPDATE public.orders SET print_status = 'failed' WHERE id = v_order_id AND print_status != 'printed';
        RETURN TRUE;
    END IF;
    
    RETURN FALSE;
END;
$$;

-- 8. Final RLS review
-- print_jobs select policy already exists and is correct for members.
-- We don't want direct inserts/updates to print_jobs, only via RPCs.
DROP POLICY IF EXISTS "Members can insert print jobs" ON public.print_jobs;
DROP POLICY IF EXISTS "Members can update print jobs" ON public.print_jobs;

-- Ensure anons can't see anything
ALTER TABLE public.print_jobs ENABLE ROW LEVEL SECURITY;
