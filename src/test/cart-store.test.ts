import { describe, it, expect, beforeEach } from "vitest";
import { useCart } from "@/lib/cart/cartStore";

/**
 * Bloco A — Garantias do carrinho para pizzas customizadas.
 */
describe("cartStore — pizzas customizadas", () => {
  beforeEach(() => {
    useCart.getState().clearCart();
    localStorage.clear();
  });

  it("duas pizzas do mesmo product_id com sabores DIFERENTES viram linhas separadas", () => {
    const { addItem } = useCart.getState();
    addItem("slug-a", {
      product_id: "p1",
      name: "Pizza",
      price_cents: 6500,
      quantity: 1,
      variation_id: "v-grande",
      pizza_flavors: ["fa", "fb"],
    });
    addItem("slug-a", {
      product_id: "p1",
      name: "Pizza",
      price_cents: 6500,
      quantity: 1,
      variation_id: "v-grande",
      pizza_flavors: ["fc", "fd"],
    });
    const items = useCart.getState().items;
    expect(items.length).toBe(2);
    expect(items[0].line_id).not.toBe(items[1].line_id);
    expect(items[0].pizza_flavors).toEqual(["fa", "fb"]);
    expect(items[1].pizza_flavors).toEqual(["fc", "fd"]);
  });

  it("dois produtos simples idênticos (sem customização) são MERGED em uma linha", () => {
    const { addItem } = useCart.getState();
    addItem("slug-a", { product_id: "p1", name: "Coca", price_cents: 500, quantity: 1 });
    addItem("slug-a", { product_id: "p1", name: "Coca", price_cents: 500, quantity: 2 });
    const items = useCart.getState().items;
    expect(items.length).toBe(1);
    expect(items[0].quantity).toBe(3);
  });

  it("trocar restaurante limpa o carrinho", () => {
    const { addItem } = useCart.getState();
    addItem("slug-a", { product_id: "p1", name: "X", price_cents: 100, quantity: 1 });
    addItem("slug-b", { product_id: "p2", name: "Y", price_cents: 100, quantity: 1 });
    const items = useCart.getState().items;
    expect(items.length).toBe(1);
    expect(items[0].product_id).toBe("p2");
  });

  it("removeItem usa line_id (não remove tudo do mesmo product_id)", () => {
    const { addItem, removeItem } = useCart.getState();
    addItem("slug-a", {
      product_id: "p1",
      name: "Pizza",
      price_cents: 6500,
      quantity: 1,
      variation_id: "v-grande",
      pizza_flavors: ["fa"],
    });
    addItem("slug-a", {
      product_id: "p1",
      name: "Pizza",
      price_cents: 6500,
      quantity: 1,
      variation_id: "v-grande",
      pizza_flavors: ["fb"],
    });
    const firstLine = useCart.getState().items[0].line_id;
    removeItem(firstLine);
    const items = useCart.getState().items;
    expect(items.length).toBe(1);
    expect(items[0].pizza_flavors).toEqual(["fb"]);
  });
});
