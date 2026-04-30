
-- =========================================
-- F4: SCHEMA CHANGES
-- =========================================

-- Add columns to restaurants
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS service_fee_percent numeric NOT NULL DEFAULT 10.0;

-- Add columns to orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS paid_amount_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS service_fee_cents integer NOT NULL DEFAULT 0;

-- =========================================
-- TABLE: cash_sessions
-- =========================================
CREATE TABLE IF NOT EXISTS public.cash_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  restaurant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  opening_amount_cents integer NOT NULL DEFAULT 0,
  expected_amount_cents integer,
  counted_amount_cents integer,
  difference_cents integer,
  status text NOT NULL DEFAULT 'open',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_sessions_one_open_per_user
  ON public.cash_sessions (restaurant_id, user_id)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_cash_sessions_restaurant ON public.cash_sessions (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_cash_sessions_user ON public.cash_sessions (user_id);

ALTER TABLE public.cash_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cash_sessions_select_member"
  ON public.cash_sessions FOR SELECT
  TO authenticated
  USING (is_member_of_restaurant(auth.uid(), restaurant_id));

-- =========================================
-- TABLE: cash_movements
-- =========================================
CREATE TABLE IF NOT EXISTS public.cash_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  restaurant_id uuid NOT NULL,
  cash_session_id uuid NOT NULL,
  user_id uuid NOT NULL,
  movement_type text NOT NULL,
  amount_cents integer NOT NULL,
  reason text,
  order_id uuid,
  payment_method text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cash_movements_session ON public.cash_movements (cash_session_id);
CREATE INDEX IF NOT EXISTS idx_cash_movements_restaurant ON public.cash_movements (restaurant_id);

ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cash_movements_select_member"
  ON public.cash_movements FOR SELECT
  TO authenticated
  USING (is_member_of_restaurant(auth.uid(), restaurant_id));

-- =========================================
-- TABLE: order_payments
-- =========================================
CREATE TABLE IF NOT EXISTS public.order_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  restaurant_id uuid NOT NULL,
  order_id uuid NOT NULL,
  cash_session_id uuid,
  user_id uuid NOT NULL,
  payment_method text NOT NULL,
  amount_cents integer NOT NULL,
  change_cents integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_payments_order ON public.order_payments (order_id);
CREATE INDEX IF NOT EXISTS idx_order_payments_session ON public.order_payments (cash_session_id);
CREATE INDEX IF NOT EXISTS idx_order_payments_restaurant ON public.order_payments (restaurant_id);

ALTER TABLE public.order_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "order_payments_select_member"
  ON public.order_payments FOR SELECT
  TO authenticated
  USING (is_member_of_restaurant(auth.uid(), restaurant_id));

-- =========================================
-- TABLE: order_discounts
-- =========================================
CREATE TABLE IF NOT EXISTS public.order_discounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  restaurant_id uuid NOT NULL,
  order_id uuid NOT NULL,
  order_item_id uuid,
  scope text NOT NULL,
  discount_type text NOT NULL,
  value numeric NOT NULL,
  amount_cents integer NOT NULL,
  reason text,
  applied_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_discounts_order ON public.order_discounts (order_id);
CREATE INDEX IF NOT EXISTS idx_order_discounts_restaurant ON public.order_discounts (restaurant_id);

ALTER TABLE public.order_discounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "order_discounts_select_member"
  ON public.order_discounts FOR SELECT
  TO authenticated
  USING (is_member_of_restaurant(auth.uid(), restaurant_id));

-- =========================================
-- RPC: open_cash_session
-- =========================================
CREATE OR REPLACE FUNCTION public.open_cash_session(
  _restaurant_id uuid,
  _opening_amount_cents integer,
  _notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
  v_session_id uuid;
  v_existing uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF NOT has_any_role_in_restaurant(v_user_id, _restaurant_id, ARRAY['cashier'::app_role, 'manager'::app_role, 'owner'::app_role]) THEN
    RAISE EXCEPTION 'Sem permissão para abrir caixa';
  END IF;

  IF _opening_amount_cents < 0 THEN
    RAISE EXCEPTION 'Valor de abertura inválido';
  END IF;

  SELECT tenant_id INTO v_tenant_id FROM restaurants WHERE id = _restaurant_id;

  SELECT id INTO v_existing
    FROM cash_sessions
   WHERE restaurant_id = _restaurant_id
     AND user_id = v_user_id
     AND status = 'open'
   LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'Já existe um caixa aberto para este usuário';
  END IF;

  INSERT INTO cash_sessions (tenant_id, restaurant_id, user_id, opening_amount_cents, notes)
  VALUES (v_tenant_id, _restaurant_id, v_user_id, _opening_amount_cents, _notes)
  RETURNING id INTO v_session_id;

  RETURN v_session_id;
END;
$$;

REVOKE ALL ON FUNCTION public.open_cash_session(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_cash_session(uuid, integer, text) TO authenticated;

-- =========================================
-- RPC: register_cash_movement
-- =========================================
CREATE OR REPLACE FUNCTION public.register_cash_movement(
  _cash_session_id uuid,
  _movement_type text,
  _amount_cents integer,
  _reason text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_session record;
  v_movement_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT * INTO v_session FROM cash_sessions WHERE id = _cash_session_id FOR UPDATE;

  IF v_session.id IS NULL THEN
    RAISE EXCEPTION 'Caixa não encontrado';
  END IF;
  IF v_session.status <> 'open' THEN
    RAISE EXCEPTION 'Caixa já fechado';
  END IF;
  IF v_session.user_id <> v_user_id AND NOT has_any_role_in_restaurant(v_user_id, v_session.restaurant_id, ARRAY['manager'::app_role, 'owner'::app_role]) THEN
    RAISE EXCEPTION 'Sem permissão para movimentar este caixa';
  END IF;

  IF _movement_type NOT IN ('bleed', 'supply') THEN
    RAISE EXCEPTION 'Tipo de movimento inválido (use bleed ou supply)';
  END IF;
  IF _amount_cents <= 0 THEN
    RAISE EXCEPTION 'Valor deve ser positivo';
  END IF;
  IF _reason IS NULL OR length(trim(_reason)) < 3 THEN
    RAISE EXCEPTION 'Motivo obrigatório (mínimo 3 caracteres)';
  END IF;

  INSERT INTO cash_movements (tenant_id, restaurant_id, cash_session_id, user_id, movement_type, amount_cents, reason)
  VALUES (v_session.tenant_id, v_session.restaurant_id, _cash_session_id, v_user_id, _movement_type, _amount_cents, _reason)
  RETURNING id INTO v_movement_id;

  RETURN v_movement_id;
END;
$$;

REVOKE ALL ON FUNCTION public.register_cash_movement(uuid, text, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_cash_movement(uuid, text, integer, text) TO authenticated;

-- =========================================
-- RPC: close_cash_session
-- =========================================
CREATE OR REPLACE FUNCTION public.close_cash_session(
  _cash_session_id uuid,
  _counted_amount_cents integer,
  _notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_session record;
  v_supplies integer := 0;
  v_bleeds integer := 0;
  v_sales_money integer := 0;
  v_expected integer;
  v_difference integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT * INTO v_session FROM cash_sessions WHERE id = _cash_session_id FOR UPDATE;

  IF v_session.id IS NULL THEN
    RAISE EXCEPTION 'Caixa não encontrado';
  END IF;
  IF v_session.status <> 'open' THEN
    RAISE EXCEPTION 'Caixa já fechado';
  END IF;
  IF v_session.user_id <> v_user_id AND NOT has_any_role_in_restaurant(v_user_id, v_session.restaurant_id, ARRAY['manager'::app_role, 'owner'::app_role]) THEN
    RAISE EXCEPTION 'Sem permissão para fechar este caixa';
  END IF;

  SELECT COALESCE(SUM(amount_cents), 0) INTO v_supplies
    FROM cash_movements WHERE cash_session_id = _cash_session_id AND movement_type = 'supply';
  SELECT COALESCE(SUM(amount_cents), 0) INTO v_bleeds
    FROM cash_movements WHERE cash_session_id = _cash_session_id AND movement_type = 'bleed';
  SELECT COALESCE(SUM(amount_cents), 0) INTO v_sales_money
    FROM order_payments
   WHERE cash_session_id = _cash_session_id AND payment_method = 'money';

  v_expected := v_session.opening_amount_cents + v_supplies - v_bleeds + v_sales_money;
  v_difference := _counted_amount_cents - v_expected;

  UPDATE cash_sessions
     SET status = 'closed',
         closed_at = now(),
         expected_amount_cents = v_expected,
         counted_amount_cents = _counted_amount_cents,
         difference_cents = v_difference,
         notes = COALESCE(_notes, notes),
         updated_at = now()
   WHERE id = _cash_session_id;

  RETURN jsonb_build_object(
    'session_id', _cash_session_id,
    'opening_amount_cents', v_session.opening_amount_cents,
    'supplies_cents', v_supplies,
    'bleeds_cents', v_bleeds,
    'sales_money_cents', v_sales_money,
    'expected_amount_cents', v_expected,
    'counted_amount_cents', _counted_amount_cents,
    'difference_cents', v_difference
  );
END;
$$;

REVOKE ALL ON FUNCTION public.close_cash_session(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_cash_session(uuid, integer, text) TO authenticated;

-- =========================================
-- RPC: register_order_payment
-- =========================================
CREATE OR REPLACE FUNCTION public.register_order_payment(
  _order_id uuid,
  _payment_method text,
  _amount_cents integer,
  _change_cents integer DEFAULT 0,
  _notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_order record;
  v_session_id uuid;
  v_payment_id uuid;
  v_already_paid integer;
  v_remaining integer;
  v_new_paid integer;
  v_status text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF _payment_method NOT IN ('money', 'card', 'pix', 'online') THEN
    RAISE EXCEPTION 'Método de pagamento inválido';
  END IF;
  IF _amount_cents <= 0 THEN
    RAISE EXCEPTION 'Valor de pagamento deve ser positivo';
  END IF;

  SELECT * INTO v_order FROM orders WHERE id = _order_id FOR UPDATE;
  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Pedido não encontrado';
  END IF;
  IF NOT has_any_role_in_restaurant(v_user_id, v_order.restaurant_id, ARRAY['cashier'::app_role, 'manager'::app_role, 'owner'::app_role]) THEN
    RAISE EXCEPTION 'Sem permissão para registrar pagamento';
  END IF;
  IF v_order.payment_status = 'paid' THEN
    RAISE EXCEPTION 'Pedido já fechado';
  END IF;

  v_already_paid := COALESCE(v_order.paid_amount_cents, 0);
  v_remaining := v_order.total_cents - v_already_paid;

  IF (_amount_cents - _change_cents) > v_remaining THEN
    RAISE EXCEPTION 'Valor pago (líquido) excede o total restante do pedido';
  END IF;

  -- Try to bind to user's open cash session for this restaurant (money only enforced; others optional)
  SELECT id INTO v_session_id
    FROM cash_sessions
   WHERE restaurant_id = v_order.restaurant_id AND user_id = v_user_id AND status = 'open'
   LIMIT 1;

  INSERT INTO order_payments (tenant_id, restaurant_id, order_id, cash_session_id, user_id, payment_method, amount_cents, change_cents, notes)
  VALUES (v_order.tenant_id, v_order.restaurant_id, _order_id, v_session_id, v_user_id, _payment_method, _amount_cents, _change_cents, _notes)
  RETURNING id INTO v_payment_id;

  v_new_paid := v_already_paid + (_amount_cents - _change_cents);

  IF v_new_paid >= v_order.total_cents THEN
    v_status := 'paid';
    UPDATE orders
       SET paid_amount_cents = v_new_paid,
           payment_status = 'paid',
           paid_at = now(),
           closed_at = now(),
           payment_method = _payment_method::payment_method,
           updated_at = now()
     WHERE id = _order_id;
  ELSE
    v_status := 'partial';
    UPDATE orders
       SET paid_amount_cents = v_new_paid,
           updated_at = now()
     WHERE id = _order_id;
  END IF;

  RETURN jsonb_build_object(
    'payment_id', v_payment_id,
    'paid_amount_cents', v_new_paid,
    'remaining_cents', GREATEST(v_order.total_cents - v_new_paid, 0),
    'payment_status', v_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.register_order_payment(uuid, text, integer, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_order_payment(uuid, text, integer, integer, text) TO authenticated;

-- =========================================
-- RPC: split_order_equal
-- =========================================
CREATE OR REPLACE FUNCTION public.split_order_equal(
  _order_id uuid,
  _parts integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_order record;
  v_remaining integer;
  v_per_part integer;
  v_remainder integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;
  IF _parts < 2 THEN
    RAISE EXCEPTION 'Divisão precisa de pelo menos 2 partes';
  END IF;

  SELECT * INTO v_order FROM orders WHERE id = _order_id;
  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Pedido não encontrado';
  END IF;
  IF NOT has_any_role_in_restaurant(v_user_id, v_order.restaurant_id, ARRAY['cashier'::app_role, 'manager'::app_role, 'owner'::app_role]) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  v_remaining := v_order.total_cents - COALESCE(v_order.paid_amount_cents, 0);
  IF v_remaining <= 0 THEN
    RAISE EXCEPTION 'Pedido já está totalmente pago';
  END IF;

  v_per_part := v_remaining / _parts;
  v_remainder := v_remaining - (v_per_part * _parts);

  RETURN jsonb_build_object(
    'parts', _parts,
    'amount_per_part_cents', v_per_part,
    'remainder_cents', v_remainder,
    'total_remaining_cents', v_remaining
  );
END;
$$;

REVOKE ALL ON FUNCTION public.split_order_equal(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.split_order_equal(uuid, integer) TO authenticated;

-- =========================================
-- RPC: apply_order_discount
-- =========================================
CREATE OR REPLACE FUNCTION public.apply_order_discount(
  _order_id uuid,
  _scope text,
  _discount_type text,
  _value numeric,
  _order_item_id uuid DEFAULT NULL,
  _reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_order record;
  v_base_cents integer;
  v_amount_cents integer;
  v_discount_id uuid;
  v_total_disc integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT * INTO v_order FROM orders WHERE id = _order_id FOR UPDATE;
  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Pedido não encontrado';
  END IF;
  IF NOT has_any_role_in_restaurant(v_user_id, v_order.restaurant_id, ARRAY['manager'::app_role, 'owner'::app_role]) THEN
    RAISE EXCEPTION 'Apenas gerente/dono podem aplicar desconto';
  END IF;
  IF v_order.payment_status = 'paid' THEN
    RAISE EXCEPTION 'Pedido já fechado';
  END IF;

  IF _scope NOT IN ('order', 'item') THEN
    RAISE EXCEPTION 'Escopo inválido (use order ou item)';
  END IF;
  IF _discount_type NOT IN ('percent', 'fixed') THEN
    RAISE EXCEPTION 'Tipo de desconto inválido (use percent ou fixed)';
  END IF;
  IF _value <= 0 THEN
    RAISE EXCEPTION 'Valor de desconto deve ser positivo';
  END IF;

  IF _scope = 'item' THEN
    IF _order_item_id IS NULL THEN
      RAISE EXCEPTION 'order_item_id obrigatório para desconto por item';
    END IF;
    SELECT total_price_cents INTO v_base_cents
      FROM order_items WHERE id = _order_item_id AND order_id = _order_id AND status <> 'cancelled';
    IF v_base_cents IS NULL THEN
      RAISE EXCEPTION 'Item não encontrado ou cancelado';
    END IF;
  ELSE
    v_base_cents := v_order.subtotal_cents;
  END IF;

  IF _discount_type = 'percent' THEN
    IF _value > 100 THEN
      RAISE EXCEPTION 'Percentual não pode passar de 100';
    END IF;
    v_amount_cents := floor(v_base_cents * _value / 100.0)::integer;
  ELSE
    v_amount_cents := floor(_value)::integer;
  END IF;

  IF v_amount_cents > v_base_cents THEN
    v_amount_cents := v_base_cents;
  END IF;

  INSERT INTO order_discounts (tenant_id, restaurant_id, order_id, order_item_id, scope, discount_type, value, amount_cents, reason, applied_by)
  VALUES (v_order.tenant_id, v_order.restaurant_id, _order_id, _order_item_id, _scope, _discount_type, _value, v_amount_cents, _reason, v_user_id)
  RETURNING id INTO v_discount_id;

  -- Recompute order discount + total
  SELECT COALESCE(SUM(amount_cents), 0) INTO v_total_disc
    FROM order_discounts WHERE order_id = _order_id;

  UPDATE orders
     SET discount_cents = v_total_disc,
         total_cents = GREATEST(subtotal_cents - v_total_disc + COALESCE(service_fee_cents, 0) + COALESCE(delivery_fee_cents, 0), 0),
         updated_at = now()
   WHERE id = _order_id;

  RETURN jsonb_build_object(
    'discount_id', v_discount_id,
    'amount_cents', v_amount_cents,
    'order_total_cents', (SELECT total_cents FROM orders WHERE id = _order_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_order_discount(uuid, text, text, numeric, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_order_discount(uuid, text, text, numeric, uuid, text) TO authenticated;

-- =========================================
-- RPC: set_service_fee  (per order, in cents, computed from %)
-- =========================================
CREATE OR REPLACE FUNCTION public.set_service_fee(
  _order_id uuid,
  _percent numeric
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_order record;
  v_fee integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;
  IF _percent < 0 OR _percent > 100 THEN
    RAISE EXCEPTION 'Percentual inválido (0 a 100)';
  END IF;

  SELECT * INTO v_order FROM orders WHERE id = _order_id FOR UPDATE;
  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Pedido não encontrado';
  END IF;
  IF NOT has_any_role_in_restaurant(v_user_id, v_order.restaurant_id, ARRAY['cashier'::app_role, 'manager'::app_role, 'owner'::app_role]) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  IF v_order.payment_status = 'paid' THEN
    RAISE EXCEPTION 'Pedido já fechado';
  END IF;

  v_fee := floor((v_order.subtotal_cents - COALESCE(v_order.discount_cents, 0)) * _percent / 100.0)::integer;
  IF v_fee < 0 THEN v_fee := 0; END IF;

  UPDATE orders
     SET service_fee_cents = v_fee,
         total_cents = GREATEST(subtotal_cents - COALESCE(discount_cents, 0) + v_fee + COALESCE(delivery_fee_cents, 0), 0),
         updated_at = now()
   WHERE id = _order_id;

  RETURN jsonb_build_object('service_fee_cents', v_fee, 'order_total_cents', (SELECT total_cents FROM orders WHERE id = _order_id));
END;
$$;

REVOKE ALL ON FUNCTION public.set_service_fee(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_service_fee(uuid, numeric) TO authenticated;
