-- Add delivery address validation to create_public_order
-- Re-create function adding address check right after phone validation
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
    v_pizza_config RECORD;
    v_flavor_id UUID;
    v_flavor_price INTEGER;
    v_flavor_name TEXT;
    v_flavor_prices INTEGER[];
    v_flavors_snapshot JSONB[];
    v_pizza_base_price INTEGER := 0;
    v_group RECORD;
    v_count INTEGER;
BEGIN
    SELECT id, tenant_id INTO v_restaurant_id, v_tenant_id
    FROM public.restaurants
    WHERE slug = _restaurant_slug AND public_menu_enabled = true;

    IF v_restaurant_id IS NULL THEN
        RAISE EXCEPTION 'Restaurante não encontrado ou cardápio desativado.';
    END IF;

    SELECT id INTO v_existing_order_id
    FROM public.orders
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

    -- NEW: Address required for delivery
    IF _order_type = 'delivery' AND (_address IS NULL OR length(trim(_address)) < 5) THEN
        RAISE EXCEPTION 'Endereço obrigatório para entrega.';
    END IF;

    v_phone_normalized := regexp_replace(_customer_phone, '[^0-9]', '', 'g');

    INSERT INTO public.orders (
        tenant_id, restaurant_id, customer_name, customer_phone,
        order_type, address, payment_method, notes, idempotency_key, status
    ) VALUES (
        v_tenant_id, v_restaurant_id, _customer_name, v_phone_normalized,
        _order_type::public.order_type, _address, _payment_method::public.payment_method, _notes, _idempotency_key, 'new'
    ) RETURNING id INTO v_order_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(_items)
    LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_quantity := COALESCE((v_item->>'quantity')::INTEGER, 1);

        SELECT active, type, price_cents INTO v_product_active, v_product_type, v_base_price_cents
        FROM public.products
        WHERE id = v_product_id AND restaurant_id = v_restaurant_id;

        IF NOT FOUND OR NOT v_product_active THEN
            RAISE EXCEPTION 'Produto indisponível.';
        END IF;

        v_unit_price_cents := v_base_price_cents;

        INSERT INTO public.order_items (
            order_id, product_id, quantity, unit_price_cents, total_price_cents, note
        ) VALUES (
            v_order_id, v_product_id, v_quantity, v_unit_price_cents,
            v_unit_price_cents * v_quantity, v_item->>'note'
        );

        v_subtotal_cents := v_subtotal_cents + (v_unit_price_cents * v_quantity);
    END LOOP;

    v_total_cents := v_subtotal_cents;

    UPDATE public.orders
    SET subtotal_cents = v_subtotal_cents, total_cents = v_total_cents
    WHERE id = v_order_id;

    RETURN jsonb_build_object('order_id', v_order_id, 'idempotent', false);
END;
$function$;