DROP FUNCTION IF EXISTS public.get_public_restaurant(text);
DROP FUNCTION IF EXISTS public.get_public_products(text);

-- 1. get_public_restaurant
CREATE OR REPLACE FUNCTION public.get_public_restaurant(_slug text)
 RETURNS TABLE(id uuid, name text, slug text, timezone text, public_menu_enabled boolean, inventory_enabled boolean, inventory_mode text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select r.id, r.name, r.slug, r.timezone, r.public_menu_enabled, r.inventory_enabled, r.inventory_mode
  from public.restaurants r
  where r.slug = _slug
    and r.public_menu_enabled = true
$function$;

-- 2. get_public_products
CREATE OR REPLACE FUNCTION public.get_public_products(_slug text)
 RETURNS TABLE(
    id uuid, 
    category_id uuid, 
    name text, 
    description text, 
    price_cents integer, 
    sort_order integer, 
    image_url text, 
    type product_type, 
    has_options boolean,
    track_stock boolean,
    stock_quantity numeric,
    allow_out_of_stock_sale boolean
 )
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
   select 
    p.id, 
    p.category_id, 
    p.name, 
    p.description, 
    p.price_cents, 
    p.sort_order, 
    p.image_url, 
    p.type,
    (
        p.type IN ('variable', 'pizza', 'combo') OR
        EXISTS (select 1 from public.product_option_groups pog where pog.product_id = p.id)
    ) as has_options,
    p.track_stock,
    p.stock_quantity,
    p.allow_out_of_stock_sale
   from public.products p
   join public.restaurants r on r.id = p.restaurant_id
   where r.slug = _slug
     and r.public_menu_enabled = true
     and p.active = true
     and (
       p.category_id is null
       or exists (
         select 1 from public.product_categories c
         where c.id = p.category_id and c.active = true
       )
     )
   order by p.sort_order asc, p.name asc;
$function$;

-- 3. get_public_product_details
CREATE OR REPLACE FUNCTION public.get_public_product_details(_product_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    result jsonb;
    v_variants jsonb;
    v_option_groups jsonb;
    v_pizza_config jsonb;
    v_pizza_flavors jsonb;
BEGIN
    SELECT jsonb_agg(jsonb_build_object(
        'id', id, 
        'name', name, 
        'price_cents', price_cents,
        'track_stock', track_stock,
        'stock_quantity', stock_quantity,
        'allow_out_of_stock_sale', allow_out_of_stock_sale
    ) ORDER BY sort_order, name) INTO v_variants
    FROM public.product_variants
    WHERE product_id = _product_id AND active = true;

    SELECT jsonb_agg(jsonb_build_object(
        'id', og.id,
        'name', og.name,
        'min_options', og.min_options,
        'max_options', og.max_options,
        'is_required', og.is_required,
        'items', (
            SELECT jsonb_agg(jsonb_build_object(
                'id', oi.id,
                'name', oi.name,
                'price_cents', oi.price_cents,
                'track_stock', oi.track_stock,
                'stock_quantity', oi.stock_quantity,
                'allow_out_of_stock_sale', oi.allow_out_of_stock_sale,
                'price_overrides', COALESCE((
                    SELECT jsonb_object_agg(o.variant_id::text, o.price_cents)
                    FROM public.option_item_price_overrides o
                    WHERE o.option_item_id = oi.id
                ), '{}'::jsonb)
            ) ORDER BY oi.sort_order, oi.name)
            FROM public.option_items oi
            WHERE oi.group_id = og.id AND oi.active = true
        )
    ) ORDER BY og.sort_order, og.name) INTO v_option_groups
    FROM public.option_groups og
    JOIN public.product_option_groups pog ON pog.group_id = og.id
    WHERE pog.product_id = _product_id AND og.active = true;

    SELECT jsonb_build_object(
        'max_flavors', max_flavors,
        'price_rule', price_rule,
        'allow_edge_customization', allow_edge_customization
    ) INTO v_pizza_config
    FROM public.pizza_configs
    WHERE product_id = _product_id;

    -- Sabores vinculados (somente ativos), com preço por variant e estoque
    SELECT jsonb_agg(jsonb_build_object(
        'id', pf.id,
        'name', pf.name,
        'description', pf.description,
        'category', pf.category,
        'image_url', pf.image_url,
        'track_stock', pf.track_stock,
        'stock_quantity', pf.stock_quantity,
        'allow_out_of_stock_sale', pf.allow_out_of_stock_sale,
        'prices', COALESCE((
            SELECT jsonb_object_agg(pfp.variant_id::text, pfp.price_cents)
            FROM public.pizza_flavor_prices pfp
            WHERE pfp.flavor_id = pf.id
        ), '{}'::jsonb)
    ) ORDER BY ppf.sort_order, pf.sort_order, pf.name) INTO v_pizza_flavors
    FROM public.product_pizza_flavors ppf
    JOIN public.pizza_flavors pf ON pf.id = ppf.flavor_id
    WHERE ppf.product_id = _product_id AND pf.active = true;

    result := jsonb_build_object(
        'variants', COALESCE(v_variants, '[]'::jsonb),
        'option_groups', COALESCE(v_option_groups, '[]'::jsonb),
        'pizza_config', v_pizza_config,
        'pizza_flavors', COALESCE(v_pizza_flavors, '[]'::jsonb)
    );
    RETURN result;
END;
$function$;
