import { supabase } from "@/integrations/supabase/client";

export type PaymentMethod = "money" | "card" | "pix" | "online";

export interface OrderPayment {
  id: string;
  order_id: string;
  cash_session_id: string | null;
  user_id: string;
  payment_method: PaymentMethod;
  amount_cents: number;
  change_cents: number;
  notes: string | null;
  created_at: string;
}

export interface RegisterPaymentResult {
  payment_id: string;
  paid_amount_cents: number;
  remaining_cents: number;
  payment_status: "partial" | "paid";
}

export const listOrderPayments = async (
  orderId: string,
): Promise<OrderPayment[]> => {
  const { data, error } = await supabase
    .from("order_payments")
    .select(
      "id, order_id, cash_session_id, user_id, payment_method, amount_cents, change_cents, notes, created_at",
    )
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as OrderPayment[];
};

export const registerOrderPayment = async (
  orderId: string,
  paymentMethod: PaymentMethod,
  amountCents: number,
  changeCents: number = 0,
  notes?: string,
): Promise<RegisterPaymentResult> => {
  const { data, error } = await supabase.rpc("register_order_payment", {
    _order_id: orderId,
    _payment_method: paymentMethod,
    _amount_cents: amountCents,
    _change_cents: changeCents,
    _notes: notes ?? null,
  });

  if (error) throw error;
  return data as unknown as RegisterPaymentResult;
};
