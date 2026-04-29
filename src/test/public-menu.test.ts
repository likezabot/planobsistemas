import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Testes do Cardápio Público.
 *
 * Esses testes focam na CAMADA DE APLICAÇÃO (publicQueries) — garantem
 * que ela:
 *  - exige slug,
 *  - nunca expõe `cost_cents` mesmo se o backend devolvesse,
 *  - trata corretamente restaurante desabilitado / inexistente,
 *  - usa apenas RPCs públicas (nunca `from()` direto em tabelas internas).
 *
 * As garantias de RLS no banco (anônimo NÃO consegue ler products /
 * audit_log / restaurant_members, NÃO consegue mutar nada) ficam
 * registradas como `it.todo` para serem promovidas a E2E reais antes
 * do piloto comercial — conforme combinado.
 */

const rpcMock = vi.fn();
const fromMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

import {
  getPublicRestaurant,
  getPublicCategories,
  getPublicProducts,
} from "@/lib/menu/publicQueries";

beforeEach(() => {
  rpcMock.mockReset();
  fromMock.mockReset();
});

describe("Cardápio Público — camada de aplicação", () => {
  it("exige slug não vazio", async () => {
    await expect(getPublicRestaurant("")).rejects.toThrow(/slug/i);
    await expect(getPublicCategories("   ")).rejects.toThrow(/slug/i);
    await expect(getPublicProducts(undefined as unknown as string)).rejects.toThrow(/slug/i);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("usa RPC pública, nunca acesso direto a tabelas", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    await getPublicRestaurant("burger-x");
    await getPublicCategories("burger-x");
    await getPublicProducts("burger-x");

    expect(fromMock).not.toHaveBeenCalled();
    expect(rpcMock).toHaveBeenCalledWith("get_public_restaurant", { _slug: "burger-x" });
    expect(rpcMock).toHaveBeenCalledWith("get_public_categories", { _slug: "burger-x" });
    expect(rpcMock).toHaveBeenCalledWith("get_public_products", { _slug: "burger-x" });
  });

  it("retorna null quando restaurante não existe ou está desabilitado", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    const r = await getPublicRestaurant("nao-existe");
    expect(r).toBeNull();
  });

  it("retorna o restaurante quando habilitado", async () => {
    rpcMock.mockResolvedValue({
      data: [
        {
          id: "r1",
          name: "Burger X",
          slug: "burger-x",
          timezone: "America/Sao_Paulo",
          public_menu_enabled: true,
        },
      ],
      error: null,
    });
    const r = await getPublicRestaurant("burger-x");
    expect(r?.name).toBe("Burger X");
    expect(r?.public_menu_enabled).toBe(true);
  });

  it("NUNCA expõe cost_cents — defesa em profundidade na camada de app", async () => {
    rpcMock.mockResolvedValue({
      data: [
        {
          id: "p1",
          category_id: "c1",
          name: "X-Burger",
          description: "delicioso",
          price_cents: 2500,
          sort_order: 0,
          // simulando vazamento acidental do backend:
          cost_cents: 999,
          tenant_id: "tenant-secreto",
        },
      ],
      error: null,
    });

    const products = await getPublicProducts("burger-x");
    expect(products).toHaveLength(1);
    const p = products[0] as unknown as Record<string, unknown>;
    expect(p.price_cents).toBe(2500);
    expect("cost_cents" in p).toBe(false);
    expect("tenant_id" in p).toBe(false);
  });

  it("propaga erro do backend (slug inexistente vira null, mas erros de RPC sobem)", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(getPublicProducts("burger-x")).rejects.toBeTruthy();
  });
});

// Os it.todo críticos foram promovidos a testes E2E REAIS em
// `src/test/public-menu.e2e.test.ts`, que roda contra o Supabase real
// com o cliente anônimo. Veja também SECURITY_CHECKLIST.md.
