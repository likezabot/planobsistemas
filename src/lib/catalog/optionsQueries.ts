import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type OptionGroup = Database["public"]["Tables"]["option_groups"]["Row"];
export type OptionItem = Database["public"]["Tables"]["option_items"]["Row"];

function requireScope(restaurantId: string | null | undefined): string {
  if (!restaurantId) throw new Error("restaurant_id é obrigatório");
  return restaurantId;
}

export async function listOptionGroups(restaurantId: string) {
  const id = requireScope(restaurantId);
  return supabase
    .from("option_groups")
    .select("*")
    .eq("restaurant_id", id)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
}

export async function createOptionGroup(input: Database["public"]["Tables"]["option_groups"]["Insert"]) {
  return supabase.from("option_groups").insert(input).select().single();
}

export async function updateOptionGroup(id: string, patch: Database["public"]["Tables"]["option_groups"]["Update"]) {
  return supabase.from("option_groups").update(patch).eq("id", id).select().single();
}

export async function deleteOptionGroup(id: string) {
  return supabase.from("option_groups").delete().eq("id", id);
}

export async function listOptionItems(groupId: string) {
  return supabase
    .from("option_items")
    .select("*")
    .eq("group_id", groupId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
}

export async function createOptionItem(input: Database["public"]["Tables"]["option_items"]["Insert"]) {
  return supabase.from("option_items").insert(input).select().single();
}

export async function updateOptionItem(id: string, patch: Database["public"]["Tables"]["option_items"]["Update"]) {
  return supabase.from("option_items").update(patch).eq("id", id).select().single();
}

export async function deleteOptionItem(id: string) {
  return supabase.from("option_items").delete().eq("id", id);
}

// Vinculação Produto ↔ Grupo
export async function listProductOptionGroups(productId: string) {
  return supabase
    .from("product_option_groups")
    .select("*, group:option_groups(*)")
    .eq("product_id", productId)
    .order("sort_order", { ascending: true });
}

export async function setProductOptionGroups(productId: string, groupIds: string[]) {
  const del = await supabase.from("product_option_groups").delete().eq("product_id", productId);
  if (del.error) return del;
  if (groupIds.length === 0) return { error: null, data: [] };
  return supabase.from("product_option_groups").insert(
    groupIds.map((gid, i) => ({
      product_id: productId,
      group_id: gid,
      sort_order: i
    }))
  ).select();
}
