
-- =========================================================
-- 1) option_groups: remover policy aberta, criar policies seguras
-- =========================================================
DROP POLICY IF EXISTS "Owners can manage option groups" ON public.option_groups;
DROP POLICY IF EXISTS "Anyone can view active option groups" ON public.option_groups;

-- Leitura pública: somente grupos ativos de restaurantes com cardápio público
CREATE POLICY "option_groups_select_public"
ON public.option_groups
FOR SELECT
TO anon, authenticated
USING (
  active = true
  AND EXISTS (
    SELECT 1 FROM public.restaurants r
    WHERE r.id = option_groups.restaurant_id
      AND r.public_menu_enabled = true
  )
);

-- Leitura para membros do restaurante (independente de ativo)
CREATE POLICY "option_groups_select_member"
ON public.option_groups
FOR SELECT
TO authenticated
USING (public.is_member_of_restaurant(auth.uid(), restaurant_id));

-- Escrita: apenas owner/manager
CREATE POLICY "option_groups_insert_admins"
ON public.option_groups
FOR INSERT
TO authenticated
WITH CHECK (public.has_any_role_in_restaurant(auth.uid(), restaurant_id, ARRAY['owner','manager']::app_role[]));

CREATE POLICY "option_groups_update_admins"
ON public.option_groups
FOR UPDATE
TO authenticated
USING (public.has_any_role_in_restaurant(auth.uid(), restaurant_id, ARRAY['owner','manager']::app_role[]))
WITH CHECK (public.has_any_role_in_restaurant(auth.uid(), restaurant_id, ARRAY['owner','manager']::app_role[]));

CREATE POLICY "option_groups_delete_admins"
ON public.option_groups
FOR DELETE
TO authenticated
USING (public.has_any_role_in_restaurant(auth.uid(), restaurant_id, ARRAY['owner','manager']::app_role[]));

-- =========================================================
-- 2) option_items: remover policy aberta
-- =========================================================
DROP POLICY IF EXISTS "Owners can manage option items" ON public.option_items;
DROP POLICY IF EXISTS "Anyone can view active option items" ON public.option_items;

CREATE POLICY "option_items_select_public"
ON public.option_items
FOR SELECT
TO anon, authenticated
USING (
  active = true
  AND EXISTS (
    SELECT 1 FROM public.option_groups og
    JOIN public.restaurants r ON r.id = og.restaurant_id
    WHERE og.id = option_items.group_id
      AND og.active = true
      AND r.public_menu_enabled = true
  )
);

CREATE POLICY "option_items_select_member"
ON public.option_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.option_groups og
    WHERE og.id = option_items.group_id
      AND public.is_member_of_restaurant(auth.uid(), og.restaurant_id)
  )
);

CREATE POLICY "option_items_insert_admins"
ON public.option_items
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.option_groups og
    WHERE og.id = option_items.group_id
      AND public.has_any_role_in_restaurant(auth.uid(), og.restaurant_id, ARRAY['owner','manager']::app_role[])
  )
);

CREATE POLICY "option_items_update_admins"
ON public.option_items
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.option_groups og
    WHERE og.id = option_items.group_id
      AND public.has_any_role_in_restaurant(auth.uid(), og.restaurant_id, ARRAY['owner','manager']::app_role[])
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.option_groups og
    WHERE og.id = option_items.group_id
      AND public.has_any_role_in_restaurant(auth.uid(), og.restaurant_id, ARRAY['owner','manager']::app_role[])
  )
);

CREATE POLICY "option_items_delete_admins"
ON public.option_items
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.option_groups og
    WHERE og.id = option_items.group_id
      AND public.has_any_role_in_restaurant(auth.uid(), og.restaurant_id, ARRAY['owner','manager']::app_role[])
  )
);

-- =========================================================
-- 3) product_variants: remover policy aberta
-- =========================================================
DROP POLICY IF EXISTS "Owners can manage variants" ON public.product_variants;
DROP POLICY IF EXISTS "Anyone can view active variants" ON public.product_variants;

CREATE POLICY "product_variants_select_public"
ON public.product_variants
FOR SELECT
TO anon, authenticated
USING (
  active = true
  AND EXISTS (
    SELECT 1 FROM public.products p
    JOIN public.restaurants r ON r.id = p.restaurant_id
    WHERE p.id = product_variants.product_id
      AND p.active = true
      AND r.public_menu_enabled = true
  )
);

CREATE POLICY "product_variants_select_member"
ON public.product_variants
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_variants.product_id
      AND public.is_member_of_restaurant(auth.uid(), p.restaurant_id)
  )
);

CREATE POLICY "product_variants_insert_admins"
ON public.product_variants
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_variants.product_id
      AND public.has_any_role_in_restaurant(auth.uid(), p.restaurant_id, ARRAY['owner','manager']::app_role[])
  )
);

