
# Bloco E1 — Módulo Pizza opcional + catálogo flexível

## O que JÁ existe (não vou recriar)

Já está pronto e funcionando, validado em testes E2E:

- Tabelas pizza completas: `pizza_flavors`, `pizza_flavor_prices`, `product_pizza_flavors`, `pizza_configs`
- Tamanhos via `product_variants` (com estoque opcional)
- Bordas via `option_groups` + `option_items` + `option_item_price_overrides` (preço por tamanho)
- Backend `create_public_order` recalcula preço (regra max/average/sum), valida sabores vinculados, bloqueia 5º sabor, aplica override de borda por tamanho
- RPC pública `get_public_product_details` retorna config + sabores vinculados + variants + opções
- UI: `PizzasTab.tsx`, `PizzaModal.tsx`, fluxo público em `PublicMenu.tsx`
- Catálogo genérico já suporta produtos simples/variable/combo + grupos de opção + estoque opcional
- Padrão de flag por restaurante já existe (`accounting_reports_enabled`) — vou copiar a fórmula

## O que FALTA implementar

### 1. Flag `pizza_module_enabled` por restaurante
Migração:
- `ALTER TABLE restaurants ADD COLUMN pizza_module_enabled boolean NOT NULL DEFAULT false`
- Trigger de auditoria (igual `log_accounting_toggle`) → registra mudanças em `audit_log`
- RLS: a UPDATE policy `restaurants_update_owner_or_manager` já restringe a owner/manager. Não precisa nada novo.

### 2. Esconder pizza do público quando flag=false
- `get_public_products`: adicionar `AND (r.pizza_module_enabled OR p.type <> 'pizza')`
- `get_public_product_details`: bloquear se `type='pizza'` e flag=false
- `get_public_restaurant`: incluir `pizza_module_enabled` no retorno

### 3. Esconder aba Pizzas no catálogo quando flag=false
- `src/pages/Catalog.tsx`: condicional na `TabsTrigger value="pizzas"`
- Banner em `PizzasTab.tsx` quando desligado: "Módulo Pizza desativado. Ative em Configurações."
- Card de toggle owner/manager (em `PizzasTab.tsx`) — usa o mesmo padrão do `Accounting.tsx`

### 4. Campos opcionais profissionais
Migração:
- `ALTER TABLE product_variants ADD COLUMN diameter_cm numeric NULL, ADD COLUMN slices integer NULL`
- `ALTER TABLE pizza_flavors ADD COLUMN ingredients text NULL`
- Atualizar UI de `VariantsTab` / `PizzasTab` para mostrar os campos (opcionais, sem validação)
- Atualizar `get_public_product_details` para devolver diâmetro/fatias/ingredientes

### 5. Modelos JSON baixáveis (sem importar automaticamente)
Hoje existe `src/lib/catalog/sampleCatalog.ts` (1 modelo). Vou:
- Criar `src/lib/catalog/templates/` com 4 arquivos:
  - `generic.ts` — bebidas, porções, lanches básicos
  - `espetinho.ts` — espetinhos com variações de unidade/combo, adicionais (farofa, vinagrete, pão de alho), grupo "ponto da carne" obrigatório
  - `pizzaria.ts` — tamanhos (Broto/M/G/Família com diâmetro/fatias), sabores (Tradicional/Especial/Doce com ingredientes), bordas (Sem/Tradicional/Catupiry/Cheddar/Chocolate com override por tamanho), pizza_config max=4 regra max
  - `lanchonete.ts` — lanches com variações (simples/duplo) e adicionais (queijo/bacon/molho)
- Em `ImportExportTab.tsx`: nova seção "Modelos prontos (baixar JSON)" com 4 botões. Cada botão chama `downloadJSON(template)` — sem importar nada automaticamente.

### 6. Melhorar textos de ajuda no cadastro
Em `ProductsTab.tsx` (form de criar/editar produto), adicionar `<p className="text-xs text-muted-foreground">` próximo aos campos:
- Tipo "Variável": "Use variações para tamanhos, quantidades ou versões."
- Adicionais: "Use adicionais para molhos, acompanhamentos e extras."
- Tipo "Pizza": "Use somente quando o restaurante trabalha com tamanhos e sabores. Requer módulo Pizza ativo."

