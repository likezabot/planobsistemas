import { useState } from "react";
import { useRestaurant } from "@/lib/auth/RestaurantProvider";
import { getRestaurantOrders, updateOrderStatus, reprintOrder, OrderWithItems } from "@/lib/orders/queries";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { centsToBRL } from "@/lib/catalog/money";
import { format, formatDistanceToNow } from "date-fns";
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
  Package, 
  MapPin,
  ClipboardList,
  Phone,
  Printer,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Hash,
  ShoppingBag,
  Truck
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function OrdersPage() {
  const { currentRestaurantId } = useRestaurant();
  const queryClient = useQueryClient();
  const [selectedOrder, setSelectedOrder] = useState<OrderWithItems | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [isReprintDialogOpen, setIsReprintDialogOpen] = useState(false);
  const [reprintReason, setReprintReason] = useState("");

  const { data: orders, isLoading } = useQuery({
    queryKey: ["orders", currentRestaurantId],
    queryFn: () => getRestaurantOrders(currentRestaurantId!),
    enabled: !!currentRestaurantId,
    refetchInterval: 5000, 
  });

  const statusMutation = useMutation({
    mutationFn: ({ orderId, status, reason }: { orderId: string; status: any; reason?: string }) =>
      updateOrderStatus(orderId, status, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast.success("Status atualizado!");
      setSelectedOrder(null);
      setIsCancelDialogOpen(false);
      setCancelReason("");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao atualizar status");
    },
  });

  const reprintMutation = useMutation({
    mutationFn: ({ orderId, reason }: { orderId: string; reason: string }) =>
      reprintOrder(orderId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast.success("Solicitação de reimpressão enviada!");
      setIsReprintDialogOpen(false);
      setReprintReason("");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao solicitar reimpressão");
    },
  });

  const handleStatusChange = (orderId: string, status: any) => {
    if (status === 'cancelled') {
      setIsCancelDialogOpen(true);
      return;
    }
    statusMutation.mutate({ orderId, status });
  };

  const handleCancelConfirm = () => {
    if (!selectedOrder) return;
    statusMutation.mutate({ 
      orderId: selectedOrder.id, 
      status: 'cancelled', 
      reason: cancelReason 
    });
  };

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
          <p className="text-muted-foreground font-medium animate-pulse">Carregando seus pedidos...</p>
        </div>
      </AppShell>
    );
  }

  const filteredOrders = (statusGroup: string) => {
    if (!orders) return [];
    switch (statusGroup) {
      case "new":
        return orders.filter((o) => o.status === "new");
      case "preparing":
        return orders.filter((o) => ["accepted", "preparing"].includes(o.status));
      case "ready":
        return orders.filter((o) => ["ready", "out_for_delivery"].includes(o.status));
      case "finished":
        return orders.filter((o) => ["delivered", "completed", "cancelled"].includes(o.status));
      default:
        return [];
    }
  };

  const stats = {
    new: orders?.filter(o => o.status === 'new').length || 0,
    active: orders?.filter(o => ['accepted', 'preparing', 'ready', 'out_for_delivery'].includes(o.status)).length || 0,
    total_today: orders?.length || 0
  };

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        {/* Dashboard Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard label="Novos" value={stats.new} icon={<AlertCircle className="w-4 h-4" />} color="bg-primary" pulse={stats.new > 0} />
          <StatCard label="Em Preparo" value={stats.active} icon={<Clock className="w-4 h-4" />} color="bg-warning" />
          <StatCard label="Total Hoje" value={stats.total_today} icon={<CheckCircle2 className="w-4 h-4" />} color="bg-success" />
        </div>

        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-secondary">Monitor de Pedidos</h1>
          <Button 
            variant="outline" 
            size="sm"
            className="rounded-lg h-9 border-border"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["orders"] })}
          >
            <Loader2 className={cn("w-3.5 h-3.5 mr-2", isLoading && "animate-spin")} />
            Atualizar
          </Button>
        </div>

        <Tabs defaultValue="new" className="w-full">
          <TabsList className="grid grid-cols-4 w-full bg-white border border-border p-1 rounded-xl h-12 mb-6">
            <TabsTrigger value="new" className="rounded-lg font-bold text-xs data-[state=active]:bg-muted">
              Novos {stats.new > 0 && <Badge className="ml-2 bg-primary text-[9px] h-4 px-1.5">{stats.new}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="preparing" className="rounded-lg font-bold text-xs data-[state=active]:bg-muted">Preparo</TabsTrigger>
            <TabsTrigger value="ready" className="rounded-lg font-bold text-xs data-[state=active]:bg-muted">Prontos</TabsTrigger>
            <TabsTrigger value="finished" className="rounded-lg font-bold text-xs data-[state=active]:bg-muted">Histórico</TabsTrigger>
          </TabsList>

          {["new", "preparing", "ready", "finished"].map((group) => (
            <TabsContent key={group} value={group} className="animate-in fade-in duration-300">
              {filteredOrders(group).length === 0 ? (
                <div className="text-center py-20 bg-white rounded-xl border border-dashed border-border">
                  <ClipboardList className="w-12 h-12 mx-auto mb-4 opacity-10 text-secondary" />
                  <p className="text-muted-foreground text-sm">Nenhum pedido encontrado.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredOrders(group).map((order) => (
                    <OrderCard key={order.id} order={order} onClick={() => setSelectedOrder(order)} />
                  ))}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>

      <OrderDetailsDialog 
        order={selectedOrder} 
        onClose={() => setSelectedOrder(null)}
        onStatusChange={handleStatusChange}
        onReprint={() => setIsReprintDialogOpen(true)}
        onCancel={() => setIsCancelDialogOpen(true)}
      />

      {/* Reprint Dialog */}
      <Dialog open={isReprintDialogOpen} onOpenChange={setIsReprintDialogOpen}>
        <DialogContent className="max-w-md rounded-xl p-6">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Solicitar Reimpressão</DialogTitle>
            <DialogDescription className="text-sm">
              Informe o motivo para reimprimir este pedido.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <Label className="text-xs font-bold uppercase tracking-wider text-secondary">Motivo</Label>
            <Textarea 
              placeholder="Ex: Falha na impressora..." 
              className="rounded-lg border-border focus:ring-primary min-h-[80px]"
              value={reprintReason}
              onChange={(e) => setReprintReason(e.target.value)}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" className="rounded-lg font-bold" onClick={() => setIsReprintDialogOpen(false)}>Voltar</Button>
            <Button 
              className="rounded-lg h-10 font-bold px-6"
              disabled={reprintReason.length < 3 || reprintMutation.isPending}
              onClick={() => reprintMutation.mutate({ 
                orderId: selectedOrder?.id!, 
                reason: reprintReason 
              })}
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancellation Dialog */}
      <Dialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
        <DialogContent className="max-w-md rounded-xl p-6">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-destructive">Cancelar Pedido</DialogTitle>
            <DialogDescription className="text-sm">
              Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <Label className="text-xs font-bold uppercase tracking-wider text-secondary">Motivo do Cancelamento</Label>
            <Textarea 
              placeholder="Ex: Item sem estoque..." 
              className="rounded-lg border-border focus:ring-destructive min-h-[80px]"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" className="rounded-lg font-bold" onClick={() => setIsCancelDialogOpen(false)}>Voltar</Button>
            <Button 
              variant="destructive" 
              className="rounded-lg h-10 font-bold px-6"
              disabled={cancelReason.length < 3 || statusMutation.isPending}
              onClick={handleCancelConfirm}
            >
              Cancelar Pedido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function StatCard({ label, value, icon, color, pulse }: { label: string, value: number, icon: React.ReactNode, color: string, pulse?: boolean }) {
  return (
    <Card className="border-border shadow-sm bg-white overflow-hidden">
      <CardContent className="p-4 flex items-center justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-0.5">{label}</p>
          <p className="text-2xl font-bold text-secondary tabular-nums">{value}</p>
        </div>
        <div className={cn(
          "w-9 h-9 rounded-lg flex items-center justify-center text-white shadow-sm",
          color,
          pulse && "animate-pulse"
        )}>
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}

function OrderCard({ order, onClick }: { order: OrderWithItems, onClick: () => void }) {
  const timeSince = formatDistanceToNow(new Date(order.created_at), { addSuffix: true, locale: ptBR });
  
  return (
    <div 
      className="bg-white rounded-xl border border-border p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer group flex flex-col gap-4"
      onClick={onClick}
    >
      <div className="flex justify-between items-start">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[9px] font-bold text-muted-foreground uppercase tracking-widest mb-0.5">
            <Hash className="w-2.5 h-2.5" />
            {order.id.slice(0, 5)}
          </div>
          <h3 className="font-bold text-secondary text-sm truncate">{order.customer_name}</h3>
        </div>
        <StatusBadge status={order.status} />
      </div>

      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Clock className="w-3.5 h-3.5" />
          <span>{timeSince}</span>
        </div>
        <span className="font-bold text-secondary">{centsToBRL(order.total_cents)}</span>
      </div>

      <div className="pt-3 border-t border-dashed border-border flex justify-between items-center">
        <div className={cn(
          "flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider",
          order.order_type === 'delivery' ? 'text-warning' : 'text-success'
        )}>
          {order.order_type === 'delivery' ? <Truck className="w-3.5 h-3.5" /> : <ShoppingBag className="w-3.5 h-3.5" />}
          {order.order_type === 'delivery' ? 'Entrega' : 'Retirada'}
        </div>
        {(order as any).print_status && (
          <PrintStatusBadge status={(order as any).print_status} />
        )}
      </div>
    </div>
  );
}

function OrderDetailsDialog({ order, onClose, onStatusChange, onReprint, onCancel }: any) {
  if (!order) return null;

  return (
    <Dialog open={!!order} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg rounded-xl p-0 overflow-hidden border-none shadow-2xl">
        <div className="bg-secondary p-6 text-white flex justify-between items-start">
          <div>
            <div className="text-[10px] uppercase font-bold opacity-60 mb-1 flex items-center gap-1">
              <Hash className="w-2.5 h-2.5" /> {order.id.slice(0, 8)}
            </div>
            <h2 className="text-xl font-bold">{order.customer_name}</h2>
            <div className="flex items-center gap-3 mt-3">
              <div className="flex items-center gap-1.5 text-xs bg-secondary px-2 py-1 rounded-lg border border-border text-white">
                <Phone className="w-3 h-3 text-primary" /> {order.customer_phone}
              </div>
              <div className="flex items-center gap-1.5 text-xs bg-secondary px-2 py-1 rounded-lg border border-border text-white">
                {order.order_type === 'delivery' ? <Truck className="w-3 h-3 text-warning" /> : <ShoppingBag className="w-3 h-3 text-success" />}
                {order.order_type === 'delivery' ? 'Entrega' : 'Retirada'}
              </div>
            </div>
          </div>
          <div className="text-right">
            <StatusBadge status={order.status} />
            <div className="text-[10px] mt-2 opacity-60 font-bold uppercase tracking-widest">
              {format(new Date(order.created_at), "HH:mm '•' dd/MM", { locale: ptBR })}
            </div>
          </div>
        </div>

        <div className="p-6 max-h-[60vh] overflow-y-auto space-y-6">
          {order.order_type === 'delivery' && (
            <div className="space-y-1.5">
              <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Endereço</p>
              <div className="flex gap-2 p-3 bg-muted rounded-lg text-xs font-medium border border-border">
                <MapPin className="w-4 h-4 text-primary shrink-0" />
                <span>{order.address}</span>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Itens</p>
            <div className="space-y-2">
              {order.order_items.map((item: any) => (
                <div key={item.id} className="flex justify-between items-start p-3 bg-white border border-border rounded-lg shadow-sm">
                  <div className="flex gap-2.5">
                    <span className="font-bold text-primary bg-accent w-6 h-6 flex items-center justify-center rounded text-[10px]">{item.quantity}x</span>
                    <div className="min-w-0">
                      <p className="font-bold text-secondary text-xs">{item.product?.name}</p>
                      {item.customization && (
                        <p className="text-[10px] text-muted-foreground italic leading-tight mt-0.5">{(item.customization as any).description}</p>
                      )}
                      {item.note && <p className="text-[10px] text-warning font-bold mt-1 uppercase">Obs: {item.note}</p>}
                    </div>
                  </div>
                  <span className="font-bold text-secondary text-xs tabular-nums">{centsToBRL(item.total_price_cents)}</span>
                </div>
              ))}
            </div>
          </div>

          {order.notes && (
            <div className="p-3 bg-accent border border-border rounded-lg">
              <p className="text-[9px] uppercase font-bold text-warning tracking-widest mb-1">Observação Geral</p>
              <p className="text-xs italic text-secondary font-medium">"{order.notes}"</p>
            </div>
          )}

          <div className="flex justify-between items-center p-4 bg-secondary text-white rounded-xl shadow-lg">
            <span className="text-xs font-bold uppercase tracking-widest opacity-60">Total</span>
            <span className="text-2xl font-bold tabular-nums">{centsToBRL(order.total_cents)}</span>
          </div>
        </div>

        <div className="p-6 bg-[#F8FAFC] border-t border-border">
          <div className="grid grid-cols-2 gap-3">
            {order.status === 'new' && (
              <Button className="h-10 rounded-lg font-bold bg-success text-white shadow-sm" onClick={() => onStatusChange(order.id, 'accepted')}>Aceitar Pedido</Button>
            )}
            {order.status === 'accepted' && (
              <Button className="h-10 rounded-lg font-bold bg-primary text-white shadow-sm" onClick={() => onStatusChange(order.id, 'preparing')}>Iniciar Preparo</Button>
            )}
            {order.status === 'preparing' && (
              <Button className="h-10 rounded-lg font-bold bg-warning text-white shadow-sm" onClick={() => onStatusChange(order.id, 'ready')}>Marcar Pronto</Button>
            )}
            {order.status === 'ready' && (
              <Button className="h-10 rounded-lg font-bold bg-success text-white shadow-sm" onClick={() => onStatusChange(order.id, 'completed')}>Concluir</Button>
            )}
            
            <Button variant="outline" className="h-10 rounded-lg font-bold border-border" onClick={onReprint}><Printer className="w-3.5 h-3.5 mr-2" />Reimprimir</Button>
            
            {['new', 'accepted', 'preparing', 'ready'].includes(order.status) && (
              <Button variant="ghost" className="h-10 rounded-lg font-bold text-destructive hover:bg-destructive col-span-2 mt-1" onClick={onCancel}><XCircle className="w-3.5 h-3.5 mr-2" />Cancelar Pedido</Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const StatusBadge = ({ status }: { status: string }) => {
  const configs: Record<string, { label: string; className: string }> = {
    new: { label: "Novo", className: "bg-primary text-white" },
    accepted: { label: "Aceito", className: "bg-success text-white" },
    preparing: { label: "Preparo", className: "bg-warning text-white" },
    ready: { label: "Pronto", className: "bg-secondary text-white" },
    completed: { label: "Concluído", className: "bg-muted text-muted-foreground" },
    cancelled: { label: "Cancelado", className: "bg-destructive text-white" },
  };
  const config = configs[status] || { label: status, className: "bg-muted text-muted-foreground" };
  return (
    <Badge variant="outline" className={cn("rounded-md px-1.5 py-0.5 font-bold uppercase text-[8px] tracking-widest border-none shadow-sm", config.className)}>
      {config.label}
    </Badge>
  );
};

const PrintStatusBadge = ({ status }: { status: string }) => {
  const configs: Record<string, { label: string; className: string }> = {
    none: { label: "Pendente", className: "bg-muted text-muted-foreground" },
    pending: { label: "Imprimindo...", className: "bg-warning text-white" },
    printed: { label: "Impresso", className: "bg-success text-white" },
    failed: { label: "Falhou", className: "bg-destructive text-white" },
  };
  const config = configs[status] || { label: status, className: "bg-muted text-muted-foreground" };
  return (
    <span className={cn("text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shadow-sm", config.className)}>
      {config.label}
    </span>
  );
};
