-- RPC: relatório de fechamento de caixa por período
-- Retorna lista de cash_sessions (abertas e fechadas) com totais por método de pagamento
-- e cálculo de diferença esperado vs contado.

CREATE OR REPLACE FUNCTION public.get_cash_sessions_report(
  _restaurant_id uuid,
  _from timestamptz,
  _to timestamptz
)
RETURNS TABLE (
  session_id uuid,
  user_id uuid,
  user_name text,
  status text,
  opened_at timestamptz,
  closed_at timestamptz,
  opening_amount_cents integer,
  supplies_cents bigint,
  bleeds_cents bigint,
  sales_money_cents bigint,
  sales_card_cents bigint,
  sales_pix_cents bigint,
  sales_other_cents bigint,
  sales_total_cents bigint,
  expected_amount_cents bigint,
  counted_amount_cents integer,
  difference_cents integer,
  notes text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Authorization: must be owner/manager of restaurant
  IF NOT public.has_any_role_in_restaurant(
    auth.uid(),
    _restaurant_id,
    ARRAY['owner'::app_role, 'manager'::app_role]
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH sessions AS (
    SELECT cs.*
    FROM public.cash_sessions cs
    WHERE cs.restaurant_id = _restaurant_id
      AND cs.opened_at >= _from
      AND cs.opened_at < _to
  ),
  movs AS (
    SELECT
      cm.cash_session_id,
      COALESCE(SUM(CASE WHEN cm.movement_type = 'supply' THEN cm.amount_cents ELSE 0 END), 0)::bigint AS supplies_cents,
      COALESCE(SUM(CASE WHEN cm.movement_type = 'bleed'  THEN cm.amount_cents ELSE 0 END), 0)::bigint AS bleeds_cents
    FROM public.cash_movements cm
    WHERE cm.cash_session_id IN (SELECT id FROM sessions)
    GROUP BY cm.cash_session_id
  ),
  pays AS (
    SELECT
      op.cash_session_id,
      COALESCE(SUM(CASE WHEN op.payment_method = 'money' THEN (op.amount_cents - op.change_cents) ELSE 0 END), 0)::bigint AS sales_money_cents,
      COALESCE(SUM(CASE WHEN op.payment_method = 'card'  THEN op.amount_cents ELSE 0 END), 0)::bigint AS sales_card_cents,
      COALESCE(SUM(CASE WHEN op.payment_method = 'pix'   THEN op.amount_cents ELSE 0 END), 0)::bigint AS sales_pix_cents,
      COALESCE(SUM(CASE WHEN op.payment_method NOT IN ('money','card','pix') THEN op.amount_cents ELSE 0 END), 0)::bigint AS sales_other_cents
    FROM public.order_payments op
    WHERE op.cash_session_id IN (SELECT id FROM sessions)
    GROUP BY op.cash_session_id
  )
  SELECT
    s.id AS session_id,
    s.user_id,
    COALESCE(p.full_name, p.email, 'Usuário') AS user_name,
    s.status,
    s.opened_at,
    s.closed_at,
    s.opening_amount_cents,
    COALESCE(m.supplies_cents, 0) AS supplies_cents,
    COALESCE(m.bleeds_cents, 0)   AS bleeds_cents,
    COALESCE(pay.sales_money_cents, 0) AS sales_money_cents,
    COALESCE(pay.sales_card_cents, 0)  AS sales_card_cents,
    COALESCE(pay.sales_pix_cents, 0)   AS sales_pix_cents,
    COALESCE(pay.sales_other_cents, 0) AS sales_other_cents,
    (COALESCE(pay.sales_money_cents,0) + COALESCE(pay.sales_card_cents,0) + COALESCE(pay.sales_pix_cents,0) + COALESCE(pay.sales_other_cents,0))::bigint AS sales_total_cents,
    (s.opening_amount_cents + COALESCE(m.supplies_cents,0) - COALESCE(m.bleeds_cents,0) + COALESCE(pay.sales_money_cents,0))::bigint AS expected_amount_cents,
    s.counted_amount_cents,
    s.difference_cents,
    s.notes
  FROM sessions s
  LEFT JOIN movs m   ON m.cash_session_id  = s.id
  LEFT JOIN pays pay ON pay.cash_session_id = s.id
  LEFT JOIN public.profiles p ON p.id = s.user_id
  ORDER BY s.opened_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_cash_sessions_report(uuid, timestamptz, timestamptz) TO authenticated;