-- Drop existing function to update return type
DROP FUNCTION IF EXISTS public.get_public_products(_slug text);

-- Update get_public_products to include product type
CREATE OR REPLACE FUNCTION public.get_public_products(_slug text)
RETURNS TABLE(
    id uuid, 
    category_id uuid, 
    name text, 
    description text, 
    price_cents integer, 
    sort_order integer, 
    image_url text,
    type public.product_type
) AS $$
   select p.id, p.category_id, p.name, p.description, p.price_cents, p.sort_order, p.image_url, p.type
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
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Grant access to the updated function
GRANT EXECUTE ON FUNCTION public.get_public_products(_slug text) TO anon, authenticated;

-- Create function to get product details (variants, options, pizza_config)
CREATE OR REPLACE FUNCTION public.get_public_product_details(_product_id uuid)
RETURNS jsonb AS $$
DECLARE
    result jsonb;
    v_variants jsonb;
    v_option_groups jsonb;
    v_pizza_config jsonb;
BEGIN
    -- Get variants
    SELECT jsonb_agg(jsonb_build_object(
        'id', id,
        'name', name,
        'price_cents', price_cents
    )) INTO v_variants
    FROM public.product_variants
    WHERE product_id = _product_id AND active = true;

    -- Get option groups and items
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
                'price_cents', oi.price_cents
            ))
            FROM public.option_items oi
            WHERE oi.group_id = og.id AND oi.active = true
        )
    )) INTO v_option_groups
    FROM public.option_groups og
    JOIN public.product_option_groups pog ON pog.group_id = og.id
    WHERE pog.product_id = _product_id AND og.active = true;

    -- Get pizza config
    SELECT jsonb_build_object(
        'max_flavors', max_flavors,
        'price_rule', price_rule,
        'allow_edge_customization', allow_edge_customization
    ) INTO v_pizza_config
    FROM public.pizza_configs
    WHERE product_id = _product_id;

    result := jsonb_build_object(
        'variants', COALESCE(v_variants, '[]'::jsonb),
        'option_groups', COALESCE(v_option_groups, '[]'::jsonb),
        'pizza_config', v_pizza_config
    );

    RETURN result;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Grant access to the new function
GRANT EXECUTE ON FUNCTION public.get_public_product_details(_product_id uuid) TO anon, authenticated;