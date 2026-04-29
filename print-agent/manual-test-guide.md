# Guia de Validação Manual do Agente de Impressão (CLI)

Este guia descreve os passos para validar a impressão física no Windows antes de gerar o executável (EXE).

## 1. Preparação da Impressora no Windows

A impressora deve estar compartilhada localmente para que o Node.js possa enviar bytes brutos para ela.

1.  Abra o **PowerShell** no Windows.
2.  Execute o comando para listar as impressoras e confirmar o nome exato:
    ```powershell
    Get-Printer | Select-Object Name, ShareName, PrinterStatus
    ```
3.  Garanta que a impressora está compartilhada (Propriedades da Impressora -> Compartilhamento -> Compartilhar esta impressora).
4.  Anote o **Nome** da impressora (ex: `POS-80`).

## 2. Configuração do Agente CLI

Navegue até a pasta `print-agent` e configure o arquivo `.env`:

```env
# Supabase (Copie do app principal)
SUPABASE_URL=https://hyrpwrtomwotxjiquyxv.supabase.co
SUPABASE_ANON_KEY=seu_anon_key

# Restaurante e Agente (Crie na tela /impressao do sistema)
RESTAURANT_ID=id_do_restaurante
AGENT_ID=id_do_agente
AGENT_SECRET=secret_key_gerado

# Configurações de Impressão
MODE=spooler_powershell
PRINTER_NAME=NOME_EXATO_DA_IMPRESSORA
POLLING_INTERVAL=5000
```

## 3. Rodando o Teste

### Passo 3.1: Validação de Inicialização
Execute:
```bash
npm install
npm start
```
**Resultado esperado:**
- O log deve mostrar: `Checking if printer "NOME" is available...`
- Se o nome estiver errado, o agente deve parar com erro `CRITICAL`.
- Se estiver certo, deve mostrar `Printer "NOME" validated` e iniciar o polling.

### Passo 3.2: Fluxo de Pedido Real
1.  Vá ao Checkout do sistema e crie um pedido.
2.  No Dashboard do restaurante, mude o status do pedido para **Preparing**.
3.  Observe os logs do Agente CLI.

**Checklist de Sucesso:**
- [ ] O agente logou `Found pending job...`.
- [ ] O agente logou `Successfully claimed job...`.
- [ ] A impressora física imprimiu o papel.
- [ ] O agente logou `Job marked as printed successfully`.
- [ ] No banco de dados, o `print_job` mudou para `printed`.
- [ ] No banco de dados, o pedido (`order`) mudou `print_status` para `printed`.

### Passo 3.3: Validação de Conteúdo (Complexo)
Crie um pedido com:
- Pizza 2 sabores (ex: Marguerita / Calabresa).
- Adicionais (ex: +Bacon).
- Observação (ex: "Sem cebola").

**Verifique no papel:**
- [ ] Sabores estão listados.
- [ ] Adicionais estão listados.
- [ ] Observação aparece em destaque.
- [ ] Fingerprint (ID do pedido/Timestamp) aparece no final.

### Passo 3.4: Teste de Falha Controlada
1.  Pare o agente (`Ctrl+C`).
2.  No `.env`, mude o `PRINTER_NAME` para um nome inexistente.
3.  Inicie o agente (`npm start`).

**Resultado esperado:**
- O agente deve logar um erro e **não deve capturar** nenhum job do banco de dados (o processo deve encerrar ou não iniciar o polling).

---

## 4. Troubleshooting
- **Erro de Acesso Negado (PowerShell):** Verifique se o terminal tem permissões suficientes ou se a impressora está compartilhada.
- **Job não aparece:** Verifique se o `RESTAURANT_ID` no `.env` é o mesmo do pedido e se o Agente está `active` no sistema.
- **Duplicidade:** O sistema possui trava por `payload_hash`, impedindo a criação de jobs idênticos para o mesmo pedido em status pending.
