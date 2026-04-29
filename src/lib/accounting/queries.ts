import { supabase } from "@/integrations/supabase/client";

export interface AccountingFilter {
  restaurantId: string;
  startDate: string; // ISO date YYYY-MM-DD
  endDate: string;
}

export interface AccountingOrderRow {
  order_id: string;
  order_created_at: string;
  order_status: string;
  order_type: string;
  payment_method: string;
  customer_name: string | null;
  customer_phone: string | null;
  notes: string | null;
  order_total_cents: number;
  order_subtotal_cents: number;
  delivery_fee_cents: number;
  product_id: string | null;
  product_name: string | null;
  product_code: string | null;
  category_name: string | null;
  quantity: number;
  unit_price_cents: number;
  total_price_cents: number;
  ncm: string | null;
  cest: string | null;
  cfop: string | null;
  cst: string | null;
  csosn: string | null;
  origin: string | null;
  fiscal_unit: string | null;
}

export async function fetchAccountingRows(filter: AccountingFilter): Promise<AccountingOrderRow[]> {
  // start = startDate 00:00, end = endDate 23:59:59
  const startISO = new Date(`${filter.startDate}T00:00:00`).toISOString();
  const endISO = new Date(`${filter.endDate}T23:59:59.999`).toISOString();

  const { data, error } = await supabase
    .from("orders")
    .select(`
      id, created_at, status, order_type, payment_method,
      customer_name, customer_phone, notes,
      total_cents, subtotal_cents, delivery_fee_cents,
      order_items (
        product_id, quantity, unit_price_cents, total_price_cents,
        product:products (
          id, name, code, ncm, cest, cfop, cst, csosn, origin, fiscal_unit,
          category:product_categories (name)
        )
      )
    `)
    .eq("restaurant_id", filter.restaurantId)
    .gte("created_at", startISO)
    .lte("created_at", endISO)
    .order("created_at", { ascending: true });

  if (error) throw error;

  const rows: AccountingOrderRow[] = [];
  for (const o of data ?? []) {
    const items = (o as any).order_items as any[];
    if (!items || items.length === 0) {
      rows.push({
        order_id: o.id,
        order_created_at: o.created_at,
        order_status: o.status,
        order_type: o.order_type,
        payment_method: o.payment_method,
        customer_name: o.customer_name,
        customer_phone: o.customer_phone,
        notes: o.notes,
        order_total_cents: o.total_cents,
        order_subtotal_cents: o.subtotal_cents,
        delivery_fee_cents: o.delivery_fee_cents,
        product_id: null, product_name: null, product_code: null,
        category_name: null, quantity: 0, unit_price_cents: 0, total_price_cents: 0,
        ncm: null, cest: null, cfop: null, cst: null, csosn: null, origin: null, fiscal_unit: null,
      });
      continue;
    }
    for (const it of items) {
      const p = it.product;
      rows.push({
        order_id: o.id,
        order_created_at: o.created_at,
        order_status: o.status,
        order_type: o.order_type,
        payment_method: o.payment_method,
        customer_name: o.customer_name,
        customer_phone: o.customer_phone,
        notes: o.notes,
        order_total_cents: o.total_cents,
        order_subtotal_cents: o.subtotal_cents,
        delivery_fee_cents: o.delivery_fee_cents,
        product_id: it.product_id,
        product_name: p?.name ?? null,
        product_code: p?.code ?? null,
        category_name: p?.category?.name ?? null,
        quantity: it.quantity,
        unit_price_cents: it.unit_price_cents,
        total_price_cents: it.total_price_cents,
        ncm: p?.ncm ?? null,
        cest: p?.cest ?? null,
        cfop: p?.cfop ?? null,
        cst: p?.cst ?? null,
        csosn: p?.csosn ?? null,
        origin: p?.origin ?? null,
        fiscal_unit: p?.fiscal_unit ?? null,
      });
    }
  }
  return rows;
}

