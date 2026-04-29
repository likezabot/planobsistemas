CREATE OR REPLACE FUNCTION public.create_public_order(
    _restaurant_slug text, 
    _customer_name text, 
    _customer_phone text, 
    _order_type order_type, 
    _payment_method payment_method, 
    _idempotency_key text, 
    _items jsonb, 
    _address text DEFAULT NULL::text, 
    _notes text DEFAULT NULL::text,
    _delivery_zone_id UUID DEFAULT NULL,
    _coupon_code TEXT DEFAULT NULL
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
    v_zone_fee INTEGER;
    v_zone_restaurant_id UUID;
    v_has_active_zones BOOLEAN;
    v_coupon_validation JSONB;
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

    -- Delivery Zone Validation
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

    -- Pre-calculate subtotal for coupon validation
    FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_quantity := COALESCE((v_item->>'quantity')::INTEGER, 1);
        v_variation_id := (v_item->>'variation_id')::UUID;
        v_selected_options := ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_item->'selected_options', '[]'::jsonb))::UUID);
        v_pizza_flavor_ids := ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_item->'pizza_flavors', '[]'::jsonb))::UUID);

        SELECT price_cents, type INTO v_base_price_cents, v_product_type FROM public.products WHERE id = v_product_id;
        
        v_unit_price_cents := 0;
        IF v_product_type IN ('variable','pizza') AND v_variation_id IS NOT NULL THEN
            SELECT price_cents INTO v_variation_price FROM public.product_variants WHERE id = v_variation_id;
            v_unit_price_cents := v_variation_price;
        ELSE
            v_unit_price_cents := v_base_price_cents;
        END IF;

        IF v_product_type = 'pizza' THEN
             v_flavor_prices := ARRAY[]::INTEGER[];
             FOREACH v_flavor_id IN ARRAY v_pizza_flavor_ids LOOP
                 v_flavor_price := NULL;
                 IF v_variation_id IS NOT NULL THEN
                    SELECT price_cents INTO v_flavor_price FROM public.pizza_flavor_prices WHERE flavor_id = v_flavor_id AND variant_id = v_variation_id;
                    IF v_flavor_price IS NULL THEN SELECT price_cents INTO v_flavor_price FROM public.product_variants WHERE id = v_variation_id; END IF;
                 END IF;
                 v_flavor_prices := v_flavor_prices || COALESCE(v_flavor_price, 0);
             END LOOP;
             SELECT price_rule INTO v_pizza_config FROM public.pizza_configs WHERE product_id = v_product_id;
             IF v_pizza_config.price_rule = 'max' THEN SELECT MAX(p) INTO v_pizza_base_price FROM unnest(v_flavor_prices) AS p;
             ELSIF v_pizza_config.price_rule = 'average' THEN SELECT ROUND(AVG(p))::INTEGER INTO v_pizza_base_price FROM unnest(v_flavor_prices) AS p;
             ELSE SELECT SUM(p) INTO v_pizza_base_price FROM unnest(v_flavor_prices) AS p;
             END IF;
             v_unit_price_cents := v_unit_price_cents + COALESCE(v_pizza_base_price, 0);
        END IF;

        IF array_length(v_selected_options, 1) > 0 THEN
            SELECT SUM(COALESCE(override.price_cents, oi.price_cents)) INTO v_options_total
            FROM public.option_items oi
            LEFT JOIN public.option_item_price_overrides override ON override.option_item_id = oi.id AND override.variant_id = v_variation_id
            WHERE oi.id = ANY(v_selected_options);
            v_unit_price_cents := v_unit_price_cents + COALESCE(v_options_total, 0);
        END IF;

        v_subtotal_cents := v_subtotal_cents + (v_unit_price_cents * v_quantity);
    END LOOP;

    -- Coupon Validation
    IF _coupon_code IS NOT NULL AND _coupon_code != '' THEN
        v_coupon_validation := public.validate_coupon(_restaurant_slug, _coupon_code, v_subtotal_cents);
        IF (v_coupon_validation->>'valid')::BOOLEAN THEN
            v_discount_cents := (v_coupon_validation->>'discount_cents')::INTEGER;
            v_coupon_id := (v_coupon_validation->>'coupon_id')::UUID;
        ELSE
            RAISE EXCEPTION 'Cupom inválido: %', (v_coupon_validation->>'message');
        END IF;
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

    -- Start Transaction of creation
    INSERT INTO public.orders (
        tenant_id, restaurant_id, customer_name, customer_phone, order_type,
        address, payment_method, notes, idempotency_key, status, subtotal_cents, total_cents,
        delivery_zone_id, delivery_fee_cents, coupon_code, discount_cents
    ) VALUES (
        v_tenant_id, v_restaurant_id, trim(_customer_name), v_normalized_phone, _order_type,
        _address, _payment_method, _notes, _idempotency_key, 'new', v_subtotal_cents, 0,
        _delivery_zone_id, v_delivery_fee_cents, upper(_coupon_code), v_discount_cents
    ) RETURNING id INTO v_order_id;

    -- Re-run item loop to insert order_items (and handle stock)
    FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_quantity := COALESCE((v_item->>'quantity')::INTEGER, 1);
        v_variation_id := (v_item->>'variation_id')::UUID;
        v_selected_options := ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_item->'selected_options', '[]'::jsonb))::UUID);
        v_pizza_flavor_ids := ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_item->'pizza_flavors', '[]'::jsonb))::UUID);

        SELECT price_cents, active, type, track_stock, stock_quantity, allow_out_of_stock_sale
        INTO v_base_price_cents, v_product_active, v_product_type, v_track_stock, v_stock_quantity, v_allow_out_of_stock_sale
        FROM public.products WHERE id = v_product_id AND restaurant_id = v_restaurant_id;

        IF v_product_active IS NOT TRUE THEN RAISE EXCEPTION 'Produto indisponível.'; END IF;
        IF v_product_type = 'pizza' AND v_pizza_enabled IS NOT TRUE THEN RAISE EXCEPTION 'Módulo Pizza desativado.'; END IF;

        IF v_inventory_enabled AND v_track_stock THEN
            IF v_stock_quantity < v_quantity AND NOT v_allow_out_of_stock_sale THEN RAISE EXCEPTION 'Estoque insuficiente.'; END IF;
            PERFORM public.update_stock(v_restaurant_id, 'product', v_product_id, v_stock_quantity - v_quantity, 'sale', v_order_id, NULL);
        END IF;

        v_unit_price_cents := 0;
        v_customization_snapshot := '{}'::jsonb;

        IF v_product_type IN ('variable','pizza') AND v_variation_id IS NOT NULL THEN
            SELECT name, price_cents, active, track_stock, stock_quantity, allow_out_of_stock_sale
            INTO v_variation_name, v_variation_price, v_product_active, v_track_stock, v_stock_quantity, v_allow_out_of_stock_sale
            FROM public.product_variants WHERE id = v_variation_id AND product_id = v_product_id;
            v_unit_price_cents := v_variation_price;
            v_customization_snapshot := v_customization_snapshot || jsonb_build_object('variation', jsonb_build_object('id', v_variation_id, 'name', v_variation_name, 'price', v_variation_price));
        ELSE
            v_unit_price_cents := v_base_price_cents;
        END IF;

        IF v_product_type = 'pizza' THEN
            v_flavor_prices := ARRAY[]::INTEGER[];
            v_flavors_snapshot := ARRAY[]::jsonb[];
            FOREACH v_flavor_id IN ARRAY v_pizza_flavor_ids LOOP
                SELECT pf.name, pf.active INTO v_flavor_name, v_flavor_active FROM public.pizza_flavors pf JOIN public.product_pizza_flavors ppf ON ppf.flavor_id = pf.id WHERE pf.id = v_flavor_id AND pf.restaurant_id = v_restaurant_id;
                v_flavor_price := NULL;
                IF v_variation_id IS NOT NULL THEN
                    SELECT price_cents INTO v_flavor_price FROM public.pizza_flavor_prices WHERE flavor_id = v_flavor_id AND variant_id = v_variation_id;
                    IF v_flavor_price IS NULL THEN SELECT price_cents INTO v_flavor_price FROM public.product_variants WHERE id = v_variation_id; END IF;
                END IF;
                v_flavor_price := COALESCE(v_flavor_price, 0);
                v_flavor_prices := v_flavor_prices || v_flavor_price;
                v_flavors_snapshot := v_flavors_snapshot || jsonb_build_object('id', v_flavor_id, 'name', v_flavor_name, 'price', v_flavor_price);
            END LOOP;
            SELECT price_rule INTO v_pizza_config FROM public.pizza_configs WHERE product_id = v_product_id;
            IF v_pizza_config.price_rule = 'max' THEN SELECT MAX(p) INTO v_pizza_base_price FROM unnest(v_flavor_prices) AS p;
            ELSIF v_pizza_config.price_rule = 'average' THEN SELECT ROUND(AVG(p))::INTEGER INTO v_pizza_base_price FROM unnest(v_flavor_prices) AS p;
            ELSE SELECT SUM(p) INTO v_pizza_base_price FROM unnest(v_flavor_prices) AS p;
            END IF;
            v_unit_price_cents := v_unit_price_cents + COALESCE(v_pizza_base_price, 0);
            v_customization_snapshot := v_customization_snapshot || jsonb_build_object('flavors', to_jsonb(v_flavors_snapshot));
        END IF;

        IF array_length(v_selected_options, 1) > 0 THEN
            v_options_snapshot := ARRAY[]::jsonb[];
            v_options_total := 0;
            FOREACH v_option_id IN ARRAY v_selected_options LOOP
                SELECT oi.name, oi.price_cents INTO v_option_name, v_option_price FROM public.option_items oi JOIN public.option_groups og ON og.id = oi.group_id WHERE oi.id = v_option_id AND og.restaurant_id = v_restaurant_id;
                SELECT price_cents INTO v_option_override FROM public.option_item_price_overrides WHERE option_item_id = v_option_id AND variant_id = v_variation_id;
                IF v_option_override IS NOT NULL THEN v_option_price := v_option_override; END IF;
                v_options_total := v_options_total + v_option_price;
                v_options_snapshot := v_options_snapshot || jsonb_build_object('id', v_option_id, 'name', v_option_name, 'price', v_option_price);
            END LOOP;
            v_customization_snapshot := v_customization_snapshot || jsonb_build_object('options', to_jsonb(v_options_snapshot));
            v_unit_price_cents := v_unit_price_cents + v_options_total;
        END IF;

        INSERT INTO public.order_items (order_id, product_id, quantity, unit_price_cents, total_price_cents, note, customization, subtotal_cents)
        VALUES (v_order_id, v_product_id, v_quantity, v_unit_price_cents, v_unit_price_cents * v_quantity, v_item->>'note', v_customization_snapshot, v_unit_price_cents * v_quantity);
    END LOOP;

    v_total_cents := GREATEST(v_subtotal_cents - v_discount_cents, 0) + v_delivery_fee_cents;

    UPDATE public.orders SET total_cents = v_total_cents WHERE id = v_order_id;

    -- Increment coupon usage
    IF v_coupon_id IS NOT NULL THEN
        UPDATE public.coupons SET used_count = used_count + 1 WHERE id = v_coupon_id;
    END IF;

    PERFORM public.create_print_job_for_order(v_order_id, 'auto');

    RETURN jsonb_build_object('order_id', v_order_id, 'idempotent', false);
END;
$function$;