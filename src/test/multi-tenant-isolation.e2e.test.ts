/**
 * Bloco D — E2E real de isolamento multi-tenant.
 *
 * Cria 2 tenants/restaurantes via service_role, cria membros distintos
 * via service_role, faz sign-in real como cada um, e prova que
 * usuário do restaurante A NÃO vê / NÃO altera nada do restaurante B.
 *
 * Cobertura:
 *   - produtos
 *   - pedidos
 *   - print_jobs
 *   - inventory_logs (estoque)
 *   - audit_log (Contador / dados sensíveis)
 *   - configuração do restaurante (accounting_reports_enabled, inventory_enabled)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { queryWithRetry, rpcWithRetry } from './helpers/retry';

const url = process.env.VITE_SUPABASE_URL!;
const anonKey =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const hasAdmin = Boolean(url && anonKey && serviceKey);
const d = hasAdmin ? describe : describe.skip;

const admin = hasAdmin ? createClient(url, serviceKey) : (null as any);

interface Ctx {
  tenantId: string;
  restaurantId: string;
  productId: string;
  orderId: string;
  printJobId: string;
  email: string;
  password: string;
  userId: string;
  client: SupabaseClient;
}

async function makeFixture(label: string): Promise<Ctx> {
  const stamp = Date.now() + Math.floor(Math.random() * 1000);
  const slug = `mt-${label}-${stamp}`;

  const { data: tenant, error: tErr } = await admin.from('tenants').insert({ name: `T-${label}-${stamp}`, slug }).select('id').single();
  if (tErr) throw tErr;

  const { data: restaurant, error: rErr } = await admin.from('restaurants').insert({
    tenant_id: tenant.id, name: `R-${label}-${stamp}`, slug,
  }).select('id').single();
  if (rErr) throw rErr;

  const { data: product, error: pErr } = await admin.from('products').insert({
    tenant_id: tenant.id, restaurant_id: restaurant.id, name: `P-${label}`, price_cents: 1000,
  }).select('id').single();
  if (pErr) throw pErr;

  const { data: order, error: oErr } = await admin.from('orders').insert({
    tenant_id: tenant.id, restaurant_id: restaurant.id,
    customer_name: `C-${label}`, customer_phone: '11999999999',
    order_type: 'pickup', payment_method: 'money',
    idempotency_key: `mt-${label}-${stamp}`,
    status: 'new', subtotal_cents: 1000, total_cents: 1000,
  }).select('id').single();
  if (oErr) throw oErr;

  const { data: pj, error: jErr } = await admin.from('print_jobs').insert({
    tenant_id: tenant.id, restaurant_id: restaurant.id, order_id: order.id,
    status: 'pending', source: 'manual', payload: { test: label },
    payload_hash: `hash-${label}-${stamp}`,
  }).select('id').single();
  if (jErr) throw jErr;

  // Create real auth user
  const email = `mt-${label}-${stamp}@e2e.local`;
  const password = `Pwd!${stamp}xyz`;
  const { data: u, error: uErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (uErr) throw uErr;

  await admin.from('restaurant_members').insert({
    tenant_id: tenant.id, restaurant_id: restaurant.id, user_id: u.user!.id, role: 'owner',
  });

  // Sign in as that user with anon client
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: sErr } = await client.auth.signInWithPassword({ email, password });
  if (sErr) throw sErr;

  return {
    tenantId: tenant.id, restaurantId: restaurant.id,
    productId: product.id, orderId: order.id, printJobId: pj.id,
    email, password, userId: u.user!.id, client,
  };
}

async function cleanup(ctx: Ctx) {
  if (!ctx) return;
  await admin.from('print_jobs').delete().eq('restaurant_id', ctx.restaurantId);
  await admin.from('order_items').delete().eq('order_id', ctx.orderId);
  await admin.from('orders').delete().eq('restaurant_id', ctx.restaurantId);
  await admin.from('inventory_logs').delete().eq('restaurant_id', ctx.restaurantId);
  await admin.from('products').delete().eq('restaurant_id', ctx.restaurantId);
  await admin.from('restaurant_members').delete().eq('restaurant_id', ctx.restaurantId);
  await admin.from('restaurants').delete().eq('id', ctx.restaurantId);
  await admin.from('tenants').delete().eq('id', ctx.tenantId);
  if (ctx.userId) await admin.auth.admin.deleteUser(ctx.userId);
}

d('Multi-tenant isolation — REAL E2E', () => {
  let A: Ctx, B: Ctx;

  beforeAll(async () => {
    A = await makeFixture('a');
    B = await makeFixture('b');
  }, 90_000);

  afterAll(async () => {
    await cleanup(A).catch(() => {});
    await cleanup(B).catch(() => {});
  });

  // ---------- READS ----------
  it('A não vê produtos de B', async () => {
    const { data, error } = await queryWithRetry(() =>
      A.client.from('products').select('id').eq('restaurant_id', B.restaurantId)
    );
    expect(error).toBeNull();
    expect(data || []).toHaveLength(0);
  });

  it('A não vê pedidos de B', async () => {
    const { data, error } = await queryWithRetry(() =>
      A.client.from('orders').select('id').eq('restaurant_id', B.restaurantId)
    );
    expect(error).toBeNull();
    expect(data || []).toHaveLength(0);
  });

  it('A não vê print_jobs de B', async () => {
    const { data, error } = await queryWithRetry(() =>
      A.client.from('print_jobs').select('id').eq('restaurant_id', B.restaurantId)
    );
    expect(error).toBeNull();
    expect(data || []).toHaveLength(0);
  });

  it('A não vê inventory_logs de B', async () => {
    const { data, error } = await queryWithRetry(() =>
      A.client.from('inventory_logs').select('id').eq('restaurant_id', B.restaurantId)
    );
    expect(error).toBeNull();
    expect(data || []).toHaveLength(0);
  });

  it('A não vê audit_log de B (relevante para Contador)', async () => {
    const { data, error } = await queryWithRetry(() =>
      A.client.from('audit_log').select('id').eq('restaurant_id', B.restaurantId)
    );
    expect(error).toBeNull();
    expect(data || []).toHaveLength(0);
  });

  it('A não vê o restaurante B', async () => {
    const { data, error } = await queryWithRetry(() =>
      A.client.from('restaurants').select('id').eq('id', B.restaurantId)
    );
    expect(error).toBeNull();
    expect(data || []).toHaveLength(0);
  });

  // ---------- WRITES ----------
  it('A não edita produto de B', async () => {
    const { data, error } = await queryWithRetry(() =>
      A.client.from('products').update({ price_cents: 1 }).eq('id', B.productId).select('id')
    );
    expect(error || (data && data.length === 0)).toBeTruthy();
    if (data) expect(data.length).toBe(0);

    // confirm via admin that price was NOT changed
    const { data: still } = await admin.from('products').select('price_cents').eq('id', B.productId).single();
    expect(still.price_cents).toBe(1000);
  });

  it('A não cria produto no restaurante B (RLS de INSERT)', async () => {
    const { error } = await queryWithRetry(() =>
      A.client.from('products').insert({
        tenant_id: B.tenantId, restaurant_id: B.restaurantId,
        name: 'pwn', price_cents: 1,
      })
    );
    expect(error).toBeTruthy();
  });

  it('A não altera flag accounting_reports_enabled de B', async () => {
    const { data } = await queryWithRetry(() =>
      A.client.from('restaurants').update({ accounting_reports_enabled: true }).eq('id', B.restaurantId).select('id')
    );
    expect((data || []).length).toBe(0);
    const { data: still } = await admin.from('restaurants').select('accounting_reports_enabled').eq('id', B.restaurantId).single();
    expect(still.accounting_reports_enabled).toBe(false);
  });

  it('A não altera estoque de B (não consegue inserir inventory_logs em B)', async () => {
    const { error } = await queryWithRetry(() =>
      A.client.from('inventory_logs').insert({
        tenant_id: B.tenantId, restaurant_id: B.restaurantId,
        item_type: 'product', item_id: B.productId,
        old_quantity: 0, new_quantity: 999, change_amount: 999,
        reason: 'cross-tenant attack',
      })
    );
    expect(error).toBeTruthy();
  });

  it('A não muda status de pedido de B via RPC', async () => {
    const { error } = await rpcWithRetry(A.client, 'update_order_status', {
      _order_id: B.orderId, _new_status: 'cancelled', _reason: 'attack',
    });
    expect(error).toBeTruthy();
  });
});
