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

export interface PrintAgent {
  id: string;
  restaurant_id: string;
  name: string;
  secret_key: string;
  status: 'active' | 'inactive';
  last_seen_at: string | null;
  created_at: string;
}

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

export const claimPrintJob = async (jobId: string, agentId: string, secretKey: string) => {
  const { data, error } = await supabase.rpc('claim_print_job', {
    p_job_id: jobId,
    p_agent_id: agentId,
    p_secret_key: secretKey
  });
  if (error) throw error;
  return data;
};

export const completePrintJob = async (jobId: string, agentId: string, secretKey: string) => {
  const { data, error } = await supabase.rpc('complete_print_job', {
    p_job_id: jobId,
    p_agent_id: agentId,
    p_secret_key: secretKey
  });
  if (error) throw error;
  return data;
};

export const failPrintJob = async (jobId: string, agentId: string, secretKey: string, errorMsg: string) => {
  const { data, error } = await supabase.rpc('fail_print_job', {
    p_job_id: jobId,
    p_agent_id: agentId,
    p_secret_key: secretKey,
    p_error: errorMsg
  });
  if (error) throw error;
  return data;
};

export async function getPrintAgents(restaurantId: string) {
  const { data, error } = await supabase
    .from('print_agents')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data as PrintAgent[];
}

export async function createPrintAgent(restaurantId: string, name: string) {
  const { data, error } = await supabase
    .from('print_agents')
    .insert({
      restaurant_id: restaurantId,
      name: name
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as PrintAgent;
}

export async function deletePrintAgent(agentId: string) {
  const { error } = await supabase
    .from('print_agents')
    .delete()
    .eq('id', agentId);

  if (error) throw error;
  return true;
}

export async function getPendingPrintJobs(restaurantId: string, agentId: string, secretKey: string, afterTimestamp?: string) {
  const { data, error } = await supabase.rpc('get_pending_print_jobs', {
    p_restaurant_id: restaurantId,
    p_agent_id: agentId,
    p_secret_key: secretKey,
    p_after_timestamp: afterTimestamp
  });

  if (error) throw error;
  return data as PrintJob[];
}