export interface AccountingSummary {
  totalCents: number;
  ordersCount: number;
  cancelledCount: number;
  byPayment: Record<string, { count: number; totalCents: number }>;
  byProduct: Record<string, { name: string; quantity: number; totalCents: number }>;
  byCategory: Record<string, { name: string; totalCents: number }>;
}

export function summarize(rows: AccountingOrderRow[]): AccountingSummary {
  const seenOrders = new Set<string>();
  let totalCents = 0;
  let cancelled = 0;
  const byPayment: AccountingSummary["byPayment"] = {};
  const byProduct: AccountingSummary["byProduct"] = {};
  const byCategory: AccountingSummary["byCategory"] = {};

  for (const r of rows) {
    if (!seenOrders.has(r.order_id)) {
      seenOrders.add(r.order_id);
      if (r.order_status === "cancelled") {
        cancelled++;
      } else {
        totalCents += r.order_total_cents;
        const pm = byPayment[r.payment_method] ?? { count: 0, totalCents: 0 };
        pm.count += 1;
        pm.totalCents += r.order_total_cents;
        byPayment[r.payment_method] = pm;
      }
    }
    if (r.product_id && r.order_status !== "cancelled") {
      const k = r.product_id;
      const p = byProduct[k] ?? { name: r.product_name ?? "—", quantity: 0, totalCents: 0 };
      p.quantity += r.quantity;
      p.totalCents += r.total_price_cents;
      byProduct[k] = p;

      const ck = r.category_name ?? "—";
      const c = byCategory[ck] ?? { name: ck, totalCents: 0 };
      c.totalCents += r.total_price_cents;
      byCategory[ck] = c;
    }
  }

  return {
    totalCents,
    ordersCount: seenOrders.size - cancelled,
    cancelledCount: cancelled,
    byPayment,
    byProduct,
    byCategory,
  };
}

export function rowsToCSV(rows: AccountingOrderRow[], includePhone: boolean): string {
  const headers = [
    "data", "pedido_id", "status", "tipo", "pagamento",
    "cliente", ...(includePhone ? ["telefone"] : []),
    "produto_codigo", "produto_nome", "categoria",
    "quantidade", "preco_unitario", "total_item",
    "ncm", "cest", "cfop", "cst", "csosn", "origin", "unidade_fiscal",
    "subtotal_pedido", "taxa_entrega", "total_pedido", "observacoes",
  ];
  const escape = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = String(v).replace(/"/g, '""');
    return /[",;\n]/.test(s) ? `"${s}"` : s;
  };
  const fmtCents = (c: number) => (c / 100).toFixed(2).replace(".", ",");
  const lines = [headers.join(";")];
  for (const r of rows) {
    const cols = [
      r.order_created_at, r.order_id, r.order_status, r.order_type, r.payment_method,
      r.customer_name ?? "", ...(includePhone ? [r.customer_phone ?? ""] : []),
      r.product_code ?? "", r.product_name ?? "", r.category_name ?? "",
      r.quantity, fmtCents(r.unit_price_cents), fmtCents(r.total_price_cents),
      r.ncm ?? "", r.cest ?? "", r.cfop ?? "", r.cst ?? "", r.csosn ?? "", r.origin ?? "", r.fiscal_unit ?? "",
      fmtCents(r.order_subtotal_cents), fmtCents(r.delivery_fee_cents), fmtCents(r.order_total_cents),
      r.notes ?? "",
    ];
    lines.push(cols.map(escape).join(";"));
  }
  return lines.join("\n");
}

export function rowsToJSON(rows: AccountingOrderRow[], includePhone: boolean): string {
  const cleaned = rows.map((r) => {
    const out: Record<string, unknown> = { ...r };
    if (!includePhone) delete out.customer_phone;
    return out;
  });
  return JSON.stringify({ generated_at: new Date().toISOString(), rows: cleaned }, null, 2);
}

export function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function setAccountingEnabled(restaurantId: string, enabled: boolean) {
  const { error } = await supabase
    .from("restaurants")
    .update({ accounting_reports_enabled: enabled })
    .eq("id", restaurantId);
  if (error) throw error;
}
