import { describe, it, expect } from "vitest";
import { parseBRLToCents, centsToBRL, isAdminRole } from "@/lib/catalog/money";
import {
  createProduct,
  updateProduct,
  listProducts,
  listCategories,
} from "@/lib/catalog/queries";

/**
 * Testes do módulo Catálogo.
 *
 * Aqui validamos o CONTRATO defensivo do client (escopo + dinheiro).
 * Os testes que exigem RLS real (waiter não altera, cross-tenant não vê) ficam
 * como `it.todo` para a CI E2E rodar contra o banco real com 2 usuários.
 */

describe("Catálogo — money", () => {
  it("converte BRL para centavos", () => {
    expect(parseBRLToCents("12,50")).toBe(1250);
    expect(parseBRLToCents("12.50")).toBe(1250);
    expect(parseBRLToCents("1.234,56")).toBe(123456);
    expect(parseBRLToCents("0")).toBe(0);
    expect(parseBRLToCents("")).toBe(0);
  });

  it("formata centavos como BRL", () => {
    expect(centsToBRL(1250)).toMatch(/12,50/);
    expect(centsToBRL(0)).toMatch(/0,00/);
  });

  it("rejeita valores negativos", () => {
    expect(() => parseBRLToCents("-1")).toThrow(/negativo/i);
    expect(() => parseBRLToCents("-12,50")).toThrow(/negativo/i);
  });

  it("rejeita valores inválidos", () => {
    expect(() => parseBRLToCents("abc")).toThrow();
  });
});

describe("Catálogo — RBAC client-side", () => {
  it("isAdminRole reconhece owner e manager", () => {
    expect(isAdminRole("owner")).toBe(true);
    expect(isAdminRole("manager")).toBe(true);
  });
  it("isAdminRole NEGA waiter, cashier, kitchen, support", () => {
    expect(isAdminRole("waiter")).toBe(false);
    expect(isAdminRole("cashier")).toBe(false);
    expect(isAdminRole("kitchen")).toBe(false);
    expect(isAdminRole("support")).toBe(false);
    expect(isAdminRole(null)).toBe(false);
    expect(isAdminRole(undefined)).toBe(false);
  });
});

describe("Catálogo — queries exigem escopo", () => {
  it("listProducts lança sem restaurant_id", async () => {
    await expect(listProducts("" as unknown as string)).rejects.toThrow(/restaurant_id/i);
  });
  it("listCategories lança sem restaurant_id", async () => {
    await expect(listCategories("" as unknown as string)).rejects.toThrow(/restaurant_id/i);
  });
  it("createProduct lança sem tenant/restaurant", async () => {
    await expect(
      createProduct({ name: "X", tenant_id: "", restaurant_id: "" } as never)
    ).rejects.toThrow(/obrigatórios/i);
  });
  it("createProduct rejeita preço negativo no client (defesa em profundidade)", async () => {
    await expect(
      createProduct({
        name: "X",
        tenant_id: "t",
        restaurant_id: "r",
        price_cents: -1,
        cost_cents: 0,
      } as never)
    ).rejects.toThrow(/price_cents/i);
  });
  it("createProduct rejeita custo negativo", async () => {
    await expect(
      createProduct({
        name: "X",
        tenant_id: "t",
        restaurant_id: "r",
        price_cents: 0,
        cost_cents: -5,
      } as never)
    ).rejects.toThrow(/cost_cents/i);
  });
  it("updateProduct rejeita preço negativo", async () => {
    await expect(updateProduct("id", { price_cents: -1 })).rejects.toThrow(/price_cents/i);
  });
  it("updateProduct rejeita custo negativo", async () => {
    await expect(updateProduct("id", { cost_cents: -1 })).rejects.toThrow(/cost_cents/i);
  });
});

/**
 * Testes que exigem banco real (CI E2E).
 * O banco PRECISA aplicar essas regras independente do client.
 */
describe("Catálogo — RLS no banco (E2E)", () => {
  it.todo("waiter recebe erro ao tentar UPDATE em products");
  it.todo("cashier recebe erro ao tentar UPDATE em price_cents");
  it.todo("manager consegue INSERT em products");
  it.todo("usuário do restaurante A não vê produtos do restaurante B");
  it.todo("produto com active=false não aparece em listPublicMenu");
  it.todo("INSERT com price_cents negativo é rejeitado pelo trigger");
  it.todo("INSERT com cost_cents negativo é rejeitado pelo trigger");
  it.todo("DELETE físico em products é bloqueado (sem policy)");
});
