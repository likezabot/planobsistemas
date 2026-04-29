# SECURITY_CHECKLIST — bloqueadores antes do piloto comercial

Este documento lista garantias de segurança que **devem** estar verdes antes
de liberar o sistema para clientes pagantes. Itens marcados como
**BLOQUEADOR** impedem o go-live até serem cobertos por teste automatizado
real (não `it.todo`, não documentação).

Convenção:

- ✅ — coberto por teste automatizado real, rodando no CI.
- 🟡 — coberto parcialmente (unit / mock) — precisa virar E2E real.
- ❌ — não coberto.

---

## 1. Multi-tenant / Isolamento

| Item | Status | Onde |
|---|---|---|
| Toda query operacional exige `restaurant_id` em escopo | ✅ | `useRequiredRestaurantId`, `multi-tenant-isolation.test.tsx` |
| Usuário do restaurante A não vê produto do restaurante B | 🟡 | RLS no banco; falta E2E com 2 contas reais → **BLOQUEADOR** |
| Usuário do restaurante A não vê pedidos / membros / auditoria de B | ❌ | depende dos próximos módulos |

## 2. Cardápio Público (anônimo)

| Item | Status | Onde |
|---|---|---|
| Anônimo NÃO consegue SELECT direto em `products` | ✅ | `public-menu.e2e.test.ts` |
| Anônimo NÃO consegue SELECT em `audit_log` | ✅ | `public-menu.e2e.test.ts` |
| Anônimo NÃO consegue SELECT em `restaurant_members` | ✅ | `public-menu.e2e.test.ts` |
| Anônimo NÃO consegue SELECT em `product_categories` | ✅ | `public-menu.e2e.test.ts` |
| Anônimo NÃO consegue INSERT/UPDATE/DELETE em `products` | ✅ | `public-menu.e2e.test.ts` |
| `get_public_products` NÃO retorna produto `active=false` | ✅ | `public-menu.e2e.test.ts` |
| `get_public_products` NÃO retorna produto em categoria inativa | ✅ | `public-menu.e2e.test.ts` |
| `get_public_categories` NÃO retorna categoria `active=false` | ✅ | `public-menu.e2e.test.ts` |
| `get_public_restaurant` retorna vazio se `public_menu_enabled=false` | ✅ | `public-menu.e2e.test.ts` |
| `get_public_products` NÃO devolve `cost_cents` / `tenant_id` | ✅ | `public-menu.e2e.test.ts` |
| Restaurante desabilitado não vaza produtos | ✅ | `public-menu.e2e.test.ts` |

### Critérios aceitos para manter `SECURITY DEFINER` nas RPCs públicas

Auditados em 29/04/2026 — `get_public_restaurant`, `get_public_categories`,
`get_public_products`:

- ✅ retornam apenas colunas permitidas
- ✅ não retornam `tenant_id`
- ✅ não retornam `cost_cents`
- ✅ não retornam dados internos (auditoria, membros, custos)
- ✅ não permitem escrita (apenas `SELECT`)
- ✅ têm `set search_path = public`
- ✅ filtram `active = true` e `public_menu_enabled = true`

Os warnings do linter sobre `0028/0029` (`SECURITY DEFINER` executável por
anônimo / autenticado) são **aceitos conscientemente** porque a função é,
por desenho, o ponto de entrada público controlado.

## 3. Catálogo (autenticado)

| Item | Status | Onde |
|---|---|---|
| Garçom/caixa/cozinha não consegue criar/editar produto | 🟡 | RLS + UI; falta E2E com usuário real → **BLOQUEADOR** |
| Preço/custo negativo é bloqueado | ✅ | trigger `validate_product_money` + `catalog.test.ts` |
| `restaurant_id` precisa pertencer ao `tenant_id` | ✅ | trigger `validate_product_money` |

## 4. Checkout (Público)

| Item | Status | Onde |
|---|---|---|
| Cliente nunca envia total confiável; backend recalcula | ✅ | RPC `create_public_order` |
| `idempotency_key` impede pedido duplicado em clique duplo | ✅ | `orders_idempotency_unique` + RPC logic |
| Produto `active=false` não pode ser comprado | ✅ | RPC check; `checkout.e2e.test.ts` |
| Preço alterado no navegador é ignorado pelo servidor | ✅ | RPC recalculates from product table |
| Checkout só cria pedido se `public_menu_enabled=true` | ✅ | `checkout.e2e.test.ts` |
| Telefone é normalizado (remove formatação) | ✅ | RPC logic |
| Anônimo NÃO consegue INSERT direto em `orders` ou `order_items` | ✅ | `checkout.e2e.test.ts` |
| Carrinho vazio não gera pedido | ✅ | `checkout.e2e.test.ts` |

## 5. Pedidos / PDV (autenticado)

| Item | Status | Onde |
|---|---|---|
| Membro do restaurante A não vê pedido do restaurante B | ✅ | RLS `Members can view orders` |
| Anônimo NÃO lê `orders` ou `order_items` | ✅ | `orders-pdv.e2e.test.ts` |
| Mudança de status via RPC segura `update_order_status` | ✅ | RPC logic + Audit log |
| Cancelamento exige motivo obrigatório | ✅ | RPC check |
| Bloqueio de reativação de pedido cancelado/concluído | ✅ | RPC logic |
| Audit log gerado para mudanças de status | ✅ | `audit_log` verification |
| **Impedir loop de impressão: duplicata via ID+Hash bloqueada** | ✅ | `idx_print_jobs_auto_pending` |
| **Garantir que pedido cancelado não imprime automático** | ✅ | RPC `create_print_job_for_order` |

## 6. Impressão (print_jobs)

| Item | Status | Onde |
|---|---|---|
| Anônimo NÃO consegue ler `print_jobs` | ✅ | `print-jobs.e2e.test.ts` |
| Anônimo NÃO consegue criar jobs via RPC | ✅ | `print-jobs.e2e.test.ts` |
| Anônimo NÃO consegue claim/complete/fail jobs | ✅ | `print-jobs.e2e.test.ts` |
| `claim_print_job` só funciona para job `pending` ou `failed` | ✅ | RPC logic |
| `complete_print_job` exige mesmo `agent_id` que capturou | ✅ | RPC logic |
| `reprint_order` exige role `cashier`, `manager` ou `owner` | ✅ | RPC logic |
| Reimpressão exige motivo e gera audit log | ✅ | RPC logic |
| Job falhado NÃO reinprime sozinho | ✅ | RPC logic |
| Job `printed` é imutável (não pode ser reclamado novamente) | ✅ | RPC logic |
| Agent mismatch bloqueado em transições de status | ✅ | RPC logic |
| `print_status` no pedido atualizado pelo contrato | ✅ | RPC logic |

## 7. Genéricos

| Item | Status |
|---|---|
| Roles ficam em tabela separada (`restaurant_members`), nunca no profile | ✅ |
| Funções de checagem de role são `SECURITY DEFINER` para evitar recursão | ✅ |
| Senha nunca é logada / nunca volta para o cliente | ✅ (Supabase Auth) |
| Service role key nunca aparece no front | ✅ (apenas em edge functions) |

---

## Como rodar a suíte de segurança

```bash
bunx vitest run src/test/public-menu.e2e.test.ts
bunx vitest run src/test/multi-tenant-isolation.test.tsx
bunx vitest run src/test/catalog.test.ts
```

A suíte E2E usa o cliente **anônimo** real do Supabase (apenas `anon key`,
sem login) e exige `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`
no ambiente.
