import { supabase } from "@/integrations/supabase/client";
import { catalogPayloadSchema, formatZodErrors, type CatalogPayload } from "./importSchema";

export type ImportResult = {
  ok: boolean;
  categories: number;
  products: number;
  option_groups: number;
  option_items: number;
  variants: number;
  pizza_flavors?: number;
};

export type ValidationResult =
  | { ok: true; data: CatalogPayload; errors?: undefined }
  | { ok: false; errors: string[]; data?: undefined };

/**
 * Valida o JSON localmente (Zod). Retorna lista de erros se inválido.
 */
export function validateCatalogJson(raw: unknown): ValidationResult {
  const parsed = catalogPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, errors: formatZodErrors(parsed.error) };
  }
  return { ok: true, data: parsed.data as CatalogPayload };
}

/**
 * Importa o catálogo no servidor. Tudo ou nada.
 * RPC valida novamente e respeita RBAC (só owner/manager).
 */
export async function importCatalog(
  restaurantId: string,
  payload: CatalogPayload,
  deactivateMissing: boolean
): Promise<ImportResult> {
  if (!restaurantId) throw new Error("restaurant_id obrigatório.");
  const { data, error } = await supabase.rpc("import_catalog", {
    _restaurant_id: restaurantId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _payload: payload as any,
    _deactivate_missing: deactivateMissing,
  });
  if (error) throw new Error(error.message);
  return data as unknown as ImportResult;
}

/**
 * Exporta o catálogo atual no mesmo formato do JSON modelo.
 */
export async function exportCatalog(
  restaurantId: string
): Promise<CatalogPayload> {
  if (!restaurantId) throw new Error("restaurant_id obrigatório.");
  const { data, error } = await supabase.rpc("export_catalog", {
    _restaurant_id: restaurantId,
  });
  if (error) throw new Error(error.message);
  return data as unknown as CatalogPayload;
}

/**
 * Helper: força download de um JSON no browser.
 */
export function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
