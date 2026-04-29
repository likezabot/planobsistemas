CREATE OR REPLACE FUNCTION public.get_dashboard_stats(_restaurant_id UUID, _days_back INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id UUID;
    v_is_authorized BOOLEAN;
    v_start_date TIMESTAMP;
    v_pizza_enabled BOOLEAN;
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

    SELECT pizza_module_enabled INTO v_pizza_enabled FROM restaurants WHERE id = _restaurant_id;

    v_start_date := date_trunc('day', now()) - (_days_back || ' days')::INTERVAL;

    WITH filtered_orders AS (
        SELECT * FROM orders
        WHERE restaurant_id = _restaurant_id 
          AND status IN ('delivered', 'completed')
          AND created_at >= v_start_date
    ),
    daily_sales AS (
        SELECT 
            date_trunc('day', created_at)::date::text AS day,
            SUM(total_cents) AS sales_cents,
            COUNT(*) AS order_count
        FROM filtered_orders
        GROUP BY 1
        ORDER BY 1
    ),
    best_day AS (
        SELECT 
            extract(DOW FROM created_at) AS dow,
            SUM(total_cents) AS total
        FROM filtered_orders
        GROUP BY 1
        ORDER BY 2 DESC
        LIMIT 1
    ),
    peak_hour AS (
        SELECT 
            extract(hour from created_at) AS hour,
            COUNT(*) AS count
        FROM filtered_orders
        GROUP BY 1
        ORDER BY 2 DESC
        LIMIT 1
    ),
    top_products AS (
        SELECT 
            p.name,
            SUM(oi.quantity) AS qty
        FROM order_items oi
        JOIN products p ON p.id = oi.product_id
        JOIN filtered_orders o ON o.id = oi.order_id
        GROUP BY 1
        ORDER BY 2 DESC
        LIMIT 10
    ),
    channel_stats AS (
        SELECT 
            order_type::text as name,
            COUNT(*) AS value
        FROM filtered_orders
        GROUP BY 1
    ),
    pizza_ratio AS (
        SELECT 
            CASE WHEN p.type = 'pizza' THEN 'Pizza' ELSE 'Outros' END AS name,
            SUM(oi.total_price_cents) as total_cents,
            COUNT(DISTINCT oi.order_id) as order_count
        FROM order_items oi
        JOIN products p ON p.id = oi.product_id
        JOIN filtered_orders o ON o.id = oi.order_id
        GROUP BY 1
    ),
    pizza_flavors AS (
        SELECT 
            flavor->>'name' as name,
            COUNT(*) as value
        FROM order_items oi
        JOIN products p ON p.id = oi.product_id
        JOIN filtered_orders o ON o.id = oi.order_id
        CROSS JOIN LATERAL jsonb_array_elements(
            CASE 
                WHEN jsonb_typeof(oi.customization->'flavors') = 'array' THEN oi.customization->'flavors'
                ELSE '[]'::jsonb
            END
        ) as flavor
        WHERE p.type = 'pizza'
        GROUP BY 1
        ORDER BY 2 DESC
        LIMIT 5
    ),
    pizza_sizes AS (
        SELECT 
            oi.customization->'variation'->>'name' as name,
            COUNT(*) as value
        FROM order_items oi
        JOIN products p ON p.id = oi.product_id
        JOIN filtered_orders o ON o.id = oi.order_id
        WHERE p.type = 'pizza' AND oi.customization->'variation'->>'name' IS NOT NULL
        GROUP BY 1
        ORDER BY 2 DESC
        LIMIT 3
    )
    SELECT jsonb_build_object(
        'daily_sales', COALESCE((SELECT jsonb_agg(daily_sales) FROM daily_sales), '[]'::jsonb),
        'avg_ticket', (SELECT CASE WHEN COUNT(*) > 0 THEN ROUND(SUM(total_cents) / COUNT(*)) ELSE 0 END FROM filtered_orders),
        'best_dow', (SELECT dow FROM best_day),
        'peak_hour', (SELECT hour FROM peak_hour),
        'top_products', COALESCE((SELECT jsonb_agg(top_products) FROM top_products), '[]'::jsonb),
        'channel_stats', COALESCE((SELECT jsonb_agg(channel_stats) FROM channel_stats), '[]'::jsonb),
        'pizza_enabled', v_pizza_enabled,
        'pizza_ratio', COALESCE((SELECT jsonb_agg(pizza_ratio) FROM pizza_ratio), '[]'::jsonb),
        'pizza_flavors', (CASE WHEN v_pizza_enabled THEN COALESCE((SELECT jsonb_agg(pizza_flavors) FROM pizza_flavors), '[]'::jsonb) ELSE '[]'::jsonb END),
        'pizza_sizes', (CASE WHEN v_pizza_enabled THEN COALESCE((SELECT jsonb_agg(pizza_sizes) FROM pizza_sizes), '[]'::jsonb) ELSE '[]'::jsonb END)
    ) INTO v_result;

    RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_dashboard_stats(UUID, INTEGER) FROM public;
REVOKE EXECUTE ON FUNCTION public.get_dashboard_stats(UUID, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_stats(UUID, INTEGER) TO authenticated;