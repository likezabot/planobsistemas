import { describe, it, expect } from "vitest";
import { renderReceiptText, type ReceiptPayload } from "@/lib/printing/renderReceipt";

describe("renderReceiptText", () => {
  function basePayload(): ReceiptPayload {
    return {
      restaurant: { name: "Pizzaria Teste" },
      order: {
        id: "ord-12345678",
        customer_name: "Maria",
        customer_phone: "11999999999",
        order_type: "delivery",
        address: "Rua A, 100",
        payment_method: "pix",
        notes: "Tocar a campainha",
        total_cents: 8900,
      },
      items: [],
    };
  }

  it("renderiza pizza com tamanho, sabores, borda e observação", () => {
    const payload = basePayload();
    payload.items = [
      {
        product_name: "Pizza Família",
        quantity: 1,
        unit_price: 8900,
        total_price: 8900,
        note: "Bem assada",
        customization: {
          variation: { id: "v1", name: "Grande", price: 5000 },
          flavors: [
            { id: "f1", name: "Mussarela", price: 4000 },
            { id: "f2", name: "Calabresa", price: 4500 },
          ],
          price_rule: "max",
          options: [{ id: "o1", name: "Borda Catupiry", price: 1200 }],
          options_total: 1200,
        },
      },
    ];
    const out = renderReceiptText(payload);
    expect(out).toContain("PIZZARIA TESTE");
    expect(out).toContain("Tamanho: Grande");
    expect(out).toContain("Sabores");
    expect(out).toContain("Mussarela");
    expect(out).toContain("Calabresa");
    expect(out).toContain("Adicionais");
    expect(out).toContain("Borda Catupiry");
    expect(out).toContain("Obs: Bem assada");
    expect(out).toContain("regra: max");
    expect(out).toContain("Tocar a campainha");
    expect(out).toMatch(/TOTAL:\s*R\$/);
  });

  it("não quebra com pedido sem customização (item simples)", () => {
    const payload = basePayload();
    payload.items = [
      { product_name: "Refrigerante", quantity: 2, unit_price: 800, total_price: 1600 },
    ];
    const out = renderReceiptText(payload);
    expect(out).toContain("2x Refrigerante");
    expect(out).not.toContain("Sabores");
    expect(out).not.toContain("Adicionais");
  });

  it("renderiza tipo retirada quando order_type=pickup", () => {
    const payload = basePayload();
    payload.order!.order_type = "pickup";
    payload.items = [{ product_name: "Coca", quantity: 1, unit_price: 500, total_price: 500 }];
    const out = renderReceiptText(payload);
    expect(out).toContain("Tipo: Retirada");
  });
});
