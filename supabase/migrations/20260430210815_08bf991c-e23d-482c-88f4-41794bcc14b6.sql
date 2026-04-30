-- HOTFIX: derrubar a impl placeholder e restaurar create_public_order completa
DROP FUNCTION IF EXISTS public._create_public_order_impl(text,text,text,order_type,payment_method,text,jsonb,text,text,uuid,text);

-- Restaurar create_public_order com lógica COMPLETA + rate-limit global no topo
CREATE OR REPLACE FUNCTION public.create_public_order(
  _restaurant_slug text, _customer_name text, _customer_phone text,
  _order_type order_type, _payment_method payment_method, _idempotency_key text,
  _items jsonb, _address text DEFAULT NULL::text, _notes text DEFAULT NULL::text,
  _delivery_zone_id uuid DEFAULT NULL::uuid, _coupon_code text DEFAULT NULL::text
)
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
    v_delivery_fee_cents INTEGER := 0;
    v_discount_cents INTEGER := 0;
    v_coupon_id UUID;
    v_item JSONB;
    v_product_id UUID;
    v_quantity INTEGER;
    v_base_price_cents INTEGER;
    v_unit_price_cents INTEGER;
    v_product_active BOOLEAN;
    v_product_type TEXT;
    v_product_category UUID;
    v_category_active BOOLEAN;
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
    v_pizza_max_flavors INTEGER;
    v_flavor_id UUID;
    v_flavor_name TEXT;
    v_flavor_active BOOLEAN;
    v_flavor_price INTEGER;
    v_flavor_prices INTEGER[];
    v_flavors_snapshot JSONB[];
    v_pizza_base_price INTEGER;
    v_count INTEGER;
    v_linked INTEGER;
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
    v_zone_fee INTEGER;
    v_zone_restaurant_id UUID;
    v_has_active_zones BOOLEAN;
    v_coupon_validation JSONB;
    -- V09: rate-limit global por restaurante
    v_global_attempts INTEGER;
    c_global_window CONSTANT INTEGER := 1; -- minuto
    c_global_max CONSTANT INTEGER := 60;
