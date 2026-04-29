import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { startOfDay, endOfDay, subDays } from "date-fns";

export type Order = Database['public']['Tables']['orders']['Row'];
export type OrderItem = Database['public']['Tables']['order_items']['Row'] & {
  product?: {
    name: string;
  };
};

export type OrderWithItems = Order & {
  order_items: OrderItem[];
  delivery_zone?: { name: string } | null;
};

export const getRestaurantOrders = async (restaurantId: string) => {
  const { data, error } = await supabase
    .from('orders')
    .select(`
      *,
      order_items (
        *,
        product:products (name)
      ),
      delivery_zone:delivery_zones (name)
    `)
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data as unknown as OrderWithItems[];
};

export const updateOrderStatus = async (orderId: string, newStatus: Order['status'], reason?: string) => {
  const { error } = await supabase.rpc('update_order_status', {
    _order_id: orderId,
    _new_status: newStatus,
    _reason: reason
  });

  if (error) throw error;
};

export const reprintOrder = async (orderId: string, reason: string) => {
  const { data, error } = await supabase.rpc('reprint_order', {
    p_order_id: orderId,
    p_reason: reason
  });

  if (error) throw error;
  return data;
};

export const getDashboardMetrics = async (restaurantId: string) => {
  const today = new Date();
  const start = startOfDay(today).toISOString();
  const end = endOfDay(today).toISOString();
  const yesterdayStart = startOfDay(subDays(today, 1)).toISOString();
  const yesterdayEnd = endOfDay(subDays(today, 1)).toISOString();

  // Today's sales
  const { data: todaySales } = await supabase
    .from('orders')
    .select('total_cents')
    .eq('restaurant_id', restaurantId)
    .in('status', ['delivered', 'completed'])
    .gte('created_at', start)
    .lte('created_at', end);

  // Yesterday's sales
  const { data: yesterdaySales } = await supabase
    .from('orders')
    .select('total_cents')
    .eq('restaurant_id', restaurantId)
    .in('status', ['delivered', 'completed'])
    .gte('created_at', yesterdayStart)
    .lte('created_at', yesterdayEnd);

  // Today's orders count
  const { count: ordersCount } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('restaurant_id', restaurantId)
    .neq('status', 'cancelled')
    .gte('created_at', start)
    .lte('created_at', end);

  // Average prep time
  const { data: completedOrders } = await supabase
    .from('orders')
    .select('created_at, updated_at')
    .eq('restaurant_id', restaurantId)
    .eq('status', 'completed')
    .gte('created_at', start)
    .lte('created_at', end);

  const totalToday = todaySales?.reduce((acc, curr) => acc + curr.total_cents, 0) || 0;
  const totalYesterday = yesterdaySales?.reduce((acc, curr) => acc + curr.total_cents, 0) || 0;

  let trend: string | undefined;
  if (totalYesterday > 0) {
    const diff = ((totalToday - totalYesterday) / totalYesterday) * 100;
    trend = `${diff > 0 ? '+' : ''}${Math.round(diff)}%`;
  }

  let avgPrepTime: string = "-- min";
  if (completedOrders && completedOrders.length > 0) {
    const totalMinutes = completedOrders.reduce((acc, curr) => {
      const start = new Date(curr.created_at).getTime();
      const end = new Date(curr.updated_at).getTime();
      return acc + (end - start) / (1000 * 60);
    }, 0);
    avgPrepTime = `${Math.round(totalMinutes / completedOrders.length)} min`;
  }

  return {
    salesToday: totalToday,
    ordersToday: ordersCount || 0,
    avgPrepTime,
    trend
  };
};
