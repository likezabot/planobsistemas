DROP FUNCTION IF EXISTS public.get_public_products(_slug text);

CREATE OR REPLACE FUNCTION public.get_public_products(_slug text)
RETURNS TABLE(
    id uuid, 
    category_id uuid, 
    name text, 
    description text, 
    price_cents integer, 
    sort_order integer, 
    image_url text,
    type public.product_type,
    has_options boolean
) AS $$
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
    ) as has_options
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

GRANT EXECUTE ON FUNCTION public.get_public_products(_slug text) TO anon, authenticated;