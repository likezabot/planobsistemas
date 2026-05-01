import { useState } from "react";
import { useRestaurant } from "@/lib/auth/RestaurantProvider";
import { getPrintJobs, reprintOrder, PrintJob } from "@/lib/printing/queries";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
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
  const canResetStuck = currentMembership?.role === 'owner' || currentMembership?.role === 'manager';

  const resetStuckMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('reset_stuck_print_jobs', {
        p_restaurant_id: currentRestaurantId!,
        p_stuck_minutes: 5,
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["print_jobs"] });
      if (count > 0) toast.success(`${count} job(s) travado(s) liberados.`);
      else toast.info("Nenhum job travado encontrado.");
    },
    onError: (err: any) => toast.error(err.message || "Falha ao liberar jobs travados."),
  });

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
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
          <p className="text-muted-foreground font-medium animate-pulse">Carregando fila de impressão...</p>
        </div>
      </AppShell>
    );
  }

  const filteredJobs = (status: string) => {
    if (!jobs) return [];
    if (status === 'active') return jobs.filter(j => ['pending', 'printing', 'failed'].includes(j.status));
    if (status === 'printed') return jobs.filter(j => j.status === 'printed');
    return jobs;
  };

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-secondary">Controle de Impressão</h1>
            <p className="text-muted-foreground text-sm mt-1">Gerencie a fila de impressão e os agentes locais.</p>
          </div>
          <div className="flex gap-2">
            {canResetStuck && (
              <Button
                variant="outline"
                size="sm"
                className="rounded-lg h-9 border-border"
                onClick={() => resetStuckMutation.mutate()}
                disabled={resetStuckMutation.isPending}
                title="Devolve para 'pendente' jobs presos em 'imprimindo' há mais de 5 minutos (agente caiu)"
              >
                {resetStuckMutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5 mr-2" />
                )}
                Liberar travados
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="rounded-lg h-9 border-border"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["print_jobs"] })}
            >
              <RefreshCw className={cn("w-3.5 h-3.5 mr-2", isLoading && "animate-spin")} />
              Sincronizar
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <Tabs defaultValue="active" className="w-full">
              <TabsList className="grid grid-cols-3 w-full bg-white border border-border p-1 rounded-xl h-12 mb-6">
                <TabsTrigger value="active" className="rounded-lg font-bold text-xs data-[state=active]:bg-muted">Ativos / Falhas</TabsTrigger>
                <TabsTrigger value="printed" className="rounded-lg font-bold text-xs data-[state=active]:bg-muted">Concluídos</TabsTrigger>
                <TabsTrigger value="all" className="rounded-lg font-bold text-xs data-[state=active]:bg-muted">Histórico</TabsTrigger>
              </TabsList>

              {["active", "printed", "all"].map((tab) => (
                <TabsContent key={tab} value={tab} className="animate-in fade-in duration-300">
                  {filteredJobs(tab).length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center bg-white rounded-xl border border-border">
                      <Printer className="w-12 h-12 text-muted-foreground/30 mb-4" />
                      <p className="text-base font-bold text-secondary"> Nenhum job ainda </p>
                      <p className="text-sm text-muted-foreground mt-1 mb-6"> A fila de impressão aparecerá aqui conforme novos pedidos forem realizados. </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {filteredJobs(tab).map((job) => (
                        <JobCard key={job.id} job={job} canReprint={!!canReprint} onReprint={handleReprintRequest} />
                      ))}
                    </div>
                  )}
                </TabsContent>
              ))}
            </Tabs>
          </div>

          <div className="lg:col-span-1 space-y-6">
            {currentRestaurantId && (
              <>
                <div className="bg-white rounded-xl border border-border p-4 shadow-sm">
                  <PrintAgentManager restaurantId={currentRestaurantId} />
                </div>
                <div className="bg-muted/30 rounded-xl border border-border p-4">
                  <PrintAgentSimulator restaurantId={currentRestaurantId} />
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <Dialog open={isReprintDialogOpen} onOpenChange={setIsReprintDialogOpen}>
        <DialogContent className="max-w-md rounded-xl p-6 overflow-hidden border-none shadow-2xl">
          <DialogHeader className="mb-4">
            <DialogTitle className="text-xl font-bold">Solicitar Reimpressão</DialogTitle>
            <DialogDescription className="text-sm">
              Um novo job de impressão será criado para o pedido #{selectedJob?.order_id.slice(0, 5)}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label className="text-xs font-bold uppercase tracking-wider text-secondary">Motivo</Label>
            <Textarea 
              placeholder="Ex: Falha na impressora, papel acabou..." 
              className="rounded-lg border-border focus:ring-primary min-h-[100px]"
              value={reprintReason}
              onChange={(e) => setReprintReason(e.target.value)}
            />
          </div>
          <DialogFooter className="mt-6 gap-2">
            <Button variant="ghost" className="rounded-lg font-bold" onClick={() => setIsReprintDialogOpen(false)}>Voltar</Button>
            <Button 
              className="rounded-lg h-10 px-6 font-bold shadow-sm"
              disabled={reprintReason.length < 3 || reprintMutation.isPending}
              onClick={handleReprintConfirm}
            >
              {reprintMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> : <RefreshCw className="w-3.5 h-3.5 mr-2" />}
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
    <Card className="rounded-xl border-border bg-white shadow-sm hover:shadow-md transition-shadow overflow-hidden group">
      <CardContent className="p-4 flex flex-col gap-4">
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-9 h-9 rounded-lg flex items-center justify-center text-white shadow-sm",
              job.status === 'printed' ? 'bg-success' : job.status === 'failed' ? 'bg-destructive' : 'bg-primary'
            )}>
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                  <Hash className="w-2.5 h-2.5" />
                  {job.order_id.slice(0, 5)}
                </span>
                <Badge variant="outline" className="text-[8px] uppercase tracking-tighter h-3.5 bg-muted border-none px-1.5">
                  {job.source}
                </Badge>
              </div>
              <h3 className="font-bold text-secondary text-xs truncate">Job #{job.id.slice(0, 4)}</h3>
            </div>
          </div>
          <StatusBadge status={job.status} />
        </div>

        <div className="flex items-center justify-between text-[10px] text-muted-foreground font-bold uppercase tracking-wider">
          <div className="flex items-center gap-1.5">
            <Clock className="w-3 h-3" />
            {format(new Date(job.created_at), "HH:mm:ss '•' dd/MM", { locale: ptBR })}
          </div>
          {job.agent_id && (
            <div className="flex items-center gap-1">
              <Monitor className="w-3 h-3" />
              {job.agent_id.slice(0, 8)}
            </div>
          )}
        </div>
        
        {job.last_error && (
          <div className="p-2 bg-destructive/5 text-destructive rounded-lg text-[10px] flex gap-1.5 border border-destructive/10 font-medium leading-tight">
            <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
            <p className="line-clamp-2"><strong>Erro:</strong> {job.last_error}</p>
          </div>
        )}

        <div className="pt-3 border-t border-dashed border-border flex justify-between items-center">
          <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1">
            <RefreshCw className="w-2.5 h-2.5" />
            Tentativas: {job.attempts}
          </span>
          {canReprint && job.status !== 'pending' && job.status !== 'printing' && (
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-7 w-7 rounded-lg hover:bg-primary/10 hover:text-primary transition-colors"
              onClick={() => onReprint(job)}
            >
              <RefreshCw className="w-3 h-3" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const configs: Record<string, { label: string; className: string; icon: any }> = {
    pending: { label: "Pendente", className: "bg-muted text-muted-foreground", icon: Clock },
    printing: { label: "Imprimindo", className: "bg-primary text-white", icon: Loader2 },
    printed: { label: "Impresso", className: "bg-success text-white", icon: CheckCircle2 },
    failed: { label: "Falhou", className: "bg-destructive text-white", icon: AlertCircle },
  };
  const config = configs[status] || { label: status, className: "bg-muted text-muted-foreground", icon: Clock };
  const Icon = config.icon;
  
  return (
    <Badge variant="outline" className={cn("rounded-md px-1.5 py-0.5 font-bold uppercase text-[8px] tracking-widest border-none shadow-sm flex items-center gap-1", config.className)}>
      <Icon className={cn("w-2.5 h-2.5", status === 'printing' && "animate-spin")} />
      {config.label}
    </Badge>
  );
}
