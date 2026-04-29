-- Helper to check restaurant member role
CREATE OR REPLACE FUNCTION public.check_restaurant_role(_restaurant_id uuid, _allowed_roles text[])
RETURNS boolean AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM restaurant_members
        WHERE restaurant_id = _restaurant_id
        AND user_id = auth.uid()
        AND role = ANY(_allowed_roles)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Helper to calculate order item details (internal)
-- This encapsulates the complex pricing and validation logic to be shared between public and private orders
CREATE OR REPLACE FUNCTION public.calculate_order_item_details(
    _restaurant_id uuid,
    _item jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_product_id uuid;
    v_variation_id uuid;
    v_selected_options uuid[];
    v_pizza_flavor_ids uuid[];
    v_quantity integer;
    
    v_product_active boolean;
    v_product_type text;
    v_product_name text;
    v_base_price_cents integer;
    v_variation_price integer;
    v_unit_price_cents integer;
    
    v_customization_snapshot jsonb;
    v_option_id uuid;
    v_option_name text;
    v_option_price integer;
    v_options_total integer := 0;
    v_options_snapshot jsonb[] := '{}';
    
    v_flavor_id uuid;
    v_flavor_name text;
    v_flavor_active boolean;
    v_flavor_price integer;
    v_flavors_snapshot jsonb[] := '{}';
    v_flavor_prices integer[] := '{}';
    
    v_pizza_base_price integer := 0;
    v_pizza_config record;
    v_inventory_enabled boolean;
    v_track_stock boolean;
    v_stock_quantity numeric;
    v_allow_out_of_stock_sale boolean;
BEGIN
    v_product_id := (_item->>'product_id')::uuid;
    v_quantity := COALESCE((_item->>'quantity')::integer, 1);
    v_variation_id := (_item->>'variation_id')::uuid;
    v_selected_options := ARRAY(SELECT jsonb_array_elements_text(COALESCE(_item->'selected_options', '[]'::jsonb))::uuid);
    v_pizza_flavor_ids := ARRAY(SELECT jsonb_array_elements_text(COALESCE(_item->'pizza_flavors', '[]'::jsonb))::uuid);

    -- Product lookup
    SELECT name, active, type, price_cents 
    INTO v_product_name, v_product_active, v_product_type, v_base_price_cents
    FROM public.products
    WHERE id = v_product_id AND restaurant_id = _restaurant_id;

    IF v_product_name IS NULL THEN
        RAISE EXCEPTION 'Produto não encontrado.';
    END IF;
    IF NOT v_product_active THEN
        RAISE EXCEPTION 'Produto % está inativo.', v_product_name;
    END IF;

    -- Inventory logic
    SELECT inventory_enabled INTO v_inventory_enabled FROM public.restaurants WHERE id = _restaurant_id;
    IF v_inventory_enabled THEN
        SELECT track_stock, stock_quantity, allow_out_of_stock_sale 
        INTO v_track_stock, v_stock_quantity, v_allow_out_of_stock_sale
        FROM public.products WHERE id = v_product_id;

        IF COALESCE(v_track_stock, false) AND NOT COALESCE(v_allow_out_of_stock_sale, false) AND v_stock_quantity < v_quantity THEN
            RAISE EXCEPTION 'Produto % fora de estoque.', v_product_name;
        END IF;
    END IF;

    -- Price logic
    IF v_product_type IN ('variable', 'pizza') AND v_variation_id IS NOT NULL THEN
        SELECT price_cents INTO v_variation_price
        FROM public.product_variants
        WHERE id = v_variation_id AND product_id = v_product_id;
        
        IF v_variation_price IS NULL THEN
            RAISE EXCEPTION 'Variação inválida para o produto %.', v_product_name;
        END IF;
        v_unit_price_cents := v_variation_price;
    ELSE
        v_unit_price_cents := v_base_price_cents;
    END IF;

    -- Pizza flavors
    IF v_product_type = 'pizza' THEN
        IF v_variation_id IS NULL THEN
            RAISE EXCEPTION 'Tamanho obrigatório para pizza.';
        END IF;
        IF array_length(v_pizza_flavor_ids, 1) = 0 THEN
            RAISE EXCEPTION 'Selecione pelo menos um sabor.';
        END IF;

        FOREACH v_flavor_id IN ARRAY v_pizza_flavor_ids LOOP
            v_flavor_price := NULL;
            SELECT pf.price_cents INTO v_flavor_price 
            FROM public.pizza_flavor_prices pf
            WHERE pf.flavor_id = v_flavor_id AND pf.variant_id = v_variation_id;
            
            IF v_flavor_price IS NULL THEN
                SELECT price_cents INTO v_flavor_price FROM public.product_variants WHERE id = v_variation_id;
            END IF;

            SELECT p.name, p.active INTO v_flavor_name, v_flavor_active
            FROM public.products p
            WHERE p.id = v_flavor_id AND p.restaurant_id = _restaurant_id AND p.type = 'pizza_flavor';

            IF v_flavor_name IS NULL THEN
                RAISE EXCEPTION 'Sabor não encontrado.';
            END IF;
            IF NOT v_flavor_active THEN
                RAISE EXCEPTION 'Sabor % está inativo.', v_flavor_name;
            END IF;

            v_flavors_snapshot := v_flavors_snapshot || jsonb_build_object('name', v_flavor_name, 'price_cents', v_flavor_price);
            v_flavor_prices := v_flavor_prices || COALESCE(v_flavor_price, 0);
        END LOOP;

        SELECT price_rule INTO v_pizza_config FROM public.pizza_configs WHERE product_id = v_product_id;
        IF v_pizza_config.price_rule = 'max' THEN 
            SELECT MAX(p) INTO v_pizza_base_price FROM unnest(v_flavor_prices) AS p;
        ELSIF v_pizza_config.price_rule = 'average' THEN 
            SELECT ROUND(AVG(p))::INTEGER INTO v_pizza_base_price FROM unnest(v_flavor_prices) AS p;
        ELSE 
            SELECT SUM(p) INTO v_pizza_base_price FROM unnest(v_flavor_prices) AS p;
        END IF;
        
        v_unit_price_cents := v_pizza_base_price;
    END IF;

    -- Options
    IF array_length(v_selected_options, 1) > 0 THEN
        FOR v_option_id, v_option_name, v_option_price IN 
            SELECT oi.id, oi.name, COALESCE(override.price_cents, oi.price_cents)
            FROM public.option_items oi
            JOIN public.option_groups og ON oi.group_id = og.id
            LEFT JOIN public.option_item_price_overrides override ON override.option_item_id = oi.id AND override.variant_id = v_variation_id
            WHERE oi.id = ANY(v_selected_options) AND og.product_id = v_product_id
        LOOP
            v_options_total := v_options_total + v_option_price;
            v_options_snapshot := v_options_snapshot || jsonb_build_object('name', v_option_name, 'price_cents', v_option_price);
        END LOOP;
        
        IF array_length(v_options_snapshot, 1) != array_length(v_selected_options, 1) THEN
             RAISE EXCEPTION 'Uma ou mais opções selecionadas são inválidas para o produto %.', v_product_name;
        END IF;
    END IF;

    v_unit_price_cents := COALESCE(v_unit_price_cents, 0) + COALESCE(v_options_total, 0);

    v_customization_snapshot := jsonb_build_object(
        'variation_id', v_variation_id,
        'selected_options', to_jsonb(v_options_snapshot),
        'pizza_flavors', to_jsonb(v_flavors_snapshot)
    );

    RETURN jsonb_build_object(
        'product_id', v_product_id,
        'quantity', v_quantity,
        'unit_price_cents', v_unit_price_cents,
        'total_price_cents', v_unit_price_cents * v_quantity,
        'customization', v_customization_snapshot,
        'product_name', v_product_name
    );
END;
$$;

-- RPC: open_table_order
CREATE OR REPLACE FUNCTION public.open_table_order(_restaurant_id uuid, _table_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order_id uuid;
    v_tenant_id uuid;
    v_is_active boolean;
    v_table_restaurant_id uuid;
BEGIN
    IF NOT public.check_restaurant_role(_restaurant_id, ARRAY['waiter', 'cashier', 'manager', 'owner']) THEN
        RAISE EXCEPTION 'Não autorizado.';
    END IF;

    SELECT active, restaurant_id, tenant_id INTO v_is_active, v_table_restaurant_id, v_tenant_id
    FROM public.dining_tables
    WHERE id = _table_id;

    IF v_table_restaurant_id IS NULL OR v_table_restaurant_id != _restaurant_id THEN
        RAISE EXCEPTION 'Mesa não pertence ao restaurante.';
    END IF;

    IF NOT v_is_active THEN
        RAISE EXCEPTION 'Mesa está inativa.';
    END IF;

    -- Look for existing open table order
    SELECT id INTO v_order_id
    FROM public.orders
    WHERE restaurant_id = _restaurant_id
    AND table_id = _table_id
    AND payment_status = 'open'
    AND status != 'cancelled'
    LIMIT 1;

    IF v_order_id IS NOT NULL THEN
        RETURN v_order_id;
    END IF;

    INSERT INTO public.orders (
        restaurant_id, tenant_id, service_mode, table_id, opened_by, status, payment_status, subtotal_cents, total_cents
    ) VALUES (
        _restaurant_id, v_tenant_id, 'table', _table_id, auth.uid(), 'new', 'open', 0, 0
    ) RETURNING id INTO v_order_id;

    RETURN v_order_id;
END;
$$;

-- RPC: create_counter_order
CREATE OR REPLACE FUNCTION public.create_counter_order(_restaurant_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order_id uuid;
    v_tenant_id uuid;
BEGIN
    IF NOT public.check_restaurant_role(_restaurant_id, ARRAY['cashier', 'manager', 'owner']) THEN
        RAISE EXCEPTION 'Não autorizado.';
    END IF;

    SELECT tenant_id INTO v_tenant_id FROM public.restaurants WHERE id = _restaurant_id;

    INSERT INTO public.orders (
        restaurant_id, tenant_id, service_mode, opened_by, status, payment_status, subtotal_cents, total_cents
    ) VALUES (
        _restaurant_id, v_tenant_id, 'counter', auth.uid(), 'new', 'open', 0, 0
    ) RETURNING id INTO v_order_id;

    RETURN v_order_id;
END;
$$;

-- RPC: add_items_to_order
CREATE OR REPLACE FUNCTION public.add_items_to_order(_order_id uuid, _items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_restaurant_id uuid;
    v_payment_status text;
    v_item jsonb;
    v_calc jsonb;
    v_new_subtotal integer := 0;
BEGIN
    SELECT restaurant_id, payment_status INTO v_restaurant_id, v_payment_status
    FROM public.orders WHERE id = _order_id;

    IF v_restaurant_id IS NULL THEN RAISE EXCEPTION 'Pedido não encontrado.'; END IF;
    IF v_payment_status != 'open' THEN RAISE EXCEPTION 'Pedido não está aberto para adição de itens.'; END IF;

    IF NOT public.check_restaurant_role(v_restaurant_id, ARRAY['waiter', 'cashier', 'manager', 'owner']) THEN
        RAISE EXCEPTION 'Não autorizado.';
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
        v_calc := public.calculate_order_item_details(v_restaurant_id, v_item);
        
        INSERT INTO public.order_items (
            order_id, product_id, quantity, unit_price_cents, total_price_cents, customization, status, created_by
        ) VALUES (
            _order_id, 
            (v_calc->>'product_id')::uuid, 
            (v_calc->>'quantity')::integer, 
            (v_calc->>'unit_price_cents')::integer, 
            (v_calc->>'total_price_cents')::integer, 
            (v_calc->'customization'), 
            'draft', 
            auth.uid()
        );
    END LOOP;

    -- Update order totals
    SELECT SUM(total_price_cents) INTO v_new_subtotal FROM public.order_items WHERE order_id = _order_id AND status != 'cancelled';
    
    UPDATE public.orders 
    SET subtotal_cents = COALESCE(v_new_subtotal, 0), 
        total_cents = COALESCE(v_new_subtotal, 0) + COALESCE(delivery_fee_cents, 0) - COALESCE(discount_cents, 0),
        updated_at = now()
    WHERE id = _order_id;

    RETURN jsonb_build_object('order_id', _order_id, 'subtotal_cents', v_new_subtotal);
END;
$$;

-- RPC: send_order_to_kitchen
CREATE OR REPLACE FUNCTION public.send_order_to_kitchen(_order_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_restaurant_id uuid;
    v_count integer;
BEGIN
    SELECT restaurant_id INTO v_restaurant_id FROM public.orders WHERE id = _order_id;
    IF v_restaurant_id IS NULL THEN RAISE EXCEPTION 'Pedido não encontrado.'; END IF;

    IF NOT public.check_restaurant_role(v_restaurant_id, ARRAY['waiter', 'cashier', 'manager', 'owner']) THEN
        RAISE EXCEPTION 'Não autorizado.';
    END IF;

    UPDATE public.order_items
    SET status = 'sent', sent_to_kitchen_at = now()
    WHERE order_id = _order_id AND status = 'draft'
    RETURNING count(*) INTO v_count;

    IF v_count > 0 THEN
        -- Move order to accepted if it was new
        UPDATE public.orders SET status = 'accepted', updated_at = now() WHERE id = _order_id AND status = 'new';
    END IF;

    RETURN v_count;
END;
$$;

-- RPC: cancel_order_item
CREATE OR REPLACE FUNCTION public.cancel_order_item(_order_item_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_restaurant_id uuid;
    v_tenant_id uuid;
    v_order_id uuid;
    v_status text;
    v_role text;
    v_new_subtotal integer;
BEGIN
    SELECT o.restaurant_id, o.tenant_id, oi.order_id, oi.status INTO v_restaurant_id, v_tenant_id, v_order_id, v_status
    FROM public.order_items oi
    JOIN public.orders o ON oi.order_id = o.id
    WHERE oi.id = _order_item_id;

    IF v_restaurant_id IS NULL THEN RAISE EXCEPTION 'Item não encontrado.'; END IF;
    IF length(trim(_reason)) < 3 THEN RAISE EXCEPTION 'Motivo de cancelamento deve ter pelo menos 3 caracteres.'; END IF;

    SELECT role INTO v_role FROM restaurant_members WHERE restaurant_id = v_restaurant_id AND user_id = auth.uid();
    
    IF v_role NOT IN ('cashier', 'manager', 'owner') THEN
        IF v_role = 'waiter' AND v_status = 'draft' THEN
            -- Waiter can only cancel draft items
        ELSE
            RAISE EXCEPTION 'Não autorizado para cancelar este item.';
        END IF;
    END IF;

    UPDATE public.order_items
    SET status = 'cancelled', cancelled_at = now(), cancel_reason = _reason
    WHERE id = _order_item_id;

    -- Recalculate order total
    SELECT SUM(total_price_cents) INTO v_new_subtotal FROM public.order_items WHERE order_id = v_order_id AND status != 'cancelled';
    
    UPDATE public.orders 
    SET subtotal_cents = COALESCE(v_new_subtotal, 0), 
        total_cents = COALESCE(v_new_subtotal, 0) + COALESCE(delivery_fee_cents, 0) - COALESCE(discount_cents, 0),
        updated_at = now()
    WHERE id = v_order_id;

    -- Audit Log
    INSERT INTO public.audit_log (restaurant_id, tenant_id, user_id, action, entity, entity_id, payload)
    VALUES (v_restaurant_id, v_tenant_id, auth.uid(), 'cancel_item', 'order_item', _order_item_id, jsonb_build_object('reason', _reason, 'order_id', v_order_id));
END;
$$;

-- RPC: close_order
CREATE OR REPLACE FUNCTION public.close_order(_order_id uuid, _payment_method payment_method)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_restaurant_id uuid;
    v_tenant_id uuid;
    v_has_items boolean;
BEGIN
    SELECT restaurant_id, tenant_id INTO v_restaurant_id, v_tenant_id FROM public.orders WHERE id = _order_id AND payment_status = 'open';
    IF v_restaurant_id IS NULL THEN RAISE EXCEPTION 'Pedido não encontrado ou já fechado.'; END IF;

    IF NOT public.check_restaurant_role(v_restaurant_id, ARRAY['cashier', 'manager', 'owner']) THEN
        RAISE EXCEPTION 'Não autorizado.';
    END IF;

    SELECT EXISTS (SELECT 1 FROM public.order_items WHERE order_id = _order_id AND status != 'cancelled') INTO v_has_items;
    IF NOT v_has_items THEN RAISE EXCEPTION 'Pedido não possui itens ativos.'; END IF;

    UPDATE public.orders
    SET payment_status = 'paid',
        paid_at = now(),
        status = 'completed',
        payment_method = _payment_method,
        closed_at = now(),
        updated_at = now()
    WHERE id = _order_id;

    -- Audit Log
    INSERT INTO public.audit_log (restaurant_id, tenant_id, user_id, action, entity, entity_id, payload)
    VALUES (v_restaurant_id, v_tenant_id, auth.uid(), 'close_order', 'order', _order_id, jsonb_build_object('payment_method', _payment_method));
END;
$$;