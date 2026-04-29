import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { 
  Play, 
  Pause, 
  Trash2, 
  AlertTriangle, 
  CheckCircle, 
  Settings2,
  Activity,
  Zap
} from "lucide-react";
import { claimPrintJob, completePrintJob, failPrintJob, PrintJob, getPrintAgents, PrintAgent } from "@/lib/printing/queries";
import { format } from "date-fns";
import { toast } from "sonner";

interface LogEntry {
  id: string;
  timestamp: Date;
  jobId?: string;
  orderId?: string;
  action: string;
  result: "success" | "error" | "info";
  details?: string;
}

interface SimulatorMetrics {
  processed: number;
  successes: number;
  failures: number;
  lastError?: string;
  totalTime: number;
}

export function PrintAgentSimulator({ restaurantId }: { restaurantId: string }) {
  const [isRunning, setIsRunning] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [simulateNextFail, setSimulateNextFail] = useState(false);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [metrics, setMetrics] = useState<SimulatorMetrics>({
    processed: 0,
    successes: 0,
    failures: 0,
    totalTime: 0,
  });

  const agentId = "Simulador-Navegador-" + restaurantId.slice(0, 4);
  const processingRef = useRef(false);

  const addLog = (log: Omit<LogEntry, "id" | "timestamp">) => {
    setLogs(prev => [
      {
        ...log,
        id: Math.random().toString(36).substring(7),
        timestamp: new Date(),
      },
      ...prev.slice(0, 49), // Keep last 50
    ]);
  };

  const processJob = async (job: PrintJob) => {
    if (processingRef.current) return;
    processingRef.current = true;
    setIsProcessing(true);
    const start = Date.now();

    try {
      addLog({
        jobId: job.id,
        orderId: job.order_id,
        action: "Capturando job",
        result: "info",
        details: `Status: ${job.status} -> printing`
      });

      // 1. Claim
      const claimed = await claimPrintJob(job.id, agentId);
      if (!claimed) {
        throw new Error("Não foi possível capturar o job (já capturado ou cancelado)");
      }

      // 2. Simulação de tempo de impressão (1.5s)
      await new Promise(resolve => setTimeout(resolve, 1500));

      // 3. Sucesso ou Falha
      if (simulateNextFail) {
        setSimulateNextFail(false);
        await failPrintJob(job.id, agentId, "Simulação de falha manual do usuário");
        addLog({
          jobId: job.id,
          orderId: job.order_id,
          action: "Falha simulada",
          result: "error",
          details: "Status alterado para failed"
        });
        setMetrics(m => ({
          ...m,
          processed: m.processed + 1,
          failures: m.failures + 1,
          lastError: "Simulação de falha",
          totalTime: m.totalTime + (Date.now() - start)
        }));
      } else {
        await completePrintJob(job.id, agentId);
        addLog({
          jobId: job.id,
          orderId: job.order_id,
          action: "Impressão concluída",
          result: "success",
          details: "Status alterado para printed"
        });
        setMetrics(m => ({
          ...m,
          processed: m.processed + 1,
          successes: m.successes + 1,
          totalTime: m.totalTime + (Date.now() - start)
        }));
      }
    } catch (error: any) {
      addLog({
        jobId: job.id,
        orderId: job.order_id,
        action: "Erro no processamento",
        result: "error",
        details: error.message
      });
      setMetrics(m => ({
        ...m,
        processed: m.processed + 1,
        failures: m.failures + 1,
        lastError: error.message,
        totalTime: m.totalTime + (Date.now() - start)
      }));
    } finally {
      processingRef.current = false;
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    if (!isRunning || !restaurantId) return;

    const interval = setInterval(async () => {
      if (processingRef.current) return;

      try {
        const { data: jobs, error } = await supabase
          .from("print_jobs")
          .select("*")
          .eq("restaurant_id", restaurantId)
          .eq("status", "pending")
          .gt("created_at", startTime?.toISOString())
          .order("created_at", { ascending: true })
          .limit(1);

        if (error) throw error;

        if (jobs && jobs.length > 0) {
          await processJob(jobs[0] as PrintJob);
        }
      } catch (error: any) {
        addLog({
          action: "Erro ao buscar jobs",
          result: "error",
          details: error.message
        });
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [isRunning, restaurantId, startTime, simulateNextFail]);

  const handleToggle = (checked: boolean) => {
    setIsRunning(checked);
    if (checked) {
      setStartTime(new Date());
      addLog({ action: "Simulador iniciado", result: "info", details: "Aguardando novos jobs..." });
    } else {
      addLog({ action: "Simulador pausado", result: "info" });
    }
  };

  const processBacklog = async () => {
    if (processingRef.current || isRunning) {
      toast.error("Pause o simulador automático antes de processar o backlog manual");
      return;
    }

    const confirm = window.confirm("Deseja processar todos os jobs pendentes anteriores? Isso pode gerar muitas impressões.");
    if (!confirm) return;

    try {
      const { data: jobs, error } = await supabase
        .from("print_jobs")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .eq("status", "pending")
        .order("created_at", { ascending: true });

      if (error) throw error;
      if (!jobs || jobs.length === 0) {
        toast.info("Nenhum job pendente no backlog");
        return;
      }

      toast.info(`Processando ${jobs.length} jobs do backlog...`);
      for (const job of jobs) {
        // We re-check running status inside loop just in case
        if (processingRef.current) {
           // wait a bit
           await new Promise(r => setTimeout(r, 2000));
        }
        await processJob(job as PrintJob);
      }
      toast.success("Backlog concluído");
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const avgTime = metrics.processed > 0 ? (metrics.totalTime / metrics.processed / 1000).toFixed(1) : "0";

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="p-4 pb-2 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className={`w-5 h-5 ${isRunning ? 'text-green-500 animate-pulse' : 'text-muted-foreground'}`} />
            <CardTitle className="text-sm font-bold uppercase tracking-wider">
              Simulador de Agente Local
            </CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="simulator-toggle" className="text-xs font-medium">
              {isRunning ? "Ativo" : "Inativo"}
            </Label>
            <Switch 
              id="simulator-toggle" 
              checked={isRunning} 
              onCheckedChange={handleToggle}
            />
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="p-4 space-y-4">
        {/* Metrics */}
        <div className="grid grid-cols-4 gap-2 text-center">
          <div className="bg-background rounded p-2 border">
            <div className="text-[10px] text-muted-foreground uppercase">Jobs</div>
            <div className="font-bold">{metrics.processed}</div>
          </div>
          <div className="bg-background rounded p-2 border">
            <div className="text-[10px] text-muted-foreground uppercase">Sucesso</div>
            <div className="font-bold text-green-600">{metrics.successes}</div>
          </div>
          <div className="bg-background rounded p-2 border">
            <div className="text-[10px] text-muted-foreground uppercase">Falha</div>
            <div className="font-bold text-destructive">{metrics.failures}</div>
          </div>
          <div className="bg-background rounded p-2 border">
            <div className="text-[10px] text-muted-foreground uppercase">Tempo Médio</div>
            <div className="font-bold">{avgTime}s</div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="flex-1 gap-2 text-xs"
            onClick={processBacklog}
            disabled={isRunning || isProcessing}
          >
            <Zap className="w-3 h-3" />
            Processar Backlog
          </Button>
          
          <Button 
            variant={simulateNextFail ? "destructive" : "outline"} 
            size="sm" 
            className="flex-1 gap-2 text-xs"
            onClick={() => setSimulateNextFail(!simulateNextFail)}
          >
            <AlertTriangle className="w-3 h-3" />
            {simulateNextFail ? "Cancelando falha" : "Próximo Falha"}
          </Button>
          
          <Button 
            variant="ghost" 
            size="sm" 
            className="gap-2 text-xs"
            onClick={() => setLogs([])}
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>

        {/* Logs */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-[10px] font-bold uppercase text-muted-foreground">Log de Atividade</Label>
            <Badge variant="outline" className="text-[10px] h-4">ID: {agentId}</Badge>
          </div>
          <ScrollArea className="h-40 w-full rounded border bg-background p-2">
            <div className="space-y-1.5">
              {logs.length === 0 && (
                <div className="text-center py-8 text-muted-foreground text-xs italic">
                  Nenhuma atividade registrada
                </div>
              )}
              {logs.map((log) => (
                <div key={log.id} className="text-[10px] font-mono border-b border-muted pb-1 last:border-0">
                  <span className="text-muted-foreground mr-1">
                    [{format(log.timestamp, "HH:mm:ss")}]
                  </span>
                  <span className={`font-bold mr-1 ${
                    log.result === 'success' ? 'text-green-600' : 
                    log.result === 'error' ? 'text-destructive' : 
                    'text-blue-600'
                  }`}>
                    {log.action}
                  </span>
                  {log.orderId && (
                    <span className="text-muted-foreground">
                      Pedido #{log.orderId.slice(0, 5)}:
                    </span>
                  )}
                  {log.details && (
                    <span className="text-muted-foreground ml-1 text-[9px] block">
                      {log.details}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  );
}
