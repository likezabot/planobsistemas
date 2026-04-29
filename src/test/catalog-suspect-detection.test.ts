import { describe, it, expect, beforeEach } from "vitest";
import {
  isSuspectFlavorProduct,
  isSuspectPizzaOptionGroup,
  classifyPizzaGroup,
  findDuplicatePizzas,
  buildScope,
  isDismissed,
  dismiss,
  undismiss,
} from "@/lib/catalog/suspectDetection";

const cats = [
  { id: "c1", name: "Sabores de Pizza" },
  { id: "c2", name: "Bebidas" },
  { id: "c3", name: "Pizza Doces" },
  { id: "c4", name: "Espetinhos" },
];

describe("suspectDetection — produtos", () => {
  it("marca simples em categoria 'Sabores de Pizza'", () => {
    expect(
      isSuspectFlavorProduct({ id: "p1", type: "simple", category_id: "c1" }, cats),
    ).toBe(true);
  });

  it("marca simples em categoria 'Pizza Doces'", () => {
    expect(
      isSuspectFlavorProduct({ id: "p2", type: "simple", category_id: "c3" }, cats),
    ).toBe(true);
  });

  it("não marca produto type='pizza' (é a pizza propriamente)", () => {
    expect(
      isSuspectFlavorProduct({ id: "p3", type: "pizza", category_id: "c1" }, cats),
    ).toBe(false);
  });

  it("não marca categoria 'Bebidas'", () => {
    expect(
      isSuspectFlavorProduct({ id: "p4", type: "simple", category_id: "c2" }, cats),
    ).toBe(false);
  });

  it("não marca espetinho", () => {
    expect(
      isSuspectFlavorProduct({ id: "p5", type: "simple", category_id: "c4" }, cats),
    ).toBe(false);
  });

  it("não marca produto sem categoria", () => {
    expect(
      isSuspectFlavorProduct({ id: "p6", type: "simple", category_id: null }, cats),
    ).toBe(false);
  });
});

describe("suspectDetection — option_groups", () => {
  it("marca grupo 'Bordas'", () => {
    expect(isSuspectPizzaOptionGroup({ id: "g1", name: "Bordas" })).toBe(true);
    expect(classifyPizzaGroup("Bordas")).toBe("borda");
  });
  it("marca grupo 'Sabores'", () => {
    expect(isSuspectPizzaOptionGroup({ id: "g2", name: "Sabores" })).toBe(true);
    expect(classifyPizzaGroup("Sabores")).toBe("sabor");
  });
  it("marca grupo 'Sabores de Pizza'", () => {
    expect(isSuspectPizzaOptionGroup({ id: "g3", name: "Sabores de Pizza" })).toBe(true);
  });
  it("não marca 'Molhos'", () => {
    expect(isSuspectPizzaOptionGroup({ id: "g4", name: "Molhos" })).toBe(false);
    expect(classifyPizzaGroup("Molhos")).toBe(null);
  });
  it("não marca 'Ponto da carne'", () => {
    expect(isSuspectPizzaOptionGroup({ id: "g5", name: "Ponto da carne" })).toBe(false);
  });
});

describe("suspectDetection — duplicatas de pizza", () => {
  it("encontra duplicatas case-insensitive e ordena por created_at", () => {
    const products = [
      { id: "a", name: "Pizza Grande", type: "pizza", created_at: "2025-02-01T00:00:00Z" },
      { id: "b", name: "pizza grande", type: "pizza", created_at: "2025-01-01T00:00:00Z" },
      { id: "c", name: "Pizza Média", type: "pizza", created_at: "2025-01-15T00:00:00Z" },
      { id: "d", name: "Coca-Cola", type: "simple", created_at: "2025-01-01T00:00:00Z" },
    ];
    const dupes = findDuplicatePizzas(products);
    expect(dupes).toHaveLength(1);
    expect(dupes[0].nameKey).toBe("pizza grande");
    expect(dupes[0].ids).toEqual(["b", "a"]);
  });

  it("ignora produtos não-pizza mesmo com nome igual", () => {
    const products = [
      { id: "a", name: "Combo", type: "simple", created_at: "2025-01-01T00:00:00Z" },
      { id: "b", name: "Combo", type: "variable", created_at: "2025-01-02T00:00:00Z" },
    ];
    expect(findDuplicatePizzas(products)).toHaveLength(0);
  });
});

describe("suspectDetection — dismiss localStorage", () => {
  const scope = buildScope("rest-1", "user-1");

  beforeEach(() => {
    if (typeof window !== "undefined") window.localStorage.clear();
  });

  it("começa não-dismissed", () => {
    expect(isDismissed(scope, "p1")).toBe(false);
  });

  it("dismiss persiste e undismiss reverte", () => {
    dismiss(scope, "p1");
    expect(isDismissed(scope, "p1")).toBe(true);
    undismiss(scope, "p1");
    expect(isDismissed(scope, "p1")).toBe(false);
  });

  it("escopo isola por restaurante/usuário", () => {
    const other = buildScope("rest-2", "user-1");
    dismiss(scope, "p1");
    expect(isDismissed(other, "p1")).toBe(false);
  });
});
