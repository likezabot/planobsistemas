import { useState } from "react";
import { useRestaurant } from "@/lib/auth/RestaurantProvider";
import { getPrintJobs, reprintOrder, PrintJob } from "@/lib/printing/queries";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AppShell } from "@/components/AppShell";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { 
  Loader2, 
  Printer, 
  AlertCircle,
  CheckCircle2,
  Clock,
  RefreshCw
} from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";

export default function PrintControlPage() {
  const { currentRestaurantId, currentMembership } = useRestaurant();
  const queryClient = useQueryClient();
  const [selectedJob, setSelectedJob] = useState<PrintJob | null>(null);
  const [reprintReason, setReprintReason] = useState("");
  const [isReprintDialogOpen, setIsReprintDialogOpen] = useState(false);

  const canReprint = currentMembership?.role && ['owner', 'manager', 'cashier'].includes(currentMembership.role);

  const { data: jobs, isLoading } = useQuery({
    queryKey: ["print_jobs", currentRestaurantId],
    queryFn: () => getPrintJobs(currentRestaurantId!),
    enabled: !!currentRestaurantId,
    refetchInterval: 5000,
  });

  const reprintMutation = useMutation({
    mutationFn: ({ orderId, reason }: { orderId: string; reason: string }) =>
      reprintOrder(orderId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["print_jobs"] });
      toast.success("Novo job de impressão criado!");
      setIsReprintDialogOpen(false);
      setReprintReason("");
      setSelectedJob(null);
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao solicitar reimpressão");
    },
  });

  const handleReprintRequest = (job: PrintJob) => {
    setSelectedJob(job);
    setIsReprintDialogOpen(true);
  };

  const handleReprintConfirm = () => {
    if (!selectedJob) return;
    reprintMutation.mutate({ 
      orderId: selectedJob.order_id, 
      reason: reprintReason 
    });
  };

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-[50vh]">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      </AppShell>
    );
  }

  const StatusBadge = ({ status }: { status: string }) => {
    const configs: Record<string, { label: string; variant: "default" | "destructive" | "outline" | "secondary"; icon: any }> = {
      pending: { label: "Pendente", variant: "outline", icon: Clock },
      printing: { label: "Imprimindo", variant: "default", icon: Printer },
      printed: { label: "Impresso", variant: "secondary", icon: CheckCircle2 },
      failed: { label: "Falhou", variant: "destructive", icon: AlertCircle },
    };
    const config = configs[status] || { label: status, variant: "outline", icon: Clock };
    const Icon = config.icon;
    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon className="w-3 h-3" />
        {config.label}
      </Badge>
    );
  };

  const JobCard = ({ job }: { job: PrintJob }) => (
    <Card className="mb-4">
      <CardHeader className="p-4 flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-sm font-bold">
            Pedido #{job.order_id.slice(0, 5)}
          </CardTitle>
          <div className="flex gap-2 mt-1">
            <Badge variant="outline" className="text-[10px] uppercase h-5 bg-muted">
              {job.source}
            </Badge>
... keep existing code
            <span className="text-xs text-muted-foreground">
              {format(new Date(job.created_at), "HH:mm:ss '•' dd/MM", { locale: ptBR })}
            </span>
          </div>
        </div>
        <StatusBadge status={job.status} />
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <div className="grid grid-cols-2 gap-2 text-sm mb-3">
          <div className="text-muted-foreground">Tentativas: <span className="text-foreground">{job.attempts}</span></div>
          <div className="text-muted-foreground">Agente: <span className="text-foreground">{job.agent_id || '-'}</span></div>
        </div>
        
        {job.last_error && (
          <div className="bg-destructive/10 p-2 rounded text-xs text-destructive mb-3 border border-destructive/20">
            <strong>Erro:</strong> {job.last_error}
          </div>
        )}

        <div className="flex justify-end">
          {canReprint && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => handleReprintRequest(job)}
              className="gap-2"
            >
              <RefreshCw className="w-3 h-3" />
              Reimprimir
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );

  const filteredJobs = (status: string) => {
    if (!jobs) return [];
    if (status === 'all') return jobs;
    if (status === 'active') return jobs.filter(j => ['pending', 'printing', 'failed'].includes(j.status));
    return jobs.filter(j => j.status === status);
  };

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Controle de Impressão</h1>
          <p className="text-sm text-muted-foreground">Monitoramento de jobs e fila local</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ["print_jobs"] })}>
          Atualizar
        </Button>
      </div>

      <Tabs defaultValue="active" className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-6">
          <TabsTrigger value="active">Ativos / Falhas</TabsTrigger>
          <TabsTrigger value="printed">Impressos</TabsTrigger>
          <TabsTrigger value="all">Todos</TabsTrigger>
        </TabsList>

        {["active", "printed", "all"].map((tab) => (
          <TabsContent key={tab} value={tab}>
            {filteredJobs(tab).length === 0 ? (
              <div className="text-center py-20 text-muted-foreground">
                <Printer className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p>Nenhum job de impressão encontrado</p>
              </div>
            ) : (
              <div className="grid gap-0">
                {filteredJobs(tab).map((job) => <JobCard key={job.id} job={job} />)}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      {/* Reprint Dialog */}
      <Dialog open={isReprintDialogOpen} onOpenChange={setIsReprintDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Solicitar Reimpressão</DialogTitle>
            <DialogDescription>
              Um novo job de impressão será criado para o pedido #{selectedJob?.order_id.slice(0, 5)}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Motivo da reimpressão</Label>
            <Textarea 
              placeholder="Ex: Impressora travou, papel acabou..." 
              value={reprintReason}
              onChange={(e) => setReprintReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsReprintDialogOpen(false)}>Voltar</Button>
            <Button 
              disabled={reprintReason.length < 3 || reprintMutation.isPending}
              onClick={handleReprintConfirm}
            >
              Confirmar Reimpressão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
