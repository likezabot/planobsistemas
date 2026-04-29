-- 1. Flag pizza_module_enabled em restaurants
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS pizza_module_enabled boolean NOT NULL DEFAULT false;

-- 2. Campos opcionais em product_variants (tamanhos)
ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS diameter_cm numeric NULL,
  ADD COLUMN IF NOT EXISTS slices integer NULL;

-- 3. Ingredientes em pizza_flavors
ALTER TABLE public.pizza_flavors
  ADD COLUMN IF NOT EXISTS ingredients text NULL;

-- 4. Trigger de auditoria do toggle
CREATE OR REPLACE FUNCTION public.log_pizza_module_toggle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.pizza_module_enabled IS DISTINCT FROM OLD.pizza_module_enabled THEN
    INSERT INTO public.audit_log (action, entity, entity_id, restaurant_id, tenant_id, user_id, payload)
    VALUES (
      'pizza_module_toggled',
      'restaurant',
      NEW.id,
      NEW.id,
      NEW.tenant_id,
      auth.uid(),
      jsonb_build_object('enabled', NEW.pizza_module_enabled)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_pizza_module_toggle ON public.restaurants;
CREATE TRIGGER trg_log_pizza_module_toggle
  AFTER UPDATE ON public.restaurants
  FOR EACH ROW
  EXECUTE FUNCTION public.log_pizza_module_toggle();

-- 5. Atualizar get_public_restaurant para retornar a flag
DROP FUNCTION IF EXISTS public.get_public_restaurant(text);
CREATE OR REPLACE FUNCTION public.get_public_restaurant(_slug text)
 RETURNS TABLE(id uuid, name text, slug text, timezone text, public_menu_enabled boolean, inventory_enabled boolean, inventory_mode text, pizza_module_enabled boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select r.id, r.name, r.slug, r.timezone, r.public_menu_enabled, r.inventory_enabled, r.inventory_mode, r.pizza_module_enabled
  from public.restaurants r
  where r.slug = _slug
    and r.public_menu_enabled = true
$function$;

REVOKE ALL ON FUNCTION public.get_public_restaurant(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_restaurant(text) TO anon, authenticated;

-- 6. Atualizar get_public_products para esconder pizza quando flag=false
DROP FUNCTION IF EXISTS public.get_public_products(text);
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
     and (r.pizza_module_enabled = true OR p.type <> 'pizza')
     and (
       p.category_id is null
       or exists (
         select 1 from public.product_categories c
         where c.id = p.category_id and c.active = true
       )
     )
   order by p.sort_order asc, p.name asc;
$function$;

REVOKE ALL ON FUNCTION public.get_public_products(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_products(text) TO anon, authenticated;

-- 7. Atualizar get_public_product_details:
--    - bloquear pizza quando flag=false
--    - incluir diameter_cm/slices em variants
--    - incluir ingredients em sabores
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
    v_product_type public.product_type;
    v_pizza_enabled boolean;
BEGIN
    SELECT p.type, r.pizza_module_enabled
      INTO v_product_type, v_pizza_enabled
      FROM public.products p
      JOIN public.restaurants r ON r.id = p.restaurant_id
     WHERE p.id = _product_id
       AND p.active = true
       AND r.public_menu_enabled = true;

    -- Produto não existe / inativo / restaurante off
    IF v_product_type IS NULL THEN
      RETURN jsonb_build_object(
        'variants', '[]'::jsonb,
        'option_groups', '[]'::jsonb,
        'pizza_config', NULL,
        'pizza_flavors', '[]'::jsonb
      );
    END IF;

    -- Pizza bloqueada quando módulo desligado
    IF v_product_type = 'pizza' AND v_pizza_enabled IS NOT TRUE THEN
      RETURN jsonb_build_object(
        'variants', '[]'::jsonb,
        'option_groups', '[]'::jsonb,
        'pizza_config', NULL,
        'pizza_flavors', '[]'::jsonb
      );
    END IF;

    SELECT jsonb_agg(jsonb_build_object(
        'id', id,
        'name', name,
        'price_cents', price_cents,
        'track_stock', track_stock,
        'stock_quantity', stock_quantity,
        'allow_out_of_stock_sale', allow_out_of_stock_sale,
        'diameter_cm', diameter_cm,
        'slices', slices
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

    SELECT jsonb_agg(jsonb_build_object(
        'id', pf.id,
        'name', pf.name,
        'description', pf.description,
        'category', pf.category,
        'image_url', pf.image_url,
        'ingredients', pf.ingredients,
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

-- 8. Bloquear pizza no checkout público quando módulo está desligado
--    Reutiliza create_public_order: vamos adicionar a checagem dentro dela.
--    Para evitar reescrever a função inteira, criamos um trigger no orders
--    que rejeita itens de pizza quando flag=false. Mais seguro: validar dentro
--    da própria RPC (defesa em profundidade). Ajustamos abaixo.
--
-- Como create_public_order é grande, fazemos validação extra antes do loop:
--    a verificação adicional é: para cada item de produto do tipo pizza,
--    o restaurante precisa ter pizza_module_enabled = true.
--    Implementação simples: adicionar bloco de checagem após resolver o restaurante.

CREATE OR REPLACE FUNCTION public.create_public_order(_restaurant_slug text, _customer_name text, _customer_phone text, _order_type order_type, _payment_method payment_method, _idempotency_key text, _items jsonb, _address text DEFAULT NULL::text, _notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_restaurant_id UUID;
    v_tenant_id UUID;
    v_pizza_enabled BOOLEAN;
    v_order_id UUID;
    v_existing_order RECORD;
    v_subtotal_cents INTEGER := 0;
    v_total_cents INTEGER := 0;
    v_item JSONB;
    v_product_id UUID;
    v_quantity INTEGER;
    v_base_price_cents INTEGER;
    v_unit_price_cents INTEGER;
    v_product_active BOOLEAN;
    v_product_type TEXT;
    v_variation_id UUID;
    v_variation_name TEXT;
    v_variation_price INTEGER;
    v_selected_options UUID[];
    v_options_total INTEGER;
    v_options_snapshot JSONB[];
    v_option_id UUID;
    v_option_name TEXT;
    v_option_price INTEGER;
    v_option_override INTEGER;
    v_pizza_flavor_ids UUID[];
    v_pizza_config RECORD;
    v_flavor_id UUID;
    v_flavor_name TEXT;
    v_flavor_active BOOLEAN;
    v_flavor_price INTEGER;
    v_flavor_prices INTEGER[];
    v_flavors_snapshot JSONB[];
    v_pizza_base_price INTEGER;
    v_count INTEGER;
    v_group RECORD;
    v_customization_snapshot JSONB;
    v_normalized_phone TEXT;
    v_inventory_enabled BOOLEAN;
    v_inventory_mode TEXT;
    v_track_stock BOOLEAN;
    v_stock_quantity NUMERIC;
    v_allow_out_of_stock_sale BOOLEAN;
    v_recent_attempts INTEGER;
    c_window_minutes CONSTANT INTEGER := 5;
    c_max_attempts CONSTANT INTEGER := 8;
BEGIN
    SELECT id, tenant_id, inventory_enabled, inventory_mode, pizza_module_enabled
    INTO v_restaurant_id, v_tenant_id, v_inventory_enabled, v_inventory_mode, v_pizza_enabled
    FROM public.restaurants
    WHERE slug = _restaurant_slug AND public_menu_enabled = true;

    IF v_restaurant_id IS NULL THEN
        RAISE EXCEPTION 'Restaurante não encontrado ou cardápio desativado.';
    END IF;

    IF _customer_name IS NULL OR length(trim(_customer_name)) < 2 THEN
        RAISE EXCEPTION 'Nome do cliente é obrigatório.';
    END IF;
    v_normalized_phone := regexp_replace(COALESCE(_customer_phone, ''), '[^0-9]', '', 'g');
    IF length(v_normalized_phone) < 8 THEN
        RAISE EXCEPTION 'Telefone inválido.';
    END IF;
    IF _order_type = 'delivery' AND (_address IS NULL OR length(trim(_address)) < 3) THEN
        RAISE EXCEPTION 'Endereço obrigatório para entrega.';
    END IF;
    IF jsonb_array_length(_items) = 0 THEN
        RAISE EXCEPTION 'Pedido sem itens.';
    END IF;

    SELECT id, total_cents INTO v_existing_order FROM public.orders
    WHERE restaurant_id = v_restaurant_id AND idempotency_key = _idempotency_key;
    IF v_existing_order.id IS NOT NULL THEN
        RETURN jsonb_build_object('order_id', v_existing_order.id, 'idempotent', true);
    END IF;

    SELECT COUNT(DISTINCT idempotency_key) INTO v_recent_attempts
    FROM public.public_order_attempts
    WHERE restaurant_id = v_restaurant_id
      AND normalized_phone = v_normalized_phone
      AND created_at > now() - (c_window_minutes || ' minutes')::INTERVAL;

    IF v_recent_attempts >= c_max_attempts THEN
        BEGIN
            INSERT INTO public.public_order_attempts (
                restaurant_id, normalized_phone, idempotency_key, blocked
            ) VALUES (
                v_restaurant_id, v_normalized_phone, _idempotency_key, true
            );
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
        RAISE EXCEPTION 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
    END IF;

    INSERT INTO public.public_order_attempts (
        restaurant_id, normalized_phone, idempotency_key, blocked
    ) VALUES (
        v_restaurant_id, v_normalized_phone, _idempotency_key, false
    );

    INSERT INTO public.orders (
        tenant_id, restaurant_id, customer_name, customer_phone, order_type,
        address, payment_method, notes, idempotency_key, status, subtotal_cents, total_cents
    ) VALUES (
        v_tenant_id, v_restaurant_id, trim(_customer_name), v_normalized_phone, _order_type,
        _address, _payment_method, _notes, _idempotency_key, 'new', 0, 0
    ) RETURNING id INTO v_order_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(_items)
    LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_quantity := COALESCE((v_item->>'quantity')::INTEGER, 1);
        v_variation_id := (v_item->>'variation_id')::UUID;
        v_selected_options := ARRAY(SELECT jsonb_array_elements_text(v_item->'selected_options')::UUID);
        v_pizza_flavor_ids := ARRAY(SELECT jsonb_array_elements_text(v_item->'pizza_flavors')::UUID);

        IF v_quantity <= 0 THEN RAISE EXCEPTION 'Quantidade inválida.'; END IF;

        SELECT price_cents, active, type, track_stock, stock_quantity, allow_out_of_stock_sale
        INTO v_base_price_cents, v_product_active, v_product_type, v_track_stock, v_stock_quantity, v_allow_out_of_stock_sale
        FROM public.products
        WHERE id = v_product_id AND restaurant_id = v_restaurant_id;

        IF v_product_active IS NOT TRUE THEN
            RAISE EXCEPTION 'Produto indisponível.';
        END IF;

        -- Defesa em profundidade: bloqueia pizza se módulo desativado
        IF v_product_type = 'pizza' AND v_pizza_enabled IS NOT TRUE THEN
            RAISE EXCEPTION 'Módulo Pizza desativado neste restaurante.';
        END IF;

        IF v_inventory_enabled AND v_track_stock THEN
            IF v_stock_quantity < v_quantity AND NOT v_allow_out_of_stock_sale THEN
                RAISE EXCEPTION 'Estoque insuficiente para o produto: %', (SELECT name FROM public.products WHERE id = v_product_id);
            END IF;
            PERFORM public.update_stock(v_restaurant_id, 'product', v_product_id, v_stock_quantity - v_quantity, 'sale', v_order_id, NULL);
        END IF;

        v_unit_price_cents := 0;
        v_customization_snapshot := '{}'::jsonb;
        v_options_snapshot := ARRAY[]::jsonb[];
        v_options_total := 0;

        IF v_product_type = 'pizza' AND v_variation_id IS NULL THEN
            RAISE EXCEPTION 'Tamanho obrigatório para pizza.';
        END IF;
        IF v_product_type = 'variable' AND v_variation_id IS NULL THEN
            RAISE EXCEPTION 'Variação obrigatória para este produto.';
        END IF;

        IF v_product_type IN ('variable','pizza') AND v_variation_id IS NOT NULL THEN
            SELECT name, price_cents, active, track_stock, stock_quantity, allow_out_of_stock_sale
            INTO v_variation_name, v_variation_price, v_product_active, v_track_stock, v_stock_quantity, v_allow_out_of_stock_sale
            FROM public.product_variants
            WHERE id = v_variation_id AND product_id = v_product_id;

            IF v_variation_name IS NULL THEN RAISE EXCEPTION 'Variação inválida.'; END IF;
            IF v_product_active IS NOT TRUE THEN RAISE EXCEPTION 'Variação indisponível: %', v_variation_name; END IF;

            IF v_inventory_enabled AND v_inventory_mode = 'advanced' AND v_track_stock THEN
                IF v_stock_quantity < v_quantity AND NOT v_allow_out_of_stock_sale THEN
                    RAISE EXCEPTION 'Estoque insuficiente para a variação: %', v_variation_name;
                END IF;
                PERFORM public.update_stock(v_restaurant_id, 'variant', v_variation_id, v_stock_quantity - v_quantity, 'sale', v_order_id, NULL);
            END IF;

            v_unit_price_cents := v_variation_price;
            v_customization_snapshot := v_customization_snapshot || jsonb_build_object(
                'variation', jsonb_build_object('id', v_variation_id, 'name', v_variation_name, 'price', v_variation_price)
            );
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
                SELECT pf.name, pf.active, pf.track_stock, pf.stock_quantity, pf.allow_out_of_stock_sale
                INTO v_flavor_name, v_flavor_active, v_track_stock, v_stock_quantity, v_allow_out_of_stock_sale
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

                IF v_inventory_enabled AND v_inventory_mode = 'advanced' AND v_track_stock THEN
                    IF v_stock_quantity < v_quantity AND NOT v_allow_out_of_stock_sale THEN
                        RAISE EXCEPTION 'Estoque insuficiente para o sabor: %', v_flavor_name;
                    END IF;
                    PERFORM public.update_stock(v_restaurant_id, 'pizza_flavor', v_flavor_id, v_stock_quantity - v_quantity, 'sale', v_order_id, NULL);
                END IF;

                v_flavor_price := NULL;
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
            END LOOP;

            IF v_pizza_config.price_rule = 'max' THEN
                SELECT MAX(p) INTO v_pizza_base_price FROM unnest(v_flavor_prices) AS p;
            ELSIF v_pizza_config.price_rule = 'average' THEN
                SELECT AVG(p)::INTEGER INTO v_pizza_base_price FROM unnest(v_flavor_prices) AS p;
            ELSE
                SELECT SUM(p) INTO v_pizza_base_price FROM unnest(v_flavor_prices) AS p;
            END IF;

            v_unit_price_cents := v_unit_price_cents + COALESCE(v_pizza_base_price, 0);
            v_customization_snapshot := v_customization_snapshot || jsonb_build_object('flavors', to_jsonb(v_flavors_snapshot));
        END IF;

        FOR v_group IN
            SELECT og.id, og.min_options, og.is_required
            FROM public.product_option_groups pog
            JOIN public.option_groups og ON og.id = pog.group_id
            WHERE pog.product_id = v_product_id AND og.active = true
        LOOP
            SELECT COUNT(*) INTO v_count
            FROM unnest(v_selected_options) AS sel(id)
            JOIN public.option_items oi ON oi.id = sel.id AND oi.group_id = v_group.id;

            IF v_group.is_required AND v_count < v_group.min_options THEN
                RAISE EXCEPTION 'Grupo de opções obrigatório não atendido.';
            END IF;
        END LOOP;

        IF array_length(v_selected_options, 1) > 0 THEN
            FOREACH v_option_id IN ARRAY v_selected_options LOOP
                SELECT oi.name, oi.price_cents, oi.active
                INTO v_option_name, v_option_price, v_product_active
                FROM public.option_items oi
                JOIN public.option_groups og ON og.id = oi.group_id
                WHERE oi.id = v_option_id AND og.restaurant_id = v_restaurant_id;

                IF v_option_name IS NULL OR v_product_active IS NOT TRUE THEN
                    RAISE EXCEPTION 'Opção inválida ou indisponível.';
                END IF;

                IF v_variation_id IS NOT NULL THEN
                    SELECT price_cents INTO v_option_override
                    FROM public.option_item_price_overrides
                    WHERE option_item_id = v_option_id AND variant_id = v_variation_id;
                    IF v_option_override IS NOT NULL THEN
                        v_option_price := v_option_override;
                    END IF;
                END IF;

                v_options_total := v_options_total + v_option_price;
                v_options_snapshot := v_options_snapshot || jsonb_build_object(
                    'id', v_option_id, 'name', v_option_name, 'price', v_option_price
                );
            END LOOP;

            v_customization_snapshot := v_customization_snapshot || jsonb_build_object('options', to_jsonb(v_options_snapshot));
        END IF;

        v_unit_price_cents := v_unit_price_cents + v_options_total;
        v_subtotal_cents := v_subtotal_cents + (v_unit_price_cents * v_quantity);

        INSERT INTO public.order_items (
            order_id, product_id, quantity, unit_price_cents, total_price_cents,
            note, customization, subtotal_cents
        ) VALUES (
            v_order_id, v_product_id, v_quantity, v_unit_price_cents, v_unit_price_cents * v_quantity,
            v_item->>'note', v_customization_snapshot, v_unit_price_cents * v_quantity
        );
    END LOOP;

    v_total_cents := v_subtotal_cents;

    UPDATE public.orders
    SET subtotal_cents = v_subtotal_cents, total_cents = v_total_cents
    WHERE id = v_order_id;

    PERFORM public.create_print_job_for_order(v_order_id, 'auto');

    RETURN jsonb_build_object('order_id', v_order_id, 'idempotent', false);
END;
$function$;