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
  RefreshCw,
  Hash,
  Cpu,
  Monitor
} from "lucide-react";
import { PrintAgentSimulator } from "@/components/printing/PrintAgentSimulator";
import { PrintAgentManager } from "@/components/printing/PrintAgentManager";
import { cn } from "@/lib/utils";

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
        <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
          <div className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          <p className="text-muted-foreground font-medium animate-pulse">Carregando fila de impressão...</p>
        </div>
      </AppShell>
    );
  }

  const filteredJobs = (status: string) => {
    if (!jobs) return [];
    if (status === 'all') return jobs;
    if (status === 'active') return jobs.filter(j => ['pending', 'printing', 'failed'].includes(j.status));
    return jobs.filter(j => j.status === status);
  };

  return (
    <AppShell>
      <div className="flex flex-col gap-8">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-secondary">Controle de Impressão</h1>
            <p className="text-muted-foreground font-medium mt-1">Gerencie a fila de impressão e os agentes locais.</p>
          </div>
          <Button 
            variant="outline" 
            className="rounded-xl h-12 border-border hover:bg-muted"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["print_jobs"] })}
          >
            <RefreshCw className={cn("w-4 h-4 mr-2", isLoading && "animate-spin")} />
            Sincronizar
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Print Jobs List */}
          <div className="lg:col-span-2 space-y-6">
            <Tabs defaultValue="active" className="w-full">
              <TabsList className="flex w-full mb-6 bg-muted/50 p-1.5 rounded-2xl h-14">
                <TabsTrigger value="active" className="flex-1 rounded-xl font-bold data-[state=active]:bg-white data-[state=active]:shadow-sm">Ativos / Falhas</TabsTrigger>
                <TabsTrigger value="printed" className="flex-1 rounded-xl font-bold data-[state=active]:bg-white data-[state=active]:shadow-sm">Concluídos</TabsTrigger>
                <TabsTrigger value="all" className="flex-1 rounded-xl font-bold data-[state=active]:bg-white data-[state=active]:shadow-sm">Todos</TabsTrigger>
              </TabsList>

              {["active", "printed", "all"].map((tab) => (
                <TabsContent key={tab} value={tab} className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                  {filteredJobs(tab).length === 0 ? (
                    <div className="text-center py-32 bg-card rounded-[2.5rem] border border-dashed border-border shadow-sm">
                      <Printer className="w-16 h-16 mx-auto mb-4 opacity-10 text-secondary" />
                      <p className="text-muted-foreground font-medium">Nenhum job de impressão encontrado.</p>
                    </div>
                  ) : (
                    <div className="grid gap-4">
                      {filteredJobs(tab).map((job) => (
                        <JobCard key={job.id} job={job} canReprint={!!canReprint} onReprint={handleReprintRequest} />
                      ))}
                    </div>
                  )}
                </TabsContent>
              ))}
            </Tabs>
          </div>

          {/* Agents Sidebar */}
          <div className="lg:col-span-1 space-y-8">
            {currentRestaurantId && (
              <>
                <div className="bg-card rounded-[2rem] shadow-card border border-border p-2">
                  <PrintAgentManager restaurantId={currentRestaurantId} />
                </div>
                <div className="bg-muted/30 rounded-[2rem] border border-border p-2">
                  <PrintAgentSimulator restaurantId={currentRestaurantId} />
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Reprint Dialog */}
      <Dialog open={isReprintDialogOpen} onOpenChange={setIsReprintDialogOpen}>
        <DialogContent className="rounded-[2.5rem] p-0 overflow-hidden border-none shadow-premium max-w-md">
          <DialogHeader className="p-8 bg-secondary text-white">
            <DialogTitle className="text-2xl font-display font-bold">Solicitar Reimpressão</DialogTitle>
            <DialogDescription className="text-white/60">
              Um novo job de impressão será criado para o pedido #{selectedJob?.order_id.slice(0, 5)}.
            </DialogDescription>
          </DialogHeader>
          <div className="p-8 space-y-4">
            <Label className="font-bold text-secondary">Motivo da Reimpressão</Label>
            <Textarea 
              placeholder="Ex: Impressora falhou, papel acabou..." 
              className="rounded-2xl border-border focus:ring-primary min-h-[100px] bg-card"
              value={reprintReason}
              onChange={(e) => setReprintReason(e.target.value)}
            />
          </div>
          <DialogFooter className="p-8 bg-muted/50 border-t border-border gap-2">
            <Button variant="ghost" className="rounded-xl font-bold" onClick={() => setIsReprintDialogOpen(false)}>Voltar</Button>
            <Button 
              className="rounded-xl h-12 px-8 font-bold shadow-premium"
              disabled={reprintReason.length < 3 || reprintMutation.isPending}
              onClick={handleReprintConfirm}
            >
              {reprintMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function JobCard({ job, canReprint, onReprint }: { job: PrintJob, canReprint: boolean, onReprint: (job: PrintJob) => void }) {
  return (
    <Card className="rounded-2xl border-border hover:border-primary/20 shadow-card hover:shadow-premium transition-all overflow-hidden bg-card group">
      <CardContent className="p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={cn(
              "w-12 h-12 rounded-xl flex items-center justify-center text-white shadow-sm",
              job.status === 'printed' ? 'bg-success' : job.status === 'failed' ? 'bg-destructive' : 'bg-primary'
            )}>
              <Printer className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                  <Hash className="w-3 h-3" />
                  {job.order_id.slice(0, 5)}
                </span>
                <Badge variant="outline" className="text-[9px] uppercase tracking-tighter h-4 bg-muted border-none">
                  {job.source}
                </Badge>
              </div>
              <h3 className="font-bold text-secondary group-hover:text-primary transition-colors">Job de Impressão</h3>
              <p className="text-xs text-muted-foreground mt-1">
                {format(new Date(job.created_at), "HH:mm:ss '•' dd/MM", { locale: ptBR })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex flex-col items-end gap-1">
              <StatusBadge status={job.status} />
              {job.agent_id && (
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-medium">
                  <Monitor className="w-3 h-3" />
                  Agent: {job.agent_id.slice(0, 8)}
                </div>
              )}
            </div>
            {canReprint && job.status !== 'pending' && job.status !== 'printing' && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="rounded-xl hover:bg-primary/10 hover:text-primary transition-all"
                onClick={() => onReprint(job)}
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
        
        {job.last_error && (
          <div className="mt-4 p-3 bg-destructive/5 text-destructive rounded-xl text-xs flex gap-2 border border-destructive/10">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <p><strong>Erro:</strong> {job.last_error}</p>
          </div>
        )}

        <div className="mt-4 flex items-center gap-6 pt-4 border-t border-dashed border-border text-[10px] uppercase font-bold text-muted-foreground tracking-widest">
          <div className="flex items-center gap-1.5">
            <RefreshCw className="w-3 h-3" />
            Tentativas: {job.attempts}
          </div>
          <div className="flex items-center gap-1.5">
            <Cpu className="w-3 h-3" />
            V: {job.fingerprint ? 'Sim' : 'Não'}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const configs: Record<string, { label: string; className: string; icon: any }> = {
    pending: { label: "Pendente", className: "bg-muted text-muted-foreground border-border", icon: Clock },
    printing: { label: "Imprimindo", className: "bg-primary/10 text-primary border-primary/20", icon: Loader2 },
    printed: { label: "Impresso", className: "bg-success/10 text-success border-success/20", icon: CheckCircle2 },
    failed: { label: "Falhou", className: "bg-destructive/10 text-destructive border-destructive/20", icon: AlertCircle },
  };
  const config = configs[status] || { label: status, className: "bg-muted text-muted-foreground", icon: Clock };
  const Icon = config.icon;
  
  return (
    <Badge variant="outline" className={cn("rounded-lg px-2 py-0.5 font-bold uppercase text-[9px] tracking-widest flex items-center gap-1.5", config.className)}>
      <Icon className={cn("w-3 h-3", status === 'printing' && "animate-spin")} />
      {config.label}
    </Badge>
  );
}