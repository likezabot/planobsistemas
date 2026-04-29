
-- Fixture E2E para Bloco A (pizza profissional)
-- Restaurante: e2e-public-on (já existe)
-- Cria: pizza com max_flavors=4 (regra max), 2 tamanhos, 4 sabores vinculados,
--       1 grupo de borda com 1 item e override por tamanho.

DO $$
DECLARE
  v_rest UUID;
  v_tenant UUID;
  v_pizza UUID := '77777777-aaaa-aaaa-aaaa-777777777777';
  v_var_m UUID := '77777777-bbbb-bbbb-bbbb-000000000001'; -- Média
  v_var_g UUID := '77777777-bbbb-bbbb-bbbb-000000000002'; -- Grande
  v_fl_a  UUID := '77777777-cccc-cccc-cccc-000000000001';
  v_fl_b  UUID := '77777777-cccc-cccc-cccc-000000000002';
  v_fl_c  UUID := '77777777-cccc-cccc-cccc-000000000003';
  v_fl_d  UUID := '77777777-cccc-cccc-cccc-000000000004';
  v_grp   UUID := '77777777-dddd-dddd-dddd-000000000001';
  v_borda UUID := '77777777-eeee-eeee-eeee-000000000001';
BEGIN
  SELECT id, tenant_id INTO v_rest, v_tenant FROM public.restaurants WHERE slug='e2e-public-on';
  IF v_rest IS NULL THEN RAISE NOTICE 'restaurant e2e-public-on missing'; RETURN; END IF;

  -- Pizza
  INSERT INTO public.products (id, tenant_id, restaurant_id, name, type, price_cents, active, sort_order)
  VALUES (v_pizza, v_tenant, v_rest, 'E2E Pizza Pro', 'pizza', 0, true, 10)
  ON CONFLICT (id) DO UPDATE SET active=true, type='pizza', name='E2E Pizza Pro';

  -- Config
  INSERT INTO public.pizza_configs (product_id, max_flavors, price_rule, allow_edge_customization)
  VALUES (v_pizza, 4, 'max', true)
  ON CONFLICT (product_id) DO UPDATE SET max_flavors=4, price_rule='max', allow_edge_customization=true;

  -- Tamanhos
  INSERT INTO public.product_variants (id, product_id, name, price_cents, active, sort_order)
  VALUES
    (v_var_m, v_pizza, 'Média', 3000, true, 1),
    (v_var_g, v_pizza, 'Grande', 5000, true, 2)
  ON CONFLICT (id) DO UPDATE SET active=true, name=EXCLUDED.name, price_cents=EXCLUDED.price_cents;

  -- Sabores
  INSERT INTO public.pizza_flavors (id, restaurant_id, tenant_id, name, active, sort_order)
  VALUES
    (v_fl_a, v_rest, v_tenant, 'E2E Sabor A', true, 1),
    (v_fl_b, v_rest, v_tenant, 'E2E Sabor B', true, 2),
    (v_fl_c, v_rest, v_tenant, 'E2E Sabor C', true, 3),
    (v_fl_d, v_rest, v_tenant, 'E2E Sabor D', true, 4)
  ON CONFLICT (id) DO UPDATE SET active=true, name=EXCLUDED.name;

  -- Cria também um sabor extra NÃO vinculado a esta pizza, para validar bloqueio
  INSERT INTO public.pizza_flavors (id, restaurant_id, tenant_id, name, active, sort_order)
  VALUES ('77777777-cccc-cccc-cccc-000000000099', v_rest, v_tenant, 'E2E Sabor Solto', true, 99)
  ON CONFLICT (id) DO UPDATE SET active=true;

  -- Vínculo Pizza ↔ Sabores (apenas A,B,C,D)
  DELETE FROM public.product_pizza_flavors WHERE product_id=v_pizza;
  INSERT INTO public.product_pizza_flavors (product_id, flavor_id, sort_order)
  VALUES (v_pizza, v_fl_a, 1), (v_pizza, v_fl_b, 2), (v_pizza, v_fl_c, 3), (v_pizza, v_fl_d, 4);

  -- Preço do sabor por tamanho (regra MAX → vence o maior)
  INSERT INTO public.pizza_flavor_prices (flavor_id, variant_id, price_cents) VALUES
    (v_fl_a, v_var_m, 0),    (v_fl_a, v_var_g, 0),
    (v_fl_b, v_var_m, 500),  (v_fl_b, v_var_g, 800),
    (v_fl_c, v_var_m, 1000), (v_fl_c, v_var_g, 1500),
    (v_fl_d, v_var_m, 200),  (v_fl_d, v_var_g, 300)
  ON CONFLICT (flavor_id, variant_id) DO UPDATE SET price_cents=EXCLUDED.price_cents;

  -- Grupo Borda + item, vinculado à pizza
  INSERT INTO public.option_groups (id, restaurant_id, name, min_options, max_options, is_required, active, sort_order)
  VALUES (v_grp, v_rest, 'E2E Borda', 0, 1, false, true, 1)
  ON CONFLICT (id) DO UPDATE SET active=true, name='E2E Borda';

  INSERT INTO public.option_items (id, group_id, name, price_cents, active, sort_order)
  VALUES (v_borda, v_grp, 'E2E Borda Catupiry', 1000, true, 1)
  ON CONFLICT (id) DO UPDATE SET active=true, price_cents=1000;

  INSERT INTO public.product_option_groups (product_id, group_id, sort_order)
  VALUES (v_pizza, v_grp, 1)
  ON CONFLICT DO NOTHING;

  -- Override: borda na grande custa 1500 (em vez de 1000)
  INSERT INTO public.option_item_price_overrides (option_item_id, variant_id, price_cents)
  VALUES (v_borda, v_var_g, 1500)
  ON CONFLICT (option_item_id, variant_id) DO UPDATE SET price_cents=1500;
END $$;
