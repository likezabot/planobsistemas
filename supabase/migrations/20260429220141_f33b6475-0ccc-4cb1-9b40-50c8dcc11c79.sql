-- Update open_table_order to set idempotency_key
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
    v_table_name text;
BEGIN
    IF NOT public.check_restaurant_role(_restaurant_id, ARRAY['waiter', 'cashier', 'manager', 'owner']) THEN
        RAISE EXCEPTION 'Não autorizado.';
    END IF;

    SELECT active, restaurant_id, tenant_id, name INTO v_is_active, v_table_restaurant_id, v_tenant_id, v_table_name
    FROM public.dining_tables
    WHERE id = _table_id;

    IF v_table_restaurant_id IS NULL OR v_table_restaurant_id != _restaurant_id THEN
        RAISE EXCEPTION 'Mesa não pertence ao restaurante.';
    END IF;

    IF NOT v_is_active THEN
        RAISE EXCEPTION 'Mesa está inativa.';
    END IF;

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
        restaurant_id, tenant_id, service_mode, table_id, opened_by, status, payment_status, subtotal_cents, total_cents, customer_name, customer_phone, order_type, idempotency_key
    ) VALUES (
        _restaurant_id, v_tenant_id, 'table', _table_id, auth.uid(), 'new', 'open', 0, 0, v_table_name, '00000000', 'pickup', gen_random_uuid()::text
    ) RETURNING id INTO v_order_id;

    RETURN v_order_id;
END;
$$;

-- Update create_counter_order to set idempotency_key
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
        restaurant_id, tenant_id, service_mode, opened_by, status, payment_status, subtotal_cents, total_cents, customer_name, customer_phone, order_type, idempotency_key
    ) VALUES (
        _restaurant_id, v_tenant_id, 'counter', auth.uid(), 'new', 'open', 0, 0, 'Balcão', '00000000', 'pickup', gen_random_uuid()::text
    ) RETURNING id INTO v_order_id;

    RETURN v_order_id;
END;
$$;