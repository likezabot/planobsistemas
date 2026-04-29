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
  ChevronRight,
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
          <div className="relative">
            <div className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
            <ClipboardList className="absolute inset-0 m-auto w-6 h-6 text-primary animate-pulse" />
          </div>
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

  const getStats = () => {
    if (!orders) return { new: 0, active: 0, total_today: 0 };
    return {
      new: orders.filter(o => o.status === 'new').length,
      active: orders.filter(o => ['accepted', 'preparing', 'ready', 'out_for_delivery'].includes(o.status)).length,
      total_today: orders.length
    };
  };

  const stats = getStats();

  return (
    <AppShell>
      {/* Dashboard Stats Header */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <StatCard 
          label="Novos Pedidos" 
          value={stats.new} 
          icon={<AlertCircle className="w-5 h-5" />} 
          color="bg-primary" 
          pulse={stats.new > 0}
        />
        <StatCard 
          label="Em Preparo" 
          value={stats.active} 
          icon={<Clock className="w-5 h-5" />} 
          color="bg-warning" 
        />
        <StatCard 
          label="Total Hoje" 
          value={stats.total_today} 
          icon={<CheckCircle2 className="w-5 h-5" />} 
          color="bg-success" 
        />
      </div>

      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-display font-bold text-secondary">Monitor de Pedidos</h1>
        <Button 
          variant="outline" 
          className="rounded-xl border-border hover:bg-muted"
          onClick={() => queryClient.invalidateQueries({ queryKey: ["orders"] })}
        >
          <Loader2 className={cn("w-4 h-4 mr-2", isLoading && "animate-spin")} />
          Atualizar Lista
        </Button>
      </div>

      <Tabs defaultValue="new" className="w-full">
        <TabsList className="flex w-full mb-8 bg-muted/50 p-1.5 rounded-2xl h-14">
          <TabsTrigger value="new" className="flex-1 rounded-xl font-bold data-[state=active]:bg-white data-[state=active]:shadow-sm">
            Novos {stats.new > 0 && <Badge className="ml-2 bg-primary text-[10px] h-5 px-1.5">{stats.new}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="preparing" className="flex-1 rounded-xl font-bold data-[state=active]:bg-white data-[state=active]:shadow-sm">Preparo</TabsTrigger>
          <TabsTrigger value="ready" className="flex-1 rounded-xl font-bold data-[state=active]:bg-white data-[state=active]:shadow-sm">Prontos</TabsTrigger>
          <TabsTrigger value="finished" className="flex-1 rounded-xl font-bold data-[state=active]:bg-white data-[state=active]:shadow-sm">Finalizados</TabsTrigger>
        </TabsList>

        {["new", "preparing", "ready", "finished"].map((group) => (
          <TabsContent key={group} value={group} className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            {filteredOrders(group).length === 0 ? (
              <div className="text-center py-32 bg-card rounded-[2.5rem] border border-dashed border-border shadow-sm">
                <ClipboardList className="w-16 h-16 mx-auto mb-4 opacity-10 text-secondary" />
                <p className="text-muted-foreground font-medium">Nenhum pedido encontrado nesta categoria.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredOrders(group).map((order) => (
                  <OrderCard key={order.id} order={order} onClick={() => setSelectedOrder(order)} />
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      {/* Order Details Drawer */}
      <Dialog open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
        <DialogContent className="max-w-xl rounded-[2.5rem] p-0 overflow-hidden border-none shadow-premium">
          {selectedOrder && (
            <div className="flex flex-col max-h-[90vh]">
              {/* Modal Header */}
              <div className="p-8 bg-secondary text-white relative">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold opacity-60 mb-1">
                      <Hash className="w-3 h-3" />
                      {selectedOrder.id.slice(0, 8)}
                    </div>
                    <h2 className="text-2xl font-display font-bold">{selectedOrder.customer_name}</h2>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <StatusBadge status={selectedOrder.status} />
                    <div className="flex items-center gap-1.5 text-xs opacity-70">
                      <Clock className="w-3 h-3" />
                      {format(new Date(selectedOrder.created_at), "HH:mm", { locale: ptBR })}
                    </div>
                  </div>
                </div>
                
                <div className="flex flex-wrap gap-4 mt-6">
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-white/10 rounded-xl text-xs backdrop-blur-sm border border-white/10">
                    <Phone className="w-3.5 h-3.5 text-primary" />
                    {selectedOrder.customer_phone}
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-white/10 rounded-xl text-xs backdrop-blur-sm border border-white/10">
                    {selectedOrder.order_type === 'delivery' ? <Truck className="w-3.5 h-3.5 text-warning" /> : <ShoppingBag className="w-3.5 h-3.5 text-success" />}
                    {selectedOrder.order_type === 'delivery' ? 'Entrega' : 'Retirada'}
                  </div>
                  {(selectedOrder as any).print_status && (
                    <PrintStatusBadge status={(selectedOrder as any).print_status} />
                  )}
                </div>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto p-8 space-y-8">
                {selectedOrder.order_type === 'delivery' && (
                  <div className="space-y-2">
                    <h3 className="text-xs uppercase tracking-widest font-bold text-muted-foreground">Endereço de Entrega</h3>
                    <div className="p-4 bg-muted rounded-2xl flex gap-3">
                      <MapPin className="w-5 h-5 text-primary shrink-0" />
                      <p className="text-sm font-medium text-secondary">{selectedOrder.address}</p>
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  <h3 className="text-xs uppercase tracking-widest font-bold text-muted-foreground">Itens do Pedido</h3>
                  <div className="space-y-3">
                    {selectedOrder.order_items.map((item) => (
                      <div key={item.id} className="group p-4 bg-card rounded-2xl border border-border hover:border-primary/20 transition-all">
                        <div className="flex justify-between items-start">
                          <div className="flex gap-3">
                            <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 text-primary font-bold text-sm">
                              {item.quantity}x
                            </span>
                          <div>
                            <p className="font-bold text-secondary">{item.product?.name}</p>
                            {item.customization && typeof item.customization === 'object' && (item.customization as any).description && (
                              <p className="text-xs text-muted-foreground mt-1 italic">
                                {(item.customization as any).description}
                              </p>
                            )}
                            {item.note && (
                              <p className="text-xs text-warning mt-1 font-medium">Obs: {item.note}</p>
                            )}
                          </div>
                          </div>
                          <span className="font-bold text-secondary tabular-nums">{centsToBRL(item.total_price_cents)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {selectedOrder.notes && (
                  <div className="space-y-2">
                    <h3 className="text-xs uppercase tracking-widest font-bold text-muted-foreground">Observações Gerais</h3>
                    <p className="p-4 bg-highlight/10 text-highlight-foreground rounded-2xl text-sm italic font-medium">
                      "{selectedOrder.notes}"
                    </p>
                  </div>
                )}

                <div className="p-6 bg-secondary text-white rounded-[2rem] flex justify-between items-center shadow-lg">
                  <span className="text-lg font-display font-bold opacity-60">Total do Pedido</span>
                  <span className="text-3xl font-display font-bold tabular-nums">
                    {centsToBRL(selectedOrder.total_cents)}
                  </span>
                </div>
              </div>

              {/* Modal Footer Actions */}
              <div className="p-8 border-t border-border bg-muted/30">
                <div className="grid grid-cols-2 gap-4">
                  {selectedOrder.status === 'new' && (
                    <ActionButton color="bg-success" onClick={() => handleStatusChange(selectedOrder.id, 'accepted')}>
                      Aceitar Pedido
                    </ActionButton>
                  )}
                  {selectedOrder.status === 'accepted' && (
                    <ActionButton color="bg-primary" onClick={() => handleStatusChange(selectedOrder.id, 'preparing')}>
                      Iniciar Preparo
                    </ActionButton>
                  )}
                  {selectedOrder.status === 'preparing' && (
                    <ActionButton color="bg-warning" onClick={() => handleStatusChange(selectedOrder.id, 'ready')}>
                      Marcar Pronto
                    </ActionButton>
                  )}
                  {selectedOrder.status === 'ready' && (
                    <ActionButton color="bg-success" onClick={() => handleStatusChange(selectedOrder.id, 'completed')}>
                      Concluir
                    </ActionButton>
                  )}
                  
                  {['new', 'accepted', 'preparing', 'ready', 'completed', 'delivered'].includes(selectedOrder.status) && (
                    <Button 
                      variant="outline" 
                      className="h-14 rounded-2xl font-bold border-border hover:bg-white" 
                      onClick={() => setIsReprintDialogOpen(true)}
                    >
                      <Printer className="w-5 h-5 mr-2" />
                      Reimprimir
                    </Button>
                  )}
                  
                  {['new', 'accepted', 'preparing', 'ready'].includes(selectedOrder.status) && (
                    <Button 
                      variant="outline" 
                      className="h-14 rounded-2xl font-bold border-border text-destructive hover:bg-destructive/10" 
                      onClick={() => setIsCancelDialogOpen(true)}
                    >
                      <XCircle className="w-5 h-5 mr-2" />
                      Cancelar
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reprint Dialog */}
      <Dialog open={isReprintDialogOpen} onOpenChange={setIsReprintDialogOpen}>
        <DialogContent className="rounded-[2.5rem] p-8">
          <DialogHeader>
            <DialogTitle className="text-2xl font-display font-bold">Solicitar Reimpressão</DialogTitle>
            <DialogDescription className="py-2">
              Informe o motivo para reimprimir este pedido. Isso será registrado na auditoria de impressão.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Label className="font-bold">Motivo da Reimpressão</Label>
            <Textarea 
              placeholder="Ex: Impressora falhou, papel acabou, pedido extraviado..." 
              className="rounded-2xl border-border focus:ring-primary min-h-[100px]"
              value={reprintReason}
              onChange={(e) => setReprintReason(e.target.value)}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" className="rounded-xl font-bold" onClick={() => setIsReprintDialogOpen(false)}>Voltar</Button>
            <Button 
              className="rounded-xl h-12 font-bold px-8 shadow-premium"
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
        <DialogContent className="rounded-[2.5rem] p-8 border-none">
          <DialogHeader>
            <DialogTitle className="text-2xl font-display font-bold text-destructive">Cancelar Pedido</DialogTitle>
            <DialogDescription className="py-2">
              Esta ação é irreversível. O cliente será notificado e o pedido será arquivado como cancelado.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Label className="font-bold">Motivo do Cancelamento</Label>
            <Textarea 
              placeholder="Ex: Cliente desistiu, item sem estoque..." 
              className="rounded-2xl border-border focus:ring-destructive min-h-[100px]"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" className="rounded-xl font-bold" onClick={() => setIsCancelDialogOpen(false)}>Voltar</Button>
            <Button 
              variant="destructive" 
              className="rounded-xl h-12 font-bold px-8 shadow-lg shadow-destructive/20"
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

function ActionButton({ children, color, onClick }: { children: React.ReactNode, color: string, onClick: () => void }) {
  return (
    <Button 
      className={cn("h-14 rounded-2xl font-bold shadow-lg transition-transform active:scale-95 text-white", color)}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function StatCard({ label, value, icon, color, pulse }: { label: string, value: number, icon: React.ReactNode, color: string, pulse?: boolean }) {
  return (
    <Card className="border-none shadow-card hover:shadow-premium transition-all overflow-hidden bg-card group">
      <CardContent className="p-6 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest font-bold text-muted-foreground mb-1 group-hover:text-secondary transition-colors">{label}</p>
          <p className="text-3xl font-display font-bold text-secondary tabular-nums">{value}</p>
        </div>
        <div className={cn(
          "w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg",
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
      className="bg-card rounded-[2rem] border border-border p-6 shadow-card hover:shadow-premium hover:border-primary/20 transition-all cursor-pointer group active:scale-[0.98]"
      onClick={onClick}
    >
      <div className="flex justify-between items-start mb-6">
        <div>
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1 group-hover:text-primary transition-colors">
            <Hash className="w-3 h-3" />
            {order.id.slice(0, 5)}
          </div>
          <h3 className="font-bold text-secondary text-lg leading-tight truncate max-w-[140px]">{order.customer_name}</h3>
        </div>
        <StatusBadge status={order.status} />
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm font-bold text-secondary">
          <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
            <Package className="w-4 h-4 text-primary" />
          </div>
          <span>{order.order_items.length} {order.order_items.length === 1 ? 'item' : 'itens'}</span>
          <span className="ml-auto tabular-nums">{centsToBRL(order.total_cents)}</span>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-dashed border-border">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Clock className="w-3.5 h-3.5" />
            {timeSince}
          </div>
          <div className={cn(
            "flex items-center gap-1.5 text-xs font-bold",
            order.order_type === 'delivery' ? 'text-warning' : 'text-success'
          )}>
            {order.order_type === 'delivery' ? <Truck className="w-4 h-4" /> : <ShoppingBag className="w-4 h-4" />}
            {order.order_type === 'delivery' ? 'Entrega' : 'Retirada'}
          </div>
        </div>

        {(order as any).print_status && (
          <div className="pt-2">
            <PrintStatusBadge status={(order as any).print_status} />
          </div>
        )}
      </div>
    </div>
  );
}

const StatusBadge = ({ status }: { status: string }) => {
  const configs: Record<string, { label: string; className: string }> = {
    new: { label: "Novo", className: "bg-primary/10 text-primary border-primary/20" },
    accepted: { label: "Aceito", className: "bg-success/10 text-success border-success/20" },
    preparing: { label: "Preparando", className: "bg-warning/10 text-warning border-warning/20" },
    ready: { label: "Pronto", className: "bg-accent/20 text-accent-foreground border-accent/30" },
    out_for_delivery: { label: "Em entrega", className: "bg-accent/20 text-accent-foreground border-accent/30" },
    delivered: { label: "Entregue", className: "bg-muted text-muted-foreground border-border" },
    completed: { label: "Concluído", className: "bg-muted text-muted-foreground border-border" },
    cancelled: { label: "Cancelado", className: "bg-destructive/10 text-destructive border-destructive/20" },
  };
  const config = configs[status] || { label: status, className: "bg-muted text-muted-foreground" };
  return (
    <Badge variant="outline" className={cn("rounded-lg px-2 py-0.5 font-bold uppercase text-[9px] tracking-widest", config.className)}>
      {config.label}
    </Badge>
  );
};

const PrintStatusBadge = ({ status }: { status: string }) => {
  const configs: Record<string, { label: string; icon: React.ReactNode, className: string }> = {
    none: { label: "Não impresso", icon: <Printer className="w-3 h-3" />, className: "bg-muted text-muted-foreground border-border" },
    pending: { label: "Fila de Impressão", icon: <Loader2 className="w-3 h-3 animate-spin" />, className: "bg-warning/10 text-warning border-warning/20" },
    printed: { label: "Impresso", icon: <CheckCircle2 className="w-3 h-3" />, className: "bg-success/10 text-success border-success/20" },
    failed: { label: "Falha Impressora", icon: <XCircle className="w-3 h-3" />, className: "bg-destructive/10 text-destructive border-destructive/20" },
  };
  const config = configs[status] || { label: status, icon: <Printer className="w-3 h-3" />, className: "bg-muted text-muted-foreground" };
  return (
    <div className={cn("flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[10px] font-bold uppercase tracking-wider", config.className)}>
      {config.icon}
      {config.label}
    </div>
  );
};