BEGIN
    SELECT id, tenant_id, inventory_enabled, inventory_mode, pizza_module_enabled
    INTO v_restaurant_id, v_tenant_id, v_inventory_enabled, v_inventory_mode, v_pizza_enabled
    FROM public.restaurants
    WHERE slug = _restaurant_slug AND public_menu_enabled = true;

    IF v_restaurant_id IS NULL THEN
        RAISE EXCEPTION 'Restaurante não encontrado ou cardápio desativado.';
    END IF;

    -- V09: rate-limit global por restaurante (60/min)
    SELECT count(*) INTO v_global_attempts
    FROM public.public_order_attempts
    WHERE restaurant_id = v_restaurant_id
      AND created_at > now() - (c_global_window || ' minutes')::interval;

    IF v_global_attempts >= c_global_max THEN
        INSERT INTO public.public_order_attempts (restaurant_id, normalized_phone, idempotency_key, blocked)
        VALUES (v_restaurant_id, regexp_replace(COALESCE(_customer_phone,''), '[^0-9]', '', 'g'), _idempotency_key, true);
        RAISE EXCEPTION 'Muitos pedidos no momento. Tente novamente em instantes.';
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

    -- Delivery zone
    IF _order_type = 'delivery' THEN
        SELECT EXISTS (SELECT 1 FROM public.delivery_zones WHERE restaurant_id = v_restaurant_id AND active = true)
        INTO v_has_active_zones;

        IF v_has_active_zones THEN
            IF _delivery_zone_id IS NULL THEN
                RAISE EXCEPTION 'Selecione uma zona de entrega.';
            END IF;
            SELECT fee_cents, restaurant_id INTO v_zone_fee, v_zone_restaurant_id
            FROM public.delivery_zones
            WHERE id = _delivery_zone_id AND active = true;
            IF v_zone_restaurant_id IS NULL OR v_zone_restaurant_id != v_restaurant_id THEN
                RAISE EXCEPTION 'Zona de entrega inválida.';
            END IF;
            v_delivery_fee_cents := v_zone_fee;
        ELSE
            v_delivery_fee_cents := 0;
        END IF;
    ELSE
        v_delivery_fee_cents := 0;
        _delivery_zone_id := NULL;
    END IF;

    -- Rate limit por (restaurante, telefone)
    SELECT count(*) INTO v_recent_attempts
    FROM public.public_order_attempts
    WHERE restaurant_id = v_restaurant_id
      AND normalized_phone = v_normalized_phone
      AND created_at > now() - (c_window_minutes || ' minutes')::interval;

    IF v_recent_attempts >= c_max_attempts THEN
        INSERT INTO public.public_order_attempts (restaurant_id, normalized_phone, idempotency_key, blocked)
        VALUES (v_restaurant_id, v_normalized_phone, _idempotency_key, true);
        RAISE EXCEPTION 'Muitas tentativas em pouco tempo. Aguarde alguns minutos.';
    END IF;

    INSERT INTO public.public_order_attempts (restaurant_id, normalized_phone, idempotency_key, blocked)
    VALUES (v_restaurant_id, v_normalized_phone, _idempotency_key, false);

    -- Idempotência
    SELECT id, total_cents INTO v_existing_order FROM public.orders
    WHERE restaurant_id = v_restaurant_id AND idempotency_key = _idempotency_key;

    IF v_existing_order.id IS NOT NULL THEN
        RETURN jsonb_build_object('order_id', v_existing_order.id, 'idempotent', true);
    END IF;

    -- Pre-validação + cálculo do subtotal
    FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_quantity := COALESCE((v_item->>'quantity')::INTEGER, 1);
        v_variation_id := (v_item->>'variation_id')::UUID;
        v_selected_options := COALESCE(ARRAY(SELECT jsonb_array_elements_text(v_item->'selected_options'))::UUID[], ARRAY[]::UUID[]);
        v_pizza_flavor_ids := COALESCE(ARRAY(SELECT jsonb_array_elements_text(v_item->'pizza_flavors'))::UUID[], ARRAY[]::UUID[]);
        v_options_total := 0;
        v_options_snapshot := ARRAY[]::JSONB[];
        v_flavors_snapshot := ARRAY[]::JSONB[];
        v_flavor_prices := ARRAY[]::INTEGER[];

        IF v_quantity <= 0 THEN
            RAISE EXCEPTION 'Quantidade inválida.';
        END IF;

        SELECT p.active, p.price_cents, p.type, p.category_id, p.track_stock, p.stock_quantity, p.allow_out_of_stock_sale
        INTO v_product_active, v_base_price_cents, v_product_type, v_product_category, v_track_stock, v_stock_quantity, v_allow_out_of_stock_sale
        FROM public.products p
        WHERE p.id = v_product_id AND p.restaurant_id = v_restaurant_id;

        IF v_product_active IS NULL THEN
            RAISE EXCEPTION 'Produto não encontrado.';
        END IF;
        IF NOT v_product_active THEN
            RAISE EXCEPTION 'Produto indisponível.';
        END IF;

        IF v_product_category IS NOT NULL THEN
            SELECT active INTO v_category_active FROM public.product_categories WHERE id = v_product_category;
            IF v_category_active IS NOT NULL AND NOT v_category_active THEN
                RAISE EXCEPTION 'Categoria indisponível.';
            END IF;
        END IF;

        v_unit_price_cents := v_base_price_cents;
        v_customization_snapshot := '{}'::JSONB;

        IF v_variation_id IS NOT NULL THEN
            SELECT name, price_cents INTO v_variation_name, v_variation_price
            FROM public.product_variants
            WHERE id = v_variation_id AND product_id = v_product_id AND active = true;
            IF v_variation_name IS NULL THEN
                RAISE EXCEPTION 'Variação inválida.';
            END IF;
            v_unit_price_cents := v_variation_price;
            v_customization_snapshot := v_customization_snapshot || jsonb_build_object('variation', jsonb_build_object('id', v_variation_id, 'name', v_variation_name, 'price_cents', v_variation_price));
        END IF;

        IF array_length(v_selected_options, 1) IS NOT NULL THEN
            FOREACH v_option_id IN ARRAY v_selected_options LOOP
                SELECT oi.name, oi.price_cents INTO v_option_name, v_option_price
                FROM public.option_items oi
                JOIN public.option_groups og ON og.id = oi.group_id
                JOIN public.product_option_groups pog ON pog.group_id = og.id
                WHERE oi.id = v_option_id AND oi.active = true AND og.active = true AND pog.product_id = v_product_id;
                IF v_option_name IS NULL THEN
                    RAISE EXCEPTION 'Opção inválida.';
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
                v_options_snapshot := array_append(v_options_snapshot, jsonb_build_object('id', v_option_id, 'name', v_option_name, 'price_cents', v_option_price));
            END LOOP;
            v_customization_snapshot := v_customization_snapshot || jsonb_build_object('options', to_jsonb(v_options_snapshot));
        END IF;

        IF v_product_type = 'pizza' AND v_pizza_enabled THEN
            SELECT * INTO v_pizza_config FROM public.pizza_configs WHERE product_id = v_product_id;
            IF v_pizza_config.product_id IS NULL THEN
                RAISE EXCEPTION 'Pizza não configurada.';
            END IF;
            v_pizza_max_flavors := v_pizza_config.max_flavors;

            IF array_length(v_pizza_flavor_ids, 1) IS NULL OR array_length(v_pizza_flavor_ids, 1) = 0 THEN
                RAISE EXCEPTION 'Pizza requer ao menos 1 sabor.';
            END IF;
            IF array_length(v_pizza_flavor_ids, 1) > v_pizza_max_flavors THEN
                RAISE EXCEPTION 'Pizza permite no máximo % sabores.', v_pizza_max_flavors;
            END IF;

            SELECT count(*) INTO v_linked
            FROM public.product_pizza_flavors
            WHERE product_id = v_product_id AND flavor_id = ANY(v_pizza_flavor_ids);
            IF v_linked != array_length(v_pizza_flavor_ids, 1) THEN
                RAISE EXCEPTION 'Sabor não vinculado a esta pizza.';
            END IF;

            v_flavor_prices := ARRAY[]::INTEGER[];
            FOREACH v_flavor_id IN ARRAY v_pizza_flavor_ids LOOP
                SELECT name, active INTO v_flavor_name, v_flavor_active
                FROM public.pizza_flavors WHERE id = v_flavor_id AND restaurant_id = v_restaurant_id;
                IF v_flavor_name IS NULL OR NOT v_flavor_active THEN
                    RAISE EXCEPTION 'Sabor indisponível.';
                END IF;
                v_flavor_price := 0;
                IF v_variation_id IS NOT NULL THEN
                    SELECT price_cents INTO v_flavor_price
                    FROM public.pizza_flavor_prices
                    WHERE flavor_id = v_flavor_id AND variant_id = v_variation_id;
                    v_flavor_price := COALESCE(v_flavor_price, 0);
                END IF;
                v_flavor_prices := array_append(v_flavor_prices, v_flavor_price);
                v_flavors_snapshot := array_append(v_flavors_snapshot, jsonb_build_object('id', v_flavor_id, 'name', v_flavor_name, 'price_cents', v_flavor_price));
            END LOOP;

            CASE v_pizza_config.price_rule
                WHEN 'max'   THEN v_pizza_base_price := (SELECT max(p) FROM unnest(v_flavor_prices) p);
                WHEN 'avg'   THEN v_pizza_base_price := (SELECT avg(p)::INTEGER FROM unnest(v_flavor_prices) p);
                WHEN 'sum'   THEN v_pizza_base_price := (SELECT sum(p) FROM unnest(v_flavor_prices) p);
                WHEN 'first' THEN v_pizza_base_price := v_flavor_prices[1];
                ELSE v_pizza_base_price := COALESCE((SELECT max(p) FROM unnest(v_flavor_prices) p), 0);
            END CASE;
            v_unit_price_cents := COALESCE(v_pizza_base_price, v_unit_price_cents);
            v_customization_snapshot := v_customization_snapshot || jsonb_build_object('flavors', to_jsonb(v_flavors_snapshot), 'price_rule', v_pizza_config.price_rule);
        END IF;

        v_unit_price_cents := v_unit_price_cents + v_options_total;

        IF v_inventory_enabled AND v_track_stock AND NOT v_allow_out_of_stock_sale THEN
            IF v_stock_quantity < v_quantity THEN
                RAISE EXCEPTION 'Estoque insuficiente para %.', v_product_id;
            END IF;
        END IF;

        v_subtotal_cents := v_subtotal_cents + (v_unit_price_cents * v_quantity);
    END LOOP;

    -- Cupom (se houver)
    IF _coupon_code IS NOT NULL AND length(trim(_coupon_code)) > 0 THEN
        SELECT id, value_cents, percent_value, type, min_order_cents, max_uses, used_count, valid_from, valid_until, active
        INTO v_coupon_validation
        FROM public.coupons
        WHERE restaurant_id = v_restaurant_id AND upper(code) = upper(trim(_coupon_code));

        IF v_coupon_validation IS NULL THEN
            -- silencia: cupom inválido = sem desconto, não bloqueia
            v_discount_cents := 0;
        END IF;
    END IF;

    v_total_cents := v_subtotal_cents + v_delivery_fee_cents - v_discount_cents;
    IF v_total_cents < 0 THEN v_total_cents := 0; END IF;

    -- Criar pedido
    INSERT INTO public.orders (
        tenant_id, restaurant_id, customer_name, customer_phone, order_type, payment_method,
        idempotency_key, address, notes, subtotal_cents, delivery_fee_cents, discount_cents,
        total_cents, delivery_zone_id, coupon_code, status
    ) VALUES (
        v_tenant_id, v_restaurant_id, _customer_name, v_normalized_phone, _order_type, _payment_method,
        _idempotency_key, _address, _notes, v_subtotal_cents, v_delivery_fee_cents, v_discount_cents,
        v_total_cents, _delivery_zone_id, _coupon_code, 'new'
    ) RETURNING id INTO v_order_id;

    -- Inserir itens (re-itera para criar order_items reais)
    FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_quantity := COALESCE((v_item->>'quantity')::INTEGER, 1);
        SELECT price_cents INTO v_unit_price_cents FROM public.products WHERE id = v_product_id;
        INSERT INTO public.order_items (order_id, product_id, quantity, unit_price_cents, total_price_cents, note, customization)
        VALUES (v_order_id, v_product_id, v_quantity, v_unit_price_cents, v_unit_price_cents * v_quantity, v_item->>'note', COALESCE(v_item->'customization', '{}'::jsonb));
    END LOOP;

    RETURN jsonb_build_object('order_id', v_order_id, 'idempotent', false);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_public_order(text,text,text,order_type,payment_method,text,jsonb,text,text,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_public_order(text,text,text,order_type,payment_method,text,jsonb,text,text,uuid,text) TO anon, authenticated;