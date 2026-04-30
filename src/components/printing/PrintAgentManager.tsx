import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getPrintAgents, createPrintAgent, deletePrintAgent, PrintAgent } from "@/lib/printing/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Laptop,
  Plus,
  Trash2,
  Key,
  Copy,
  Clock,
  AlertTriangle,
  Eye,
  EyeOff,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

type CreatedAgentReveal = {
  id: string;
  restaurant_id: string;
  name: string;
  secret_key: string;
};

export function PrintAgentManager({ restaurantId }: { restaurantId: string }) {
  const queryClient = useQueryClient();
  const [newAgentName, setNewAgentName] = useState("");
  const [revealedAgent, setRevealedAgent] = useState<CreatedAgentReveal | null>(null);
  const [showSecret, setShowSecret] = useState(false);

  const { data: agents, isLoading } = useQuery({
    queryKey: ["print_agents", restaurantId],
    queryFn: () => getPrintAgents(restaurantId),
    enabled: !!restaurantId,
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => createPrintAgent(restaurantId, name),
    onSuccess: (agent: PrintAgent) => {
      queryClient.invalidateQueries({ queryKey: ["print_agents"] });
      setNewAgentName("");
      // Captura secret_key UMA ÚNICA VEZ em memória para exibir no modal.
      // NÃO logar, NÃO persistir fora deste estado local.
      setRevealedAgent({
        id: agent.id,
        restaurant_id: agent.restaurant_id,
        name: agent.name,
        secret_key: agent.secret_key,
      });
      setShowSecret(false);
      toast.success("Agente criado! Copie a chave secreta agora.");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao criar agente");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deletePrintAgent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["print_agents"] });
      toast.success("Agente removido");
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAgentName.trim()) return;
    createMutation.mutate(newAgentName);
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copiado!`);
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };

  const closeRevealModal = () => {
    // Limpa o secret da memória ao fechar.
    setRevealedAgent(null);
    setShowSecret(false);
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
                  <Badge
                    variant={agent.status === "active" ? "default" : "secondary"}
                    className="h-2 w-2 rounded-full p-0"
                  />
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
                    ? `Visto ${formatDistanceToNow(new Date(agent.last_seen_at), {
                        addSuffix: true,
                        locale: ptBR,
                      })}`
                    : "Nunca visto"}
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
                  <Copy className="w-3 h-3" /> Copiar ID
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-amber-50 border border-amber-200 p-2 rounded text-[10px] text-amber-900">
          <p className="font-bold mb-1 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Chave secreta
          </p>
          <p>
            A <strong>secret key</strong> é exibida <strong>uma única vez</strong> no momento da criação.
            Se você perder, exclua o agente e crie outro.
          </p>
        </div>
      </CardContent>

      {/* Modal de revelação one-time da secret_key */}
      <Dialog open={!!revealedAgent} onOpenChange={(open) => !open && closeRevealModal()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="w-4 h-4" />
              Credenciais do agente "{revealedAgent?.name}"
            </DialogTitle>
            <DialogDescription className="text-destructive font-medium">
              Salve estas informações agora. A chave secreta não será exibida novamente.
            </DialogDescription>
          </DialogHeader>

          {revealedAgent && (
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider">AGENT_ID</Label>
                <div className="flex gap-2">
                  <Input readOnly value={revealedAgent.id} className="font-mono text-xs" />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(revealedAgent.id, "AGENT_ID")}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider">AGENT_SECRET</Label>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    type={showSecret ? "text" : "password"}
                    value={revealedAgent.secret_key}
                    className="font-mono text-xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setShowSecret((v) => !v)}
                    aria-label={showSecret ? "Ocultar chave" : "Mostrar chave"}
                  >
                    {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(revealedAgent.secret_key, "AGENT_SECRET")}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider">RESTAURANT_ID</Label>
                <div className="flex gap-2">
                  <Input readOnly value={revealedAgent.restaurant_id} className="font-mono text-xs" />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(revealedAgent.restaurant_id, "RESTAURANT_ID")}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div className="bg-muted p-2 rounded border text-[10px] text-muted-foreground">
                <p className="font-bold mb-1">Snippet para o arquivo .env do agente local:</p>
                <pre className="font-mono whitespace-pre-wrap break-all">
{`RESTAURANT_ID=${revealedAgent.restaurant_id}
AGENT_ID=${revealedAgent.id}
AGENT_SECRET=${showSecret ? revealedAgent.secret_key : "••••••••••••••••"}`}
                </pre>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-2 h-7 text-[10px] gap-1"
                  onClick={() =>
                    copyToClipboard(
                      `RESTAURANT_ID=${revealedAgent.restaurant_id}\nAGENT_ID=${revealedAgent.id}\nAGENT_SECRET=${revealedAgent.secret_key}`,
                      ".env completo"
                    )
                  }
                >
                  <Copy className="w-3 h-3" /> Copiar .env completo
                </Button>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button onClick={closeRevealModal}>Já salvei, fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
