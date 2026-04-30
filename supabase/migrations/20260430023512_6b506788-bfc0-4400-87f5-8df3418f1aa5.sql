
-- 1. Function to get active orders summary for PDV
CREATE OR REPLACE FUNCTION public.get_active_orders_summary(_restaurant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role text;
    v_result jsonb;
BEGIN
    -- Authorization check
    SELECT role::text INTO v_role FROM restaurant_members WHERE restaurant_id = _restaurant_id AND user_id = auth.uid();
    IF v_role NOT IN ('cashier', 'manager', 'owner') THEN
        RAISE EXCEPTION 'Não autorizado.';
    END IF;

    SELECT jsonb_build_object(
        'tables', (
            SELECT jsonb_agg(jsonb_build_object(
                'id', dt.id,
                'name', dt.name,
                'area', dt.area,
                'status', CASE WHEN o.id IS NOT NULL THEN 'occupied' ELSE 'free' END,
                'order_id', o.id,
                'total_cents', o.total_cents,
                'opened_at', o.created_at
            ) ORDER BY dt.sort_order)
            FROM dining_tables dt
            LEFT JOIN orders o ON dt.id = o.table_id AND o.payment_status = 'open' AND o.status != 'cancelled'
            WHERE dt.restaurant_id = _restaurant_id AND dt.active = true
        ),
        'counter_orders', (
            SELECT jsonb_agg(jsonb_build_object(
                'id', o.id,
                'customer_name', o.customer_name,
                'total_cents', o.total_cents,
                'opened_at', o.created_at,
                'status', o.status
            ) ORDER BY o.created_at DESC)
            FROM orders o
            WHERE o.restaurant_id = _restaurant_id 
            AND o.service_mode = 'counter' 
            AND o.payment_status = 'open' 
            AND o.status != 'cancelled'
        ),
        'delivery_orders', (
            SELECT jsonb_agg(jsonb_build_object(
                'id', o.id,
                'customer_name', o.customer_name,
                'total_cents', o.total_cents,
                'opened_at', o.created_at,
                'status', o.status
            ) ORDER BY o.created_at DESC)
            FROM orders o
            WHERE o.restaurant_id = _restaurant_id 
            AND o.service_mode = 'delivery' 
            AND o.payment_status = 'open' 
            AND o.status != 'cancelled'
        )
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- 2. Function to request account print (pre-bill)
CREATE OR REPLACE FUNCTION public.request_account_print(_order_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_restaurant_id uuid;
    v_tenant_id uuid;
    v_print_job_id uuid;
BEGIN
    SELECT restaurant_id, tenant_id INTO v_restaurant_id, v_tenant_id FROM public.orders WHERE id = _order_id;
    IF v_restaurant_id IS NULL THEN RAISE EXCEPTION 'Pedido não encontrado.'; END IF;

    IF NOT public.check_restaurant_role(v_restaurant_id, ARRAY['cashier', 'manager', 'owner']) THEN
        RAISE EXCEPTION 'Não autorizado.';
    END IF;

    INSERT INTO public.print_jobs (
        restaurant_id, tenant_id, order_id, type, status, content
    ) VALUES (
        v_restaurant_id, v_tenant_id, _order_id, 'account', 'pending', 
        jsonb_build_object('requested_at', now(), 'requested_by', auth.uid())
    ) RETURNING id INTO v_print_job_id;

    RETURN v_print_job_id;
END;
$$;

-- 3. Security Grants
REVOKE EXECUTE ON FUNCTION public.get_active_orders_summary(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.request_account_print(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_active_orders_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_account_print(uuid) TO authenticated;

-- Ensure previous RPCs are also blocked for anon (Double check)
REVOKE EXECUTE ON FUNCTION public.open_table_order(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_counter_order(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.add_items_to_order(uuid, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.send_order_to_kitchen(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.cancel_order_item(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.close_order(uuid, public.payment_method) FROM anon;
