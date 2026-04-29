# ROADMAP — Pendências futuras (não implementar agora)

> Este arquivo registra escopo **adiado conscientemente**. Nada aqui deve ser
> implementado sem aprovação explícita do dono do produto.

---

## Status atual (29/04/2026)

✅ **Sistema tecnicamente pronto para piloto comercial.**

Validado em Bloco D (Hardening de piloto):
- Multi-tenant real isolado (RLS + testes E2E negativos)
- RBAC validado no backend (owner / manager / cashier / waiter / kitchen)
- Catálogo completo (simples, variável, pizza multi-sabor, opções, overrides)
- Checkout público com idempotência e rate-limit (8/5min)
- Impressão com 1 agente local + recuperação de jobs travados
- Módulo Contador opcional (CSV/JSON, sem valor fiscal)
- Suíte: 126/126 testes passando, typecheck limpo, 0 erros críticos no scan

**Limitações conhecidas (comunicar ao cliente antes de vender):**
- Sem emissão fiscal real (NFC-e/SAT/NF-e) — ver item 1
- 1 impressora por restaurante — ver item 2
- Sem onboarding assistido — ver Bloco E abaixo
- Backup automático diário pela Lovable Cloud (7 dias de retenção padrão)
- 5 warnings pré-existentes do linter aceitos como falsos positivos — ver item 4

---

## Bloco E — Onboarding e operação assistida do 1º cliente (próximo provável, **NÃO aprovado**)

Escopo provável a discutir antes de implementar:
- Checklist de onboarding (passo a passo do dono ao primeiro pedido)
- Wizard de criação de cliente / restaurante / primeiro usuário
- Catálogo modelo por tipo de negócio (pizzaria, hamburgueria, açaí, etc.)
- Tela de saúde do restaurante (impressora online, pedidos hoje, erros recentes)
- Teste ponta-a-ponta guiado (criar pedido fake, imprimir, cancelar)
- Relatório comercial 1-pager (o que entrega / o que não entrega / preço sugerido)

Status: **aguardando aprovação explícita do dono do produto.**
Justificativa de prioridade: onboarding atrapalha **toda venda**, mesmo a primeira —
mais alto ROI que fiscal ou multi-impressora neste momento.

---

## 1. Fiscal real opcional (futuro)
- Emissão de NFC-e / SAT / NF-e
- Geração e assinatura de XML
- Integração com SEFAZ
- Armazenamento de certificado digital A1/A3
- DANFE fiscal oficial
- Provider fiscal (mock + real)
- Tabelas: `fiscal_settings`, `fiscal_documents`, `fiscal_events`,
  `tenant_feature_entitlements`, `restaurant_feature_settings`
- Tela `/fiscal` com chave de ativação por restaurante
- Status: **bloqueado até decisão comercial** (vender como módulo pago)

## 2. Multi-impressoras (futuro)
- Tabelas: `printer_devices`, `printer_routing_rules`
- Roteamento por categoria/tipo (cozinha, bar, balcão, fiscal)
- Integração no `print_jobs` mantendo compatibilidade com 1 impressora
- Status: **adiado** — fluxo atual de 1 impressora está estável

## 3. Integração com API fiscal / provedor externo (futuro)
- Interface `FiscalProvider` (mock + real)
- Conectores: Focus NFe, NFe.io, Tecnospeed, etc.
- Webhooks de autorização/cancelamento
- Status: **depende do item 1**

## 4. Hardening de segurança — 5 warnings pré-existentes (futuro)
Warnings do linter Supabase que **NÃO** vieram do módulo Contador.
Auditados em 29/04/2026 e classificados como **falsos positivos aceitáveis**:

| # | Warning | Função / Objeto | Por que aceito hoje |
|---|---------|-----------------|---------------------|
| 1 | SECURITY DEFINER executável por anon | `get_public_restaurant` | Ponto de entrada público controlado, retorna apenas colunas seguras |
| 2 | SECURITY DEFINER executável por anon | `get_public_categories` | Idem — filtra `active=true` e `public_menu_enabled=true` |
| 3 | SECURITY DEFINER executável por anon | `get_public_products` | Idem — não devolve `cost_cents` nem `tenant_id` |
| 4 | SECURITY DEFINER executável por anon | `create_public_order` | RPC de checkout público, recalcula totais no servidor |
| 5 | Function search_path mutable (resíduo) | funções utilitárias antigas | Já têm `set search_path = public`; warning persiste por metadata cache |

**Ação futura sugerida:**
- Revisar individualmente cada função
- Adicionar testes E2E negativos extras (ex.: anon tentando passar `restaurant_id` falso)
- Considerar mover RPCs públicas para schema dedicado `public_api`

Status: **monitorar** — não bloqueia piloto comercial.

---

## 5. Melhorias de Defesa em Profundidade (Futuro - 29/04/2026)
- **Bloqueio de Categoria Inativa no Checkout**: Atualmente, `get_public_products` filtra categorias inativas, mas a RPC `create_public_order` não faz essa validação final. Adicionar essa trava como redundância.
- **Isolamento de Segredos**: Mover a visualização de `print_agents.secret_key` para uma permissão exclusiva de `owner`.
- **Restrição de Custos**: Garantir que `products.cost_cents` não seja visível para roles de nível inferior (waiter/cashier) via RLS ou filtragem na UI.
- **Documentação SECURITY DEFINER**: Justificar formalmente o uso em todas as funções para auditoria de segurança.
