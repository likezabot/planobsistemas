/**
 * Detecção de itens cadastrados no lugar errado relacionados ao módulo Pizza.
 *
 * Regras (conservadoras — só por nome de categoria/grupo):
 *  - Produto suspeito de ser sabor: type='simple' E categoria com nome contendo
 *    "sabor" ou "pizza" (case-insensitive).
 *  - Grupo de adicional suspeito de ser específico de pizza: nome contém
 *    "borda", "sabor" ou "pizza".
 *
 * Persistência do "Ignorar aviso": localStorage por restaurante + usuário.
 * Não bloqueia funcionamento. Não deleta nada. Só sinaliza.
 */

export type SuspectKind = "flavor_product" | "pizza_option_group";

interface CategoryLike {
  id: string;
  name: string;
}

interface ProductLike {
  id: string;
  type: string | null;
  category_id: string | null;
}

interface OptionGroupLike {
  id: string;
  name: string;
}

const PIZZA_CATEGORY_PATTERN = /(sabor|pizza)/i;
const PIZZA_GROUP_PATTERN = /(borda|sabor|pizza)/i;

export function isSuspectFlavorProduct(
  product: ProductLike,
  categories: CategoryLike[],
): boolean {
  if (product.type !== "simple") return false;
  if (!product.category_id) return false;
  const cat = categories.find((c) => c.id === product.category_id);
  if (!cat) return false;
  return PIZZA_CATEGORY_PATTERN.test(cat.name);
}

export function isSuspectPizzaOptionGroup(group: OptionGroupLike): boolean {
  return PIZZA_GROUP_PATTERN.test(group.name);
}

/** Retorna a sub-classificação para mostrar a orientação certa no UI. */
export function classifyPizzaGroup(name: string): "borda" | "sabor" | "pizza" | null {
  if (/borda/i.test(name)) return "borda";
  if (/sabor/i.test(name)) return "sabor";
  if (/pizza/i.test(name)) return "pizza";
  return null;
}

/** Pizzas duplicadas: mesmo restaurant_id + lower(name) + type='pizza'. */
export interface PizzaDuplicateGroup {
  nameKey: string;
  ids: string[]; // ordenados por created_at asc — primeiro é o "principal"
}

export function findDuplicatePizzas(
  products: Array<{ id: string; name: string; type: string | null; created_at: string }>,
): PizzaDuplicateGroup[] {
  const buckets = new Map<string, typeof products>();
  for (const p of products) {
    if (p.type !== "pizza") continue;
    const key = p.name.trim().toLowerCase();
    if (!key) continue;
    const arr = buckets.get(key) ?? [];
    arr.push(p);
    buckets.set(key, arr);
  }
  const dupes: PizzaDuplicateGroup[] = [];
  for (const [key, arr] of buckets.entries()) {
    if (arr.length < 2) continue;
    const sorted = [...arr].sort((a, b) => a.created_at.localeCompare(b.created_at));
    dupes.push({ nameKey: key, ids: sorted.map((p) => p.id) });
  }
  return dupes;
}

// ---------- Persistência do "Ignorar" via localStorage ----------

function storageKey(scope: string): string {
  return `planb:suspect_dismissed:${scope}`;
}

function readSet(scope: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(storageKey(scope));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

function writeSet(scope: string, set: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(scope), JSON.stringify([...set]));
  } catch {
    // ignore quota errors
  }
}

export function isDismissed(scope: string, id: string): boolean {
  return readSet(scope).has(id);
}

export function dismiss(scope: string, id: string): void {
  const s = readSet(scope);
  s.add(id);
  writeSet(scope, s);
}

export function undismiss(scope: string, id: string): void {
  const s = readSet(scope);
  s.delete(id);
  writeSet(scope, s);
}

export function buildScope(restaurantId: string | null | undefined, userId: string | null | undefined): string {
  return `${restaurantId ?? "no-rest"}::${userId ?? "no-user"}`;
}
