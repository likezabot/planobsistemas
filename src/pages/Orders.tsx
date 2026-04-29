import { useState, useEffect } from "react";
import { useRestaurant } from "@/lib/auth/RestaurantProvider";
import { getRestaurantOrders, updateOrderStatus, OrderWithItems } from "@/lib/orders/queries";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { centsToBRL } from "@/lib/catalog/money";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
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
  Clock, 
  CheckCircle2, 
  XCircle, 
  ChevronRight,
  Phone,
  MapPin,
  ClipboardList
} from "lucide-react";

export default function OrdersPage() {
  const { selectedRestaurant } = useRestaurant();
  const queryClient = useQueryClient();
  const [selectedOrder, setSelectedOrder] = useState<OrderWithItems | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);

  const { data: orders, isLoading } = useQuery({
    queryKey: ["orders", selectedRestaurant?.id],
    queryFn: () => getRestaurantOrders(selectedRestaurant!.id),
    enabled: !!selectedRestaurant,
    refetchInterval: 5000, // Poll every 5s as fallback
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
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
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

  const StatusBadge = ({ status }: { status: string }) => {
    const configs: Record<string, { label: string; variant: any }> = {
      new: { label: "Novo", variant: "destructive" },
      accepted: { label: "Aceito", variant: "default" },
      preparing: { label: "Preparando", variant: "secondary" },
      ready: { label: "Pronto", variant: "outline" },
      out_for_delivery: { label: "Em entrega", variant: "outline" },
      delivered: { label: "Entregue", variant: "secondary" },
      completed: { label: "Concluído", variant: "secondary" },
      cancelled: { label: "Cancelado", variant: "ghost" },
    };
    const config = configs[status] || { label: status, variant: "outline" };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const OrderCard = ({ order }: { order: OrderWithItems }) => (
    <Card 
      className="mb-4 cursor-pointer hover:border-primary transition-colors"
      onClick={() => setSelectedOrder(order)}
    >
      <CardHeader className="p-4 flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-sm font-bold">
            #{order.id.slice(0, 5)} - {order.customer_name}
          </CardTitle>
          <CardDescription className="text-xs">
            {format(new Date(order.created_at), "HH:mm '•' dd/MM", { locale: ptBR })}
          </CardDescription>
        </div>
        <StatusBadge status={order.status} />
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <div className="flex items-center gap-2 text-sm mb-2 text-muted-foreground">
          <Package className="w-4 h-4" />
          <span>{order.order_items.length} itens</span>
          <span className="mx-1">•</span>
          <span className="font-semibold text-foreground">{centsToBRL(order.total_cents)}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase">
          {order.order_type === 'delivery' ? (
            <><MapPin className="w-3 h-3" /> Entrega</>
          ) : (
            <><Package className="w-3 h-3" /> Retirada</>
          )}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="p-4 pb-20 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Pedidos</h1>
        <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ["orders"] })}>
          Atualizar
        </Button>
      </div>

      <Tabs defaultValue="new" className="w-full">
        <TabsList className="grid w-full grid-cols-4 mb-6">
          <TabsTrigger value="new">Novos</TabsTrigger>
          <TabsTrigger value="preparing">Preparo</TabsTrigger>
          <TabsTrigger value="ready">Prontos</TabsTrigger>
          <TabsTrigger value="finished">Finalizados</TabsTrigger>
        </TabsList>

        {["new", "preparing", "ready", "finished"].map((group) => (
          <TabsContent key={group} value={group}>
            {filteredOrders(group).length === 0 ? (
              <div className="text-center py-20 text-muted-foreground">
                <ClipboardList className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p>Nenhum pedido nesta categoria</p>
              </div>
            ) : (
              filteredOrders(group).map((order) => <OrderCard key={order.id} order={order} />)
            )}
          </TabsContent>
        ))}
      </Tabs>

      {/* Order Details Drawer/Dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Detalhes do Pedido #{selectedOrder?.id.slice(0, 5)}</DialogTitle>
            <DialogDescription>
              {selectedOrder && format(new Date(selectedOrder.created_at), "PPP 'às' HH:mm", { locale: ptBR })}
            </DialogDescription>
          </DialogHeader>

          {selectedOrder && (
            <div className="space-y-6">
              {/* Customer Info */}
              <div className="bg-muted p-3 rounded-lg text-sm space-y-2">
                <div className="flex items-center gap-2 font-semibold">
                  <span>{selectedOrder.customer_name}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="w-4 h-4" /> {selectedOrder.customer_phone}
                </div>
                {selectedOrder.order_type === 'delivery' && (
                  <div className="flex items-start gap-2 text-muted-foreground">
                    <MapPin className="w-4 h-4 mt-0.5" /> {selectedOrder.address}
                  </div>
                )}
              </div>

              {/* Items */}
              <div className="space-y-3">
                <h3 className="font-semibold text-sm border-b pb-1">Itens</h3>
                {selectedOrder.order_items.map((item) => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <div className="flex gap-2">
                      <span className="font-bold">{item.quantity}x</span>
                      <div>
                        <p>{item.product?.name}</p>
                        {item.note && <p className="text-xs text-muted-foreground italic">{item.note}</p>}
                      </div>
                    </div>
                    <span>{centsToBRL(item.total_price_cents)}</span>
                  </div>
                ))}
                <div className="border-t pt-2 flex justify-between font-bold">
                  <span>Total</span>
                  <span>{centsToBRL(selectedOrder.total_cents)}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-2">
                <h3 className="font-semibold text-sm border-b pb-1">Ações</h3>
                <div className="grid grid-cols-2 gap-2">
                  {selectedOrder.status === 'new' && (
                    <Button onClick={() => handleStatusChange(selectedOrder.id, 'accepted')}>
                      Aceitar
                    </Button>
                  )}
                  {selectedOrder.status === 'accepted' && (
                    <Button onClick={() => handleStatusChange(selectedOrder.id, 'preparing')}>
                      Iniciar Preparo
                    </Button>
                  )}
                  {selectedOrder.status === 'preparing' && (
                    <Button onClick={() => handleStatusChange(selectedOrder.id, 'ready')}>
                      Marcar como Pronto
                    </Button>
                  )}
                  {selectedOrder.status === 'ready' && (
                    <Button onClick={() => handleStatusChange(selectedOrder.id, 'completed')}>
                      Concluir
                    </Button>
                  )}
                  
                  {['new', 'accepted', 'preparing', 'ready'].includes(selectedOrder.status) && (
                    <Button variant="outline" className="text-destructive" onClick={() => setIsCancelDialogOpen(true)}>
                      Cancelar
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Cancellation Dialog */}
      <Dialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar Pedido</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja cancelar este pedido? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Motivo do cancelamento</Label>
            <Textarea 
              placeholder="Ex: Cliente desistiu, item sem estoque..." 
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCancelDialogOpen(false)}>Voltar</Button>
            <Button 
              variant="destructive" 
              disabled={cancelReason.length < 3 || statusMutation.isPending}
              onClick={handleCancelConfirm}
            >
              Confirmar Cancelamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
