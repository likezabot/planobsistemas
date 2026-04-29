import { describe, it, expect } from "vitest";
import { catalogPayloadSchema } from "@/lib/catalog/importSchema";
import { sampleCatalog } from "@/lib/catalog/sampleCatalog";
import { validateCatalogJson } from "@/lib/catalog/importExport";

/**
 * Testes do schema de importação de catálogo.
 * Validações de RLS / transacionalidade no banco ficam como `it.todo` — CI E2E.
 */
describe("Catálogo — Import JSON (schema)", () => {
  it("modelo de exemplo é válido", () => {
    const r = catalogPayloadSchema.safeParse(sampleCatalog);
    expect(r.success).toBe(true);
  });

  it("aceita produto simples mínimo", () => {
    const r = validateCatalogJson({
      version: "1",
      categories: [{ code: "BEB", name: "Bebidas" }],
      products: [
        { code: "AGUA", name: "Água 500ml", category_code: "BEB", price_cents: 500 },
      ],
    });
    expect(r.ok).toBe(true);
  });

  it("aceita produto com variação (tamanhos)", () => {
    const r = validateCatalogJson({
      version: "1",
      categories: [{ code: "BEB", name: "Bebidas" }],
      products: [
        {
          code: "SUCO",
          name: "Suco",
          category_code: "BEB",
          price_cents: 0,
          type: "variable",
          variants: [
            { code: "P", name: "300ml", price_cents: 900 },
            { code: "G", name: "500ml", price_cents: 1400 },
          ],
        },
      ],
    });
    expect(r.ok).toBe(true);
  });

  it("aceita pizza com 4 sabores", () => {
    const r = validateCatalogJson({
      version: "1",
      categories: [{ code: "PZ", name: "Pizzas" }],
      products: [
        {
          code: "PG",
          name: "Pizza",
          category_code: "PZ",
          price_cents: 5000,
          type: "pizza",
          pizza_config: { max_flavors: 4, price_rule: "max" },
        },
      ],
    });
    expect(r.ok).toBe(true);
  });

  it("BLOQUEIA pizza com 5 sabores", () => {
    const r = validateCatalogJson({
      version: "1",
      categories: [{ code: "PZ", name: "Pizzas" }],
      products: [
        {
          code: "PG",
          name: "Pizza",
          category_code: "PZ",
          price_cents: 5000,
          type: "pizza",
          pizza_config: { max_flavors: 5, price_rule: "max" },
        },
      ],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => /max_flavors/i.test(e))).toBe(true);
    }
  });

  it("BLOQUEIA preço negativo", () => {
    const r = validateCatalogJson({
      version: "1",
      categories: [{ code: "BEB", name: "Bebidas" }],
      products: [
        { code: "X", name: "X", category_code: "BEB", price_cents: -1 },
      ],
    });
    expect(r.ok).toBe(false);
  });

  it("BLOQUEIA grupo obrigatório com min_options 0", () => {
    const r = validateCatalogJson({
      version: "1",
      categories: [],
      option_groups: [
        {
          code: "G1",
          name: "Obrig",
          is_required: true,
          min_options: 0,
          max_options: 1,
          items: [{ code: "A", name: "A", price_cents: 0 }],
        },
      ],
      products: [],
    });
    expect(r.ok).toBe(false);
  });

  it("BLOQUEIA produto referenciando categoria inexistente", () => {
    const r = validateCatalogJson({
      version: "1",
      categories: [{ code: "BEB", name: "Bebidas" }],
      products: [
        { code: "X", name: "X", category_code: "INEXISTENTE", price_cents: 100 },
      ],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.some((e) => /INEXISTENTE/.test(e))).toBe(true);
    }
  });

  it("BLOQUEIA produto referenciando grupo de adicional inexistente", () => {
    const r = validateCatalogJson({
      version: "1",
      categories: [{ code: "L", name: "Lanches" }],
      option_groups: [],
      products: [
        {
          code: "B",
          name: "Burger",
          category_code: "L",
          price_cents: 1000,
          option_group_codes: ["GRUPO_FANTASMA"],
        },
      ],
    });
    expect(r.ok).toBe(false);
  });

  it("BLOQUEIA categoria com code duplicado", () => {
    const r = validateCatalogJson({
      version: "1",
      categories: [
        { code: "X", name: "A" },
        { code: "x", name: "B" },
      ],
      products: [],
    });
    expect(r.ok).toBe(false);
  });

  it("BLOQUEIA variação com code duplicado no mesmo produto", () => {
    const r = validateCatalogJson({
      version: "1",
      categories: [{ code: "BEB", name: "Bebidas" }],
      products: [
        {
          code: "S",
          name: "Suco",
          category_code: "BEB",
          price_cents: 0,
          type: "variable",
          variants: [
            { code: "P", name: "P", price_cents: 100 },
            { code: "P", name: "P2", price_cents: 200 },
          ],
        },
      ],
    });
    expect(r.ok).toBe(false);
  });

  it("BLOQUEIA item de adicional duplicado dentro do mesmo grupo", () => {
    const r = validateCatalogJson({
      version: "1",
      categories: [],
      option_groups: [
        {
          code: "G",
          name: "G",
          items: [
            { code: "A", name: "A", price_cents: 0 },
            { code: "A", name: "A2", price_cents: 0 },
          ],
        },
      ],
      products: [],
    });
    expect(r.ok).toBe(false);
  });

  it("modelo exportado é re-importável (round-trip)", () => {
    // Simula export -> import. O JSON modelo serve como referência.
    const exported = JSON.parse(JSON.stringify(sampleCatalog));
    const r = validateCatalogJson(exported);
    expect(r.ok).toBe(true);
  });
});

/**
 * Testes que exigem banco real (CI E2E):
 */
describe("Catálogo — Import RPC (E2E)", () => {
  it.todo("waiter recebe erro ao chamar import_catalog");
  it.todo("cashier recebe erro ao chamar import_catalog");
  it.todo("manager consegue importar com sucesso");
  it.todo("importação com erro NÃO salva nada (transacional)");
  it.todo("desativar ausentes só roda quando flag está marcada");
  it.todo("usuário do restaurante A não consegue importar para restaurante B");
  it.todo("export do restaurante A não retorna dados do restaurante B");
});
