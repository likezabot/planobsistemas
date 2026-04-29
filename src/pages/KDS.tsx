import { useState, useEffect, useMemo } from "react";
import { useRestaurant } from "@/lib/auth/RestaurantProvider";
import { getRestaurantOrders, updateOrderStatus, OrderWithItems, Order } from "@/lib/orders/queries";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Loader2, 
  Clock, 
  ShoppingBag, 
  Truck, 
  CheckCircle2, 
  Play, 
  Check, 
  AlertCircle,
  Wifi,
  WifiOff
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

export default function KDS() {
  const { currentRestaurantId } = useRestaurant();
  const queryClient = useQueryClient();
  const [now, setNow] = useState(new Date());
  const [isLive, setIsLive] = useState(false);

  // Update clock every 30s for elapsed time
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const { data: orders, isLoading } = useQuery({
    queryKey: ["kds-orders", currentRestaurantId],
    queryFn: () => getRestaurantOrders(currentRestaurantId!),
    enabled: !!currentRestaurantId,
    refetchInterval: 60000, // Fallback safety
  });

  useEffect(() => {
    if (!currentRestaurantId) return;

    const channel = supabase
      .channel(`kds-${currentRestaurantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `restaurant_id=eq.${currentRestaurantId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["kds-orders", currentRestaurantId] });
        }
      )
      .subscribe((status) => {
        setIsLive(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentRestaurantId, queryClient]);

  const statusMutation = useMutation({
    mutationFn: ({ orderId, status }: { orderId: string; status: Order['status'] }) =>
      updateOrderStatus(orderId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kds-orders"] });
      toast.success("Status atualizado!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao atualizar status");
    },
  });

  const columns = useMemo(() => {
    if (!orders) return { new: [], preparing: [], ready: [] };
    
    return {
      new: orders.filter(o => o.status === 'new' || o.status === 'accepted'),
      preparing: orders.filter(o => o.status === 'preparing'),
      ready: orders.filter(o => o.status === 'ready'),
    };
  }, [orders]);

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center h-[70vh] gap-4">
          <Loader2 className="w-12 h-12 text-primary animate-spin" />
          <p className="text-xl font-bold text-muted-foreground animate-pulse">Carregando Cozinha...</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-6 h-full max-w-full">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-black text-secondary tracking-tight">KDS Cozinha</h1>
            <Badge variant={isLive ? "success" : "destructive"} className="h-6 gap-1.5 px-2 uppercase text-[10px] font-black tracking-widest">
              {isLive ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              {isLive ? "Ao Vivo" : "Desconectado"}
            </Badge>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">
              {now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 flex-1 min-h-[70vh]">
          <KDSColumn 
            title="Novos" 
            orders={columns.new} 
            onAction={(id, status) => statusMutation.mutate({ orderId: id, status })}
            actionLabel="Preparar"
            nextStatus="preparing"
            color="bg-primary/5"
            borderColor="border-primary/20"
          />
          <KDSColumn 
            title="Em Preparo" 
            orders={columns.preparing} 
            onAction={(id, status) => statusMutation.mutate({ orderId: id, status })}
            actionLabel="Pronto"
            nextStatus="ready"
            color="bg-warning/5"
            borderColor="border-warning/20"
          />
          <KDSColumn 
            title="Prontos" 
            orders={columns.ready} 
            onAction={(id, status) => statusMutation.mutate({ orderId: id, status })}
            actionLabel="Finalizar"
            nextStatus="completed"
            color="bg-success/5"
            borderColor="border-success/20"
          />
        </div>
      </div>
    </AppShell>
  );
}

function KDSColumn({ title, orders, onAction, actionLabel, nextStatus, color, borderColor }: { 
  title: string, 
  orders: OrderWithItems[], 
  onAction: (id: string, status: Order['status']) => void,
  actionLabel: string,
  nextStatus: Order['status'],
  color: string,
  borderColor: string
}) {
  return (
    <div className={cn("flex flex-col gap-4 p-4 rounded-2xl border-2 min-h-full", color, borderColor)}>
      <div className="flex items-center justify-between px-2">
        <h2 className="text-xl font-black uppercase tracking-widest text-secondary">{title}</h2>
        <Badge variant="outline" className="font-black h-7 min-w-[28px] flex items-center justify-center border-2 border-secondary/20 text-secondary">
          {orders.length}
        </Badge>
      </div>
      
      <div className="flex flex-col gap-4 overflow-y-auto">
        {orders.map(order => (
          <KDSCard 
            key={order.id} 
            order={order} 
            onAction={() => onAction(order.id, nextStatus)}
            actionLabel={actionLabel}
          />
        ))}
        {orders.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 opacity-20 italic">
            <ShoppingBag className="w-12 h-12 mb-2" />
            <p className="text-sm">Sem pedidos</p>
          </div>
        )}
      </div>
    </div>
  );
}

function KDSCard({ order, onAction, actionLabel }: { order: OrderWithItems, onAction: () => void, actionLabel: string }) {
  const timeSince = formatDistanceToNow(new Date(order.created_at), { addSuffix: true, locale: ptBR });
  const minutesElapsed = (new Date().getTime() - new Date(order.created_at).getTime()) / (1000 * 60);
  const isDelayed = order.status === 'preparing' && minutesElapsed > 20;

  return (
    <div className={cn(
      "bg-white rounded-xl p-5 shadow-sm border-2 transition-all flex flex-col gap-4",
      isDelayed ? "border-destructive ring-2 ring-destructive/20 animate-pulse-discrete" : "border-border hover:border-secondary/30"
    )}>
      <div className="flex justify-between items-start border-b border-border pb-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-1">
            #{order.id.slice(-4)}
          </div>
          <h3 className="text-xl font-black text-secondary uppercase leading-none">{order.customer_name}</h3>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge variant={order.order_type === 'delivery' ? 'warning' : 'success'} className="h-7 gap-1.5 px-3 uppercase text-[10px] font-black tracking-widest">
            {order.order_type === 'delivery' ? <Truck className="w-3.5 h-3.5" /> : <ShoppingBag className="w-3.5 h-3.5" />}
            {order.order_type === 'delivery' ? 'Entrega' : 'Retirada'}
          </Badge>
          <div className="flex items-center gap-1.5 text-muted-foreground text-[11px] font-bold">
            <Clock className="w-3.5 h-3.5" />
            <span>{timeSince}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 py-1">
        {order.order_items.map((item: any) => {
          const isPizza = item.customization?.flavors?.length > 0;
          return (
            <div key={item.id} className={cn(
              "p-3 rounded-lg border flex flex-col gap-2",
              isPizza ? "bg-primary/5 border-primary/20" : "bg-muted/30 border-border/50"
            )}>
              <div className="flex items-center gap-3">
                <span className="flex items-center justify-center bg-secondary text-white font-black text-lg w-10 h-10 rounded-lg">
                  {item.quantity}x
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-black text-secondary leading-tight">{item.product?.name}</p>
                  {item.customization?.variation && (
                    <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                      Tamanho: {item.customization.variation.name}
                    </p>
                  )}
                </div>
              </div>

              {isPizza && (
                <div className="space-y-2 border-t border-primary/10 pt-2">
                  <div className="flex flex-wrap gap-2">
                    {item.customization.flavors.map((f: any) => (
                      <Badge key={f.id} variant="outline" className="bg-white border-primary/30 text-primary font-black uppercase text-[10px] px-2 py-1">
                        {f.name}
                      </Badge>
                    ))}
                  </div>
                  {item.customization.options?.length > 0 && (
                    <div className="text-[10px] text-muted-foreground flex flex-wrap gap-x-2">
                      <span className="font-black uppercase">Adicionais:</span>
                      {item.customization.options.map((o: any) => o.name).join(', ')}
                    </div>
                  )}
                </div>
              )}

              {item.note && (
                <div className="bg-warning/20 p-2 rounded border border-warning/30 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                  <p className="text-xs font-bold text-secondary italic">OBS: {item.note}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {order.notes && (
        <div className="p-3 bg-secondary/5 border-2 border-dashed border-secondary/10 rounded-xl">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Observação do Pedido:</p>
          <p className="text-sm font-bold text-secondary italic">"{order.notes}"</p>
        </div>
      )}

      <Button 
        size="lg"
        className="h-14 rounded-xl text-lg font-black uppercase tracking-widest gap-3 shadow-lg transition-transform active:scale-95"
        onClick={onAction}
      >
        {actionLabel === 'Preparar' && <Play className="w-6 h-6" />}
        {actionLabel === 'Pronto' && <CheckCircle2 className="w-6 h-6" />}
        {actionLabel === 'Finalizar' && <Check className="w-6 h-6" />}
        {actionLabel}
      </Button>
    </div>
  );
}
