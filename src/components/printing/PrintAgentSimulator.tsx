import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Play, 
  Pause, 
  Trash2, 
  AlertTriangle, 
  CheckCircle, 
  Settings2,
  Activity,
  Zap,
  ShieldCheck
} from "lucide-react";
import { claimPrintJob, completePrintJob, failPrintJob, PrintJob, getPrintAgents, PrintAgent, getPendingPrintJobs } from "@/lib/printing/queries";
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
  const [agents, setAgents] = useState<PrintAgent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [metrics, setMetrics] = useState<SimulatorMetrics>({
    processed: 0,
    successes: 0,
    failures: 0,
    totalTime: 0,
  });

  const processingRef = useRef(false);
  
  const selectedAgent = agents.find(a => a.id === selectedAgentId);

  useEffect(() => {
    if (restaurantId) {
      getPrintAgents(restaurantId).then(setAgents).catch(console.error);
    }
  }, [restaurantId, isRunning]);

  const addLog = (log: Omit<LogEntry, "id" | "timestamp">) => {
    setLogs(prev => [
      {
        ...log,
        id: Math.random().toString(36).substring(7),
        timestamp: new Date(),
      },
      ...prev.slice(0, 49),
    ]);
  };

  const processJob = async (job: PrintJob) => {
    if (processingRef.current || !selectedAgent) return;
    processingRef.current = true;
    setIsProcessing(true);
    const start = Date.now();

    try {
      addLog({
        jobId: job.id,
        orderId: job.order_id,
        action: "Capturando job",
        result: "info",
        details: `Usando agente: ${selectedAgent.name}`
      });

      // 1. Claim
      const claimed = await claimPrintJob(job.id, selectedAgent.id, selectedAgent.secret_key);
      if (!claimed) {
        throw new Error("Não foi possível capturar o job (chave inválida ou já capturado)");
      }

      // 2. Simulação de tempo de impressão
      await new Promise(resolve => setTimeout(resolve, 1500));

      // 3. Sucesso ou Falha
      if (simulateNextFail) {
        setSimulateNextFail(false);
        await failPrintJob(job.id, selectedAgent.id, selectedAgent.secret_key, "Simulação de falha manual do usuário");
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
        await completePrintJob(job.id, selectedAgent.id, selectedAgent.secret_key);
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
    if (!isRunning || !restaurantId || !selectedAgentId) return;

    const interval = setInterval(async () => {
      if (processingRef.current) return;

      try {
        const jobs = await getPendingPrintJobs(
          restaurantId, 
          selectedAgentId, 
          selectedAgent.secret_key, 
          startTime?.toISOString()
        );

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
  }, [isRunning, restaurantId, startTime, selectedAgentId]);

  const handleToggle = (checked: boolean) => {
    if (checked && !selectedAgentId) {
      toast.error("Selecione um agente para simular");
      return;
    }
    setIsRunning(checked);
    if (checked) {
      setStartTime(new Date());
      addLog({ action: "Simulador iniciado", result: "info", details: `Agente: ${selectedAgent?.name}` });
    } else {
      addLog({ action: "Simulador pausado", result: "info" });
    }
  };

  const avgTime = metrics.processed > 0 ? (metrics.totalTime / metrics.processed / 1000).toFixed(1) : "0";

  return (
    <Card className="border-orange-200 bg-orange-50/30 mt-6">
      <CardHeader className="p-4 pb-2 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className={`w-5 h-5 ${isRunning ? 'text-orange-500 animate-pulse' : 'text-muted-foreground'}`} />
            <CardTitle className="text-xs font-bold uppercase tracking-wider">
              Simulador (Dev Only)
            </CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Switch 
              id="simulator-toggle" 
              checked={isRunning} 
              onCheckedChange={handleToggle}
            />
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="p-4 space-y-4">
        <div className="space-y-1">
          <Label className="text-[10px] uppercase text-muted-foreground">Agente Autorizado</Label>
          <Select value={selectedAgentId} onValueChange={setSelectedAgentId} disabled={isRunning}>
            <SelectTrigger className="h-8 text-xs bg-background">
              <SelectValue placeholder="Selecione um agente..." />
            </SelectTrigger>
            <SelectContent>
              {agents.map(agent => (
                <SelectItem key={agent.id} value={agent.id} className="text-xs">
                  {agent.name}
                </SelectItem>
              ))}
              {agents.length === 0 && (
                <div className="p-2 text-xs text-muted-foreground italic">
                  Nenhum agente criado acima
                </div>
              )}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-4 gap-2 text-center">
          <div className="bg-background rounded p-2 border">
            <div className="text-[10px] text-muted-foreground uppercase leading-tight">Jobs</div>
            <div className="font-bold text-xs">{metrics.processed}</div>
          </div>
          <div className="bg-background rounded p-2 border">
            <div className="text-[10px] text-muted-foreground uppercase leading-tight">Ok</div>
            <div className="font-bold text-xs text-green-600">{metrics.successes}</div>
          </div>
          <div className="bg-background rounded p-2 border">
            <div className="text-[10px] text-muted-foreground uppercase leading-tight">Err</div>
            <div className="font-bold text-xs text-destructive">{metrics.failures}</div>
          </div>
          <div className="bg-background rounded p-2 border">
            <div className="text-[10px] text-muted-foreground uppercase leading-tight">Tempo</div>
            <div className="font-bold text-xs">{avgTime}s</div>
          </div>
        </div>

        <div className="flex gap-2">
          <Button 
            variant={simulateNextFail ? "destructive" : "outline"} 
            size="sm" 
            className="flex-1 gap-2 text-[10px] h-7"
            onClick={() => setSimulateNextFail(!simulateNextFail)}
          >
            <AlertTriangle className="w-3 h-3" />
            {simulateNextFail ? "Modo Falha Ativo" : "Simular Falha"}
          </Button>
          
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-7 w-7 p-0"
            onClick={() => setLogs([])}
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>

        <ScrollArea className="h-32 w-full rounded border bg-background p-2">
          <div className="space-y-1">
            {logs.length === 0 && (
              <div className="text-center py-6 text-muted-foreground text-[10px] italic">
                Aguardando início...
              </div>
            )}
            {logs.map((log) => (
              <div key={log.id} className="text-[9px] font-mono border-b border-muted pb-1 last:border-0 leading-tight">
                <span className="text-muted-foreground mr-1">[{format(log.timestamp, "HH:mm:ss")}]</span>
                <span className={`font-bold mr-1 ${log.result === 'success' ? 'text-green-600' : log.result === 'error' ? 'text-destructive' : 'text-blue-600'}`}>
                  {log.action}
                </span>
                {log.orderId && <span className="text-muted-foreground">Order #{log.orderId.slice(0, 5)}</span>}
                {log.details && <span className="text-muted-foreground ml-1 block opacity-70">{log.details}</span>}
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
