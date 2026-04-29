/**
 * Renderer puro de recibo a partir do payload de print_jobs.
 *
 * Objetivo Fase 2 / Bloco A:
 * - Garantir que tamanho (variation), sabores (flavors), bordas/adicionais
 *   (options) e observação (note) APAREÇAM no recibo, sempre que o pedido
 *   tiver esses dados.
 * - Função pura, sem I/O — testável e reutilizável tanto no simulador
 *   quanto em qualquer integração futura sem mexer no agente físico.
 *
 * Formato do payload (gerado por create_print_job_for_order):
 * {
 *   restaurant: { id, name },
 *   order: { id, customer_name, customer_phone, order_type, address,
 *            payment_method, notes, total_cents, created_at },
 *   items: [{
 *     product_name, quantity, unit_price, total_price, note,
 *     customization: {
 *       variation?: { id, name, price },
 *       flavors?:  [{ id, name, price }],
 *       price_rule?: 'max'|'average'|'sum',
 *       options?:  [{ id, name, price }],
 *       options_total?: number
 *     }
 *   }]
 * }
 */

export interface ReceiptItem {
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  note?: string | null;
  customization?: {
    variation?: { id?: string; name?: string; price?: number } | null;
    flavors?: Array<{ id?: string; name?: string; price?: number }> | null;
    price_rule?: "max" | "average" | "sum" | null;
    options?: Array<{ id?: string; name?: string; price?: number }> | null;
    options_total?: number | null;
  } | null;
}

export interface ReceiptPayload {
  restaurant?: { id?: string; name?: string };
  order?: {
    id?: string;
    customer_name?: string;
    customer_phone?: string;
    order_type?: string;
    address?: string | null;
    payment_method?: string;
    notes?: string | null;
    total_cents?: number;
    created_at?: string;
    delivery_fee_cents?: number | null;
    delivery_zone_name?: string | null;
  };
  items?: ReceiptItem[];
}

function fmtMoney(cents: number | null | undefined): string {
  const n = typeof cents === "number" && Number.isFinite(cents) ? cents : 0;
  return (n / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/**
 * Renderiza o payload em texto legível tipo recibo (monospace).
 * Cada item com customização ganha linhas adicionais para
 * Tamanho, Sabores, Borda/Adicional, Observação.
 */
export function renderReceiptText(payload: ReceiptPayload): string {
  const lines: string[] = [];
  const restaurant = payload.restaurant?.name ?? "Restaurante";
  const order = payload.order ?? {};
  const items = payload.items ?? [];

  lines.push("================================");
  lines.push(restaurant.toUpperCase());
  lines.push("================================");
  if (order.id) lines.push(`Pedido: ${String(order.id).slice(0, 8)}`);
  if (order.customer_name) lines.push(`Cliente: ${order.customer_name}`);
  if (order.customer_phone) lines.push(`Telefone: ${order.customer_phone}`);
  if (order.order_type) {
    lines.push(`Tipo: ${order.order_type === "delivery" ? "Entrega" : "Retirada"}`);
  }
  if (order.address) lines.push(`Endereço: ${order.address}`);
  if (order.payment_method) lines.push(`Pagamento: ${order.payment_method}`);
  lines.push("--------------------------------");

  if (items.length === 0) {
    lines.push("(sem itens)");
  } else {
    for (const it of items) {
      const qty = it.quantity ?? 1;
      lines.push(`${qty}x ${it.product_name}  ${fmtMoney(it.total_price)}`);

      const c = it.customization ?? undefined;
      // Tamanho (variation)
      if (c?.variation?.name) {
        const vp = c.variation.price ?? 0;
        lines.push(
          `  Tamanho: ${c.variation.name}` + (vp > 0 ? ` (${fmtMoney(vp)})` : ""),
        );
      }
      // Sabores
      if (c?.flavors && c.flavors.length > 0) {
        const rule = c.price_rule ? ` [regra: ${c.price_rule}]` : "";
        lines.push(`  Sabores${rule}:`);
        for (const f of c.flavors) {
          const fp = f.price ?? 0;
          lines.push(
            `    - ${f.name ?? "?"}` + (fp > 0 ? ` (${fmtMoney(fp)})` : ""),
          );
        }
      }
      // Adicionais / Borda
      if (c?.options && c.options.length > 0) {
        lines.push(`  Adicionais:`);
        for (const o of c.options) {
          const op = o.price ?? 0;
          lines.push(
            `    + ${o.name ?? "?"}` + (op > 0 ? ` (${fmtMoney(op)})` : ""),
          );
        }
        if (c.options_total && c.options_total > 0) {
          lines.push(`    Subtotal adicionais: ${fmtMoney(c.options_total)}`);
        }
      }
      // Observação
      if (it.note && String(it.note).trim()) {
        lines.push(`  Obs: ${String(it.note).trim()}`);
      }
    }
  }

  lines.push("--------------------------------");
  if (order.delivery_fee_cents && order.delivery_fee_cents > 0) {
    const zone = order.delivery_zone_name ? ` (${order.delivery_zone_name})` : "";
    lines.push(`TAXA ENTREGA${zone}: ${fmtMoney(order.delivery_fee_cents)}`);
  }
  lines.push(`TOTAL: ${fmtMoney(order.total_cents)}`);
  if (order.notes && String(order.notes).trim()) {
    lines.push("");
    lines.push(`Observações do pedido:`);
    lines.push(String(order.notes).trim());
  }
  lines.push("================================");

  return lines.join("\n");
}
