import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type PizzaFlavor = Database["public"]["Tables"]["pizza_flavors"]["Row"];
export type PizzaFlavorInsert = Database["public"]["Tables"]["pizza_flavors"]["Insert"];
export type PizzaFlavorUpdate = Database["public"]["Tables"]["pizza_flavors"]["Update"];
export type PizzaFlavorPrice = Database["public"]["Tables"]["pizza_flavor_prices"]["Row"];
export type ProductVariant = Database["public"]["Tables"]["product_variants"]["Row"];
export type PizzaConfig = Database["public"]["Tables"]["pizza_configs"]["Row"];
export type PizzaConfigInsert = Database["public"]["Tables"]["pizza_configs"]["Insert"];
export type OptionItemOverride = Database["public"]["Tables"]["option_item_price_overrides"]["Row"];

function requireScope(restaurantId: string | null | undefined): string {
  if (!restaurantId) throw new Error("restaurant_id é obrigatório");
  return restaurantId;
}

// =====================================================================
// SABORES (pizza_flavors)
// =====================================================================
export async function listPizzaFlavors(restaurantId: string) {
  const id = requireScope(restaurantId);
  return supabase
    .from("pizza_flavors")
    .select("*")
    .eq("restaurant_id", id)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
}

export async function createPizzaFlavor(input: PizzaFlavorInsert) {
  if (!input.restaurant_id || !input.tenant_id) {
    throw new Error("restaurant_id e tenant_id são obrigatórios");
  }
  if (!input.name?.trim()) throw new Error("Nome obrigatório");
  return supabase.from("pizza_flavors").insert(input).select().single();
}

export async function updatePizzaFlavor(id: string, patch: PizzaFlavorUpdate) {
  return supabase.from("pizza_flavors").update(patch).eq("id", id).select().single();
}

export async function setPizzaFlavorActive(id: string, active: boolean) {
  return supabase.from("pizza_flavors").update({ active }).eq("id", id).select().single();
}

export async function deletePizzaFlavor(id: string) {
  return supabase.from("pizza_flavors").delete().eq("id", id);
}

// =====================================================================
// PIZZAS (produtos type=pizza)
// =====================================================================
export async function listPizzas(restaurantId: string) {
  const id = requireScope(restaurantId);
  return supabase
    .from("products")
    .select("*")
    .eq("restaurant_id", id)
    .eq("type", "pizza")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
}

export async function getPizzaConfig(productId: string) {
  return supabase.from("pizza_configs").select("*").eq("product_id", productId).maybeSingle();
}

export async function upsertPizzaConfig(input: PizzaConfigInsert) {
  if (input.max_flavors != null && (input.max_flavors < 1 || input.max_flavors > 4)) {
    throw new Error("max_flavors deve estar entre 1 e 4");
  }
  return supabase
    .from("pizza_configs")
    .upsert(input, { onConflict: "product_id" })
    .select()
    .single();
}

// =====================================================================
// VARIANTS (tamanhos)
// =====================================================================
export async function listVariants(productId: string) {
  return supabase
    .from("product_variants")
    .select("*")
    .eq("product_id", productId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
}

export async function createVariant(input: {
  product_id: string;
  code?: string | null;
  name: string;
  price_cents: number;
  sort_order?: number;
  active?: boolean;
}) {
  if (input.price_cents < 0) throw new Error("price_cents não pode ser negativo");
  return supabase.from("product_variants").insert(input).select().single();
}

export async function updateVariant(
  id: string,
  patch: Partial<Database["public"]["Tables"]["product_variants"]["Update"]>,
) {
  if (patch.price_cents != null && patch.price_cents < 0) {
    throw new Error("price_cents não pode ser negativo");
  }
  return supabase.from("product_variants").update(patch).eq("id", id).select().single();
}

export async function deleteVariant(id: string) {
  return supabase.from("product_variants").delete().eq("id", id);
}

// =====================================================================
// VÍNCULO Pizza ↔ Sabor
// =====================================================================
export async function listPizzaFlavorLinks(productId: string) {
  return supabase
    .from("product_pizza_flavors")
    .select("*, flavor:pizza_flavors(*)")
    .eq("product_id", productId)
    .order("sort_order", { ascending: true });
}

export async function setPizzaFlavorLinks(
  productId: string,
  flavorIds: string[],
) {
  // Substituição completa: deletar e reinserir
  const del = await supabase
    .from("product_pizza_flavors")
    .delete()
    .eq("product_id", productId);
  if (del.error) return del;
  if (flavorIds.length === 0) return { error: null, data: [] };
  return supabase
    .from("product_pizza_flavors")
    .insert(
      flavorIds.map((fid, i) => ({
        product_id: productId,
        flavor_id: fid,
        sort_order: i,
      })),
    )
    .select();
}

// =====================================================================
// PREÇO POR TAMANHO (pizza_flavor_prices)
// =====================================================================
export async function listFlavorPricesForPizza(productId: string) {
  // Busca preços de todos sabores vinculados a esta pizza, restritos aos variants desta pizza
  const variants = await supabase
    .from("product_variants")
    .select("id")
    .eq("product_id", productId);
  if (variants.error) return { data: null, error: variants.error };
  const variantIds = (variants.data ?? []).map((v) => v.id);
  if (variantIds.length === 0) return { data: [], error: null };

  const flavorIds = await supabase
    .from("product_pizza_flavors")
    .select("flavor_id")
    .eq("product_id", productId);
  if (flavorIds.error) return { data: null, error: flavorIds.error };
  const fIds = (flavorIds.data ?? []).map((f) => f.flavor_id);
  if (fIds.length === 0) return { data: [], error: null };

  return supabase
    .from("pizza_flavor_prices")
    .select("*")
    .in("flavor_id", fIds)
    .in("variant_id", variantIds);
}

export async function upsertFlavorPrice(input: {
  flavor_id: string;
  variant_id: string;
  price_cents: number;
}) {
  if (input.price_cents < 0) throw new Error("price_cents não pode ser negativo");
  return supabase
    .from("pizza_flavor_prices")
    .upsert(input, { onConflict: "flavor_id,variant_id" })
    .select()
    .single();
}

// =====================================================================
// OVERRIDES de preço de option_item por variant (ex: borda por tamanho)
// =====================================================================
export async function listOptionItemOverrides(optionItemIds: string[]) {
  if (optionItemIds.length === 0) return { data: [], error: null };
  return supabase
    .from("option_item_price_overrides")
    .select("*")
    .in("option_item_id", optionItemIds);
}

export async function upsertOptionItemOverride(input: {
  option_item_id: string;
  variant_id: string;
  price_cents: number;
}) {
  if (input.price_cents < 0) throw new Error("price_cents não pode ser negativo");
  return supabase
    .from("option_item_price_overrides")
    .upsert(input, { onConflict: "option_item_id,variant_id" })
    .select()
    .single();
}

export async function deleteOptionItemOverride(id: string) {
  return supabase.from("option_item_price_overrides").delete().eq("id", id);
}
