import { describe, it, expect, vi } from "vitest";
import { usePalmCartStore } from "@/lib/orders/palmCartStore";

describe("palmCartStore", () => {
  it("should add and remove items per orderId", () => {
    const store = usePalmCartStore.getState();
    const order1 = "order-1";
    const order2 = "order-2";

    store.addItem(order1, {
      product_id: "p1",
      name: "Product 1",
      quantity: 1,
      unit_price_cents: 1000,
    });

    store.addItem(order1, {
      product_id: "p2",
      name: "Product 2",
      quantity: 2,
      unit_price_cents: 500,
    });

    store.addItem(order2, {
      product_id: "p3",
      name: "Product 3",
      quantity: 1,
      unit_price_cents: 2000,
    });

    expect(store.getItems(order1).length).toBe(2);
    expect(store.getItems(order2).length).toBe(1);

    const item1 = store.getItems(order1)[0];
    store.updateItemQuantity(order1, item1.id, 5);
    expect(store.getItems(order1)[0].quantity).toBe(5);

    store.removeItem(order1, item1.id);
    expect(store.getItems(order1).length).toBe(1);

    store.clearOrderCart(order1);
    expect(store.getItems(order1).length).toBe(0);
    expect(store.getItems(order2).length).toBe(1);
  });
});
