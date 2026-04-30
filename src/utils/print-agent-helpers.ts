import { supabase } from "@/integrations/supabase/client";

/**
 * Cria um agente de impressão e retorna os dados (incluindo a secret_key)
 * para a UI exibir com botão de copiar.
 *
 * IMPORTANTE: a secret_key NUNCA é gravada em console.log — ela só existe
 * em memória no momento da criação. Após exibida/copiada, recupere via
 * a tabela `print_agents` apenas com permissão adequada.
 */
export async function createTestAgent(restaurantId: string, name: string = "Agente Local Teste") {
  const { data, error } = await supabase
    .from('print_agents')
    .insert({
      restaurant_id: restaurantId,
      name: name
    })
    .select('id, restaurant_id, name, secret_key')
    .single();

  if (error) {
    return { ok: false as const, error: error.message };
  }

  return {
    ok: true as const,
    agent: {
      id: data.id,
      restaurant_id: data.restaurant_id,
      name: data.name,
      secret_key: data.secret_key,
    },
    envSnippet: `RESTAURANT_ID=${data.restaurant_id}\nAGENT_ID=${data.id}\nAGENT_SECRET=${data.secret_key}`,
  };
}
