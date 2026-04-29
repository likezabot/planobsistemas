/**
 * Conversões seguras para dinheiro em centavos.
 * Regra do projeto: preço/custo SEMPRE em integer cents. Nunca decimal solto.
 * O servidor valida (trigger). Aqui é só para UI.
 */

export function centsToBRL(cents: number): string {
  if (!Number.isFinite(cents)) return "R$ 0,00";
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/**
 * Converte string digitada ("12,50", "12.5", "1250") em centavos inteiros.
 * Lança se for negativo ou inválido.
 */
export function parseBRLToCents(input: string): number {
  const trimmed = input.trim().replace(/\s/g, "");
  if (trimmed === "") return 0;
  // Se há vírgula → ponto é separador de milhar (formato pt-BR).
  // Se não há vírgula → ponto é decimal.
  const normalized = trimmed.includes(",")
    ? trimmed.replace(/\./g, "").replace(",", ".")
    : trimmed;
  const num = Number(normalized);
  if (!Number.isFinite(num)) {
    throw new Error("Valor inválido");
  }
  if (num < 0) {
    throw new Error("Valor não pode ser negativo");
  }
  return Math.round(num * 100);
}

export function isAdminRole(role: string | null | undefined): boolean {
  return role === "owner" || role === "manager";
}
