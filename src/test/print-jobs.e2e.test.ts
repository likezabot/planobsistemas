import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
const anonClient = createClient(supabaseUrl, supabaseKey);

describe('Print Jobs Security E2E', () => {
  it('anonymous users cannot read print_jobs directly', async () => {
    const { data, error } = await anonClient.from('print_jobs').select('*');
    expect(error).toBeNull();
    expect(data || []).toHaveLength(0); // RLS filtered
  });

  it('anonymous users cannot create print jobs via RPC', async () => {
    const { error } = await anonClient.rpc('create_print_job_for_order', {
      p_order_id: '00000000-0000-0000-0000-000000000000',
      p_source: 'manual'
    });
    // Should fail due to REVOKE EXECUTE or internal membership check
    expect(error).not.toBeNull();
  });

  it('anonymous users cannot claim print jobs', async () => {
    const { error } = await anonClient.rpc('claim_print_job', {
      p_job_id: '00000000-0000-0000-0000-000000000000',
      p_agent_id: 'test-agent'
    });
    expect(error).not.toBeNull();
  });

  it('anonymous users cannot reprint orders', async () => {
    const { error } = await anonClient.rpc('reprint_order', {
      p_order_id: '00000000-0000-0000-0000-000000000000',
      p_reason: 'Testing'
    });
    expect(error).not.toBeNull();
  });
});

describe('Print Job Logic (Documented/Unit)', () => {
  it.todo('pedido não cria dois jobs automáticos iguais (handled by unique index)');
  it.todo('complete_print_job só funciona para o mesmo agent_id (handled by WHERE clause)');
  it.todo('printed não volta para pending (handled by status check in claim_print_job)');
  it.todo('failed não reimprime automaticamente (handled by status check in create_print_job_for_order)');
  it.todo('reprint_order exige motivo (handled by length check)');
  it.todo('reprint_order cria novo job com source=reprint');
  it.todo('cashier/manager/owner podem reimprimir (handled by role check)');
  it.todo('waiter/kitchen não podem reimprimir (handled by role check)');
});
