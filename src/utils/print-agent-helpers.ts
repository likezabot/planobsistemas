import { supabase } from "@/integrations/supabase/client";

/**
 * Script utilitário para criar um agente de teste no banco de dados.
 * Use via console do navegador ou em uma página de admin.
 */
export async function createTestAgent(restaurantId: string, name: string = "Agente Local Teste") {
  const { data, error } = await supabase
    .from('print_agents')
    .insert({
      restaurant_id: restaurantId,
      name: name
    })
    .select('*')
    .single();

  if (error) {
    console.error("Erro ao criar agente:", error);
    return null;
  }

  console.log("=== AGENTE CRIADO COM SUCESSO ===");
  console.log("Copie estas informações para o seu arquivo .env na pasta print-agent:");
  console.log(`RESTAURANT_ID=${data.restaurant_id}`);
  console.log(`AGENT_ID=${data.id}`);
  console.log(`AGENT_SECRET=${data.secret_key}`);
  console.log("=================================");
  
  return data;
}
