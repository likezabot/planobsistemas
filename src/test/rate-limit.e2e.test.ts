/**
 * Bloco D — Rate limit do checkout público (REAL E2E).
 *
 * Confirma que:
 *   - Cliente legítimo com mesma idempotency_key NÃO conta como nova
 *     tentativa (clique duplo continua passando).
 *   - 8 tentativas distintas (mesma loja + mesmo telefone normalizado)
 *     em 5 min são permitidas; a 9ª é bloqueada com mensagem clara.
 *   - O bloqueio é registrado em audit_log como `public_order.rate_limited`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { rpcWithRetry, queryWithRetry } from './helpers/retry';

const url = process.env.VITE_SUPABASE_URL!;
const anonKey =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const hasAdmin = Boolean(url && anonKey && serviceKey);
const d = hasAdmin ? describe : describe.skip;

const admin = hasAdmin ? createClient(url, serviceKey) : (null as any);
const anon = hasAdmin ? createClient(url, anonKey) : (null as any);

let tenantId: string;
let restaurantId: string;
let restaurantSlug: string;
let productId: string;
const phone = '11944' + Math.floor(Math.random() * 100000).toString().padStart(5, '0');

d('Rate limit em create_public_order — REAL E2E', () => {
  beforeAll(async () => {
    const stamp = Date.now();
    restaurantSlug = `rate-${stamp}`;
    const { data: t } = await admin.from('tenants').insert({ name: `RT-${stamp}`, slug: restaurantSlug }).select('id').single();
    tenantId = t.id;
    const { data: r } = await admin.from('restaurants').insert({
      tenant_id: tenantId, name: 'Rate R', slug: restaurantSlug, public_menu_enabled: true,
    }).select('id').single();
    restaurantId = r.id;
    const { data: p } = await admin.from('products').insert({
      tenant_id: tenantId, restaurant_id: restaurantId, name: 'item', price_cents: 1000, active: true,
    }).select('id').single();
    productId = p.id;
  }, 60_000);

  afterAll(async () => {
    await admin.from('public_order_attempts').delete().eq('restaurant_id', restaurantId);
    await admin.from('audit_log').delete().eq('restaurant_id', restaurantId);
    await admin.from('print_jobs').delete().eq('restaurant_id', restaurantId);
    await admin.from('order_items').delete().in('order_id',
      (await admin.from('orders').select('id').eq('restaurant_id', restaurantId)).data?.map((o: any) => o.id) || []
    );
    await admin.from('orders').delete().eq('restaurant_id', restaurantId);
    await admin.from('products').delete().eq('restaurant_id', restaurantId);
    await admin.from('restaurants').delete().eq('id', restaurantId);
    await admin.from('tenants').delete().eq('id', tenantId);
  });

  async function attempt(idem: string) {
    return rpcWithRetry(anon, 'create_public_order', {
      _restaurant_slug: restaurantSlug,
      _customer_name: 'Rate Tester',
      _customer_phone: phone,
      _order_type: 'pickup',
      _payment_method: 'money',
      _idempotency_key: idem,
      _items: [{ product_id: productId, quantity: 1 }],
    });
  }

  it('clique duplo (mesma idempotency_key) NÃO consome tentativa', async () => {
    const idem = `rt-dup-${Date.now()}`;
    const r1 = await attempt(idem);
    expect(r1.error).toBeNull();
    expect(r1.data.idempotent).toBe(false);
    const r2 = await attempt(idem);
    expect(r2.error).toBeNull();
    expect(r2.data.idempotent).toBe(true);
    expect(r2.data.order_id).toBe(r1.data.order_id);
  });

  it('9ª tentativa distinta em 5 min é bloqueada com mensagem clara', async () => {
    // Já temos 1 attempt do teste anterior (mesmo telefone/loja).
    // Faremos mais 7 sucessos (totalizando 8) e 1 que deve falhar (9ª).
    for (let i = 0; i < 7; i++) {
      const r = await attempt(`rt-burst-${Date.now()}-${i}`);
      expect(r.error).toBeNull();
    }
    const blocked = await attempt(`rt-burst-${Date.now()}-9`);
    expect(blocked.error).toBeTruthy();
    expect(JSON.stringify(blocked.error)).toMatch(/Muitas tentativas/i);
  }, 60_000);

  it('audit_log recebeu evento public_order.rate_limited', async () => {
    const { data } = await admin
      .from('audit_log')
      .select('action, payload')
      .eq('restaurant_id', restaurantId)
      .eq('action', 'public_order.rate_limited');
    expect((data || []).length).toBeGreaterThan(0);
    expect(data![0].payload).toHaveProperty('phone_tail');
    // Privacy: apenas os 4 últimos dígitos
    expect(data![0].payload.phone_tail).toBe(phone.slice(-4));
  });
});
