import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Product = Database["public"]["Tables"]["products"]["Row"];
export type ProductInsert = Database["public"]["Tables"]["products"]["Insert"];
export type ProductUpdate = Database["public"]["Tables"]["products"]["Update"];
export type Category = Database["public"]["Tables"]["product_categories"]["Row"];

/**
 * Listagens SEMPRE recebem restaurantId obrigatório.
 * Se alguém chamar sem, lançamos antes de fazer a query.
 */
function requireScope(restaurantId: string | null | undefined): string {
  if (!restaurantId) {
    throw new Error("restaurant_id é obrigatório — escopo ausente.");
  }
  return restaurantId;
}

export async function listCategories(restaurantId: string) {
  const id = requireScope(restaurantId);
  return supabase
    .from("product_categories")
    .select("*")
    .eq("restaurant_id", id)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
}

export async function listProducts(restaurantId: string) {
  const id = requireScope(restaurantId);
  return supabase
    .from("products")
    .select("*")
    .eq("restaurant_id", id)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
}

/**
 * Cardápio público: somente produtos ativos, ordenados.
 * Continua exigindo escopo de restaurante.
 */
export async function listPublicMenu(restaurantId: string) {
  const id = requireScope(restaurantId);
  return supabase
    .from("products")
    .select("*")
    .eq("restaurant_id", id)
    .eq("active", true)
    .order("sort_order", { ascending: true });
}

export async function createProduct(input: ProductInsert) {
  if (!input.restaurant_id || !input.tenant_id) {
    throw new Error("restaurant_id e tenant_id são obrigatórios");
  }
  if ((input.price_cents ?? 0) < 0) throw new Error("price_cents não pode ser negativo");
  if ((input.cost_cents ?? 0) < 0) throw new Error("cost_cents não pode ser negativo");
  return supabase.from("products").insert(input).select().single();
}

export async function updateProduct(id: string, patch: ProductUpdate) {
  if (patch.price_cents != null && patch.price_cents < 0) {
    throw new Error("price_cents não pode ser negativo");
  }
  if (patch.cost_cents != null && patch.cost_cents < 0) {
    throw new Error("cost_cents não pode ser negativo");
  }
  return supabase.from("products").update(patch).eq("id", id).select().single();
}

export async function setProductActive(id: string, active: boolean) {
  return supabase.from("products").update({ active }).eq("id", id).select().single();
}

export async function createCategory(input: {
  tenant_id: string;
  restaurant_id: string;
  name: string;
  sort_order?: number;
}) {
  return supabase.from("product_categories").insert(input).select().single();
}

export async function setCategoryActive(id: string, active: boolean) {
  return supabase
    .from("product_categories")
    .update({ active })
    .eq("id", id)
    .select()
    .single();
}
