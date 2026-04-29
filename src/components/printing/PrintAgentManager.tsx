import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getPrintAgents, createPrintAgent, deletePrintAgent, PrintAgent } from "@/lib/printing/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { 
  Laptop, 
  Plus, 
  Trash2, 
  Key, 
  Copy, 
  CheckCircle2, 
  XCircle,
  Clock
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export function PrintAgentManager({ restaurantId }: { restaurantId: string }) {
  const queryClient = useQueryClient();
  const [newAgentName, setNewAgentName] = useState("");
  const [showKey, setShowKey] = useState<string | null>(null);

  const { data: agents, isLoading } = useQuery({
    queryKey: ["print_agents", restaurantId],
    queryFn: () => getPrintAgents(restaurantId),
    enabled: !!restaurantId,
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => createPrintAgent(restaurantId, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["print_agents"] });
      setNewAgentName("");
      toast.success("Agente de impressão criado!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao criar agente");
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deletePrintAgent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["print_agents"] });
      toast.success("Agente removido");
    }
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAgentName.trim()) return;
    createMutation.mutate(newAgentName);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
  };

  if (isLoading) return <div>Carregando agentes...</div>;

  return (
    <Card>
      <CardHeader className="p-4 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
          <Laptop className="w-4 h-4" />
          Agentes Locais
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        <form onSubmit={handleCreate} className="flex gap-2">
          <Input 
            placeholder="Nome do PC/Agente" 
            value={newAgentName}
            onChange={(e) => setNewAgentName(e.target.value)}
            className="h-8 text-xs"
          />
          <Button size="sm" className="h-8" disabled={createMutation.isPending}>
            <Plus className="w-4 h-4" />
          </Button>
        </form>

        <div className="space-y-3">
          {agents?.length === 0 && (
            <p className="text-xs text-muted-foreground italic text-center py-4">
              Nenhum agente registrado
            </p>
          )}
          {agents?.map((agent) => (
            <div key={agent.id} className="border rounded-md p-3 space-y-2 relative group">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant={agent.status === 'active' ? 'default' : 'secondary'} className="h-2 w-2 rounded-full p-0" />
                  <span className="text-xs font-medium">{agent.name}</span>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => deleteMutation.mutate(agent.id)}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[10px] text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {agent.last_seen_at 
                    ? `Visto ${formatDistanceToNow(new Date(agent.last_seen_at), { addSuffix: true, locale: ptBR })}`
                    : 'Nunca visto'
                  }
                </div>
                <div className="flex items-center gap-1">
                  <Key className="w-3 h-3" />
                  ID: {agent.id.slice(0, 8)}...
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-7 text-[10px] flex-1 gap-1"
                  onClick={() => copyToClipboard(agent.id, "ID do Agente")}
                >
                  <Copy className="w-3 h-3" /> ID
                </Button>
                <Button 
                  variant={showKey === agent.id ? "secondary" : "outline"} 
                  size="sm" 
                  className="h-7 text-[10px] flex-1 gap-1"
                  onClick={() => setShowKey(showKey === agent.id ? null : agent.id)}
                >
                  <Key className="w-3 h-3" /> {showKey === agent.id ? "Esconder" : "Ver Key"}
                </Button>
              </div>

              {showKey === agent.id && (
                <div className="bg-muted p-2 rounded text-[10px] font-mono break-all flex items-center justify-between border">
                  <span>{agent.secret_key}</span>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-6 w-6 p-0"
                    onClick={() => copyToClipboard(agent.secret_key, "Secret Key")}
                  >
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
        
        <div className="bg-blue-50 border border-blue-100 p-2 rounded text-[10px] text-blue-800">
          <p className="font-bold mb-1 flex items-center gap-1">
            <Laptop className="w-3 h-3" /> Configuração do Agente Local
          </p>
          <p>Use o <strong>ID</strong> e a <strong>Secret Key</strong> no arquivo <code>.env</code> do seu agente local (Node/CLI).</p>
        </div>
      </CardContent>
    </Card>
  );
}
