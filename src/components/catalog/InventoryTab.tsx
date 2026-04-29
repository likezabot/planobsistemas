import { useState, useEffect } from "react";
import { useRestaurant } from "@/lib/auth/RestaurantProvider";
import { useToast } from "@/hooks/use-toast";
import { 
  updateRestaurantInventory, 
  listInventoryLogs,
  type Category
} from "@/lib/catalog/queries";
import { isAdminRole } from "@/lib/catalog/money";
import { 
  ClipboardList, 
  Settings2, 
  History,
  Check,
  AlertCircle,
  Package,
  Layers,
  Pizza,
  PlusCircle,
  Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function InventoryTab() {
  const { currentRestaurantId, currentMembership, refresh: refreshRestaurant } = useRestaurant();
  const { toast } = useToast();
  const [logs, setLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [saving, setSaving] = useState(false);

  const canEdit = isAdminRole(currentMembership?.role);
  const restaurant = currentMembership?.restaurants;

  useEffect(() => {
    if (currentRestaurantId) {
      loadLogs();
    }
  }, [currentRestaurantId]);

  async function loadLogs() {
    if (!currentRestaurantId) return;
    setLoadingLogs(true);
    const { data, error } = await listInventoryLogs(currentRestaurantId);
    if (error) {
      toast({ title: "Erro ao carregar logs", description: error.message, variant: "destructive" });
    } else {
      setLogs(data ?? []);
    }
    setLoadingLogs(false);
  }

  async function handleToggleInventory(enabled: boolean) {
    if (!currentRestaurantId || !restaurant || !canEdit) return;
    setSaving(true);
    const { error } = await updateRestaurantInventory(currentRestaurantId, enabled, restaurant.inventory_mode);
    setSaving(false);
    
    if (error) {
      toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: enabled ? "Estoque ativado" : "Estoque desativado" });
      refreshRestaurant();
    }
  }

  async function handleChangeMode(mode: "simple" | "advanced") {
    if (!currentRestaurantId || !restaurant || !canEdit) return;
    setSaving(true);
    const { error } = await updateRestaurantInventory(currentRestaurantId, restaurant.inventory_enabled, mode);
    setSaving(false);
    
    if (error) {
      toast({ title: "Erro ao atualizar modo", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Modo de estoque atualizado" });
      refreshRestaurant();
    }
  }

  if (!restaurant) return null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Settings Card */}
        <Card className="md:col-span-1 shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-primary" />
              Configuração Global
            </CardTitle>
            <CardDescription className="text-xs">
              Ative ou desative o controle de estoque para todo o restaurante.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/20">
              <div className="space-y-0.5">
                <Label className="text-sm font-bold">Controle de Estoque</Label>
                <p className="text-[10px] text-muted-foreground">Habilitar validação no checkout</p>
              </div>
              <Switch 
                checked={restaurant.inventory_enabled} 
                onCheckedChange={handleToggleInventory}
                disabled={!canEdit || saving}
              />
            </div>

            {restaurant.inventory_enabled && (
              <div className="space-y-3">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Modo de Operação</Label>
                <Select 
                  value={restaurant.inventory_mode} 
                  onValueChange={(v: any) => handleChangeMode(v)}
                  disabled={!canEdit || saving}
                >
                  <SelectTrigger className="w-full h-10">
                    <SelectValue placeholder="Selecione o modo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="simple">
                      <div className="flex flex-col text-left">
                        <span className="font-bold text-xs">Modo Simples</span>
                        <span className="text-[10px] text-muted-foreground">Apenas no produto principal</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="advanced">
                      <div className="flex flex-col text-left">
                        <span className="font-bold text-xs">Modo Avançado</span>
                        <span className="text-[10px] text-muted-foreground">Produtos, variações, adicionais e sabores</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {!restaurant.inventory_enabled && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/5 border border-primary/10 text-[11px] text-primary leading-tight">
                <AlertCircle className="w-4 h-4 shrink-0" />
                Com o estoque desativado, o sistema não bloqueia vendas e não valida quantidades no checkout.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Status Overview Card */}
        <Card className="md:col-span-2 shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
              <History className="w-4 h-4 text-primary" />
              Histórico de Movimentações
            </CardTitle>
            <CardDescription className="text-xs">
              Últimas 100 alterações de estoque registradas.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="border border-border rounded-lg overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-[10px] font-bold uppercase py-2">Data/Hora</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase py-2">Item</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase py-2 text-center">Tipo</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase py-2 text-center">Qtd</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase py-2 text-right">Motivo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingLogs ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell colSpan={5} className="h-10 animate-pulse bg-muted/10" />
                      </TableRow>
                    ))
                  ) : logs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-24 text-center text-muted-foreground text-xs">
                        Nenhuma movimentação registrada.
                      </TableCell>
                    </TableRow>
                  ) : (
                    logs.map(log => (
                      <TableRow key={log.id} className="text-xs">
                        <TableCell className="py-2 text-muted-foreground">
                          {format(new Date(log.created_at), "dd/MM HH:mm", { locale: ptBR })}
                        </TableCell>
                        <TableCell className="py-2 font-bold text-secondary">
                          {log.item_id.substring(0, 8)}... 
                          {/* In a real app we'd join with item tables to show names */}
                        </TableCell>
                        <TableCell className="py-2 text-center">
                          {getItemIcon(log.item_type)}
                        </TableCell>
                        <TableCell className="py-2 text-center tabular-nums">
                          <span className={log.change_amount > 0 ? "text-success font-bold" : "text-destructive font-bold"}>
                            {log.change_amount > 0 ? `+${log.change_amount}` : log.change_amount}
                          </span>
                          <span className="text-[10px] text-muted-foreground ml-1">
                            ({log.new_quantity})
                          </span>
                        </TableCell>
                        <TableCell className="py-2 text-right uppercase text-[9px] font-bold">
                          {translateReason(log.reason)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function getItemIcon(type: string) {
  switch (type) {
    case 'product': return <Package className="w-3.5 h-3.5 mx-auto text-blue-500" title="Produto" />;
    case 'variant': return <Layers className="w-3.5 h-3.5 mx-auto text-orange-500" title="Variação" />;
    case 'option_item': return <PlusCircle className="w-3.5 h-3.5 mx-auto text-green-500" title="Adicional" />;
    case 'pizza_flavor': return <Pizza className="w-3.5 h-3.5 mx-auto text-red-500" title="Sabor" />;
    default: return null;
  }
}

function translateReason(reason: string) {
  switch (reason) {
    case 'manual': return <span className="text-blue-600">Manual</span>;
    case 'sale': return <span className="text-success">Venda</span>;
    case 'cancel': return <span className="text-orange-600">Estorno</span>;
    case 'import': return <span className="text-purple-600">Importação</span>;
    default: return reason;
  }
}