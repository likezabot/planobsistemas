import { supabase } from "@/integrations/supabase/client";

export interface CheckoutItem {
  product_id: string;
  quantity: number;
  note?: string;
  variation_id?: string | null;
  selected_options?: string[];
  pizza_flavors?: string[];
}

export interface CheckoutParams {
  restaurant_slug: string;
  customer_name: string;
  customer_phone: string;
  order_type: "pickup" | "delivery";
  payment_method: "money" | "card" | "pix" | "online";
  idempotency_key: string;
  items: CheckoutItem[];
  address?: string;
  notes?: string;
}

export const createPublicOrder = async (params: CheckoutParams) => {
  const { data, error } = await supabase.rpc("create_public_order", {
    _restaurant_slug: params.restaurant_slug,
    _customer_name: params.customer_name,
    _customer_phone: params.customer_phone,
    _order_type: params.order_type,
    _payment_method: params.payment_method,
    _idempotency_key: params.idempotency_key,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _items: params.items as any,
    _address: params.address,
    _notes: params.notes,
  });

  if (error) throw error;
  return data as { order_id: string; idempotent: boolean };
};
