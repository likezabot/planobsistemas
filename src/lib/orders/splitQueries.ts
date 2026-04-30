import { supabase } from "@/integrations/supabase/client";

export interface SplitEqualResult {
  parts: number;
  amount_per_part_cents: number;
  remainder_cents: number;
  total_remaining_cents: number;
}

export interface SplitItemsResult {
  amount_cents: number;
  order_total_cents: number;
  order_paid_cents: number;
  order_remaining_cents: number;
}

export const splitOrderEqual = async (
  orderId: string,
  parts: number,
): Promise<SplitEqualResult> => {
  const { data, error } = await supabase.rpc("split_order_equal", {
    _order_id: orderId,
    _parts: parts,
  });
  if (error) throw error;
  return data as unknown as SplitEqualResult;
};

export const splitOrderByItems = async (
  orderId: string,
  items: { order_item_id: string; quantity: number }[],
): Promise<SplitItemsResult> => {
  const { data, error } = await supabase.rpc("split_order_by_items", {
    _order_id: orderId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _items: items as any,
  });
  if (error) throw error;
  return data as unknown as SplitItemsResult;
};
