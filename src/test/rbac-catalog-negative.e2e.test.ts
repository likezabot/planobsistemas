/**
 * Bloco D — RBAC negativo no catálogo (REAL E2E).
 *
 * Cria 1 restaurante via service_role e 3 usuários com papéis distintos:
 * waiter, cashier, kitchen. Para cada um, prova que NÃO consegue:
 *   - criar produto
 *   - editar produto (nome, preço)
 *   - alterar preço
 *   - ativar/desativar produto
 *
 * Para kitchen prova adicionalmente que pode LER (membro do restaurante)
 * mas que NÃO escreve no catálogo.
 *
 * Importante: esses testes batem em RLS real. Não dependem de UI.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { queryWithRetry } from './helpers/retry';

const url = process.env.VITE_SUPABASE_URL!;
const anonKey =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const hasAdmin = Boolean(url && anonKey && serviceKey);
const d = hasAdmin ? describe : describe.skip;

const admin = hasAdmin ? createClient(url, serviceKey) : (null as any);

type Role = 'waiter' | 'cashier' | 'kitchen';

interface UserCtx {
  role: Role;
  email: string;
  userId: string;
  client: SupabaseClient;
}

let tenantId: string;
let restaurantId: string;
let productId: string;
const users: Record<Role, UserCtx> = {} as any;
const created: { userIds: string[] } = { userIds: [] };

async function signInAs(role: Role): Promise<UserCtx> {
  const stamp = Date.now() + Math.floor(Math.random() * 1000);
  const email = `rbac-${role}-${stamp}@e2e.local`;
  const password = `Pwd!${stamp}xyz`;
  const { data: u, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (error) throw error;
  created.userIds.push(u.user!.id);

  await admin.from('restaurant_members').insert({
    tenant_id: tenantId, restaurant_id: restaurantId, user_id: u.user!.id, role,
  });

  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: sErr } = await client.auth.signInWithPassword({ email, password });
  if (sErr) throw sErr;

  return { role, email, userId: u.user!.id, client };
}

d('RBAC negativo no catálogo — REAL E2E', () => {
  beforeAll(async () => {
    const stamp = Date.now();
    const slug = `rbac-${stamp}`;
    const { data: t } = await admin.from('tenants').insert({ name: `RBAC-${stamp}`, slug }).select('id').single();
    tenantId = t.id;
    const { data: r } = await admin.from('restaurants').insert({
      tenant_id: tenantId, name: 'RBAC R', slug,
    }).select('id').single();
    restaurantId = r.id;
    const { data: p } = await admin.from('products').insert({
      tenant_id: tenantId, restaurant_id: restaurantId, name: 'baseline', price_cents: 5000, active: true,
    }).select('id').single();
    productId = p.id;

    users.waiter = await signInAs('waiter');
    users.cashier = await signInAs('cashier');
    users.kitchen = await signInAs('kitchen');
  }, 90_000);

  afterAll(async () => {
    await admin.from('products').delete().eq('restaurant_id', restaurantId);
    await admin.from('restaurant_members').delete().eq('restaurant_id', restaurantId);
    await admin.from('restaurants').delete().eq('id', restaurantId);
    await admin.from('tenants').delete().eq('id', tenantId);
    for (const id of created.userIds) {
      await admin.auth.admin.deleteUser(id).catch(() => {});
    }
  });

  for (const role of ['waiter', 'cashier', 'kitchen'] as Role[]) {
    describe(`role: ${role}`, () => {
      it(`${role} NÃO cria produto`, async () => {
        const { error } = await queryWithRetry(() =>
          users[role].client.from('products').insert({
            tenant_id: tenantId, restaurant_id: restaurantId,
            name: `pwn-${role}`, price_cents: 1,
          })
        );
        expect(error).toBeTruthy();
      });

      it(`${role} NÃO altera preço`, async () => {
        const { data } = await queryWithRetry(() =>
          users[role].client.from('products').update({ price_cents: 1 }).eq('id', productId).select('id')
        );
        expect((data || []).length).toBe(0);
        const { data: still } = await admin.from('products').select('price_cents').eq('id', productId).single();
        expect(still.price_cents).toBe(5000);
      });

      it(`${role} NÃO ativa/desativa produto`, async () => {
        const { data } = await queryWithRetry(() =>
          users[role].client.from('products').update({ active: false }).eq('id', productId).select('id')
        );
        expect((data || []).length).toBe(0);
        const { data: still } = await admin.from('products').select('active').eq('id', productId).single();
        expect(still.active).toBe(true);
      });

      it(`${role} NÃO renomeia produto`, async () => {
        const { data } = await queryWithRetry(() =>
          users[role].client.from('products').update({ name: 'hacked' }).eq('id', productId).select('id')
        );
        expect((data || []).length).toBe(0);
        const { data: still } = await admin.from('products').select('name').eq('id', productId).single();
        expect(still.name).toBe('baseline');
      });
    });
  }

  it('kitchen pode LER catálogo (é membro), mas vimos acima que NÃO escreve', async () => {
    const { data, error } = await queryWithRetry(() =>
      users.kitchen.client.from('products').select('id').eq('id', productId)
    );
    expect(error).toBeNull();
    expect((data || []).length).toBe(1);
  });
});
