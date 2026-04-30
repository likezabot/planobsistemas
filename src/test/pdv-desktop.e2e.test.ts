import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { queryWithRetry, rpcWithRetry } from './helpers/retry';
import { adminCreateUserRetry, signInRetry } from './helpers/auth-retry';

const url = process.env.VITE_SUPABASE_URL!;
const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const hasAdmin = Boolean(url && anonKey && serviceKey);
const d = hasAdmin ? describe : describe.skip;

const admin = hasAdmin ? createClient(url, serviceKey) : (null as any);

d('PDV Desktop Block F3 - E2E', () => {
  let tenantId: string;
  let restaurantId: string;
  let cashierClient: SupabaseClient;
  let managerClient: SupabaseClient;
  let cashierId: string;
  let managerId: string;
  let productId: string;
  let tableId: string;

  beforeAll(async () => {
    const stamp = Date.now() + Math.floor(Math.random() * 1000);
    const slug = `pdv-f3-${stamp}`;

    const { data: tenant } = await admin.from('tenants').insert({ name: `T-${slug}`, slug }).select('id').single();
    tenantId = tenant.id;

    const { data: restaurant } = await admin.from('restaurants').insert({
      tenant_id: tenantId, name: `R-${slug}`, slug
    }).select('id').single();
    restaurantId = restaurant.id;

    const { data: product } = await admin.from('products').insert({
      tenant_id: tenantId, restaurant_id: restaurantId, name: 'Pizza Test', price_cents: 5000, type: 'simple'
    }).select('id').single();
    productId = product.id;

    const { data: table } = await admin.from('dining_tables').insert({
      tenant_id: tenantId, restaurant_id: restaurantId, name: 'Mesa PDV 1', active: true
    }).select('id').single();
    tableId = table.id;

    // Cashier
    const cashierEmail = `cashier-${stamp}@test.local`;
    const cashierUser: any = await adminCreateUserRetry(admin, cashierEmail, 'Pwd123!');
    cashierId = cashierUser.user.id;
    await admin.from('restaurant_members').insert({
      tenant_id: tenantId, restaurant_id: restaurantId, user_id: cashierId, role: 'cashier'
    });
    cashierClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    await signInRetry(cashierClient, cashierEmail, 'Pwd123!');

    // Manager
    const managerEmail = `manager-${stamp}@test.local`;
    const managerUser: any = await adminCreateUserRetry(admin, managerEmail, 'Pwd123!');
    managerId = managerUser.user.id;
    await admin.from('restaurant_members').insert({
      tenant_id: tenantId, restaurant_id: restaurantId, user_id: managerId, role: 'manager'
    });
    managerClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    await signInRetry(managerClient, managerEmail, 'Pwd123!');
  }, 90000);

  afterAll(async () => {
    if (!admin) return;
    await admin.from('order_items').delete().filter('product_id', 'eq', productId);
    await admin.from('orders').delete().eq('restaurant_id', restaurantId);
    await admin.from('dining_tables').delete().eq('restaurant_id', restaurantId);
    await admin.from('restaurant_members').delete().eq('restaurant_id', restaurantId);
    await admin.from('products').delete().eq('restaurant_id', restaurantId);
    await admin.from('restaurants').delete().eq('id', restaurantId);
    await admin.from('tenants').delete().eq('id', tenantId);
    if (cashierId) await admin.auth.admin.deleteUser(cashierId);
    if (managerId) await admin.auth.admin.deleteUser(managerId);
  });

  it('cashier can get active orders summary', async () => {
    const { data, error } = await rpcWithRetry(cashierClient, 'get_active_orders_summary', {
      _restaurant_id: restaurantId
    });
    expect(error).toBeNull();
    expect(data.tables).toBeDefined();
    expect(data.counter_orders).toBeDefined();
  });

  it('anonymous users cannot get active orders summary', async () => {
    const anonClient = createClient(url, anonKey);
    const { error } = await anonClient.rpc('get_active_orders_summary', {
      _restaurant_id: restaurantId
    });
    expect(error).not.toBeNull();
  });

  it('cashier can request account print', async () => {
    const { data: orderId } = await rpcWithRetry(cashierClient, 'open_table_order', {
      _restaurant_id: restaurantId, _table_id: tableId
    });
    const { data: printJobId, error } = await rpcWithRetry(cashierClient, 'request_account_print', {
      _order_id: orderId
    });
    expect(error).toBeNull();
    expect(printJobId).toBeDefined();

    const { data: job } = await admin.from('print_jobs').select('*').eq('id', printJobId).single();
    expect(job.type).toBe('account');
  });

  it('cashier CANNOT cancel sent items', async () => {
    const { data: orderId } = await rpcWithRetry(cashierClient, 'open_table_order', {
      _restaurant_id: restaurantId, _table_id: tableId
    });
    await rpcWithRetry(cashierClient, 'add_items_to_order', {
      _order_id: orderId, _items: [{ product_id: productId, quantity: 1 }]
    });
    await rpcWithRetry(cashierClient, 'send_order_to_kitchen', { _order_id: orderId });

    const { data: item } = await admin.from('order_items').select('id').eq('order_id', orderId).eq('status', 'sent').limit(1).single();

    const { error } = await rpcWithRetry(cashierClient, 'cancel_order_item', {
      _order_item_id: item.id, _reason: 'Cancelled by cashier test'
    });
    expect(error).not.toBeNull();
    expect(error.message).toMatch(/Caixa não pode cancelar/i);
  });

  it('manager CAN cancel sent items with reason', async () => {
    const { data: orderId } = await rpcWithRetry(managerClient, 'open_table_order', {
      _restaurant_id: restaurantId, _table_id: tableId
    });
    // Ensure there is a sent item
    const { data: item } = await admin.from('order_items').select('id').eq('order_id', orderId).eq('status', 'sent').limit(1).single();

    const { error } = await rpcWithRetry(managerClient, 'cancel_order_item', {
      _order_item_id: item.id, _reason: 'Cancelled by manager test'
    });
    expect(error).toBeNull();

    const { data: cancelledItem } = await admin.from('order_items').select('status, cancel_reason').eq('id', item.id).single();
    expect(cancelledItem.status).toBe('cancelled');
    expect(cancelledItem.cancel_reason).toBe('Cancelled by manager test');
  });

  it('closing order does not allow double payment', async () => {
    const { data: orderId } = await rpcWithRetry(cashierClient, 'create_counter_order', {
      _restaurant_id: restaurantId
    });
    await rpcWithRetry(cashierClient, 'add_items_to_order', {
      _order_id: orderId, _items: [{ product_id: productId, quantity: 1 }]
    });

    const { error: err1 } = await rpcWithRetry(cashierClient, 'close_order', {
      _order_id: orderId, _payment_method: 'money'
    });
    expect(err1).toBeNull();

    const { error: err2 } = await rpcWithRetry(cashierClient, 'close_order', {
      _order_id: orderId, _payment_method: 'card'
    });
    expect(err2).not.toBeNull();
    expect(err2.message).toMatch(/já fechado/i);
  });
});