CREATE POLICY "product_variants_update_admins"
ON public.product_variants
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_variants.product_id
      AND public.has_any_role_in_restaurant(auth.uid(), p.restaurant_id, ARRAY['owner','manager']::app_role[])
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_variants.product_id
      AND public.has_any_role_in_restaurant(auth.uid(), p.restaurant_id, ARRAY['owner','manager']::app_role[])
  )
);

CREATE POLICY "product_variants_delete_admins"
ON public.product_variants
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_variants.product_id
      AND public.has_any_role_in_restaurant(auth.uid(), p.restaurant_id, ARRAY['owner','manager']::app_role[])
  )
);

-- =========================================================
-- 4) product_option_groups: remover policy aberta
-- =========================================================
DROP POLICY IF EXISTS "Owners can manage product option links" ON public.product_option_groups;
DROP POLICY IF EXISTS "Anyone can view product option links" ON public.product_option_groups;

CREATE POLICY "product_option_groups_select_public"
ON public.product_option_groups
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.products p
    JOIN public.restaurants r ON r.id = p.restaurant_id
    WHERE p.id = product_option_groups.product_id
      AND p.active = true
      AND r.public_menu_enabled = true
  )
);

CREATE POLICY "product_option_groups_select_member"
ON public.product_option_groups
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_option_groups.product_id
      AND public.is_member_of_restaurant(auth.uid(), p.restaurant_id)
  )
);

CREATE POLICY "product_option_groups_insert_admins"
ON public.product_option_groups
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_option_groups.product_id
      AND public.has_any_role_in_restaurant(auth.uid(), p.restaurant_id, ARRAY['owner','manager']::app_role[])
  )
);

CREATE POLICY "product_option_groups_update_admins"
ON public.product_option_groups
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_option_groups.product_id
      AND public.has_any_role_in_restaurant(auth.uid(), p.restaurant_id, ARRAY['owner','manager']::app_role[])
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_option_groups.product_id
      AND public.has_any_role_in_restaurant(auth.uid(), p.restaurant_id, ARRAY['owner','manager']::app_role[])
  )
);

CREATE POLICY "product_option_groups_delete_admins"
ON public.product_option_groups
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_option_groups.product_id
      AND public.has_any_role_in_restaurant(auth.uid(), p.restaurant_id, ARRAY['owner','manager']::app_role[])
  )
);

-- =========================================================
-- 5) pizza_configs: remover policy aberta
-- =========================================================
DROP POLICY IF EXISTS "Owners can manage pizza configs" ON public.pizza_configs;
DROP POLICY IF EXISTS "Anyone can view pizza configs" ON public.pizza_configs;

CREATE POLICY "pizza_configs_select_public"
ON public.pizza_configs
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.products p
    JOIN public.restaurants r ON r.id = p.restaurant_id
    WHERE p.id = pizza_configs.product_id
      AND p.active = true
      AND r.public_menu_enabled = true
  )
);

CREATE POLICY "pizza_configs_select_member"
ON public.pizza_configs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = pizza_configs.product_id
      AND public.is_member_of_restaurant(auth.uid(), p.restaurant_id)
  )
);

CREATE POLICY "pizza_configs_insert_admins"
ON public.pizza_configs
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = pizza_configs.product_id
      AND public.has_any_role_in_restaurant(auth.uid(), p.restaurant_id, ARRAY['owner','manager']::app_role[])
  )
);

CREATE POLICY "pizza_configs_update_admins"
ON public.pizza_configs
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = pizza_configs.product_id
      AND public.has_any_role_in_restaurant(auth.uid(), p.restaurant_id, ARRAY['owner','manager']::app_role[])
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = pizza_configs.product_id
      AND public.has_any_role_in_restaurant(auth.uid(), p.restaurant_id, ARRAY['owner','manager']::app_role[])
  )
);

CREATE POLICY "pizza_configs_delete_admins"
ON public.pizza_configs
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = pizza_configs.product_id
      AND public.has_any_role_in_restaurant(auth.uid(), p.restaurant_id, ARRAY['owner','manager']::app_role[])
  )
);

-- =========================================================
-- 6) inventory_logs: restringir a authenticated com escopo
-- =========================================================
DROP POLICY IF EXISTS "Users can view their restaurant's inventory logs" ON public.inventory_logs;
DROP POLICY IF EXISTS "Managers and owners can insert inventory logs" ON public.inventory_logs;

CREATE POLICY "inventory_logs_select_member"
ON public.inventory_logs
FOR SELECT
TO authenticated
USING (public.is_member_of_restaurant(auth.uid(), restaurant_id));

CREATE POLICY "inventory_logs_insert_admins"
ON public.inventory_logs
FOR INSERT
TO authenticated
WITH CHECK (public.has_any_role_in_restaurant(auth.uid(), restaurant_id, ARRAY['owner','manager']::app_role[]));
