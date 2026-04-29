import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { rpcWithRetry, queryWithRetry } from "./helpers/retry";

/**
 * Testes E2E REAIS de segurança do Cardápio Público.
 *
 * Esses testes batem no Supabase de verdade usando o cliente ANÔNIMO
 * (apenas anon key — sem login). Eles validam, contra o banco real,
 * exatamente as garantias críticas para o piloto comercial:
 *
 *   1. Anônimo NÃO consegue SELECT direto em tabelas internas.
 *   2. Anônimo NÃO consegue mutar produtos.
 *   3. RPCs públicas filtram active=true e public_menu_enabled=true.
 *   4. RPCs públicas NUNCA devolvem cost_cents nem tenant_id.
 *
 * Os fixtures (`e2e-public-on`, `e2e-public-off`) são criados via
 * migração e são read-only para esses testes.
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

const hasEnv = Boolean(SUPABASE_URL && SUPABASE_ANON);

const anon = hasEnv
  ? createClient(SUPABASE_URL!, SUPABASE_ANON!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

const d = hasEnv ? describe : describe.skip;

d("Cardápio Público — E2E (cliente anônimo, banco real)", () => {
  beforeAll(() => {
    expect(anon).not.toBeNull();
  });

  // -------- 1. Acesso direto a tabelas internas é bloqueado --------

  it("anônimo NÃO consegue SELECT direto em public.products", async () => {
    const { data, error } = await anon!.from("products").select("id").limit(1);
    // Esperado: ou erro de permissão, ou data vazio (RLS bloqueia silenciosamente).
    // O que NÃO pode acontecer: vir produto.
    expect(error || (data && data.length === 0)).toBeTruthy();
    if (data) expect(data.length).toBe(0);
  });

  it("anônimo NÃO consegue SELECT em public.audit_log", async () => {
    const { data, error } = await anon!.from("audit_log").select("id").limit(1);
    expect(error || (data && data.length === 0)).toBeTruthy();
    if (data) expect(data.length).toBe(0);
  });

  it("anônimo NÃO consegue SELECT em public.restaurant_members", async () => {
    const { data, error } = await anon!.from("restaurant_members").select("id").limit(1);
    expect(error || (data && data.length === 0)).toBeTruthy();
    if (data) expect(data.length).toBe(0);
  });

  it("anônimo NÃO consegue SELECT em public.product_categories", async () => {
    const { data, error } = await anon!.from("product_categories").select("id").limit(1);
    expect(error || (data && data.length === 0)).toBeTruthy();
    if (data) expect(data.length).toBe(0);
  });

  // -------- 2. Mutações bloqueadas --------

  it("anônimo NÃO consegue INSERT em products", async () => {
    const { error } = await anon!.from("products").insert({
      // valores fictícios — não importam, RLS deve barrar antes
      tenant_id: "00000000-0000-0000-0000-000000000000",
      restaurant_id: "00000000-0000-0000-0000-000000000000",
      name: "hack",
      price_cents: 1,
    });
    expect(error).toBeTruthy();
  });

  it("anônimo NÃO consegue UPDATE em products", async () => {
    const { error, data } = await anon!
      .from("products")
      .update({ price_cents: 1 })
      .eq("name", "E2E Produto Ativo")
      .select();
    // ou erro, ou nenhuma linha afetada
    expect(error || (Array.isArray(data) && data.length === 0)).toBeTruthy();
  });

  it("anônimo NÃO consegue DELETE em products", async () => {
    const { error, data } = await anon!
      .from("products")
      .delete()
      .eq("name", "E2E Produto Ativo")
      .select();
    expect(error || (Array.isArray(data) && data.length === 0)).toBeTruthy();
  });

  // -------- 3. RPCs públicas filtram corretamente --------

  it("get_public_restaurant retorna o restaurante quando ENABLED", async () => {
    const { data, error } = await anon!.rpc("get_public_restaurant", { _slug: "e2e-public-on" });
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    expect(data!.length).toBe(1);
    expect(data![0].public_menu_enabled).toBe(true);
  });

  it("get_public_restaurant retorna VAZIO quando public_menu_enabled=false", async () => {
    const { data, error } = await anon!.rpc("get_public_restaurant", { _slug: "e2e-public-off" });
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    expect(data!.length).toBe(0);
  });

  it("get_public_products NÃO retorna produto active=false", async () => {
    const { data, error } = await anon!.rpc("get_public_products", { _slug: "e2e-public-on" });
    expect(error).toBeNull();
    const names = (data ?? []).map((p: { name: string }) => p.name);
    expect(names).toContain("E2E Produto Ativo");
    expect(names).not.toContain("E2E Produto Inativo");
  });

  it("get_public_products NÃO retorna produto cuja categoria está inativa", async () => {
    const { data } = await anon!.rpc("get_public_products", { _slug: "e2e-public-on" });
    const names = (data ?? []).map((p: { name: string }) => p.name);
    expect(names).not.toContain("E2E Produto em Cat Inativa");
  });

  it("get_public_categories NÃO inclui categoria com active=false", async () => {
    const { data, error } = await anon!.rpc("get_public_categories", { _slug: "e2e-public-on" });
    expect(error).toBeNull();
    const names = (data ?? []).map((c: { name: string }) => c.name);
    expect(names).toContain("E2E Categoria Ativa");
    expect(names).not.toContain("E2E Categoria Inativa");
  });

  it("get_public_products NÃO devolve cost_cents nem tenant_id", async () => {
    const { data } = await anon!.rpc("get_public_products", { _slug: "e2e-public-on" });
    expect(Array.isArray(data)).toBe(true);
    for (const row of data!) {
      const r = row as Record<string, unknown>;
      expect("cost_cents" in r).toBe(false);
      expect("tenant_id" in r).toBe(false);
      expect("restaurant_id" in r).toBe(false);
    }
  });

  it("get_public_products NÃO vaza produtos do restaurante OFF", async () => {
    const { data } = await anon!.rpc("get_public_products", { _slug: "e2e-public-off" });
    // restaurante desabilitado → RPC já filtra public_menu_enabled=true
    expect((data ?? []).length).toBe(0);
  });

  it("isolamento por slug: pedir slug A não devolve produto de B", async () => {
    const { data } = await anon!.rpc("get_public_products", { _slug: "e2e-public-on" });
    const names = (data ?? []).map((p: { name: string }) => p.name);
    expect(names).not.toContain("E2E Produto OFF");
  });
});
