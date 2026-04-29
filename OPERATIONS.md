# OPERATIONS — Backup, restauração e fluxos de incidente

> Procedimentos mínimos para o piloto comercial. Não substitui um plano de
> DR completo, mas cobre os 80% de casos reais do dia-a-dia.

---

## 1. Tabelas críticas (perda = perda de dinheiro)

| Prioridade | Tabela | O que armazena |
|---|---|---|
| 🔴 Alta | `tenants`, `restaurants`, `restaurant_members` | identidade do cliente e quem acessa |
| 🔴 Alta | `products`, `product_variants`, `pizza_flavors`, `option_groups`, `option_items`, `pizza_configs`, `product_pizza_flavors`, `product_option_groups`, `option_item_price_overrides`, `pizza_flavor_prices`, `product_categories` | catálogo |
| 🔴 Alta | `orders`, `order_items` | pedidos = receita |
| 🟡 Média | `inventory_logs` | histórico de estoque (quando ativado) |
| 🟡 Média | `audit_log` | trilha de mudanças sensíveis |
| 🟢 Baixa | `print_jobs`, `print_agents`, `public_order_attempts` | operacional, regenerável |

---

## 2. Backup automático

Lovable Cloud (Supabase) já faz backup diário automático e mantém por 7 dias
no plano padrão. Você não precisa configurar nada.

**Frequência recomendada para o piloto:**
- Backup automático diário: ✅ já ativo
- Export manual semanal do catálogo: recomendado (ver §3)
- Export manual mensal do relatório Contador: recomendado (ver §4)

---

## 3. Exportar catálogo (JSON)

Use a aba **Catálogo → Importar/Exportar → Exportar**.
Arquivo gerado contém: categorias, produtos, variações, sabores, grupos de
opções, opções, configurações de pizza e overrides de preço por variação.

Esse JSON serve para:
- **Backup de configuração** antes de mudanças grandes
- **Replicar catálogo** para um novo restaurante (mesma rede)
- **Restaurar** itens deletados por engano

Recomendação: exportar **toda segunda-feira** e guardar fora do sistema
(Drive, e-mail, etc.).

---

## 4. Exportar relatório Contador (CSV/JSON)

Apenas se o módulo Contador estiver ativado (owner/manager liga em
`/contador`).

1. Acesse `/contador`
2. Escolha o período (recomendado: mês fechado)
3. Clique em **Exportar CSV** ou **Exportar JSON**
4. Envie ao contador

**Limitações importantes** (já comunicadas ao usuário na tela):
- Não substitui NFC-e, SAT ou nota fiscal eletrônica
- É um relatório **interno**, sem valor fiscal oficial
- Phones de cliente só aparecem para owner/manager (LGPD)

---

## 5. Recuperação de erros comuns

### 5.1 Cliente apagou produto/categoria por engano

> Hoje produtos e categorias **não permitem DELETE pelo app** (RLS bloqueia).
> Eles só podem ser **desativados** (`active = false`).

Se um produto foi desativado por engano:
1. Vá em **Catálogo → Produtos**
2. Filtre por "Inativos"
3. Reative

Se algo realmente sumiu (foi deletado direto no banco em incidente):
1. Pegue o último export JSON do catálogo (ver §3)
2. Importe pela aba **Importar/Exportar → Importar**
3. O importador faz upsert por `code` (mantém o que já existe)

### 5.2 Pedido criado errado / total errado

Pedidos **não podem ser editados após criação**. Use a tela de pedidos para:
- **Cancelar** com motivo (gera audit_log)
- Criar um novo pedido corrigido

### 5.3 Agente de impressão caiu / job preso

Sintomas: job aparece como "imprimindo" há vários minutos e nada saiu.

1. Tente reiniciar o EXE local primeiro.
2. Se o status não voltar para "pendente" sozinho, entre em `/impressao`
   e clique em **Liberar travados** (visível só para owner/manager).
   Isso devolve para `pending` jobs travados há > 5 min.
3. Quando o agente voltar, ele puxa o job sozinho.
4. Se ainda assim não imprimir, use **Reimprimir** no card do pedido
   (gera novo job com motivo registrado).

> Veja §6 para garantias do fluxo de impressão.

### 5.4 Cliente duplicou pedido (clique duplo)

A RPC `create_public_order` é idempotente por `idempotency_key`.
Cliques duplos no mesmo botão retornam **o mesmo pedido**, sem duplicar.

Se o cliente realmente fez 2 pedidos via 2 ações diferentes, cancele um
deles na tela de pedidos.

### 5.5 Cliente está sendo bloqueado por rate-limit

Mensagem que ele vê: "Muitas tentativas. Aguarde alguns minutos e tente
novamente."

- Limite atual: **8 tentativas distintas em 5 min**, por restaurante +
  telefone normalizado.
- Idempotência (clique duplo) **não consome tentativa**.
- Owner/manager pode consultar `public_order_attempts` para auditoria.
- A janela passa sozinha em 5 min — não há "desbloquear manualmente".

---

## 6. Garantias do fluxo de impressão (sem multi-impressoras)

Validadas por testes E2E em `src/test/print-jobs.e2e.test.ts` e
`src/test/print-recovery.e2e.test.ts`:

- ✅ Pedido novo gera 1 job `pending` automaticamente.
- ✅ Se o agente está offline, o job **fica `pending`** indefinidamente
  (não há timeout de auto-cancel).
- ✅ Quando o agente liga, ele reclama o job (`claim_print_job`),
  imprime e marca `printed`.
- ✅ Se o agente cair durante a impressão, o job fica em `printing`
  e pode ser liberado via **Liberar travados** (`reset_stuck_print_jobs`).
- ✅ Reimpressão manual exige role `cashier`/`manager`/`owner` e motivo.
- ✅ Job `printed` é imutável (não pode ser reclamado de novo).
- ✅ Job duplicado (mesmo `order_id` + mesmo hash de payload) é
  bloqueado por unique index — sem loop de impressão.
- ✅ Pedido `cancelled` não gera job automático.

---

## 7. O que NÃO está coberto (consciente)

- DR cross-region: depende do plano da Lovable Cloud.
- Restauração ponto-a-ponto granular (PITR): disponível nos planos pagos
  da Lovable Cloud, não automatizado nesta app.
- Multi-impressoras (cozinha/bar/balcão): adiado para fase futura
  (ver `ROADMAP.md`).
- Emissão fiscal real (NFC-e/SAT/SEFAZ): adiado (ver `ROADMAP.md`).
