-- Create helper function if missing
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create delivery zones table
CREATE TABLE public.delivery_zones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    fee_cents INTEGER NOT NULL DEFAULT 0 CHECK (fee_cents >= 0),
    active BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add delivery_zone_id to orders
ALTER TABLE public.orders 
ADD COLUMN delivery_zone_id UUID REFERENCES public.delivery_zones(id);

-- Enable RLS on delivery_zones
ALTER TABLE public.delivery_zones ENABLE ROW LEVEL SECURITY;

-- Owner/Manager CRUD
CREATE POLICY "Owners and managers can CRUD delivery zones" 
ON public.delivery_zones 
FOR ALL 
USING (
    EXISTS (
        SELECT 1 FROM restaurant_members
        WHERE restaurant_id = delivery_zones.restaurant_id 
          AND user_id = auth.uid()
          AND role IN ('owner', 'manager')
    )
);

-- Members SELECT
CREATE POLICY "Members can view delivery zones" 
ON public.delivery_zones 
FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM restaurant_members
        WHERE restaurant_id = delivery_zones.restaurant_id 
          AND user_id = auth.uid()
    )
);

-- Public RPC to get delivery zones
CREATE OR REPLACE FUNCTION public.get_delivery_zones(_slug TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_restaurant_id UUID;
    v_result JSONB;
BEGIN
    SELECT id INTO v_restaurant_id 
    FROM public.restaurants 
    WHERE slug = _slug AND public_menu_enabled = true;

    IF v_restaurant_id IS NULL THEN
        RETURN '[]'::jsonb;
    END IF;

    SELECT jsonb_agg(sub) INTO v_result
    FROM (
        SELECT id, name, description, fee_cents 
        FROM public.delivery_zones 
        WHERE restaurant_id = v_restaurant_id AND active = true
        ORDER BY sort_order ASC, name ASC
    ) sub;

    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$function$;

-- Update trigger for updated_at
CREATE TRIGGER update_delivery_zones_updated_at
BEFORE UPDATE ON public.delivery_zones
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Update create_public_order to support delivery zones
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
    _delivery_zone_id UUID DEFAULT NULL
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
        address, payment_method, notes, idempotency_key, status, subtotal_cents, total_cents,
        delivery_zone_id, delivery_fee_cents
    ) VALUES (
        v_tenant_id, v_restaurant_id, trim(_customer_name), v_normalized_phone, _order_type,
        _address, _payment_method, _notes, _idempotency_key, 'new', 0, 0,
        _delivery_zone_id, v_delivery_fee_cents
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
                    
                    IF v_flavor_price IS NULL THEN
                        SELECT price_cents INTO v_flavor_price
                        FROM public.product_variants
                        WHERE id = v_variation_id;
                    END IF;
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
                SELECT ROUND(AVG(p))::INTEGER INTO v_pizza_base_price FROM unnest(v_flavor_prices) AS p;
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

    v_total_cents := v_subtotal_cents + v_delivery_fee_cents;

    UPDATE public.orders
    SET subtotal_cents = v_subtotal_cents, total_cents = v_total_cents
    WHERE id = v_order_id;

    PERFORM public.create_print_job_for_order(v_order_id, 'auto');

    RETURN jsonb_build_object('order_id', v_order_id, 'idempotent', false);
END;
$function$;