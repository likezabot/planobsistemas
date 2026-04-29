
-- Update create_public_order to validate required option groups
CREATE OR REPLACE FUNCTION public.create_public_order(
    _restaurant_slug text, 
    _customer_name text, 
    _customer_phone text, 
    _order_type text, 
    _payment_method text, 
    _idempotency_key text, 
    _items jsonb, 
    _address text DEFAULT NULL::text, 
    _notes text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_restaurant_id UUID;
    v_tenant_id UUID;
    v_order_id UUID;
    v_subtotal_cents INTEGER := 0;
    v_total_cents INTEGER := 0;
    v_item JSONB;
    v_product_id UUID;
    v_quantity INTEGER;
    v_base_price_cents INTEGER;
    v_unit_price_cents INTEGER;
    v_product_active BOOLEAN;
    v_product_type public.product_type;
    v_existing_order_id UUID;
    v_phone_normalized TEXT;
    
    -- Customization vars
    v_variation_id UUID;
    v_variation_name TEXT;
    v_variation_price INTEGER;
    v_selected_options UUID[];
    v_pizza_flavors UUID[];
    v_customization_snapshot JSONB;
    v_option_id UUID;
    v_option_price INTEGER;
    v_option_name TEXT;
    v_options_snapshot JSONB[];
    v_options_total INTEGER := 0;
    
    -- Pizza specific
    v_pizza_config RECORD;
    v_flavor_id UUID;
    v_flavor_price INTEGER;
    v_flavor_name TEXT;
    v_flavor_prices INTEGER[];
    v_flavors_snapshot JSONB[];
    v_pizza_base_price INTEGER := 0;

    -- Validation helpers
    v_group RECORD;
    v_count INTEGER;
BEGIN
    -- 1) Lookup restaurant
    SELECT id, tenant_id INTO v_restaurant_id, v_tenant_id
    FROM public.restaurants
    WHERE slug = _restaurant_slug AND public_menu_enabled = true;

    IF v_restaurant_id IS NULL THEN
        RAISE EXCEPTION 'Restaurante não encontrado ou cardápio desativado.';
    END IF;

    -- 2) Check idempotency
    SELECT id INTO v_existing_order_id
    FROM public.orders
    WHERE restaurant_id = v_restaurant_id AND idempotency_key = _idempotency_key;

    IF v_existing_order_id IS NOT NULL THEN
        RETURN jsonb_build_object('order_id', v_existing_order_id, 'idempotent', true);
    END IF;

    -- 3) Validation
    IF _customer_name IS NULL OR length(trim(_customer_name)) < 2 THEN
        RAISE EXCEPTION 'Nome inválido.';
    END IF;

    IF _customer_phone IS NULL OR length(trim(_customer_phone)) < 8 THEN
        RAISE EXCEPTION 'Telefone inválido.';
    END IF;

    -- Normalize phone
    v_phone_normalized := regexp_replace(_customer_phone, '[^\d]', '', 'g');

    -- 4) Create Order Header
    INSERT INTO public.orders (
        tenant_id, restaurant_id, customer_name, customer_phone, 
        order_type, address, payment_method, notes, idempotency_key, status
    ) VALUES (
        v_tenant_id, v_restaurant_id, _customer_name, v_phone_normalized,
        _order_type::public.order_type, _address, _payment_method::public.payment_method, _notes, _idempotency_key, 'new'
    ) RETURNING id INTO v_order_id;

    -- 5) Process Items
    FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_quantity := (v_item->>'quantity')::INTEGER;
        v_variation_id := (v_item->>'variation_id')::UUID;
        v_selected_options := ARRAY(SELECT jsonb_array_elements_text(v_item->'selected_options')::UUID);
        v_pizza_flavors := ARRAY(SELECT jsonb_array_elements_text(v_item->'pizza_flavors')::UUID);

        IF v_quantity <= 0 THEN
            RAISE EXCEPTION 'Quantidade inválida.';
        END IF;

        -- Fetch product info
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

        -- A) Handle Variation (Size/Type)
        IF v_product_type = 'variable' THEN
            IF v_variation_id IS NULL THEN
                RAISE EXCEPTION 'Variação obrigatória para este produto.';
            END IF;
            
            SELECT name, price_cents, active INTO v_variation_name, v_variation_price, v_product_active
            FROM public.product_variants
            WHERE id = v_variation_id AND product_id = v_product_id;
            
            IF v_variation_name IS NULL THEN
                RAISE EXCEPTION 'Variação inválida.';
            END IF;

            IF v_product_active IS NOT TRUE THEN
                RAISE EXCEPTION 'Variação indisponível: %', v_variation_name;
            END IF;
            
            v_unit_price_cents := v_variation_price;
            v_customization_snapshot := v_customization_snapshot || jsonb_build_object('variation', jsonb_build_object('id', v_variation_id, 'name', v_variation_name, 'price', v_variation_price));
        ELSE
            v_unit_price_cents := v_base_price_cents;
        END IF;

        -- B) Handle Pizza Flavors
        IF v_product_type = 'pizza' THEN
            SELECT * INTO v_pizza_config FROM public.pizza_configs WHERE product_id = v_product_id;
            
            IF array_length(v_pizza_flavors, 1) > v_pizza_config.max_flavors THEN
                RAISE EXCEPTION 'Excedeu o número máximo de sabores (% sabores).', v_pizza_config.max_flavors;
            END IF;

            -- Minimum flavor check (at least 1 if it's a pizza)
            IF COALESCE(array_length(v_pizza_flavors, 1), 0) = 0 THEN
                RAISE EXCEPTION 'Selecione ao menos um sabor para a pizza.';
            END IF;

            v_flavor_prices := ARRAY[]::INTEGER[];
            v_flavors_snapshot := ARRAY[]::jsonb[];
            
            FOREACH v_flavor_id IN ARRAY v_pizza_flavors LOOP
                SELECT name, price_cents, active INTO v_flavor_name, v_flavor_price, v_product_active
                FROM public.products
                WHERE id = v_flavor_id AND restaurant_id = v_restaurant_id;
                
                IF v_flavor_name IS NULL THEN
                    RAISE EXCEPTION 'Sabor inválido selecionado.';
                END IF;

                IF v_product_active IS NOT TRUE THEN
                    RAISE EXCEPTION 'Sabor indisponível: %', v_flavor_name;
                END IF;
                
                v_flavor_prices := v_flavor_prices || v_flavor_price;
                v_flavors_snapshot := v_flavors_snapshot || jsonb_build_object('id', v_flavor_id, 'name', v_flavor_name, 'price', v_flavor_price);
            END LOOP;
            
            -- Pricing Rule logic
            IF array_length(v_flavor_prices, 1) > 0 THEN
                IF v_pizza_config.price_rule = 'max' THEN
                    SELECT MAX(p) INTO v_pizza_base_price FROM unnest(v_flavor_prices) AS p;
                ELSIF v_pizza_config.price_rule = 'average' THEN
                    SELECT AVG(p)::INTEGER INTO v_pizza_base_price FROM unnest(v_flavor_prices) AS p;
                ELSIF v_pizza_config.price_rule = 'sum' THEN
                    SELECT SUM(p) INTO v_pizza_base_price FROM unnest(v_flavor_prices) AS p;
                END IF;
            ELSE
                v_pizza_base_price := v_base_price_cents;
            END IF;
            
            v_unit_price_cents := v_pizza_base_price;
            v_customization_snapshot := v_customization_snapshot || jsonb_build_object('flavors', to_jsonb(v_flavors_snapshot), 'price_rule', v_pizza_config.price_rule);
        END IF;

        -- C) Handle Options/Add-ons & Validate Required Groups
        FOR v_group IN 
            SELECT og.id, og.name, og.min_options, og.max_options, og.is_required
            FROM public.option_groups og
            JOIN public.product_option_groups pog ON pog.group_id = og.id
            WHERE pog.product_id = v_product_id AND og.active = true
        LOOP
            -- Count how many options from this group were selected
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

        -- Process selected options for calculation
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
                
                v_options_total := v_options_total + v_option_price;
                v_options_snapshot := v_options_snapshot || jsonb_build_object('id', v_option_id, 'name', v_option_name, 'price', v_option_price);
            END LOOP;
            
            v_unit_price_cents := v_unit_price_cents + v_options_total;
            v_customization_snapshot := v_customization_snapshot || jsonb_build_object('options', to_jsonb(v_options_snapshot), 'options_total', v_options_total);
        END IF;

        -- Final Item Insert
        INSERT INTO public.order_items (
            order_id, product_id, quantity, unit_price_cents, total_price_cents, note, customization
        ) VALUES (
            v_order_id, v_product_id, v_quantity, v_unit_price_cents, v_unit_price_cents * v_quantity, (v_item->>'note'), v_customization_snapshot
        );

        v_subtotal_cents := v_subtotal_cents + (v_unit_price_cents * v_quantity);
    END LOOP;

    -- 6) Update Order with final totals
    v_total_cents := v_subtotal_cents; 

    UPDATE public.orders
    SET subtotal_cents = v_subtotal_cents,
        total_cents = v_total_cents
    WHERE id = v_order_id;

    RETURN jsonb_build_object('order_id', v_order_id, 'idempotent', false);
END;
$function$;
