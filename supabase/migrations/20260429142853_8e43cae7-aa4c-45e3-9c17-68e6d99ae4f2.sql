-- =========================================================================
-- FASE 2: Pizza nativa + overrides de preço por tamanho
-- =========================================================================

-- 1) Tabela de sabores de pizza (dedicada, não confunde com produtos do menu)
CREATE TABLE IF NOT EXISTS public.pizza_flavors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  code text,
  name text NOT NULL,
  description text,
  category text, -- ex: "Tradicional", "Especial", "Doce"
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  image_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS pizza_flavors_restaurant_code_uniq
  ON public.pizza_flavors (restaurant_id, lower(code))
  WHERE code IS NOT NULL;

CREATE INDEX IF NOT EXISTS pizza_flavors_restaurant_active_idx
  ON public.pizza_flavors (restaurant_id, active);

ALTER TABLE public.pizza_flavors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pizza_flavors_select_member" ON public.pizza_flavors
  FOR SELECT TO authenticated
  USING (public.is_member_of_restaurant(auth.uid(), restaurant_id));

CREATE POLICY "pizza_flavors_select_public" ON public.pizza_flavors
  FOR SELECT TO anon, authenticated
  USING (active = true AND EXISTS (
    SELECT 1 FROM public.restaurants r
    WHERE r.id = pizza_flavors.restaurant_id AND r.public_menu_enabled = true
  ));

CREATE POLICY "pizza_flavors_insert_admins" ON public.pizza_flavors
  FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role_in_restaurant(auth.uid(), restaurant_id, ARRAY['owner','manager']::app_role[]));

CREATE POLICY "pizza_flavors_update_admins" ON public.pizza_flavors
  FOR UPDATE TO authenticated
  USING (public.has_any_role_in_restaurant(auth.uid(), restaurant_id, ARRAY['owner','manager']::app_role[]))
  WITH CHECK (public.has_any_role_in_restaurant(auth.uid(), restaurant_id, ARRAY['owner','manager']::app_role[]));

CREATE POLICY "pizza_flavors_delete_admins" ON public.pizza_flavors
  FOR DELETE TO authenticated
  USING (public.has_any_role_in_restaurant(auth.uid(), restaurant_id, ARRAY['owner','manager']::app_role[]));

-- Validação tenant/restaurant
CREATE OR REPLACE FUNCTION public.validate_pizza_flavor_tenant()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.restaurants r
    WHERE r.id = new.restaurant_id AND r.tenant_id = new.tenant_id
  ) THEN
    RAISE EXCEPTION 'restaurant_id does not belong to tenant_id';
  END IF;
  RETURN new;
END;
$$;
CREATE TRIGGER trg_pizza_flavors_validate
  BEFORE INSERT OR UPDATE ON public.pizza_flavors
  FOR EACH ROW EXECUTE FUNCTION public.validate_pizza_flavor_tenant();

CREATE TRIGGER trg_pizza_flavors_updated_at
  BEFORE UPDATE ON public.pizza_flavors
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) Preço de sabor por tamanho (variant da pizza). Sem entrada = grátis (0).
CREATE TABLE IF NOT EXISTS public.pizza_flavor_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flavor_id uuid NOT NULL REFERENCES public.pizza_flavors(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
  price_cents integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (flavor_id, variant_id)
);

ALTER TABLE public.pizza_flavor_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pizza_flavor_prices_select_public" ON public.pizza_flavor_prices
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "pizza_flavor_prices_manage_admins" ON public.pizza_flavor_prices
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.pizza_flavors pf
    WHERE pf.id = pizza_flavor_prices.flavor_id
      AND public.has_any_role_in_restaurant(auth.uid(), pf.restaurant_id, ARRAY['owner','manager']::app_role[])
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.pizza_flavors pf
    WHERE pf.id = pizza_flavor_prices.flavor_id
      AND public.has_any_role_in_restaurant(auth.uid(), pf.restaurant_id, ARRAY['owner','manager']::app_role[])
  ));

-- 3) Vínculo de pizza (produto) → sabores disponíveis
CREATE TABLE IF NOT EXISTS public.product_pizza_flavors (
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  flavor_id uuid NOT NULL REFERENCES public.pizza_flavors(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, flavor_id)
);

ALTER TABLE public.product_pizza_flavors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_pizza_flavors_select_public" ON public.product_pizza_flavors
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "product_pizza_flavors_manage_admins" ON public.product_pizza_flavors
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_pizza_flavors.product_id
      AND public.has_any_role_in_restaurant(auth.uid(), p.restaurant_id, ARRAY['owner','manager']::app_role[])
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_pizza_flavors.product_id
      AND public.has_any_role_in_restaurant(auth.uid(), p.restaurant_id, ARRAY['owner','manager']::app_role[])
  ));

-- 4) Override de preço de option_item por variant (ex: borda por tamanho)
CREATE TABLE IF NOT EXISTS public.option_item_price_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  option_item_id uuid NOT NULL REFERENCES public.option_items(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
  price_cents integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (option_item_id, variant_id)
);

