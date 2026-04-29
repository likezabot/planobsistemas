/**
 * Bloco D — Recuperação de jobs de impressão presos (REAL E2E).
 *
 * Cobre o caso "agente caiu no meio de imprimir":
 *   - job em status `printing` há mais de N minutos
 *   - admin chama reset_stuck_print_jobs(restaurant_id, minutes)
 *   - job volta para `pending` e o evento é registrado em audit_log
 *
 * Também confirma que usuário sem role de admin não consegue chamar.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { rpcWithRetry } from './helpers/retry';

const url = process.env.VITE_SUPABASE_URL!;
const anonKey =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const hasAdmin = Boolean(url && anonKey && serviceKey);
const d = hasAdmin ? describe : describe.skip;

const admin = hasAdmin ? createClient(url, serviceKey) : (null as any);

let tenantId: string;
let restaurantId: string;
let orderId: string;
let stuckJobId: string;
let freshJobId: string;
let ownerClient: SupabaseClient;
let waiterClient: SupabaseClient;
const cleanupUsers: string[] = [];

async function makeUser(role: string): Promise<SupabaseClient> {
  const stamp = Date.now() + Math.floor(Math.random() * 1000);
  const email = `pr-${role}-${stamp}@e2e.local`;
  const password = `Pwd!${stamp}xyz`;
  const { data: u, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  cleanupUsers.push(u.user!.id);
  await admin.from('restaurant_members').insert({
    tenant_id: tenantId, restaurant_id: restaurantId, user_id: u.user!.id, role,
  });
  const c = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  await c.auth.signInWithPassword({ email, password });
  return c;
}

d('Recuperação de jobs presos — REAL E2E', () => {
  beforeAll(async () => {
    const stamp = Date.now();
    const slug = `pr-${stamp}`;
    const { data: t } = await admin.from('tenants').insert({ name: `PR-${stamp}`, slug }).select('id').single();
    tenantId = t.id;
    const { data: r } = await admin.from('restaurants').insert({
      tenant_id: tenantId, name: 'PR R', slug,
    }).select('id').single();
    restaurantId = r.id;
    const { data: o } = await admin.from('orders').insert({
      tenant_id: tenantId, restaurant_id: restaurantId,
      customer_name: 'X', customer_phone: '11999999999',
      order_type: 'pickup', payment_method: 'money',
      idempotency_key: `pr-${stamp}`, status: 'new', subtotal_cents: 0, total_cents: 0,
    }).select('id').single();
    orderId = o.id;

    // STUCK job: claimed_at well in the past
    const { data: j1 } = await admin.from('print_jobs').insert({
      tenant_id: tenantId, restaurant_id: restaurantId, order_id: orderId,
      status: 'printing', source: 'manual', payload: { test: 'stuck' }, payload_hash: `h1-${stamp}`,
      agent_id: 'dead-agent', claimed_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    }).select('id').single();
    stuckJobId = j1.id;

    // FRESH job: claimed 30s ago — must NOT be reset
    const { data: j2 } = await admin.from('print_jobs').insert({
      tenant_id: tenantId, restaurant_id: restaurantId, order_id: orderId,
      status: 'printing', source: 'manual', payload: { test: 'fresh' }, payload_hash: `h2-${stamp}`,
      agent_id: 'live-agent', claimed_at: new Date(Date.now() - 30 * 1000).toISOString(),
    }).select('id').single();
    freshJobId = j2.id;

    ownerClient = await makeUser('owner');
    waiterClient = await makeUser('waiter');
  }, 90_000);

  afterAll(async () => {
    await admin.from('print_jobs').delete().eq('restaurant_id', restaurantId);
    await admin.from('orders').delete().eq('restaurant_id', restaurantId);
    await admin.from('restaurant_members').delete().eq('restaurant_id', restaurantId);
    await admin.from('restaurants').delete().eq('id', restaurantId);
    await admin.from('tenants').delete().eq('id', tenantId);
    for (const id of cleanupUsers) await admin.auth.admin.deleteUser(id).catch(() => {});
  });

  it('waiter NÃO pode chamar reset_stuck_print_jobs', async () => {
    const { error } = await rpcWithRetry(waiterClient, 'reset_stuck_print_jobs', {
      p_restaurant_id: restaurantId, p_stuck_minutes: 5,
    });
    expect(error).toBeTruthy();
    expect(JSON.stringify(error)).toMatch(/negado|denied/i);
  });

  it('owner reseta apenas jobs presos há mais de 5 min', async () => {
    const { data, error } = await rpcWithRetry(ownerClient, 'reset_stuck_print_jobs', {
      p_restaurant_id: restaurantId, p_stuck_minutes: 5,
    });
    expect(error).toBeNull();
    expect(data).toBe(1);

    const { data: stuck } = await admin.from('print_jobs').select('status, agent_id').eq('id', stuckJobId).single();
    expect(stuck.status).toBe('pending');
    expect(stuck.agent_id).toBeNull();

    const { data: fresh } = await admin.from('print_jobs').select('status').eq('id', freshJobId).single();
    expect(fresh.status).toBe('printing');
  });

  it('reset gera evento em audit_log', async () => {
    const { data } = await admin
      .from('audit_log')
      .select('action, payload')
      .eq('restaurant_id', restaurantId)
      .eq('action', 'print_jobs.reset_stuck');
    expect((data || []).length).toBeGreaterThan(0);
    expect(data![0].payload.count).toBe(1);
  });
});
