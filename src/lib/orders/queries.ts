import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";

export type Order = Database['public']['Tables']['orders']['Row'];
export type OrderItem = Database['public']['Tables']['order_items']['Row'] & {
  product?: {
    name: string;
  };
};

export type OrderWithItems = Order & {
  order_items: OrderItem[];
};

export const getRestaurantOrders = async (restaurantId: string) => {
  const { data, error } = await supabase
    .from('orders')
    .select(`
      *,
      order_items (
        *,
        product:products (name)
      )
    `)
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data as OrderWithItems[];
};

export const updateOrderStatus = async (orderId: string, newStatus: Order['status'], reason?: string) => {
  const { error } = await supabase.rpc('update_order_status', {
    _order_id: orderId,
    _new_status: newStatus,
    _reason: reason
  });

  if (error) throw error;
};
