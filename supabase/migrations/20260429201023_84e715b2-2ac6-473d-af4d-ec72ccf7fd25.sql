CREATE OR REPLACE FUNCTION public.get_customer_summary(_restaurant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id UUID;
    v_is_authorized BOOLEAN;
    v_result JSONB;
BEGIN
    v_user_id := auth.uid();
    
    -- Auth check: Only owners and managers of THIS restaurant
    SELECT EXISTS (
        SELECT 1 FROM restaurant_members
        WHERE restaurant_id = _restaurant_id 
          AND user_id = v_user_id
          AND role IN ('owner', 'manager')
    ) INTO v_is_authorized;

    IF NOT v_is_authorized THEN
        RAISE EXCEPTION 'Acesso negado.';
    END IF;

    WITH customer_stats AS (
        SELECT 
            regexp_replace(customer_phone, '[^0-9]', '', 'g') as phone,
            MAX(customer_name) as name, -- Simplification: latest alphabetical or just any name
            COUNT(*) as order_count,
            SUM(total_cents) as total_spent_cents,
            MAX(created_at) as last_visit,
            ROUND(AVG(total_cents)) as avg_ticket_cents
        FROM orders
        WHERE restaurant_id = _restaurant_id
          AND status != 'cancelled'
        GROUP BY 1
    ),
    favorite_products AS (
        SELECT DISTINCT ON (phone)
            phone,
            product_name
        FROM (
            SELECT 
                regexp_replace(o.customer_phone, '[^0-9]', '', 'g') as phone,
                p.name as product_name,
                COUNT(*) as qty
            FROM order_items oi
            JOIN products p ON p.id = oi.product_id
            JOIN orders o ON o.id = oi.order_id
            WHERE o.restaurant_id = _restaurant_id AND o.status != 'cancelled'
            GROUP BY 1, 2
            ORDER BY 1, 3 DESC
        ) sub
    ),
    order_histories AS (
        SELECT 
            regexp_replace(customer_phone, '[^0-9]', '', 'g') as phone,
            jsonb_agg(
                jsonb_build_object(
                    'id', id,
                    'created_at', created_at,
                    'total_cents', total_cents,
                    'status', status,
                    'items', (
                        SELECT jsonb_agg(p.name || ' (' || oi.quantity || 'x)')
                        FROM order_items oi
                        JOIN products p ON p.id = oi.product_id
                        WHERE oi.order_id = orders.id
                    )
                ) ORDER BY created_at DESC
            ) as history
        FROM orders
        WHERE restaurant_id = _restaurant_id
        GROUP BY 1
    )
    SELECT jsonb_agg(
        jsonb_build_object(
            'phone', cs.phone,
            'name', cs.name,
            'order_count', cs.order_count,
            'total_spent_cents', cs.total_spent_cents,
            'avg_ticket_cents', cs.avg_ticket_cents,
            'last_visit', cs.last_visit,
            'favorite_product', fp.product_name,
            'history', oh.history
        )
    ) INTO v_result
    FROM customer_stats cs
    LEFT JOIN favorite_products fp ON fp.phone = cs.phone
    LEFT JOIN order_histories oh ON oh.phone = cs.phone;

    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_customer_summary(UUID) FROM public;
REVOKE EXECUTE ON FUNCTION public.get_customer_summary(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_customer_summary(UUID) TO authenticated;