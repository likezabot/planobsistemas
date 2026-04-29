import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { rpcWithRetry, queryWithRetry } from './helpers/retry';

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
// Accept both naming conventions: VITE_SUPABASE_PUBLISHABLE_KEY (current) or
// VITE_SUPABASE_ANON_KEY (legacy). Tests need *some* anon key to talk to PostgREST.
const supabaseAnonKey =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  '';

if (!supabaseUrl || !supabaseAnonKey) {
  // Fail fast with a clear message instead of silently producing empty error objects.
  throw new Error(
    'Checkout E2E: missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY in env.'
  );
}

// Use anon client for public checkout tests
const anonClient = createClient(supabaseUrl, supabaseAnonKey);

describe('Checkout Security E2E', () => {
  const restaurantSlug = 'e2e-public-on'; // Created in previous migration

  it('should block anonymous direct insert into orders', async () => {
    const { error } = await queryWithRetry(() =>
      anonClient
        .from('orders')
        .insert({
          customer_name: 'Test',
          customer_phone: '12345678',
          order_type: 'pickup',
          idempotency_key: 'test-direct-insert',
          restaurant_id: '00000000-0000-0000-0000-000000000000',
          tenant_id: '00000000-0000-0000-0000-000000000000',
        })
    );

    expect(error).not.toBeNull();
  });

  it('should block anonymous direct insert into order_items', async () => {
    const { error } = await queryWithRetry(() =>
      anonClient.from('order_items').insert({
        order_id: '00000000-0000-0000-0000-000000000000',
        product_id: '00000000-0000-0000-0000-000000000000',
        quantity: 1,
        unit_price_cents: 1000,
        total_price_cents: 1000,
      })
    );

    expect(error).not.toBeNull();
  });

  it('should create order successfully via RPC with valid data', async () => {
    const idempotencyKey = `e2e-success-${Date.now()}`;

    const { data: products } = await rpcWithRetry(anonClient, 'get_public_products', { _slug: restaurantSlug });
    expect(products?.length).toBeGreaterThan(0);
    const product = products![0];

    const { data, error } = await rpcWithRetry(anonClient, 'create_public_order', {
      _restaurant_slug: restaurantSlug,
      _customer_name: 'E2E Customer',
      _customer_phone: '(11) 98888-7777',
      _order_type: 'pickup',
      _payment_method: 'money',
      _idempotency_key: idempotencyKey,
      _items: [{ product_id: product.id, quantity: 2, note: 'No onions' }],
    });

    if (error) console.error('RPC Error:', error);
    expect(error).toBeNull();
    expect(data.order_id).toBeDefined();
    expect(data.idempotent).toBe(false);
  });

  it('should handle idempotency (double click protection)', async () => {
    const idempotencyKey = `e2e-idem-${Date.now()}`;
    const { data: products } = await rpcWithRetry(anonClient, 'get_public_products', { _slug: restaurantSlug });
    const product = products![0];

    const params = {
      _restaurant_slug: restaurantSlug,
      _customer_name: 'Idempotent User',
      _customer_phone: '11999998888',
      _order_type: 'pickup',
      _payment_method: 'money',
      _idempotency_key: idempotencyKey,
      _items: [{ product_id: product.id, quantity: 1 }],
    };

    const res1 = await rpcWithRetry(anonClient, 'create_public_order', params);
    expect(res1.error).toBeNull();
    const orderId = res1.data.order_id;

    const res2 = await rpcWithRetry(anonClient, 'create_public_order', params);
    expect(res2.error).toBeNull();
    expect(res2.data.order_id).toBe(orderId);
    expect(res2.data.idempotent).toBe(true);
  });

  it('should fail if delivery address is missing', async () => {
    const { data: products } = await rpcWithRetry(anonClient, 'get_public_products', { _slug: restaurantSlug });
    expect(products?.length).toBeGreaterThan(0);
    const product = products![0];

    const result = await rpcWithRetry(anonClient, 'create_public_order', {
      _restaurant_slug: restaurantSlug,
      _customer_name: 'Delivery Fail',
      _customer_phone: '11999998888',
      _order_type: 'delivery',
      _payment_method: 'money',
      _idempotency_key: `e2e-fail-addr-${Date.now()}-${Math.random()}`,
      _items: [{ product_id: product.id, quantity: 1 }],
      _address: null,
    });

    // Debug aid for flaky parallel runs
    if (!result.error) {
      // eslint-disable-next-line no-console
      console.error('UNEXPECTED SUCCESS for delivery without address:', JSON.stringify(result));
    }

    expect(result.error).not.toBeNull();
    const blob = JSON.stringify(result.error ?? {});
    expect(blob).toMatch(/Endereço obrigatório|address|delivery/i);
  });

  it('should fail if restaurant public_menu_enabled is false', async () => {
    const { error } = await rpcWithRetry(anonClient, 'create_public_order', {
      _restaurant_slug: 'e2e-public-off',
      _customer_name: 'Off Restaurant',
      _customer_phone: '11999998888',
      _order_type: 'pickup',
      _payment_method: 'money',
      _idempotency_key: `e2e-fail-off-${Date.now()}`,
      _items: [{ product_id: '00000000-0000-0000-0000-000000000000', quantity: 1 }],
    });

    expect(error?.message).toContain('Restaurante não encontrado ou cardápio desativado');
  });

  it('should normalize phone number (strip formatting)', async () => {
    const idempotencyKey = `e2e-phone-${Date.now()}`;
    const { data: products } = await rpcWithRetry(anonClient, 'get_public_products', { _slug: restaurantSlug });
    const product = products![0];

    await rpcWithRetry(anonClient, 'create_public_order', {
      _restaurant_slug: restaurantSlug,
      _customer_name: 'Phone Test',
      _customer_phone: '+55 (11) 9-8888.7777',
      _order_type: 'pickup',
      _payment_method: 'money',
      _idempotency_key: idempotencyKey,
      _items: [{ product_id: product.id, quantity: 1 }],
    });
  });
});
