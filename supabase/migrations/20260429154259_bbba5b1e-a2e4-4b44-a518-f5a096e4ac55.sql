CREATE OR REPLACE FUNCTION public.import_catalog(_restaurant_id uuid, _payload jsonb, _deactivate_missing boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Global Settings
  UPDATE public.restaurants 
  SET 
    inventory_enabled = COALESCE((_payload->>'inventory_enabled')::boolean, inventory_enabled),
    inventory_mode = COALESCE(_payload->>'inventory_mode', inventory_mode)
  WHERE id = _restaurant_id;

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

  -- Pizza flavors
  FOR v_pf IN SELECT * FROM jsonb_array_elements(COALESCE(_payload->'pizza_flavors', '[]'::jsonb)) LOOP
    IF (v_pf->>'code') IS NULL THEN RAISE EXCEPTION 'Sabor sem code: %', v_pf->>'name'; END IF;
    IF (v_pf->>'code') = ANY(v_seen_pf_codes) THEN RAISE EXCEPTION 'Sabor duplicado: %', v_pf->>'code'; END IF;
    v_seen_pf_codes := v_seen_pf_codes || (v_pf->>'code');

    INSERT INTO public.pizza_flavors (
      tenant_id, restaurant_id, code, name, description, category, active, sort_order, image_url,
      track_stock, stock_quantity, low_stock_alert, allow_out_of_stock_sale
    )
    VALUES (
      v_tenant_id, _restaurant_id, v_pf->>'code', v_pf->>'name',
      v_pf->>'description', v_pf->>'category',
      COALESCE((v_pf->>'active')::boolean, true),
      COALESCE((v_pf->>'sort_order')::int, 0), v_pf->>'image_url',
      COALESCE((v_pf->>'track_stock')::boolean, false),
      COALESCE((v_pf->>'stock_quantity')::numeric, 0),
      (v_pf->>'low_stock_alert')::numeric,
      COALESCE((v_pf->>'allow_out_of_stock_sale')::boolean, false)
    )
    ON CONFLICT (restaurant_id, lower(code)) WHERE code IS NOT NULL
    DO UPDATE SET 
      name = EXCLUDED.name, 
      description = EXCLUDED.description,
      category = EXCLUDED.category, 
      active = EXCLUDED.active,
      sort_order = EXCLUDED.sort_order, 
      image_url = EXCLUDED.image_url,
      track_stock = EXCLUDED.track_stock,
      stock_quantity = EXCLUDED.stock_quantity,
      low_stock_alert = EXCLUDED.low_stock_alert,
      allow_out_of_stock_sale = EXCLUDED.allow_out_of_stock_sale,
      updated_at = now();
    
    -- Log change if it's a manual import
    SELECT id INTO v_pf_id FROM public.pizza_flavors WHERE restaurant_id = _restaurant_id AND lower(code) = lower(v_pf->>'code');
    INSERT INTO public.inventory_logs (restaurant_id, tenant_id, item_type, item_id, old_quantity, new_quantity, change_amount, reason, created_by)
    VALUES (_restaurant_id, v_tenant_id, 'pizza_flavor', v_pf_id, 0, COALESCE((v_pf->>'stock_quantity')::numeric, 0), COALESCE((v_pf->>'stock_quantity')::numeric, 0), 'import', v_user_id);
    
    v_count_pfs := v_count_pfs + 1;
  END LOOP;

  -- Option groups + items
  FOR v_og IN SELECT * FROM jsonb_array_elements(COALESCE(_payload->'option_groups', '[]'::jsonb)) LOOP
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

    FOR v_oi IN SELECT * FROM jsonb_array_elements(COALESCE(v_og->'items', '[]'::jsonb)) LOOP
      INSERT INTO public.option_items (
        group_id, code, name, price_cents, cost_cents, active, sort_order,
        track_stock, stock_quantity, low_stock_alert, allow_out_of_stock_sale
      )
      VALUES (
        v_og_id, v_oi->>'code', v_oi->>'name',
        COALESCE((v_oi->>'price_cents')::int, 0),
        (v_oi->>'cost_cents')::int,
        COALESCE((v_oi->>'active')::boolean, true),
        COALESCE((v_oi->>'sort_order')::int, 0),
        COALESCE((v_oi->>'track_stock')::boolean, false),
        COALESCE((v_oi->>'stock_quantity')::numeric, 0),
        (v_oi->>'low_stock_alert')::numeric,
        COALESCE((v_oi->>'allow_out_of_stock_sale')::boolean, false)
      )
      ON CONFLICT (group_id, lower(code)) WHERE code IS NOT NULL
      DO UPDATE SET 
        name = EXCLUDED.name, price_cents = EXCLUDED.price_cents,
        cost_cents = EXCLUDED.cost_cents, active = EXCLUDED.active,
        sort_order = EXCLUDED.sort_order,
        track_stock = EXCLUDED.track_stock,
        stock_quantity = EXCLUDED.stock_quantity,
        low_stock_alert = EXCLUDED.low_stock_alert,
        allow_out_of_stock_sale = EXCLUDED.allow_out_of_stock_sale,
        updated_at = now()
      RETURNING id INTO v_oi_id;

      -- Log import
      INSERT INTO public.inventory_logs (restaurant_id, tenant_id, item_type, item_id, old_quantity, new_quantity, change_amount, reason, created_by)
      VALUES (_restaurant_id, v_tenant_id, 'option_item', v_oi_id, 0, COALESCE((v_oi->>'stock_quantity')::numeric, 0), COALESCE((v_oi->>'stock_quantity')::numeric, 0), 'import', v_user_id);
      
      v_count_ois := v_count_ois + 1;
    END LOOP;
    v_count_ogs := v_count_ogs + 1;
  END LOOP;

  -- Products + variants
  FOR v_prod IN SELECT * FROM jsonb_array_elements(COALESCE(_payload->'products', '[]'::jsonb)) LOOP
    v_cat_id_lookup := (SELECT id FROM public.product_categories WHERE restaurant_id = _restaurant_id AND lower(code) = lower(v_prod->>'category_code'));

    INSERT INTO public.products (
      tenant_id, restaurant_id, category_id, code, name, description, price_cents, cost_cents, active, sort_order, image_url, type,
      track_stock, stock_quantity, low_stock_alert, allow_out_of_stock_sale
    )
    VALUES (
      v_tenant_id, _restaurant_id, v_cat_id_lookup, v_prod->>'code', v_prod->>'name',
      v_prod->>'description', COALESCE((v_prod->>'price_cents')::int, 0),
      COALESCE((v_prod->>'cost_cents')::int, 0),
      COALESCE((v_prod->>'active')::boolean, true),
      COALESCE((v_prod->>'sort_order')::int, 0), v_prod->>'image_url',
      COALESCE((v_prod->>'type')::product_type, 'simple'),
      COALESCE((v_prod->>'track_stock')::boolean, false),
      COALESCE((v_prod->>'stock_quantity')::numeric, 0),
      (v_prod->>'low_stock_alert')::numeric,
      COALESCE((v_prod->>'allow_out_of_stock_sale')::boolean, false)
    )
    ON CONFLICT (restaurant_id, lower(code)) WHERE code IS NOT NULL
    DO UPDATE SET 
      category_id = EXCLUDED.category_id, name = EXCLUDED.name,
      description = EXCLUDED.description, price_cents = EXCLUDED.price_cents,
      cost_cents = EXCLUDED.cost_cents, active = EXCLUDED.active,
      sort_order = EXCLUDED.sort_order, image_url = EXCLUDED.image_url,
      type = EXCLUDED.type,
      track_stock = EXCLUDED.track_stock,
      stock_quantity = EXCLUDED.stock_quantity,
      low_stock_alert = EXCLUDED.low_stock_alert,
      allow_out_of_stock_sale = EXCLUDED.allow_out_of_stock_sale,
      updated_at = now()
    RETURNING id INTO v_prod_id;

    -- Log product import
    INSERT INTO public.inventory_logs (restaurant_id, tenant_id, item_type, item_id, old_quantity, new_quantity, change_amount, reason, created_by)
    VALUES (_restaurant_id, v_tenant_id, 'product', v_prod_id, 0, COALESCE((v_prod->>'stock_quantity')::numeric, 0), COALESCE((v_prod->>'stock_quantity')::numeric, 0), 'import', v_user_id);

    FOR v_var IN SELECT * FROM jsonb_array_elements(COALESCE(v_prod->'variants', '[]'::jsonb)) LOOP
      INSERT INTO public.product_variants (
        product_id, code, name, price_cents, cost_cents, active, sort_order,
        track_stock, stock_quantity, low_stock_alert, allow_out_of_stock_sale
      )
      VALUES (
        v_prod_id, v_var->>'code', v_var->>'name',
        COALESCE((v_var->>'price_cents')::int, 0),
        (v_var->>'cost_cents')::int,
        COALESCE((v_var->>'active')::boolean, true),
        COALESCE((v_var->>'sort_order')::int, 0),
        COALESCE((v_var->>'track_stock')::boolean, false),
        COALESCE((v_var->>'stock_quantity')::numeric, 0),
        (v_var->>'low_stock_alert')::numeric,
        COALESCE((v_var->>'allow_out_of_stock_sale')::boolean, false)
      )
      ON CONFLICT (product_id, lower(code)) WHERE code IS NOT NULL
      DO UPDATE SET 
        name = EXCLUDED.name, price_cents = EXCLUDED.price_cents,
        cost_cents = EXCLUDED.cost_cents, active = EXCLUDED.active,
        sort_order = EXCLUDED.sort_order,
        track_stock = EXCLUDED.track_stock,
        stock_quantity = EXCLUDED.stock_quantity,
        low_stock_alert = EXCLUDED.low_stock_alert,
        allow_out_of_stock_sale = EXCLUDED.allow_out_of_stock_sale,
        updated_at = now()
      RETURNING id INTO v_var_id_lookup;
      
      -- Log variant import
      INSERT INTO public.inventory_logs (restaurant_id, tenant_id, item_type, item_id, old_quantity, new_quantity, change_amount, reason, created_by)
      VALUES (_restaurant_id, v_tenant_id, 'variant', v_var_id_lookup, 0, COALESCE((v_var->>'stock_quantity')::numeric, 0), COALESCE((v_var->>'stock_quantity')::numeric, 0), 'import', v_user_id);
      
      v_count_vars := v_count_vars + 1;
    END LOOP;
    v_count_prods := v_count_prods + 1;
  END LOOP;

  -- Cleanup missing items if requested
  IF _deactivate_missing THEN
     UPDATE public.products SET active = false WHERE restaurant_id = _restaurant_id AND (code IS NULL OR code != ALL(v_seen_prod_codes));
  END IF;

  RETURN jsonb_build_object(
    'categories', v_count_cats,
    'products', v_count_prods,
    'variants', v_count_vars,
    'option_groups', v_count_ogs,
    'option_items', v_count_ois,
    'pizza_flavors', v_count_pfs
  );
END;
$function$;
