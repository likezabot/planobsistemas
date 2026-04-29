-- ============================================================================
-- export_catalog: retorna o catálogo completo do restaurante como JSON
-- ============================================================================
CREATE OR REPLACE FUNCTION public.export_catalog(_restaurant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- Permissão: precisa ser membro
  IF NOT public.is_member_of_restaurant(auth.uid(), _restaurant_id) THEN
    RAISE EXCEPTION 'Acesso negado: você não é membro deste restaurante.';
  END IF;

  SELECT jsonb_build_object(
    'version', '1',
    'exported_at', now(),
    'restaurant_id', _restaurant_id,
    'categories', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'code', c.code,
        'name', c.name,
        'sort_order', c.sort_order,
        'active', c.active
      ) ORDER BY c.sort_order, c.name)
      FROM public.product_categories c
      WHERE c.restaurant_id = _restaurant_id
    ), '[]'::jsonb),
    'option_groups', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'code', og.code,
        'name', og.name,
        'min_options', og.min_options,
        'max_options', og.max_options,
        'is_required', og.is_required,
        'active', og.active,
        'sort_order', og.sort_order,
        'items', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'code', oi.code,
            'name', oi.name,
            'price_cents', oi.price_cents,
            'cost_cents', oi.cost_cents,
            'active', oi.active,
            'sort_order', oi.sort_order
          ) ORDER BY oi.sort_order, oi.name)
          FROM public.option_items oi
          WHERE oi.group_id = og.id
        ), '[]'::jsonb)
      ) ORDER BY og.sort_order, og.name)
      FROM public.option_groups og
      WHERE og.restaurant_id = _restaurant_id
    ), '[]'::jsonb),
    'products', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'code', p.code,
        'name', p.name,
        'description', p.description,
        'category_code', (SELECT c.code FROM public.product_categories c WHERE c.id = p.category_id),
        'price_cents', p.price_cents,
        'cost_cents', p.cost_cents,
        'active', p.active,
        'sort_order', p.sort_order,
        'image_url', p.image_url,
        'type', p.type,
        'variants', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'code', pv.code,
            'name', pv.name,
            'price_cents', pv.price_cents,
            'cost_cents', pv.cost_cents,
            'active', pv.active,
            'sort_order', pv.sort_order
          ) ORDER BY pv.sort_order, pv.name)
          FROM public.product_variants pv
          WHERE pv.product_id = p.id
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
            'allow_edge_customization', pc.allow_edge_customization,
            'flavor_codes', COALESCE((
              SELECT jsonb_agg(fp.code) FROM public.products fp
              WHERE fp.restaurant_id = _restaurant_id
                AND fp.code IS NOT NULL
                -- placeholder: sabores são produtos separados (será gerenciado por convenção/category)
                AND false
            ), '[]'::jsonb)
          )
          FROM public.pizza_configs pc WHERE pc.product_id = p.id
        )
      ) ORDER BY p.sort_order, p.name)
      FROM public.products p
      WHERE p.restaurant_id = _restaurant_id
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ============================================================================
-- import_catalog: importa catálogo em transação. Tudo ou nada.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.import_catalog(
  _restaurant_id uuid,
  _payload jsonb,
  _deactivate_missing boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant_id uuid;
  v_user_id uuid := auth.uid();
  v_cat jsonb;
  v_og jsonb;
  v_oi jsonb;
  v_prod jsonb;
  v_var jsonb;
  v_pc jsonb;
  v_og_code_link text;

  v_cat_id uuid;
  v_og_id uuid;
  v_prod_id uuid;
  v_cat_id_lookup uuid;
  v_og_id_lookup uuid;

  v_seen_cat_codes text[] := ARRAY[]::text[];
  v_seen_prod_codes text[] := ARRAY[]::text[];
  v_seen_og_codes text[] := ARRAY[]::text[];
  v_seen_oi_codes text[] := ARRAY[]::text[];

  v_count_cats int := 0;
  v_count_prods int := 0;
  v_count_ogs int := 0;
  v_count_ois int := 0;
  v_count_vars int := 0;

  v_seen_var_codes text[];
  v_var_code text;
  v_oi_code text;
BEGIN
  -- 1) Permissão: somente owner / manager
  IF NOT public.has_any_role_in_restaurant(v_user_id, _restaurant_id, ARRAY['owner','manager']::app_role[]) THEN
    RAISE EXCEPTION 'Acesso negado: somente owner ou manager podem importar catálogo.';
  END IF;

  SELECT tenant_id INTO v_tenant_id FROM public.restaurants WHERE id = _restaurant_id;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Restaurante não encontrado.';
  END IF;

  -- 2) Categorias (upsert por code)
  FOR v_cat IN SELECT * FROM jsonb_array_elements(COALESCE(_payload->'categories', '[]'::jsonb)) LOOP
    IF (v_cat->>'name') IS NULL OR length(trim(v_cat->>'name')) = 0 THEN
      RAISE EXCEPTION 'Categoria sem nome.';
    END IF;
    IF (v_cat->>'code') IS NULL OR length(trim(v_cat->>'code')) = 0 THEN
      RAISE EXCEPTION 'Categoria "%": campo code é obrigatório.', v_cat->>'name';
    END IF;
    IF (v_cat->>'code') = ANY(v_seen_cat_codes) THEN
      RAISE EXCEPTION 'Categoria com code duplicado: %', v_cat->>'code';
    END IF;
    v_seen_cat_codes := v_seen_cat_codes || (v_cat->>'code');

    INSERT INTO public.product_categories (tenant_id, restaurant_id, code, name, sort_order, active)
    VALUES (
      v_tenant_id, _restaurant_id, v_cat->>'code', v_cat->>'name',
      COALESCE((v_cat->>'sort_order')::int, 0),
      COALESCE((v_cat->>'active')::boolean, true)
    )
    ON CONFLICT (restaurant_id, lower(code)) WHERE code IS NOT NULL
    DO UPDATE SET
      name = EXCLUDED.name,
      sort_order = EXCLUDED.sort_order,
      active = EXCLUDED.active,
      updated_at = now();
    v_count_cats := v_count_cats + 1;
  END LOOP;

  -- 3) Option groups + items (upsert por code)
  FOR v_og IN SELECT * FROM jsonb_array_elements(COALESCE(_payload->'option_groups', '[]'::jsonb)) LOOP
    IF (v_og->>'code') IS NULL OR length(trim(v_og->>'code')) = 0 THEN
      RAISE EXCEPTION 'Grupo de adicional sem code: %', v_og->>'name';
    END IF;
    IF (v_og->>'code') = ANY(v_seen_og_codes) THEN
      RAISE EXCEPTION 'Grupo de adicional duplicado: %', v_og->>'code';
    END IF;
    v_seen_og_codes := v_seen_og_codes || (v_og->>'code');

    IF COALESCE((v_og->>'is_required')::boolean, false) AND COALESCE((v_og->>'min_options')::int, 0) < 1 THEN
      RAISE EXCEPTION 'Grupo "%" é obrigatório mas min_options < 1.', v_og->>'name';
    END IF;
    IF COALESCE((v_og->>'min_options')::int, 0) < 0 THEN
      RAISE EXCEPTION 'Grupo "%" tem min_options negativo.', v_og->>'name';
    END IF;
    IF COALESCE((v_og->>'max_options')::int, 1) < COALESCE((v_og->>'min_options')::int, 0) THEN
      RAISE EXCEPTION 'Grupo "%" tem max_options < min_options.', v_og->>'name';
    END IF;

    INSERT INTO public.option_groups (restaurant_id, code, name, min_options, max_options, is_required, active, sort_order)
    VALUES (
      _restaurant_id, v_og->>'code', v_og->>'name',
      COALESCE((v_og->>'min_options')::int, 0),
      COALESCE((v_og->>'max_options')::int, 1),
      COALESCE((v_og->>'is_required')::boolean, false),
      COALESCE((v_og->>'active')::boolean, true),
      COALESCE((v_og->>'sort_order')::int, 0)
    )
    ON CONFLICT (restaurant_id, lower(code)) WHERE code IS NOT NULL
    DO UPDATE SET
      name = EXCLUDED.name,
      min_options = EXCLUDED.min_options,
      max_options = EXCLUDED.max_options,
      is_required = EXCLUDED.is_required,
      active = EXCLUDED.active,
      sort_order = EXCLUDED.sort_order,
      updated_at = now()
    RETURNING id INTO v_og_id;

    -- Items
    v_seen_oi_codes := ARRAY[]::text[];
    FOR v_oi IN SELECT * FROM jsonb_array_elements(COALESCE(v_og->'items', '[]'::jsonb)) LOOP
      IF (v_oi->>'code') IS NULL THEN
        RAISE EXCEPTION 'Item de adicional sem code no grupo %', v_og->>'code';
      END IF;
      IF (v_oi->>'code') = ANY(v_seen_oi_codes) THEN
        RAISE EXCEPTION 'Item duplicado "%" no grupo %', v_oi->>'code', v_og->>'code';
      END IF;
      v_seen_oi_codes := v_seen_oi_codes || (v_oi->>'code');

      IF COALESCE((v_oi->>'price_cents')::int, 0) < 0 THEN
        RAISE EXCEPTION 'Item "%" tem preço negativo.', v_oi->>'name';
      END IF;
      IF COALESCE((v_oi->>'cost_cents')::int, 0) < 0 THEN
        RAISE EXCEPTION 'Item "%" tem custo negativo.', v_oi->>'name';
      END IF;

      INSERT INTO public.option_items (group_id, code, name, price_cents, cost_cents, active, sort_order)
      VALUES (
        v_og_id, v_oi->>'code', v_oi->>'name',
        COALESCE((v_oi->>'price_cents')::int, 0),
        (v_oi->>'cost_cents')::int,
        COALESCE((v_oi->>'active')::boolean, true),
        COALESCE((v_oi->>'sort_order')::int, 0)
      )
      ON CONFLICT (group_id, lower(code)) WHERE code IS NOT NULL
      DO UPDATE SET
        name = EXCLUDED.name,
        price_cents = EXCLUDED.price_cents,
        cost_cents = EXCLUDED.cost_cents,
        active = EXCLUDED.active,
        sort_order = EXCLUDED.sort_order,
        updated_at = now();
      v_count_ois := v_count_ois + 1;
    END LOOP;

    v_count_ogs := v_count_ogs + 1;
  END LOOP;

  -- 4) Produtos (upsert por code) + variants + pizza_config + option group links
  FOR v_prod IN SELECT * FROM jsonb_array_elements(COALESCE(_payload->'products', '[]'::jsonb)) LOOP
    IF (v_prod->>'code') IS NULL OR length(trim(v_prod->>'code')) = 0 THEN
      RAISE EXCEPTION 'Produto sem code: %', v_prod->>'name';
    END IF;
    IF (v_prod->>'code') = ANY(v_seen_prod_codes) THEN
      RAISE EXCEPTION 'Produto com code duplicado: %', v_prod->>'code';
    END IF;
    v_seen_prod_codes := v_seen_prod_codes || (v_prod->>'code');

    IF COALESCE((v_prod->>'price_cents')::int, 0) < 0 THEN
      RAISE EXCEPTION 'Produto "%" tem preço negativo.', v_prod->>'name';
    END IF;
    IF COALESCE((v_prod->>'cost_cents')::int, 0) < 0 THEN
      RAISE EXCEPTION 'Produto "%" tem custo negativo.', v_prod->>'name';
    END IF;

    -- Resolve category_code -> id
    v_cat_id_lookup := NULL;
    IF (v_prod->>'category_code') IS NOT NULL THEN
      SELECT id INTO v_cat_id_lookup FROM public.product_categories
        WHERE restaurant_id = _restaurant_id AND lower(code) = lower(v_prod->>'category_code');
      IF v_cat_id_lookup IS NULL THEN
        RAISE EXCEPTION 'Produto "%": categoria com code "%" não existe.', v_prod->>'name', v_prod->>'category_code';
      END IF;
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
    DO UPDATE SET
      category_id = EXCLUDED.category_id,
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      price_cents = EXCLUDED.price_cents,
      cost_cents = EXCLUDED.cost_cents,
      active = EXCLUDED.active,
      sort_order = EXCLUDED.sort_order,
      image_url = EXCLUDED.image_url,
      type = EXCLUDED.type,
      updated_at = now()
    RETURNING id INTO v_prod_id;

    -- Variants
    v_seen_var_codes := ARRAY[]::text[];
    FOR v_var IN SELECT * FROM jsonb_array_elements(COALESCE(v_prod->'variants', '[]'::jsonb)) LOOP
      v_var_code := v_var->>'code';
      IF v_var_code IS NULL THEN
        RAISE EXCEPTION 'Variação sem code no produto %', v_prod->>'code';
      END IF;
      IF v_var_code = ANY(v_seen_var_codes) THEN
        RAISE EXCEPTION 'Variação duplicada "%" no produto %', v_var_code, v_prod->>'code';
      END IF;
      v_seen_var_codes := v_seen_var_codes || v_var_code;

      IF COALESCE((v_var->>'price_cents')::int, 0) < 0 THEN
        RAISE EXCEPTION 'Variação "%" tem preço negativo.', v_var->>'name';
      END IF;

      INSERT INTO public.product_variants (product_id, code, name, price_cents, cost_cents, active, sort_order)
      VALUES (
        v_prod_id, v_var_code, v_var->>'name',
        COALESCE((v_var->>'price_cents')::int, 0),
        (v_var->>'cost_cents')::int,
        COALESCE((v_var->>'active')::boolean, true),
        COALESCE((v_var->>'sort_order')::int, 0)
      )
      ON CONFLICT (product_id, lower(code)) WHERE code IS NOT NULL
      DO UPDATE SET
        name = EXCLUDED.name,
        price_cents = EXCLUDED.price_cents,
        cost_cents = EXCLUDED.cost_cents,
        active = EXCLUDED.active,
        sort_order = EXCLUDED.sort_order,
        updated_at = now();
      v_count_vars := v_count_vars + 1;
    END LOOP;

    -- Pizza config
    v_pc := v_prod->'pizza_config';
    IF v_pc IS NOT NULL AND v_pc != 'null'::jsonb THEN
      IF COALESCE((v_pc->>'max_flavors')::int, 1) < 1 OR COALESCE((v_pc->>'max_flavors')::int, 1) > 4 THEN
        RAISE EXCEPTION 'Pizza "%": max_flavors deve estar entre 1 e 4.', v_prod->>'name';
      END IF;
      INSERT INTO public.pizza_configs (product_id, max_flavors, price_rule, allow_edge_customization)
      VALUES (
        v_prod_id,
        COALESCE((v_pc->>'max_flavors')::int, 1),
        COALESCE((v_pc->>'price_rule')::pizza_price_rule, 'max'::pizza_price_rule),
        COALESCE((v_pc->>'allow_edge_customization')::boolean, true)
      )
      ON CONFLICT (product_id) DO UPDATE SET
        max_flavors = EXCLUDED.max_flavors,
        price_rule = EXCLUDED.price_rule,
        allow_edge_customization = EXCLUDED.allow_edge_customization;
    END IF;

    -- Re-link option groups (limpa e reinsere)
    DELETE FROM public.product_option_groups WHERE product_id = v_prod_id;
    IF jsonb_array_length(COALESCE(v_prod->'option_group_codes', '[]'::jsonb)) > 0 THEN
      FOR v_og_code_link IN SELECT jsonb_array_elements_text(v_prod->'option_group_codes') LOOP
        SELECT id INTO v_og_id_lookup FROM public.option_groups
          WHERE restaurant_id = _restaurant_id AND lower(code) = lower(v_og_code_link);
        IF v_og_id_lookup IS NULL THEN
          RAISE EXCEPTION 'Produto "%": grupo de adicional "%" não existe.', v_prod->>'name', v_og_code_link;
        END IF;
        INSERT INTO public.product_option_groups (product_id, group_id) VALUES (v_prod_id, v_og_id_lookup);
      END LOOP;
    END IF;

    v_count_prods := v_count_prods + 1;
  END LOOP;

  -- 5) Desativar ausentes (opcional)
  IF _deactivate_missing THEN
    UPDATE public.products SET active = false, updated_at = now()
      WHERE restaurant_id = _restaurant_id
        AND code IS NOT NULL
        AND NOT (code = ANY(v_seen_prod_codes));
    UPDATE public.product_categories SET active = false, updated_at = now()
      WHERE restaurant_id = _restaurant_id
        AND code IS NOT NULL
        AND NOT (code = ANY(v_seen_cat_codes));
    UPDATE public.option_groups SET active = false, updated_at = now()
      WHERE restaurant_id = _restaurant_id
        AND code IS NOT NULL
        AND NOT (code = ANY(v_seen_og_codes));
  END IF;

  -- 6) Audit
  INSERT INTO public.audit_log (tenant_id, restaurant_id, user_id, action, entity, payload)
  VALUES (
    v_tenant_id, _restaurant_id, v_user_id,
    'catalog.import', 'catalog',
    jsonb_build_object(
      'categories', v_count_cats,
      'products', v_count_prods,
      'option_groups', v_count_ogs,
      'option_items', v_count_ois,
      'variants', v_count_vars,
      'deactivate_missing', _deactivate_missing
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'categories', v_count_cats,
    'products', v_count_prods,
    'option_groups', v_count_ogs,
    'option_items', v_count_ois,
    'variants', v_count_vars
  );
END;
$$;