### 7. Testes E2E novos
Arquivo novo `src/test/pizza-module-flag.e2e.test.ts`:
- com flag=false, `get_public_products` NÃO retorna produtos type=pizza
- com flag=false, `get_public_product_details` em pizza retorna vazio
- com flag=true, pizza aparece e fluxo completo funciona
- produto simples (espetinho) continua aparecendo independente da flag
- backend recalcula preço da pizza (validar via inserção direta de unit_price falso — já coberto em `pizza-flow.e2e.test.ts`)

Validação: a suíte completa atual (126 testes) deve continuar verde.

## Detalhes técnicos

### Arquivos editados
```text
supabase/migrations/<timestamp>_pizza_module.sql       (novo)
  - add column restaurants.pizza_module_enabled
  - add columns product_variants.diameter_cm, slices
  - add column pizza_flavors.ingredients
  - trigger log_pizza_module_toggle
  - replace get_public_restaurant (incluir flag)
  - replace get_public_products (filtrar pizza quando flag=false)
  - replace get_public_product_details (bloquear pizza quando flag=false; incluir diâmetro/fatias/ingredientes)

src/lib/menu/publicQueries.ts                          (tipos: + pizza_module_enabled, + diameter_cm, slices, ingredients)
src/pages/PublicMenu.tsx                               (não mostrar produto type=pizza se flag=false — defesa em profundidade)
src/components/menu/PizzaModal.tsx                     (mostrar diâmetro/fatias/ingredientes quando preenchidos)
src/pages/Catalog.tsx                                  (esconder aba Pizzas quando flag=false)
src/components/catalog/PizzasTab.tsx                   (banner + toggle owner/manager para ativar módulo)
src/components/catalog/VariantsTab.tsx                 (campos opcionais diameter_cm, slices)
src/components/catalog/ProductsTab.tsx                 (textos de ajuda)
src/components/catalog/ImportExportTab.tsx             (seção "Modelos prontos")
src/lib/catalog/templates/index.ts                     (novo)
src/lib/catalog/templates/generic.ts                   (novo)
src/lib/catalog/templates/espetinho.ts                 (novo)
src/lib/catalog/templates/pizzaria.ts                  (novo)
src/lib/catalog/templates/lanchonete.ts                (novo)
src/lib/auth/RestaurantProvider.tsx                    (incluir pizza_module_enabled no select de currentMembership.restaurants)
src/test/pizza-module-flag.e2e.test.ts                 (novo)
ROADMAP.md                                             (marcar Bloco E1 entregue)
```

### Tabelas/colunas reaproveitadas (sem duplicação)
- `product_variants` para tamanhos (+ 2 colunas opcionais)
- `pizza_flavors` para sabores (+ 1 coluna `ingredients`)
- `pizza_flavor_prices` para preço sabor x tamanho — sem mudança
- `option_groups`/`option_items`/`option_item_price_overrides` para bordas com preço por tamanho — sem mudança
- `pizza_configs` para regras (max_flavors, price_rule, allow_edge_customization) — sem mudança

### Segurança
- RLS já existente cobre tudo (não altero policies)
- Toggle só por owner/manager (UPDATE policy atual de `restaurants` já restringe)
- Anon não edita nada (mantido)
- Backend continua recalculando preço — flag não afeta isso
- Adicionar coluna não muda RLS, só schema

## Validação final obrigatória
1. `tsc --noEmit` verde
2. Suíte completa verde (126 + novos)
3. Security scan sem erro crítico novo
4. Confirmar manualmente:
   - flag off → aba Pizzas oculta, pizza não aparece no público
   - flag on → fluxo completo funciona
   - espetinho (produto simples + variações + adicionais + grupo obrigatório) funciona em ambos os modos

## Fora de escopo (NÃO implementar)
Conforme o pedido: fiscal real, multi-impressoras, iFood, pagamento integrado, delivery com mapa, app mobile, módulo hardcoded de espetinho, borda diferente por metade (registrar no ROADMAP como melhoria futura).
