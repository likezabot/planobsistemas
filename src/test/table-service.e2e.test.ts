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

d('Table Service F1 - E2E', () => {
  let tenantId: string;
  let restaurantId: string;
  let waiterClient: SupabaseClient;
  let cashierClient: SupabaseClient;
  let waiterId: string;
  let cashierId: string;
  let productId: string;
  let tableId: string;

  beforeAll(async () => {
    // Create Fixture
    const stamp = Date.now() + Math.floor(Math.random() * 1000);
    const slug = `ts-f1-${stamp}`;

    const { data: tenant, error: tErr } = await admin.from('tenants').insert({ name: `T-${slug}`, slug }).select('id').single();
    if (tErr) throw tErr;
    tenantId = tenant.id;

    const { data: restaurant, error: rErr } = await admin.from('restaurants').insert({
      tenant_id: tenantId, name: `R-${slug}`, slug, pizza_module_enabled: true
    }).select('id').single();
    if (rErr) throw rErr;
    restaurantId = restaurant.id;

    const { data: product, error: pErr } = await admin.from('products').insert({
      tenant_id: tenantId, restaurant_id: restaurantId, name: 'Prod Test', price_cents: 1000, type: 'simple'
    }).select('id').single();
    if (pErr) throw pErr;
    productId = product.id;

    const { data: table, error: tbErr } = await admin.from('dining_tables').insert({
      tenant_id: tenantId, restaurant_id: restaurantId, name: 'Mesa 1', active: true
    }).select('id').single();
    if (tbErr) throw tbErr;
    tableId = table.id;

    // Create Waiter
    const waiterEmail = `waiter-${stamp}@test.local`;
    const waiterUser: any = await adminCreateUserRetry(admin, waiterEmail, 'Pwd123!');
    waiterId = waiterUser.user.id;
    await admin.from('restaurant_members').insert({
      tenant_id: tenantId, restaurant_id: restaurantId, user_id: waiterId, role: 'waiter'
    });
    waiterClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    await signInRetry(waiterClient, waiterEmail, 'Pwd123!');

    // Create Cashier
    const cashierEmail = `cashier-${stamp}@test.local`;
    const cashierUser: any = await adminCreateUserRetry(admin, cashierEmail, 'Pwd123!');
    cashierId = cashierUser.user.id;
    await admin.from('restaurant_members').insert({
      tenant_id: tenantId, restaurant_id: restaurantId, user_id: cashierId, role: 'cashier'
    });
    cashierClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    await signInRetry(cashierClient, cashierEmail, 'Pwd123!');
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
    if (waiterId) await admin.auth.admin.deleteUser(waiterId);
    if (cashierId) await admin.auth.admin.deleteUser(cashierId);
  });

  it('waiter can list active tables', async () => {
    const { data, error } = await queryWithRetry(() => 
      waiterClient.from('dining_tables').select('id').eq('restaurant_id', restaurantId)
    );
    expect(error).toBeNull();
    expect(data?.length).toBeGreaterThan(0);
  });

  it('waiter can open a table order', async () => {
    const { data: orderId, error } = await rpcWithRetry(waiterClient, 'open_table_order', {
      _restaurant_id: restaurantId, _table_id: tableId
    });
    expect(error).toBeNull();
    expect(orderId).toBeDefined();

    // Opening again returns same ID
    const { data: orderId2 } = await rpcWithRetry(waiterClient, 'open_table_order', {
      _restaurant_id: restaurantId, _table_id: tableId
    });
    expect(orderId2).toBe(orderId);
  });

  it('cashier can create counter order', async () => {
    const { data: orderId, error } = await rpcWithRetry(cashierClient, 'create_counter_order', {
      _restaurant_id: restaurantId
    });
    expect(error).toBeNull();
    expect(orderId).toBeDefined();
  });

  it('waiter can add items to order', async () => {
    const { data: orderId } = await rpcWithRetry(waiterClient, 'open_table_order', {
      _restaurant_id: restaurantId, _table_id: tableId
    });

    const { data, error } = await rpcWithRetry(waiterClient, 'add_items_to_order', {
      _order_id: orderId,
      _items: [{ product_id: productId, quantity: 1 }]
    });
    expect(error).toBeNull();
    expect(data.subtotal_cents).toBe(1000);

    const { data: order } = await admin.from('orders').select('total_cents').eq('id', orderId).single();
    expect(order.total_cents).toBe(1000);
  });

  it('waiter can send order to kitchen', async () => {
    const { data: orderId } = await rpcWithRetry(waiterClient, 'open_table_order', {
      _restaurant_id: restaurantId, _table_id: tableId
    });

    const { data: count, error } = await rpcWithRetry(waiterClient, 'send_order_to_kitchen', {
      _order_id: orderId
    });
    expect(error).toBeNull();
    expect(count).toBeGreaterThan(0);

    const { data: items } = await admin.from('order_items').select('status').eq('order_id', orderId);
    expect(items?.some(i => i.status === 'sent')).toBe(true);
  });

  it('cashier can close order', async () => {
    const { data: orderId } = await rpcWithRetry(cashierClient, 'create_counter_order', {
      _restaurant_id: restaurantId
    });
    await rpcWithRetry(cashierClient, 'add_items_to_order', {
      _order_id: orderId,
      _items: [{ product_id: productId, quantity: 1 }]
    });

    const { error } = await rpcWithRetry(cashierClient, 'close_order', {
      _order_id: orderId, _payment_method: 'money'
    });
    expect(error).toBeNull();

    const { data: order } = await admin.from('orders').select('payment_status, status').eq('id', orderId).single();
    expect(order.payment_status).toBe('paid');
    expect(order.status).toBe('completed');
  });

  it('waiter cannot close order', async () => {
    const { data: orderId } = await rpcWithRetry(waiterClient, 'open_table_order', {
      _restaurant_id: restaurantId, _table_id: tableId
    });
    const { error } = await rpcWithRetry(waiterClient, 'close_order', {
      _order_id: orderId, _payment_method: 'money'
    });
    expect(error).not.toBeNull();
    expect(error.message).toMatch(/Não autorizado/i);
  });
});
