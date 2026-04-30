CREATE OR REPLACE FUNCTION public.split_order_by_items(
  _order_id uuid,
  _items jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_order record;
  v_total integer := 0;
  v_item record;
  v_entry jsonb;
  v_qty integer;
  v_unit_price integer;
  v_item_discount integer;
  v_per_unit integer;
  v_part integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT * INTO v_order FROM orders WHERE id = _order_id;
  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Pedido não encontrado';
  END IF;
  IF NOT has_any_role_in_restaurant(v_user_id, v_order.restaurant_id, ARRAY['cashier'::app_role, 'manager'::app_role, 'owner'::app_role]) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  IF _items IS NULL OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'Lista de itens vazia';
  END IF;

  FOR v_entry IN SELECT * FROM jsonb_array_elements(_items)
  LOOP
    v_qty := (v_entry->>'quantity')::integer;
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Quantidade inválida';
    END IF;

    SELECT id, quantity, unit_price_cents, total_price_cents, status
      INTO v_item
      FROM order_items
     WHERE id = (v_entry->>'order_item_id')::uuid AND order_id = _order_id;

    IF v_item.id IS NULL THEN
      RAISE EXCEPTION 'Item não pertence ao pedido';
    END IF;
    IF v_item.status = 'cancelled' THEN
      RAISE EXCEPTION 'Item cancelado não pode ser dividido';
    END IF;
    IF v_qty > v_item.quantity THEN
      RAISE EXCEPTION 'Quantidade solicitada maior que a do item';
    END IF;

    SELECT COALESCE(SUM(amount_cents), 0) INTO v_item_discount
      FROM order_discounts
     WHERE order_id = _order_id AND order_item_id = v_item.id;

    -- Per-unit value = (total_price - item_discount) / quantity, rounded down
    v_per_unit := floor((v_item.total_price_cents - v_item_discount)::numeric / v_item.quantity)::integer;
    IF v_per_unit < 0 THEN v_per_unit := 0; END IF;

    v_part := v_per_unit * v_qty;
    v_total := v_total + v_part;
  END LOOP;

  -- Cap to remaining unpaid balance
  IF v_total > (v_order.total_cents - COALESCE(v_order.paid_amount_cents, 0)) THEN
    v_total := v_order.total_cents - COALESCE(v_order.paid_amount_cents, 0);
  END IF;

  RETURN jsonb_build_object(
    'amount_cents', v_total,
    'order_total_cents', v_order.total_cents,
    'order_paid_cents', COALESCE(v_order.paid_amount_cents, 0),
    'order_remaining_cents', GREATEST(v_order.total_cents - COALESCE(v_order.paid_amount_cents, 0), 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.split_order_by_items(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.split_order_by_items(uuid, jsonb) TO authenticated;
