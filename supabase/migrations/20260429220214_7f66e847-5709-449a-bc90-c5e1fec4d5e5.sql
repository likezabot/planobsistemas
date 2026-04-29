-- Fix send_order_to_kitchen aggregate in RETURNING
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
    WHERE order_id = _order_id AND status = 'draft';
    
    GET DIAGNOSTICS v_count = ROW_COUNT;

    IF v_count > 0 THEN
        -- Move order to accepted if it was new
        UPDATE public.orders SET status = 'accepted', updated_at = now() WHERE id = _order_id AND status = 'new';
    END IF;

    RETURN v_count;
END;
$$;