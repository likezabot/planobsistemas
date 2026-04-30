
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

    SELECT role::text INTO v_role FROM restaurant_members WHERE restaurant_id = v_restaurant_id AND user_id = auth.uid();
    
    -- Role based permission check
    IF v_role = 'waiter' THEN
        IF v_status != 'draft' THEN
            RAISE EXCEPTION 'Garçom só pode cancelar itens que ainda não foram enviados para a cozinha.';
        END IF;
    ELSIF v_role = 'cashier' THEN
        IF v_status NOT IN ('draft') THEN
             RAISE EXCEPTION 'Caixa não pode cancelar itens que já foram enviados para a cozinha. Solicite a um gerente.';
        END IF;
    ELSIF v_role NOT IN ('manager', 'owner') THEN
        RAISE EXCEPTION 'Não autorizado para cancelar este item.';
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
    VALUES (v_restaurant_id, v_tenant_id, auth.uid(), 'cancel_item', 'order_item', _order_item_id, jsonb_build_object('reason', _reason, 'order_id', v_order_id, 'previous_status', v_status));
END;
$$;
