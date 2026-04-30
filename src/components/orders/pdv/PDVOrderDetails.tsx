import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Printer, ChefHat, CreditCard, DollarSign, XCircle, Trash2, Plus, ClipboardList } from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { sendOrderToKitchen, closeOrder, requestAccountPrint, cancelOrderItem } from "@/lib/orders/queries";
import { useRestaurant } from "@/lib/auth/RestaurantProvider";

interface PDVOrderDetailsProps {
  orderId: string | null;
  onRefresh: () => void;
  onOpenProductSelector: () => void;
}

export function PDVOrderDetails({ orderId, onRefresh, onOpenProductSelector }: PDVOrderDetailsProps) {
  const { toast } = useToast();
  const { currentMembership } = useRestaurant();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetchOrderDetails = async () => {
    if (!orderId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        order_items (
          *,
          product:products (name)
        )
      `)
      .eq('id', orderId)
      .single();

    if (error) {
      console.error(error);
    } else {
      setOrder(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchOrderDetails();
  }, [orderId]);

  const handleSendToKitchen = async () => {
    if (!orderId) return;
    try {
      await sendOrderToKitchen(orderId);
      toast({ title: "Enviado", description: "Pedido enviado para a cozinha." });
      fetchOrderDetails();
      onRefresh();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  const handlePrintAccount = async () => {
    if (!orderId) return;
    try {
      await requestAccountPrint(orderId);
      toast({ title: "Imprimindo", description: "Pré-conta enviada para impressão." });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  const handleCloseOrder = async (method: 'money' | 'card' | 'pix') => {
    if (!orderId) return;
    try {
      await closeOrder(orderId, method);
      toast({ title: "Fechado", description: "Pedido encerrado com sucesso." });
      setOrder(null);
      onRefresh();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  const handleCancelItem = async (itemId: string) => {
    const reason = window.prompt("Motivo do cancelamento:");
    if (!reason || reason.length < 3) {
      if (reason) toast({ title: "Erro", description: "Motivo muito curto.", variant: "destructive" });
      return;
    }

    try {
      await cancelOrderItem(itemId, reason);
      toast({ title: "Cancelado", description: "Item cancelado com sucesso." });
      fetchOrderDetails();
      onRefresh();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  if (!orderId) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
        <ClipboardList className="w-12 h-12 mb-2 opacity-20" />
        <p>Selecione um pedido para ver detalhes</p>
      </div>
    );
  }

  if (loading && !order) return <div className="p-4">Carregando...</div>;

  const hasDraftItems = order?.order_items?.some((i: any) => i.status === 'draft');
  const role = currentMembership?.role;
  const isAuthorizedToCancelAny = role === 'owner' || role === 'manager';

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b flex justify-between items-center bg-muted/30">
        <div>
          <h2 className="font-bold text-lg">#{order.id.slice(0, 4)} - {order.customer_name || 'Mesa/Balcão'}</h2>
          <p className="text-xs text-muted-foreground">{new Date(order.created_at).toLocaleString()}</p>
        </div>
        <Badge variant={order.payment_status === 'open' ? 'default' : 'secondary'}>
          {order.payment_status === 'open' ? 'ABERTO' : 'FECHADO'}
        </Badge>
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {order.order_items?.map((item: any) => (
            <div key={item.id} className={cn("flex justify-between items-start", item.status === 'cancelled' && "opacity-40 grayscale")}>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm">{item.quantity}x {item.product?.name}</span>
                  {item.status === 'draft' && <Badge variant="secondary" className="text-[8px] h-4">Draft</Badge>}
                  {item.status === 'sent' && <Badge variant="outline" className="text-[8px] h-4">Na Cozinha</Badge>}
                  {item.status === 'cancelled' && <Badge variant="destructive" className="text-[8px] h-4">Cancelado</Badge>}
                </div>
                {item.customization?.notes && <p className="text-[10px] text-muted-foreground italic">{item.customization.notes}</p>}
                {item.cancel_reason && <p className="text-[10px] text-destructive italic">Motivo: {item.cancel_reason}</p>}
              </div>
              <div className="text-right flex items-center gap-3">
                <span className="text-sm font-medium">{formatCurrency(item.total_price_cents / 100)}</span>
                {item.status !== 'cancelled' && (isAuthorizedToCancelAny || item.status === 'draft') && (
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleCancelItem(item.id)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="p-4 border-t bg-muted/10 space-y-4">
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Subtotal</span>
          <span className="font-medium">{formatCurrency(order.subtotal_cents / 100)}</span>
        </div>
        <Separator />
        <div className="flex justify-between items-center text-lg font-bold">
          <span>Total</span>
          <span className="text-primary">{formatCurrency(order.total_cents / 100)}</span>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onOpenProductSelector}>
            <Plus className="w-4 h-4 mr-1" /> Item
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrintAccount}>
            <Printer className="w-4 h-4 mr-1" /> Conta
          </Button>
          <Button 
            className="col-span-2" 
            disabled={!hasDraftItems} 
            onClick={handleSendToKitchen}
          >
            <ChefHat className="w-4 h-4 mr-2" /> Enviar para Cozinha
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Button variant="secondary" size="sm" className="bg-green-100 hover:bg-green-200 text-green-700 border-green-200" onClick={() => handleCloseOrder('money')}>
            <DollarSign className="w-4 h-4 mr-1" /> Dinheiro
          </Button>
          <Button variant="secondary" size="sm" className="bg-blue-100 hover:bg-blue-200 text-blue-700 border-blue-200" onClick={() => handleCloseOrder('card')}>
            <CreditCard className="w-4 h-4 mr-1" /> Cartão
          </Button>
          <Button variant="secondary" size="sm" className="bg-purple-100 hover:bg-purple-200 text-purple-700 border-purple-200" onClick={() => handleCloseOrder('pix')}>
            <Badge className="bg-transparent text-purple-700 p-0 mr-1">Pix</Badge> Pagamento
          </Button>
        </div>
      </div>
    </div>
  );
}