ALTER TABLE public.option_item_price_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "option_item_overrides_select_public" ON public.option_item_price_overrides
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "option_item_overrides_manage_admins" ON public.option_item_price_overrides
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.option_items oi
    JOIN public.option_groups og ON og.id = oi.group_id
    WHERE oi.id = option_item_price_overrides.option_item_id
      AND public.has_any_role_in_restaurant(auth.uid(), og.restaurant_id, ARRAY['owner','manager']::app_role[])
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.option_items oi
    JOIN public.option_groups og ON og.id = oi.group_id
    WHERE oi.id = option_item_price_overrides.option_item_id
      AND public.has_any_role_in_restaurant(auth.uid(), og.restaurant_id, ARRAY['owner','manager']::app_role[])
  ));

-- 5) Atualizar get_public_product_details para retornar sabores e overrides
CREATE OR REPLACE FUNCTION public.get_public_product_details(_product_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public AS $$
DECLARE
    result jsonb;
    v_variants jsonb;
    v_option_groups jsonb;
    v_pizza_config jsonb;
    v_pizza_flavors jsonb;
BEGIN
    SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'name', name, 'price_cents', price_cents
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

    -- Sabores vinculados (somente ativos), com preço por variant
    SELECT jsonb_agg(jsonb_build_object(
        'id', pf.id,
        'name', pf.name,
        'description', pf.description,
        'category', pf.category,
        'image_url', pf.image_url,
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
$$;

-- 6) Atualizar create_public_order: usar pizza_flavors + override de borda por variant
CREATE OR REPLACE FUNCTION public.create_public_order(
  _restaurant_slug text, _customer_name text, _customer_phone text,
  _order_type text, _payment_method text, _idempotency_key text,
  _items jsonb, _address text DEFAULT NULL, _notes text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
    v_restaurant_id UUID; v_tenant_id UUID; v_order_id UUID;
    v_subtotal_cents INTEGER := 0; v_total_cents INTEGER := 0;
    v_item JSONB; v_product_id UUID; v_quantity INTEGER;
    v_base_price_cents INTEGER; v_unit_price_cents INTEGER;
    v_product_active BOOLEAN; v_product_type public.product_type;
    v_existing_order_id UUID; v_phone_normalized TEXT;
    v_variation_id UUID; v_variation_name TEXT; v_variation_price INTEGER;
    v_selected_options UUID[]; v_pizza_flavor_ids UUID[];
    v_customization_snapshot JSONB;
    v_option_id UUID; v_option_price INTEGER; v_option_name TEXT;
    v_option_override INTEGER;
    v_options_snapshot JSONB[]; v_options_total INTEGER := 0;
    v_pizza_config RECORD; v_flavor_id UUID;
    v_flavor_price INTEGER; v_flavor_name TEXT; v_flavor_active BOOLEAN;
    v_flavor_prices INTEGER[]; v_flavors_snapshot JSONB[];
    v_pizza_base_price INTEGER := 0;
    v_group RECORD; v_count INTEGER;
BEGIN
    SELECT id, tenant_id INTO v_restaurant_id, v_tenant_id
    FROM public.restaurants
    WHERE slug = _restaurant_slug AND public_menu_enabled = true;

    IF v_restaurant_id IS NULL THEN
        RAISE EXCEPTION 'Restaurante não encontrado ou cardápio desativado.';
    END IF;

    SELECT id INTO v_existing_order_id FROM public.orders
    WHERE restaurant_id = v_restaurant_id AND idempotency_key = _idempotency_key;
    IF v_existing_order_id IS NOT NULL THEN
        RETURN jsonb_build_object('order_id', v_existing_order_id, 'idempotent', true);
    END IF;

    IF _customer_name IS NULL OR length(trim(_customer_name)) < 2 THEN
        RAISE EXCEPTION 'Nome inválido.';
    END IF;
    IF _customer_phone IS NULL OR length(trim(_customer_phone)) < 8 THEN
        RAISE EXCEPTION 'Telefone inválido.';
    END IF;
    IF _order_type = 'delivery' AND (_address IS NULL OR length(trim(_address)) < 5) THEN
        RAISE EXCEPTION 'Endereço obrigatório para entrega.';
    END IF;

    v_phone_normalized := regexp_replace(_customer_phone, '[^\d]', '', 'g');

    INSERT INTO public.orders (
        tenant_id, restaurant_id, customer_name, customer_phone,
        order_type, address, payment_method, notes, idempotency_key, status
    ) VALUES (
        v_tenant_id, v_restaurant_id, _customer_name, v_phone_normalized,
        _order_type::public.order_type, _address,
        _payment_method::public.payment_method, _notes, _idempotency_key, 'new'
    ) RETURNING id INTO v_order_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_quantity := (v_item->>'quantity')::INTEGER;
        v_variation_id := (v_item->>'variation_id')::UUID;
        v_selected_options := ARRAY(SELECT jsonb_array_elements_text(v_item->'selected_options')::UUID);
        v_pizza_flavor_ids := ARRAY(SELECT jsonb_array_elements_text(v_item->'pizza_flavors')::UUID);

        IF v_quantity <= 0 THEN RAISE EXCEPTION 'Quantidade inválida.'; END IF;

        SELECT price_cents, active, type INTO v_base_price_cents, v_product_active, v_product_type
        FROM public.products
        WHERE id = v_product_id AND restaurant_id = v_restaurant_id;

        IF v_product_active IS NOT TRUE THEN
            RAISE EXCEPTION 'Produto indisponível.';
        END IF;

        v_unit_price_cents := 0;
        v_customization_snapshot := '{}'::jsonb;
        v_options_snapshot := ARRAY[]::jsonb[];
        v_options_total := 0;

        IF v_product_type IN ('variable','pizza') AND v_variation_id IS NOT NULL THEN
            SELECT name, price_cents, active INTO v_variation_name, v_variation_price, v_product_active
            FROM public.product_variants
            WHERE id = v_variation_id AND product_id = v_product_id;
            IF v_variation_name IS NULL THEN RAISE EXCEPTION 'Variação inválida.'; END IF;
            IF v_product_active IS NOT TRUE THEN RAISE EXCEPTION 'Variação indisponível: %', v_variation_name; END IF;
            v_unit_price_cents := v_variation_price;
            v_customization_snapshot := v_customization_snapshot || jsonb_build_object(
                'variation', jsonb_build_object('id', v_variation_id, 'name', v_variation_name, 'price', v_variation_price)
            );
        ELSIF v_product_type = 'variable' THEN
            RAISE EXCEPTION 'Variação obrigatória para este produto.';
        ELSE
            v_unit_price_cents := v_base_price_cents;
        END IF;

        IF v_product_type = 'pizza' THEN
            SELECT * INTO v_pizza_config FROM public.pizza_configs WHERE product_id = v_product_id;
            IF v_pizza_config IS NULL THEN
                RAISE EXCEPTION 'Pizza sem configuração.';
            END IF;

            IF COALESCE(array_length(v_pizza_flavor_ids, 1), 0) = 0 THEN
                RAISE EXCEPTION 'Selecione ao menos um sabor para a pizza.';
            END IF;
            IF array_length(v_pizza_flavor_ids, 1) > v_pizza_config.max_flavors THEN
                RAISE EXCEPTION 'Excedeu o número máximo de sabores (% sabores).', v_pizza_config.max_flavors;
            END IF;

            v_flavor_prices := ARRAY[]::INTEGER[];
            v_flavors_snapshot := ARRAY[]::jsonb[];

            FOREACH v_flavor_id IN ARRAY v_pizza_flavor_ids LOOP
                -- Sabor precisa estar vinculado e ativo
                SELECT pf.name, pf.active INTO v_flavor_name, v_flavor_active
                FROM public.pizza_flavors pf
                JOIN public.product_pizza_flavors ppf ON ppf.flavor_id = pf.id
                WHERE pf.id = v_flavor_id
                  AND ppf.product_id = v_product_id
                  AND pf.restaurant_id = v_restaurant_id;

                IF v_flavor_name IS NULL THEN
                    RAISE EXCEPTION 'Sabor inválido ou não vinculado a esta pizza.';
                END IF;
                IF v_flavor_active IS NOT TRUE THEN
                    RAISE EXCEPTION 'Sabor indisponível: %', v_flavor_name;
                END IF;

                -- Preço do sabor para o variant escolhido (default 0)
                IF v_variation_id IS NOT NULL THEN
                    SELECT price_cents INTO v_flavor_price
                    FROM public.pizza_flavor_prices
                    WHERE flavor_id = v_flavor_id AND variant_id = v_variation_id;
                END IF;
                v_flavor_price := COALESCE(v_flavor_price, 0);

                v_flavor_prices := v_flavor_prices || v_flavor_price;
                v_flavors_snapshot := v_flavors_snapshot || jsonb_build_object(
                    'id', v_flavor_id, 'name', v_flavor_name, 'price', v_flavor_price
                );
                v_flavor_price := NULL;
            END LOOP;

            -- Aplicar regra de preço sobre os preços dos sabores no tamanho escolhido
            IF v_pizza_config.price_rule = 'max' THEN
                SELECT MAX(p) INTO v_pizza_base_price FROM unnest(v_flavor_prices) AS p;
            ELSIF v_pizza_config.price_rule = 'average' THEN
                SELECT AVG(p)::INTEGER INTO v_pizza_base_price FROM unnest(v_flavor_prices) AS p;
            ELSIF v_pizza_config.price_rule = 'sum' THEN
                SELECT SUM(p) INTO v_pizza_base_price FROM unnest(v_flavor_prices) AS p;
            END IF;

            -- v_unit_price_cents já contém preço do tamanho. Sabor é adicional sobre o tamanho.
            v_unit_price_cents := v_unit_price_cents + COALESCE(v_pizza_base_price, 0);
            v_customization_snapshot := v_customization_snapshot || jsonb_build_object(
                'flavors', to_jsonb(v_flavors_snapshot),
                'price_rule', v_pizza_config.price_rule
            );
        END IF;

        FOR v_group IN
            SELECT og.id, og.name, og.min_options, og.max_options, og.is_required
            FROM public.option_groups og
            JOIN public.product_option_groups pog ON pog.group_id = og.id
            WHERE pog.product_id = v_product_id AND og.active = true
        LOOP
            SELECT count(*) INTO v_count
            FROM public.option_items oi
            WHERE oi.group_id = v_group.id AND oi.id = ANY(v_selected_options);

            IF v_group.is_required AND v_count < v_group.min_options THEN
                RAISE EXCEPTION 'O grupo "%" é obrigatório (mínimo de % opções).', v_group.name, v_group.min_options;
            END IF;
            IF v_count > v_group.max_options THEN
                RAISE EXCEPTION 'O grupo "%" permite no máximo % opções.', v_group.name, v_group.max_options;
            END IF;
        END LOOP;

        IF array_length(v_selected_options, 1) > 0 THEN
            FOREACH v_option_id IN ARRAY v_selected_options LOOP
                SELECT oi.name, oi.price_cents, oi.active INTO v_option_name, v_option_price, v_product_active
                FROM public.option_items oi
                JOIN public.option_groups og ON og.id = oi.group_id
                JOIN public.product_option_groups pog ON pog.group_id = og.id
                WHERE oi.id = v_option_id AND pog.product_id = v_product_id;

                IF v_option_name IS NULL THEN
                    RAISE EXCEPTION 'Opcional inválido ou não pertence a este produto.';
                END IF;
                IF v_product_active IS NOT TRUE THEN
                    RAISE EXCEPTION 'Opcional indisponível: %', v_option_name;
                END IF;

                -- Override por variant (ex: borda muda de preço por tamanho)
                v_option_override := NULL;
                IF v_variation_id IS NOT NULL THEN
                    SELECT price_cents INTO v_option_override
                    FROM public.option_item_price_overrides
                    WHERE option_item_id = v_option_id AND variant_id = v_variation_id;
                END IF;
                v_option_price := COALESCE(v_option_override, v_option_price);

                v_options_total := v_options_total + v_option_price;
                v_options_snapshot := v_options_snapshot || jsonb_build_object(
                    'id', v_option_id, 'name', v_option_name, 'price', v_option_price
                );
            END LOOP;
            v_unit_price_cents := v_unit_price_cents + v_options_total;
            v_customization_snapshot := v_customization_snapshot || jsonb_build_object(
                'options', to_jsonb(v_options_snapshot),
                'options_total', v_options_total
            );
        END IF;

        INSERT INTO public.order_items (
            order_id, product_id, quantity, unit_price_cents, total_price_cents, note, customization
        ) VALUES (
            v_order_id, v_product_id, v_quantity, v_unit_price_cents,
            v_unit_price_cents * v_quantity, (v_item->>'note'), v_customization_snapshot
        );

        v_subtotal_cents := v_subtotal_cents + (v_unit_price_cents * v_quantity);
    END LOOP;

    v_total_cents := v_subtotal_cents;
    UPDATE public.orders
    SET subtotal_cents = v_subtotal_cents, total_cents = v_total_cents
    WHERE id = v_order_id;

    RETURN jsonb_build_object('order_id', v_order_id, 'idempotent', false);
END;
$$;

-- 7) Atualizar export_catalog para incluir pizza_flavors e overrides
CREATE OR REPLACE FUNCTION public.export_catalog(_restaurant_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public AS $$
DECLARE v_result jsonb;
BEGIN
  IF NOT public.is_member_of_restaurant(auth.uid(), _restaurant_id) THEN
    RAISE EXCEPTION 'Acesso negado: você não é membro deste restaurante.';
  END IF;

  SELECT jsonb_build_object(
    'version', '2',
    'exported_at', now(),
    'restaurant_id', _restaurant_id,
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
        'sort_order', pf.sort_order
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
        'variants', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'code', pv.code, 'name', pv.name,
            'price_cents', pv.price_cents, 'cost_cents', pv.cost_cents,
            'active', pv.active, 'sort_order', pv.sort_order
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
$$;

-- 8) Atualizar import_catalog para suportar pizza_flavors + overrides + vínculos
CREATE OR REPLACE FUNCTION public.import_catalog(
  _restaurant_id uuid, _payload jsonb, _deactivate_missing boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_tenant_id uuid; v_user_id uuid := auth.uid();
  v_cat jsonb; v_og jsonb; v_oi jsonb; v_prod jsonb; v_var jsonb; v_pc jsonb;
  v_pf jsonb; v_override jsonb; v_pfp jsonb; v_og_code_link text; v_flavor_code text;
  v_cat_id uuid; v_og_id uuid; v_oi_id uuid; v_prod_id uuid; v_pf_id uuid;
  v_cat_id_lookup uuid; v_og_id_lookup uuid; v_var_id_lookup uuid; v_pf_id_lookup uuid;
  v_seen_cat_codes text[] := ARRAY[]::text[];
  v_seen_prod_codes text[] := ARRAY[]::text[];
  v_seen_og_codes text[] := ARRAY[]::text[];
  v_seen_oi_codes text[]; v_seen_var_codes text[]; v_seen_pf_codes text[] := ARRAY[]::text[];
  v_var_code text; v_oi_code text; v_pf_code text;
  v_count_cats int := 0; v_count_prods int := 0; v_count_ogs int := 0;
  v_count_ois int := 0; v_count_vars int := 0; v_count_pfs int := 0;
BEGIN
  IF NOT public.has_any_role_in_restaurant(v_user_id, _restaurant_id, ARRAY['owner','manager']::app_role[]) THEN
    RAISE EXCEPTION 'Acesso negado: somente owner ou manager podem importar catálogo.';
  END IF;
  SELECT tenant_id INTO v_tenant_id FROM public.restaurants WHERE id = _restaurant_id;
  IF v_tenant_id IS NULL THEN RAISE EXCEPTION 'Restaurante não encontrado.'; END IF;

  -- Categorias
  FOR v_cat IN SELECT * FROM jsonb_array_elements(COALESCE(_payload->'categories', '[]'::jsonb)) LOOP
    IF (v_cat->>'name') IS NULL OR length(trim(v_cat->>'name')) = 0 THEN RAISE EXCEPTION 'Categoria sem nome.'; END IF;
    IF (v_cat->>'code') IS NULL OR length(trim(v_cat->>'code')) = 0 THEN RAISE EXCEPTION 'Categoria "%": code obrigatório.', v_cat->>'name'; END IF;
    IF (v_cat->>'code') = ANY(v_seen_cat_codes) THEN RAISE EXCEPTION 'Categoria duplicada: %', v_cat->>'code'; END IF;
    v_seen_cat_codes := v_seen_cat_codes || (v_cat->>'code');

    INSERT INTO public.product_categories (tenant_id, restaurant_id, code, name, sort_order, active)
    VALUES (v_tenant_id, _restaurant_id, v_cat->>'code', v_cat->>'name',
            COALESCE((v_cat->>'sort_order')::int, 0), COALESCE((v_cat->>'active')::boolean, true))
    ON CONFLICT (restaurant_id, lower(code)) WHERE code IS NOT NULL
    DO UPDATE SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order,
                  active = EXCLUDED.active, updated_at = now();
    v_count_cats := v_count_cats + 1;
  END LOOP;

  -- Pizza flavors (antes de produtos para resolver vínculos)
  FOR v_pf IN SELECT * FROM jsonb_array_elements(COALESCE(_payload->'pizza_flavors', '[]'::jsonb)) LOOP
    IF (v_pf->>'code') IS NULL THEN RAISE EXCEPTION 'Sabor sem code: %', v_pf->>'name'; END IF;
    IF (v_pf->>'code') = ANY(v_seen_pf_codes) THEN RAISE EXCEPTION 'Sabor duplicado: %', v_pf->>'code'; END IF;
    v_seen_pf_codes := v_seen_pf_codes || (v_pf->>'code');

    INSERT INTO public.pizza_flavors (tenant_id, restaurant_id, code, name, description, category, active, sort_order, image_url)
    VALUES (v_tenant_id, _restaurant_id, v_pf->>'code', v_pf->>'name',
            v_pf->>'description', v_pf->>'category',
            COALESCE((v_pf->>'active')::boolean, true),
            COALESCE((v_pf->>'sort_order')::int, 0), v_pf->>'image_url')
    ON CONFLICT (restaurant_id, lower(code)) WHERE code IS NOT NULL
    DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description,
                  category = EXCLUDED.category, active = EXCLUDED.active,
                  sort_order = EXCLUDED.sort_order, image_url = EXCLUDED.image_url,
                  updated_at = now();
    v_count_pfs := v_count_pfs + 1;
  END LOOP;

  -- Option groups + items + overrides
  FOR v_og IN SELECT * FROM jsonb_array_elements(COALESCE(_payload->'option_groups', '[]'::jsonb)) LOOP
    IF (v_og->>'code') IS NULL THEN RAISE EXCEPTION 'Grupo sem code: %', v_og->>'name'; END IF;
    IF (v_og->>'code') = ANY(v_seen_og_codes) THEN RAISE EXCEPTION 'Grupo duplicado: %', v_og->>'code'; END IF;
    v_seen_og_codes := v_seen_og_codes || (v_og->>'code');

    IF COALESCE((v_og->>'is_required')::boolean, false) AND COALESCE((v_og->>'min_options')::int, 0) < 1 THEN
      RAISE EXCEPTION 'Grupo "%" obrigatório com min_options < 1.', v_og->>'name';
    END IF;
    IF COALESCE((v_og->>'max_options')::int, 1) < COALESCE((v_og->>'min_options')::int, 0) THEN
      RAISE EXCEPTION 'Grupo "%" max < min.', v_og->>'name';
    END IF;

    INSERT INTO public.option_groups (restaurant_id, code, name, min_options, max_options, is_required, active, sort_order)
    VALUES (_restaurant_id, v_og->>'code', v_og->>'name',
            COALESCE((v_og->>'min_options')::int, 0),
            COALESCE((v_og->>'max_options')::int, 1),
            COALESCE((v_og->>'is_required')::boolean, false),
            COALESCE((v_og->>'active')::boolean, true),
            COALESCE((v_og->>'sort_order')::int, 0))
    ON CONFLICT (restaurant_id, lower(code)) WHERE code IS NOT NULL
    DO UPDATE SET name = EXCLUDED.name, min_options = EXCLUDED.min_options,
                  max_options = EXCLUDED.max_options, is_required = EXCLUDED.is_required,
                  active = EXCLUDED.active, sort_order = EXCLUDED.sort_order, updated_at = now()
    RETURNING id INTO v_og_id;

    v_seen_oi_codes := ARRAY[]::text[];
    FOR v_oi IN SELECT * FROM jsonb_array_elements(COALESCE(v_og->'items', '[]'::jsonb)) LOOP
      IF (v_oi->>'code') IS NULL THEN RAISE EXCEPTION 'Item sem code no grupo %', v_og->>'code'; END IF;
      IF (v_oi->>'code') = ANY(v_seen_oi_codes) THEN RAISE EXCEPTION 'Item duplicado "%" em %', v_oi->>'code', v_og->>'code'; END IF;
      v_seen_oi_codes := v_seen_oi_codes || (v_oi->>'code');

      IF COALESCE((v_oi->>'price_cents')::int, 0) < 0 THEN RAISE EXCEPTION 'Item "%" preço negativo.', v_oi->>'name'; END IF;

      INSERT INTO public.option_items (group_id, code, name, price_cents, cost_cents, active, sort_order)
      VALUES (v_og_id, v_oi->>'code', v_oi->>'name',
              COALESCE((v_oi->>'price_cents')::int, 0),
              (v_oi->>'cost_cents')::int,
              COALESCE((v_oi->>'active')::boolean, true),
              COALESCE((v_oi->>'sort_order')::int, 0))
      ON CONFLICT (group_id, lower(code)) WHERE code IS NOT NULL
      DO UPDATE SET name = EXCLUDED.name, price_cents = EXCLUDED.price_cents,
                    cost_cents = EXCLUDED.cost_cents, active = EXCLUDED.active,
                    sort_order = EXCLUDED.sort_order, updated_at = now()
      RETURNING id INTO v_oi_id;

      -- Overrides serão aplicados depois de variants existirem.
      -- Salvamos pendência via marcador no payload ao final (tratamos em segunda passada).

      v_count_ois := v_count_ois + 1;
    END LOOP;
    v_count_ogs := v_count_ogs + 1;
  END LOOP;

  -- Produtos + variants + pizza config + flavor links + flavor prices
  FOR v_prod IN SELECT * FROM jsonb_array_elements(COALESCE(_payload->'products', '[]'::jsonb)) LOOP
    IF (v_prod->>'code') IS NULL THEN RAISE EXCEPTION 'Produto sem code: %', v_prod->>'name'; END IF;
    IF (v_prod->>'code') = ANY(v_seen_prod_codes) THEN RAISE EXCEPTION 'Produto duplicado: %', v_prod->>'code'; END IF;
    v_seen_prod_codes := v_seen_prod_codes || (v_prod->>'code');

    IF COALESCE((v_prod->>'price_cents')::int, 0) < 0 THEN RAISE EXCEPTION 'Produto "%" preço negativo.', v_prod->>'name'; END IF;

    v_cat_id_lookup := NULL;
    IF (v_prod->>'category_code') IS NOT NULL THEN
      SELECT id INTO v_cat_id_lookup FROM public.product_categories
        WHERE restaurant_id = _restaurant_id AND lower(code) = lower(v_prod->>'category_code');
      IF v_cat_id_lookup IS NULL THEN RAISE EXCEPTION 'Produto "%": categoria "%" não existe.', v_prod->>'name', v_prod->>'category_code'; END IF;
    END IF;

    INSERT INTO public.products (
      tenant_id, restaurant_id, code, category_id, name, description,
      price_cents, cost_cents, active, sort_order, image_url, type
    ) VALUES (
      v_tenant_id, _restaurant_id, v_prod->>'code', v_cat_id_lookup,
      v_prod->>'name', v_prod->>'description',
      COALESCE((v_prod->>'price_cents')::int, 0),
      COALESCE((v_prod->>'cost_cents')::int, 0),
      COALESCE((v_prod->>'active')::boolean, true),
      COALESCE((v_prod->>'sort_order')::int, 0),
      v_prod->>'image_url',
      COALESCE((v_prod->>'type')::product_type, 'simple'::product_type)
    )
    ON CONFLICT (restaurant_id, lower(code)) WHERE code IS NOT NULL
    DO UPDATE SET category_id = EXCLUDED.category_id, name = EXCLUDED.name,
                  description = EXCLUDED.description, price_cents = EXCLUDED.price_cents,
                  cost_cents = EXCLUDED.cost_cents, active = EXCLUDED.active,
                  sort_order = EXCLUDED.sort_order, image_url = EXCLUDED.image_url,
                  type = EXCLUDED.type, updated_at = now()
    RETURNING id INTO v_prod_id;

    v_seen_var_codes := ARRAY[]::text[];
    FOR v_var IN SELECT * FROM jsonb_array_elements(COALESCE(v_prod->'variants', '[]'::jsonb)) LOOP
      v_var_code := v_var->>'code';
      IF v_var_code IS NULL THEN RAISE EXCEPTION 'Variação sem code em %', v_prod->>'code'; END IF;
      IF v_var_code = ANY(v_seen_var_codes) THEN RAISE EXCEPTION 'Variação duplicada "%" em %', v_var_code, v_prod->>'code'; END IF;
      v_seen_var_codes := v_seen_var_codes || v_var_code;

      INSERT INTO public.product_variants (product_id, code, name, price_cents, cost_cents, active, sort_order)
      VALUES (v_prod_id, v_var_code, v_var->>'name',
              COALESCE((v_var->>'price_cents')::int, 0),
              (v_var->>'cost_cents')::int,
              COALESCE((v_var->>'active')::boolean, true),
              COALESCE((v_var->>'sort_order')::int, 0))
      ON CONFLICT (product_id, lower(code)) WHERE code IS NOT NULL
      DO UPDATE SET name = EXCLUDED.name, price_cents = EXCLUDED.price_cents,
                    cost_cents = EXCLUDED.cost_cents, active = EXCLUDED.active,
                    sort_order = EXCLUDED.sort_order, updated_at = now();
      v_count_vars := v_count_vars + 1;
    END LOOP;

    v_pc := v_prod->'pizza_config';
    IF v_pc IS NOT NULL AND v_pc != 'null'::jsonb THEN
      IF COALESCE((v_pc->>'max_flavors')::int, 1) < 1 OR COALESCE((v_pc->>'max_flavors')::int, 1) > 4 THEN
        RAISE EXCEPTION 'Pizza "%": max_flavors deve estar entre 1 e 4.', v_prod->>'name';
      END IF;
      INSERT INTO public.pizza_configs (product_id, max_flavors, price_rule, allow_edge_customization)
      VALUES (v_prod_id, COALESCE((v_pc->>'max_flavors')::int, 1),
              COALESCE((v_pc->>'price_rule')::pizza_price_rule, 'max'::pizza_price_rule),
              COALESCE((v_pc->>'allow_edge_customization')::boolean, true))
      ON CONFLICT (product_id) DO UPDATE SET max_flavors = EXCLUDED.max_flavors,
                    price_rule = EXCLUDED.price_rule,
                    allow_edge_customization = EXCLUDED.allow_edge_customization;
    END IF;

    DELETE FROM public.product_option_groups WHERE product_id = v_prod_id;
    IF jsonb_array_length(COALESCE(v_prod->'option_group_codes', '[]'::jsonb)) > 0 THEN
      FOR v_og_code_link IN SELECT jsonb_array_elements_text(v_prod->'option_group_codes') LOOP
        SELECT id INTO v_og_id_lookup FROM public.option_groups
          WHERE restaurant_id = _restaurant_id AND lower(code) = lower(v_og_code_link);
        IF v_og_id_lookup IS NULL THEN RAISE EXCEPTION 'Produto "%": grupo "%" não existe.', v_prod->>'name', v_og_code_link; END IF;
        INSERT INTO public.product_option_groups (product_id, group_id) VALUES (v_prod_id, v_og_id_lookup);
      END LOOP;
    END IF;

    -- Vincular sabores
    DELETE FROM public.product_pizza_flavors WHERE product_id = v_prod_id;
    IF jsonb_array_length(COALESCE(v_prod->'pizza_flavor_codes', '[]'::jsonb)) > 0 THEN
      FOR v_flavor_code IN SELECT jsonb_array_elements_text(v_prod->'pizza_flavor_codes') LOOP
        SELECT id INTO v_pf_id_lookup FROM public.pizza_flavors
          WHERE restaurant_id = _restaurant_id AND lower(code) = lower(v_flavor_code);
        IF v_pf_id_lookup IS NULL THEN RAISE EXCEPTION 'Pizza "%": sabor "%" não existe.', v_prod->>'name', v_flavor_code; END IF;
        INSERT INTO public.product_pizza_flavors (product_id, flavor_id) VALUES (v_prod_id, v_pf_id_lookup);
      END LOOP;
    END IF;

    -- Preços de sabor por tamanho
    FOR v_pfp IN SELECT * FROM jsonb_array_elements(COALESCE(v_prod->'pizza_flavor_prices', '[]'::jsonb)) LOOP
      SELECT id INTO v_pf_id_lookup FROM public.pizza_flavors
        WHERE restaurant_id = _restaurant_id AND lower(code) = lower(v_pfp->>'flavor_code');
      SELECT id INTO v_var_id_lookup FROM public.product_variants
        WHERE product_id = v_prod_id AND lower(code) = lower(v_pfp->>'variant_code');
      IF v_pf_id_lookup IS NULL OR v_var_id_lookup IS NULL THEN
        RAISE EXCEPTION 'Pizza "%": pricing inválido (sabor=% / tamanho=%).', v_prod->>'name', v_pfp->>'flavor_code', v_pfp->>'variant_code';
      END IF;
      INSERT INTO public.pizza_flavor_prices (flavor_id, variant_id, price_cents)
      VALUES (v_pf_id_lookup, v_var_id_lookup, COALESCE((v_pfp->>'price_cents')::int, 0))
      ON CONFLICT (flavor_id, variant_id) DO UPDATE SET price_cents = EXCLUDED.price_cents;
    END LOOP;

    v_count_prods := v_count_prods + 1;
  END LOOP;

  -- Segunda passada: overrides de option_items por variant
  FOR v_og IN SELECT * FROM jsonb_array_elements(COALESCE(_payload->'option_groups', '[]'::jsonb)) LOOP
    SELECT id INTO v_og_id FROM public.option_groups
      WHERE restaurant_id = _restaurant_id AND lower(code) = lower(v_og->>'code');
    FOR v_oi IN SELECT * FROM jsonb_array_elements(COALESCE(v_og->'items', '[]'::jsonb)) LOOP
      SELECT id INTO v_oi_id FROM public.option_items
        WHERE group_id = v_og_id AND lower(code) = lower(v_oi->>'code');
      IF v_oi_id IS NOT NULL AND jsonb_array_length(COALESCE(v_oi->'price_overrides', '[]'::jsonb)) > 0 THEN
        FOR v_override IN SELECT * FROM jsonb_array_elements(v_oi->'price_overrides') LOOP
          -- variant_code precisa existir em algum produto do restaurante
          SELECT pv.id INTO v_var_id_lookup FROM public.product_variants pv
            JOIN public.products p ON p.id = pv.product_id
            WHERE p.restaurant_id = _restaurant_id AND lower(pv.code) = lower(v_override->>'variant_code')
            LIMIT 1;
          IF v_var_id_lookup IS NOT NULL THEN
            INSERT INTO public.option_item_price_overrides (option_item_id, variant_id, price_cents)
            VALUES (v_oi_id, v_var_id_lookup, COALESCE((v_override->>'price_cents')::int, 0))
            ON CONFLICT (option_item_id, variant_id) DO UPDATE SET price_cents = EXCLUDED.price_cents;
          END IF;
        END LOOP;
      END IF;
    END LOOP;
  END LOOP;

  IF _deactivate_missing THEN
    UPDATE public.products SET active = false, updated_at = now()
      WHERE restaurant_id = _restaurant_id AND code IS NOT NULL AND NOT (code = ANY(v_seen_prod_codes));
    UPDATE public.product_categories SET active = false, updated_at = now()
      WHERE restaurant_id = _restaurant_id AND code IS NOT NULL AND NOT (code = ANY(v_seen_cat_codes));
    UPDATE public.option_groups SET active = false, updated_at = now()
      WHERE restaurant_id = _restaurant_id AND code IS NOT NULL AND NOT (code = ANY(v_seen_og_codes));
    UPDATE public.pizza_flavors SET active = false, updated_at = now()
      WHERE restaurant_id = _restaurant_id AND code IS NOT NULL AND NOT (code = ANY(v_seen_pf_codes));
  END IF;

  INSERT INTO public.audit_log (tenant_id, restaurant_id, user_id, action, entity, payload)
  VALUES (v_tenant_id, _restaurant_id, v_user_id, 'catalog.import', 'catalog',
    jsonb_build_object('categories', v_count_cats, 'products', v_count_prods,
      'option_groups', v_count_ogs, 'option_items', v_count_ois,
      'variants', v_count_vars, 'pizza_flavors', v_count_pfs,
      'deactivate_missing', _deactivate_missing));

  RETURN jsonb_build_object('ok', true,
    'categories', v_count_cats, 'products', v_count_prods,
    'option_groups', v_count_ogs, 'option_items', v_count_ois,
    'variants', v_count_vars, 'pizza_flavors', v_count_pfs);
END;
$$;