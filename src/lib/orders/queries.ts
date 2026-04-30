import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { startOfDay, endOfDay, subDays } from "date-fns";

export interface OrderItemCustomization {
  notes?: string;
  [key: string]: any;
}

export type Order = Database['public']['Tables']['orders']['Row'];
export type OrderItem = Omit<Database['public']['Tables']['order_items']['Row'], 'customization'> & {
  product?: {
    name: string;
  };
  customization: OrderItemCustomization | null;
};

export type OrderWithItems = Order & {
  order_items: OrderItem[];
  delivery_zone?: { name: string } | null;
  table?: { name: string } | null;
};

export type DiningTable = Database['public']['Tables']['dining_tables']['Row'];

export const getRestaurantOrders = async (restaurantId: string) => {
  const { data, error } = await supabase
    .from('orders')
    .select(`
      *,
      order_items (
        *,
        product:products (name)
      ),
      delivery_zone:delivery_zones (name),
      table:dining_tables (name)
    `)
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data as unknown as OrderWithItems[];
};

export const listDiningTables = async (restaurantId: string) => {
  const { data, error } = await supabase
    .from('dining_tables')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .eq('active', true)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return data as DiningTable[];
};

export const getOpenTableOrders = async (restaurantId: string) => {
  const { data, error } = await supabase
    .from('orders')
    .select('*, table:dining_tables(name)')
    .eq('restaurant_id', restaurantId)
    .eq('service_mode', 'table')
    .eq('payment_status', 'open')
    .neq('status', 'cancelled');

  if (error) throw error;
  return data;
};

export const openTableOrder = async (restaurantId: string, tableId: string) => {
  const { data, error } = await supabase.rpc('open_table_order', {
    _restaurant_id: restaurantId,
    _table_id: tableId
  });

  if (error) throw error;
  return data as string;
};

export const createCounterOrder = async (restaurantId: string) => {
  const { data, error } = await supabase.rpc('create_counter_order', {
    _restaurant_id: restaurantId
  });

  if (error) throw error;
  return data as string;
};

export const addItemsToOrder = async (orderId: string, items: any[]) => {
  const { data, error } = await supabase.rpc('add_items_to_order', {
    _order_id: orderId,
    _items: items
  });

  if (error) throw error;
  return data;
};

export const sendOrderToKitchen = async (orderId: string) => {
  const { data, error } = await supabase.rpc('send_order_to_kitchen', {
    _order_id: orderId
  });

  if (error) throw error;
  return data;
};

export const cancelOrderItem = async (orderItemId: string, reason: string) => {
  const { error } = await supabase.rpc('cancel_order_item', {
    _order_item_id: orderItemId,
    _reason: reason
  });

  if (error) throw error;
};

export const closeOrder = async (orderId: string, paymentMethod: Order['payment_method']) => {
  const { error } = await supabase.rpc('close_order', {
    _order_id: orderId,
    _payment_method: paymentMethod
  });

  if (error) throw error;
};

export const updateOrderStatus = async (orderId: string, newStatus: Order['status'], reason?: string) => {
  const { error } = await supabase.rpc('update_order_status', {
    _order_id: orderId,
    _new_status: newStatus,
    _reason: reason
  });

  if (error) throw error;
};

export interface PDVTableSummary {
  id: string;
  name: string;
  status: 'available' | 'occupied';
  order_id: string | null;
  total_cents: number;
}

export interface PDVOrderSummary {
  id: string;
  customer_name: string | null;
  opened_at: string;
  total_cents: number;
  status: string;
}

export interface PDVActiveOrdersSummary {
  tables: PDVTableSummary[];
  counter_orders: PDVOrderSummary[];
  delivery_orders: PDVOrderSummary[];
}

export const getActiveOrdersSummary = async (restaurantId: string): Promise<PDVActiveOrdersSummary> => {
  const { data, error } = await supabase.rpc('get_active_orders_summary', {
    _restaurant_id: restaurantId
  });

  if (error) throw error;
  return data as unknown as PDVActiveOrdersSummary;
};

export const requestAccountPrint = async (orderId: string) => {
  const { data, error } = await supabase.rpc('request_account_print', {
    _order_id: orderId
  });

  if (error) throw error;
  return data as string;
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

  // Weekly sales for chart
  const { data: dashboardStats } = await supabase.rpc('get_dashboard_stats', {
    _restaurant_id: restaurantId,
    _days_back: 7
  });

  const weeklySales = (dashboardStats as any)?.daily_sales?.map((d: any) => ({
    dayLabel: d.day.split('-').reverse().slice(0, 2).join('/'),
    sales_cents: d.sales_cents
  })) || [];

  const maxWeeklySales = Math.max(...weeklySales.map((s: any) => s.sales_cents), 0);

  return {
    salesToday: totalToday,
    ordersToday: ordersCount || 0,
    avgPrepTime,
    trend,
    weeklySales,
    maxWeeklySales
  };
};
