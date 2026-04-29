import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { resolve } from "path";

/**
 * Bloco — Módulo Pizza opcional + modelos JSON.
 * - Garante que os 4 modelos baixáveis são JSON válidos com schema mínimo.
 * - Garante que o modelo espetinho NÃO usa pizza_flavors / type=pizza.
 * - Garante que o modelo pizzaria USA pizza_flavors e type=pizza nos lugares certos.
 */

const TEMPLATES_DIR = resolve(__dirname, "../../public/templates");
const FILES = ["modelo-generico.json", "modelo-espetinho.json", "modelo-pizzaria.json", "modelo-lanchonete.json"];

function loadTemplate(name: string) {
  return JSON.parse(readFileSync(resolve(TEMPLATES_DIR, name), "utf-8"));
}

describe("Templates de catálogo (download)", () => {
  it("os 4 modelos esperados existem em public/templates/", () => {
    const present = readdirSync(TEMPLATES_DIR);
    for (const f of FILES) expect(present).toContain(f);
  });

  it.each(FILES)("%s tem schema base válido", (name) => {
    const t = loadTemplate(name);
    expect(t.$schema_version).toBeDefined();
    for (const k of [
      "categories", "products", "variants", "option_groups",
      "option_items", "pizza_flavors", "product_pizza_flavors", "pizza_configs",
    ]) {
      expect(Array.isArray(t[k])).toBe(true);
    }
    for (const p of t.products) {
      expect(typeof p.name).toBe("string");
      expect(["simple", "variable", "pizza", "combo"]).toContain(p.type);
      expect(typeof p.price_cents).toBe("number");
    }
  });

  it("modelo-espetinho NÃO usa módulo Pizza", () => {
    const t = loadTemplate("modelo-espetinho.json");
    expect(t.pizza_flavors.length).toBe(0);
    expect(t.pizza_configs.length).toBe(0);
    expect(t.products.every((p: any) => p.type !== "pizza")).toBe(true);
  });

  it("modelo-pizzaria usa pizza_flavors (NÃO products simples) para sabores", () => {
    const t = loadTemplate("modelo-pizzaria.json");
    expect(t.pizza_flavors.length).toBeGreaterThan(0);
    expect(t.pizza_configs.length).toBeGreaterThan(0);
    expect(t.products.some((p: any) => p.type === "pizza")).toBe(true);
    // Sabores não devem aparecer como products simples
    for (const p of t.products) {
      expect(p.type).not.toBe("simple_flavor");
      // Garantir que sabores conhecidos do modelo não vazem para products
      expect(["Mussarela", "Calabresa", "Portuguesa"]).not.toContain(p.name);
    }
    // Pelo menos um tamanho deve ter diameter_cm/slices preenchidos
    const variants = t.variants.filter((v: any) => v.product_code === "PIZ-MNT");
    expect(variants.some((v: any) => v.diameter_cm && v.slices)).toBe(true);
  });

  it("modelo-lanchonete usa variações + adicionais e NÃO usa Pizza", () => {
    const t = loadTemplate("modelo-lanchonete.json");
    expect(t.variants.length).toBeGreaterThan(0);
    expect(t.option_groups.length).toBeGreaterThan(0);
    expect(t.products.every((p: any) => p.type !== "pizza")).toBe(true);
    expect(t.pizza_flavors.length).toBe(0);
  });
});
