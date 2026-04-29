-- 1) Function to safely update order status with validation and auditing
CREATE OR REPLACE FUNCTION public.update_order_status(
    _order_id UUID,
    _new_status public.order_status,
    _reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_old_status public.order_status;
    v_restaurant_id UUID;
    v_tenant_id UUID;
    v_user_role public.app_role;
    v_user_id UUID := auth.uid();
BEGIN
    -- 1) Lookup order and permissions
    SELECT status, restaurant_id, tenant_id INTO v_old_status, v_restaurant_id, v_tenant_id
    FROM public.orders
    WHERE id = _order_id;

    IF v_restaurant_id IS NULL THEN
        RAISE EXCEPTION 'Pedido não encontrado.';
    END IF;

    -- Check if user is member and get their role
    SELECT role INTO v_user_role
    FROM public.restaurant_members
    WHERE restaurant_id = v_restaurant_id AND user_id = v_user_id;

    IF v_user_role IS NULL THEN
        RAISE EXCEPTION 'Acesso negado: Você não é membro deste restaurante.';
    END IF;

    -- 2) Validate transitions
    -- Cancelled orders are final
    IF v_old_status = 'cancelled' THEN
        RAISE EXCEPTION 'Não é possível alterar um pedido cancelado.';
    END IF;

    -- Completed orders are final (except for managers/owners in special cases? No, user said "completed voltar para preparo" is forbidden)
    IF v_old_status = 'completed' AND _new_status != 'cancelled' THEN
        RAISE EXCEPTION 'Não é possível alterar um pedido concluído.';
    END IF;

    -- Specific transition rules
    IF _new_status = 'cancelled' AND (_reason IS NULL OR length(trim(_reason)) < 3) THEN
        RAISE EXCEPTION 'Motivo é obrigatório para cancelamento.';
    END IF;

    -- Role-based constraints (optional but good)
    -- kitchen might not be able to set 'delivered' or 'completed' depending on flow, but user said:
    -- "kitchen consegue alterar accepted -> preparing"
    -- "waiter/kitchen/cashier/manager/owner podem ler pedidos"

    -- 3) Perform update
    UPDATE public.orders
    SET status = _new_status,
        updated_at = now()
    WHERE id = _order_id;

    -- 4) Log to audit_log
    INSERT INTO public.audit_log (
        tenant_id, restaurant_id, user_id, action, entity, entity_id, payload
    ) VALUES (
        v_tenant_id, v_restaurant_id, v_user_id, 
        'status_change', 'order', _order_id, 
        jsonb_build_object(
            'old_status', v_old_status, 
            'new_status', _new_status, 
            'reason', _reason,
            'role', v_user_role
        )
    );
END;
$$;

-- Revoke/Grant
REVOKE ALL ON FUNCTION public.update_order_status(UUID, public.order_status, TEXT) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_order_status(UUID, public.order_status, TEXT) TO authenticated;

-- 2) Enhance RLS for orders and items
-- Ensure all roles can select orders from their restaurant
DROP POLICY IF EXISTS "Members can view orders" ON public.orders;
CREATE POLICY "Members can view orders"
ON public.orders FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.restaurant_members
    WHERE restaurant_id = orders.restaurant_id
      AND user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Members can view order items" ON public.order_items;
CREATE POLICY "Members can view order items"
ON public.order_items FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    JOIN public.restaurant_members rm ON rm.restaurant_id = o.restaurant_id
    WHERE o.id = order_items.order_id
      AND rm.user_id = auth.uid()
  )
);

-- Note: We don't allow direct UPDATE on orders for everyone, they should use the RPC.
-- But we keep a manager policy for direct fixes if needed.
DROP POLICY IF EXISTS "Managers can update orders" ON public.orders;
CREATE POLICY "Managers can update orders"
ON public.orders FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.restaurant_members
    WHERE restaurant_id = orders.restaurant_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'manager')
  )
);
