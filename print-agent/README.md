# Lovable Print Agent (Dev Mode)

Este é o agente local de impressão. Ele consome `print_jobs` do Supabase e envia para a impressora local.

## Pré-requisitos
- Node.js instalado.
- Acesso à internet para conectar ao Supabase.

## Configuração
1. Entre na pasta `print-agent`.
2. Copie `.env.example` para `.env`.
3. Preencha as variáveis:
   - `SUPABASE_URL`: URL do seu projeto Supabase.
   - `SUPABASE_ANON_KEY`: Anon Key do seu projeto.
   - `RESTAURANT_ID`: ID do restaurante que este agente vai atender.
   - `AGENT_ID`: UUID do agente (criado no banco de dados).
   - `AGENT_SECRET`: Secret Key do agente (gerada no banco de dados).
   - `MODE`: `dry_run` (apenas logs) ou `spooler_powershell` (impressão física via Windows).
   - `PRINTER_NAME`: Nome exato da impressora no Windows (necessário se MODE=spooler_powershell).

## Como Rodar
```bash
cd print-agent
npm install
npm start
```

## Regras de Funcionamento
- **Segurança**: Usa RPCs com validação de `agent_id` e `secret_key`. Não usa `service_role`.
- **Limitação**: Processa apenas 1 job por vez.
- **Prevenção de Backlog**: Ao iniciar, o agente captura apenas jobs criados **após** o seu horário de início (`started_at`).
- **Logs**: Registra tudo em `agent.log` e no console.
- **Fail-safe**: Se houver erro na impressão, marca o job como `failed` no banco com a mensagem de erro.

## Validação de Impressão Física
Antes de gerar o EXE, siga o [Guia de Validação Manual](./manual-test-guide.md).
