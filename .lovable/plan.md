## Objetivo

Permitir que o restaurante opere o PDV **sem precisar abrir caixa**, mantendo o fluxo de caixa disponível para quem quiser usar. Pagamentos em dinheiro continuam aceitos normalmente (sem vínculo a sessão) e o relatório segue acessível.

## Mudanças

### 1. Banco de dados (migration)

- Adicionar coluna em `restaurants`:
  - `cash_session_required boolean NOT NULL DEFAULT true`
- Ajustar a RPC `register_order_payment`:
  - Hoje exige `cash_session` aberta para pagamentos em dinheiro.
  - Novo comportamento: se `restaurants.cash_session_required = false` **e** não houver sessão aberta para o usuário, registrar o pagamento em dinheiro com `cash_session_id = NULL` (sem erro). Se `true`, mantém a regra atual (exige caixa aberto).
- Ajustar a RPC `register_cash_movement` / `close_cash_session`: nenhuma mudança — só atuam quando há sessão.

### 2. Configuração do restaurante (UI owner/manager)

- Em **Configurações do restaurante** (localizar tela existente; se não houver toggle dedicado, adicionar em `DeliverySettings.tsx` ou criar seção "Operação"):
  - Switch **"Exigir abertura de caixa no PDV"** (default: ligado).
  - Texto auxiliar: *"Quando desligado, operadores podem usar o PDV sem abrir caixa. Vendas em dinheiro feitas sem sessão não entrarão no relatório de fechamento."*
- Atualizar `RestaurantProvider` (`RestaurantMembership.restaurants`) para incluir `cash_session_required`.

### 3. PDV — `CashSessionBar.tsx`

Quando `cash_session_required = false` **e** não houver sessão aberta:
- Mostrar badge neutro "Operando sem caixa" + texto curto.
- Manter botão **"Abrir caixa"** (opcional, para quem quiser).
- Esconder o aviso atual de "Vendas em dinheiro não serão vinculadas..." ou trocar por aviso mais leve.

Quando `cash_session_required = true`: comportamento atual (inalterado).

### 4. PaymentDialog / SplitBillDialog

- Remover bloqueio que impede pagamento em dinheiro sem sessão **quando** `cash_session_required = false`.
- Mostrar pequeno aviso inline em pagamentos em dinheiro sem sessão: *"Sem sessão de caixa — não aparecerá no relatório de fechamento."* (apenas informativo, não bloqueia).
- Cartão e PIX já funcionam sem sessão — sem mudança.

### 5. Relatório `/relatorios/caixa`

- Mantido visível sempre (conforme decisão).
- Sem mudanças funcionais — sessões abertas manualmente continuam aparecendo. Pagamentos em dinheiro sem `cash_session_id` simplesmente não entram nos totais por sessão (comportamento já correto).

## Detalhes técnicos

- Migration com `ALTER TABLE restaurants ADD COLUMN cash_session_required boolean NOT NULL DEFAULT true;`
- `CREATE OR REPLACE FUNCTION register_order_payment(...)` para ler `restaurants.cash_session_required` e relaxar a checagem condicionalmente.
- `src/integrations/supabase/types.ts` será regenerado automaticamente.
- Atualizar `RestaurantMembership` interface + select do `RestaurantProvider`.
- Sem mudanças em RLS — coluna nova herda políticas existentes de `restaurants`.

## Arquivos afetados

- `supabase/migrations/<nova>.sql` (nova)
- `src/lib/auth/RestaurantProvider.tsx`
- `src/components/orders/pdv/CashSessionBar.tsx`
- `src/components/orders/pdv/PaymentDialog.tsx`
- `src/components/orders/pdv/SplitBillDialog.tsx`
- Tela de configurações do restaurante (a confirmar localização ao implementar — provavelmente nova seção em `DeliverySettings.tsx` ou criar `src/pages/RestaurantSettings.tsx` se não existir toggle equivalente)

## Fora de escopo

- Não altera fluxo de relatórios.
- Não altera RLS.
- Não migra dados existentes (default `true` mantém comportamento atual).