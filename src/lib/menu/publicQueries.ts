import { supabase } from "@/integrations/supabase/client";

/**
 * Camada PÚBLICA do cardápio.
 *
 * Regras de segurança (NÃO RELAXAR):
 * - Sempre via RPC `get_public_*`. Nunca via `from('products')` direto.
 *   As RPCs já filtram por `public_menu_enabled`, `active=true` e
 *   NUNCA retornam `cost_cents`, `tenant_id`, membros ou auditoria.
 * - Nenhuma mutation pública.
 * - Slug inválido / restaurante desabilitado → retorna null.
 */

export interface PublicRestaurant {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  public_menu_enabled: boolean;
}

export interface PublicCategory {
  id: string;
  name: string;
  sort_order: number;
}

export interface PublicProduct {
  id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  price_cents: number;
  sort_order: number;
  image_url: string | null;
  type: "simple" | "variable" | "pizza" | "combo";
}

export interface PublicProductDetails {
  variants: {
    id: string;
    name: string;
    price_cents: number;
  }[];
  option_groups: {
    id: string;
    name: string;
    min_options: number;
    max_options: number;
    is_required: boolean;
    items: {
      id: string;
      name: string;
      price_cents: number;
    }[];
  }[];
  pizza_config?: {
    max_flavors: number;
    price_rule: "max" | "average" | "sum";
    allow_edge_customization: boolean;
  };
}

function requireSlug(slug: string | null | undefined): string {
  const s = (slug ?? "").trim();
  if (!s) throw new Error("slug do restaurante é obrigatório");
  return s;
}

export async function getPublicRestaurant(slug: string): Promise<PublicRestaurant | null> {
  const s = requireSlug(slug);
  const { data, error } = await supabase.rpc("get_public_restaurant", { _slug: s });
  if (error) throw error;
  const row = (data as PublicRestaurant[] | null)?.[0] ?? null;
  return row;
}

export async function getPublicCategories(slug: string): Promise<PublicCategory[]> {
  const s = requireSlug(slug);
  const { data, error } = await supabase.rpc("get_public_categories", { _slug: s });
  if (error) throw error;
  return (data as PublicCategory[] | null) ?? [];
}

export async function getPublicProducts(slug: string): Promise<PublicProduct[]> {
  const s = requireSlug(slug);
  const { data, error } = await supabase.rpc("get_public_products", { _slug: s });
  if (error) throw error;
  const rows = (data as any[] | null) ?? [];
  return rows.map((p) => ({
    id: p.id,
    category_id: p.category_id,
    name: p.name,
    description: p.description,
    price_cents: p.price_cents,
    sort_order: p.sort_order,
    image_url: p.image_url,
    type: p.type,
  }));
}

export async function getPublicProductDetails(productId: string): Promise<PublicProductDetails> {
  const { data, error } = await supabase.rpc("get_public_product_details", { 
    _product_id: productId 
  });
  if (error) throw error;
  return data as unknown as PublicProductDetails;
}
