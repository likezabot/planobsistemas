import { supabase } from "@/integrations/supabase/client";

export type PrintJob = {
  id: string;
  order_id: string;
  status: 'pending' | 'printing' | 'printed' | 'failed';
  source: 'auto' | 'manual' | 'reprint';
  payload: any;
  attempts: number;
  agent_id: string | null;
  last_error: string | null;
  created_at: string;
  claimed_at: string | null;
  printed_at: string | null;
};

export const getPrintJobs = async (restaurantId: string) => {
  const { data, error } = await supabase
    .from('print_jobs')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data as PrintJob[];
};

export const reprintOrder = async (orderId: string, reason: string) => {
  const { data, error } = await supabase.rpc('reprint_order', {
    p_order_id: orderId,
    p_reason: reason
  });

  if (error) throw error;
  return data;
};
