import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { rpcWithRetry, queryWithRetry } from './helpers/retry';

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;

const anonClient = createClient(supabaseUrl, supabaseKey);

describe('Orders & PDV Security E2E', () => {
  it('anonymous users cannot read orders directly', async () => {
    const { data, error } = await queryWithRetry(() => anonClient.from('orders').select('*'));
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it('anonymous users cannot read order_items directly', async () => {
    const { data, error } = await queryWithRetry(() => anonClient.from('order_items').select('*'));
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it('anonymous users cannot update order status', async () => {
    const { error } = await rpcWithRetry(anonClient, 'update_order_status', {
      _order_id: '00000000-0000-0000-0000-000000000000',
      _new_status: 'preparing',
    });
    expect(error).not.toBeNull();
  });

  it('anonymous users cannot read audit logs', async () => {
    const { data } = await queryWithRetry(() => anonClient.from('audit_log').select('*'));
    expect(data || []).toHaveLength(0);
  });
});

describe('Order Status Transitions (Logic via RPC)', () => {
  it.todo('waiter from Restaurant A cannot see orders from Restaurant B');
  it.todo('kitchen can change status from accepted to preparing');
  it.todo('cannot cancel order without a reason');
  it.todo('cannot move cancelled order back to active');
  it.todo('cannot move completed order back to preparing');
  it.todo('status change generates audit log entry');
});
