-- Fix check_restaurant_role to handle app_role enum
CREATE OR REPLACE FUNCTION public.check_restaurant_role(_restaurant_id uuid, _allowed_roles text[])
RETURNS boolean AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM restaurant_members
        WHERE restaurant_id = _restaurant_id
        AND user_id = auth.uid()
        AND role::text = ANY(_allowed_roles)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Fix cancel_order_item to handle app_role enum
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