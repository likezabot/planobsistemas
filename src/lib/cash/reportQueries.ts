import { supabase } from "@/integrations/supabase/client";

export interface CashSessionReportRow {
  session_id: string;
  user_id: string;
  user_name: string;
  status: "open" | "closed";
  opened_at: string;
  closed_at: string | null;
  opening_amount_cents: number;
  supplies_cents: number;
  bleeds_cents: number;
  sales_money_cents: number;
  sales_card_cents: number;
  sales_pix_cents: number;
  sales_other_cents: number;
  sales_total_cents: number;
  expected_amount_cents: number;
  counted_amount_cents: number | null;
  difference_cents: number | null;
  notes: string | null;
}

export const getCashSessionsReport = async (
  restaurantId: string,
  fromIso: string,
  toIso: string,
): Promise<CashSessionReportRow[]> => {
  const { data, error } = await supabase.rpc("get_cash_sessions_report", {
    _restaurant_id: restaurantId,
    _from: fromIso,
    _to: toIso,
  });
  if (error) throw error;
  return (data ?? []) as unknown as CashSessionReportRow[];
};
