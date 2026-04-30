import { supabase } from "@/integrations/supabase/client";

export interface CashSession {
  id: string;
  tenant_id: string;
  restaurant_id: string;
  user_id: string;
  opened_at: string;
  closed_at: string | null;
  opening_amount_cents: number;
  expected_amount_cents: number | null;
  counted_amount_cents: number | null;
  difference_cents: number | null;
  status: "open" | "closed";
  notes: string | null;
}

export interface CashMovement {
  id: string;
  cash_session_id: string;
  movement_type: "bleed" | "supply";
  amount_cents: number;
  reason: string | null;
  created_at: string;
}

export interface CloseCashResult {
  session_id: string;
  opening_amount_cents: number;
  supplies_cents: number;
  bleeds_cents: number;
  sales_money_cents: number;
  expected_amount_cents: number;
  counted_amount_cents: number;
  difference_cents: number;
}

export const getOpenCashSession = async (
  restaurantId: string,
): Promise<CashSession | null> => {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("cash_sessions")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .eq("user_id", user.id)
    .eq("status", "open")
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as CashSession | null) ?? null;
};

export const listCashMovements = async (
  cashSessionId: string,
): Promise<CashMovement[]> => {
  const { data, error } = await supabase
    .from("cash_movements")
    .select("id, cash_session_id, movement_type, amount_cents, reason, created_at")
    .eq("cash_session_id", cashSessionId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as CashMovement[];
};

export const openCashSession = async (
  restaurantId: string,
  openingAmountCents: number,
  notes?: string,
): Promise<string> => {
  const { data, error } = await supabase.rpc("open_cash_session", {
    _restaurant_id: restaurantId,
    _opening_amount_cents: openingAmountCents,
    _notes: notes ?? null,
  });
  if (error) throw error;
  return data as string;
};

export const registerCashMovement = async (
  cashSessionId: string,
  movementType: "bleed" | "supply",
  amountCents: number,
  reason: string,
): Promise<string> => {
  const { data, error } = await supabase.rpc("register_cash_movement", {
    _cash_session_id: cashSessionId,
    _movement_type: movementType,
    _amount_cents: amountCents,
    _reason: reason,
  });
  if (error) throw error;
  return data as string;
};

export const closeCashSession = async (
  cashSessionId: string,
  countedAmountCents: number,
  notes?: string,
): Promise<CloseCashResult> => {
  const { data, error } = await supabase.rpc("close_cash_session", {
    _cash_session_id: cashSessionId,
    _counted_amount_cents: countedAmountCents,
    _notes: notes ?? null,
  });
  if (error) throw error;
  return data as unknown as CloseCashResult;
};
