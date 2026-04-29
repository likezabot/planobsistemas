CREATE OR REPLACE FUNCTION public.export_catalog(_restaurant_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_result jsonb;
BEGIN
  IF NOT public.is_member_of_restaurant(auth.uid(), _restaurant_id) THEN
    RAISE EXCEPTION 'Acesso negado: você não é membro deste restaurante.';
  END IF;

  SELECT jsonb_build_object(
    'version', '3',
    'exported_at', now(),
    'restaurant_id', _restaurant_id,
    'inventory_enabled', (SELECT inventory_enabled FROM public.restaurants WHERE id = _restaurant_id),
    'inventory_mode', (SELECT inventory_mode FROM public.restaurants WHERE id = _restaurant_id),
    'categories', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'code', c.code, 'name', c.name,
        'sort_order', c.sort_order, 'active', c.active
      ) ORDER BY c.sort_order, c.name)
      FROM public.product_categories c WHERE c.restaurant_id = _restaurant_id
    ), '[]'::jsonb),
    'option_groups', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'code', og.code, 'name', og.name,
        'min_options', og.min_options, 'max_options', og.max_options,
        'is_required', og.is_required, 'active', og.active,
        'sort_order', og.sort_order,
        'items', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'code', oi.code, 'name', oi.name,
            'price_cents', oi.price_cents, 'cost_cents', oi.cost_cents,
            'active', oi.active, 'sort_order', oi.sort_order,
            'track_stock', oi.track_stock, 'stock_quantity', oi.stock_quantity,
            'low_stock_alert', oi.low_stock_alert, 'allow_out_of_stock_sale', oi.allow_out_of_stock_sale,
            'price_overrides', COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                'variant_code', pv.code, 'price_cents', o.price_cents
              ))
              FROM public.option_item_price_overrides o
              JOIN public.product_variants pv ON pv.id = o.variant_id
              WHERE o.option_item_id = oi.id AND pv.code IS NOT NULL
            ), '[]'::jsonb)
          ) ORDER BY oi.sort_order, oi.name)
          FROM public.option_items oi WHERE oi.group_id = og.id
        ), '[]'::jsonb)
      ) ORDER BY og.sort_order, og.name)
      FROM public.option_groups og WHERE og.restaurant_id = _restaurant_id
    ), '[]'::jsonb),
    'pizza_flavors', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'code', pf.code, 'name', pf.name,
        'description', pf.description, 'category', pf.category,
        'image_url', pf.image_url, 'active', pf.active,
        'sort_order', pf.sort_order,
        'track_stock', pf.track_stock, 'stock_quantity', pf.stock_quantity,
        'low_stock_alert', pf.low_stock_alert, 'allow_out_of_stock_sale', pf.allow_out_of_stock_sale
      ) ORDER BY pf.sort_order, pf.name)
      FROM public.pizza_flavors pf WHERE pf.restaurant_id = _restaurant_id
    ), '[]'::jsonb),
    'products', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'code', p.code, 'name', p.name, 'description', p.description,
        'category_code', (SELECT c.code FROM public.product_categories c WHERE c.id = p.category_id),
        'price_cents', p.price_cents, 'cost_cents', p.cost_cents,
        'active', p.active, 'sort_order', p.sort_order,
        'image_url', p.image_url, 'type', p.type,
        'track_stock', p.track_stock, 'stock_quantity', p.stock_quantity,
        'low_stock_alert', p.low_stock_alert, 'allow_out_of_stock_sale', p.allow_out_of_stock_sale,
        'variants', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'code', pv.code, 'name', pv.name,
            'price_cents', pv.price_cents, 'cost_cents', pv.cost_cents,
            'active', pv.active, 'sort_order', pv.sort_order,
            'track_stock', pv.track_stock, 'stock_quantity', pv.stock_quantity,
            'low_stock_alert', pv.low_stock_alert, 'allow_out_of_stock_sale', pv.allow_out_of_stock_sale
          ) ORDER BY pv.sort_order, pv.name)
          FROM public.product_variants pv WHERE pv.product_id = p.id
        ), '[]'::jsonb),
        'option_group_codes', COALESCE((
          SELECT jsonb_agg(og.code ORDER BY pog.sort_order)
          FROM public.product_option_groups pog
          JOIN public.option_groups og ON og.id = pog.group_id
          WHERE pog.product_id = p.id AND og.code IS NOT NULL
        ), '[]'::jsonb),
        'pizza_config', (
          SELECT jsonb_build_object(
            'max_flavors', pc.max_flavors,
            'price_rule', pc.price_rule,
            'allow_edge_customization', pc.allow_edge_customization
          ) FROM public.pizza_configs pc WHERE pc.product_id = p.id
        ),
        'pizza_flavor_codes', COALESCE((
          SELECT jsonb_agg(pf.code ORDER BY ppf.sort_order)
          FROM public.product_pizza_flavors ppf
          JOIN public.pizza_flavors pf ON pf.id = ppf.flavor_id
          WHERE ppf.product_id = p.id AND pf.code IS NOT NULL
        ), '[]'::jsonb),
        'pizza_flavor_prices', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'flavor_code', pf.code,
            'variant_code', pv.code,
            'price_cents', pfp.price_cents
          ))
          FROM public.product_pizza_flavors ppf
          JOIN public.pizza_flavors pf ON pf.id = ppf.flavor_id
          JOIN public.pizza_flavor_prices pfp ON pfp.flavor_id = pf.id
          JOIN public.product_variants pv ON pv.id = pfp.variant_id
          WHERE ppf.product_id = p.id AND pv.product_id = p.id
            AND pf.code IS NOT NULL AND pv.code IS NOT NULL
        ), '[]'::jsonb)
      ) ORDER BY p.sort_order, p.name)
      FROM public.products p WHERE p.restaurant_id = _restaurant_id
    ), '[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$function$;
