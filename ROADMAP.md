# ROADMAP — Pendências futuras (não implementar agora)

> Este arquivo registra escopo **adiado conscientemente**. Nada aqui deve ser
> implementado sem aprovação explícita do dono do produto.

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
