import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useRestaurant } from "@/lib/auth/RestaurantProvider";
import { getRestaurantOrders, addItemsToOrder, sendOrderToKitchen } from "@/lib/orders/queries";
import { listCategories, listPublicMenu } from "@/lib/catalog/queries";
import { usePalmCartStore } from "@/lib/orders/palmCartStore";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Send, ShoppingCart, Plus, Minus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { centsToBRL } from "@/lib/catalog/money";
import { cn } from "@/lib/utils";
import { PalmProductList } from "./PalmProductList";

export const PalmOrderFlow = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { currentRestaurantId } = useRestaurant();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("cart");
  const [sending, setSending] = useState(false);

  const { data: orders, refetch: refetchOrder, isLoading: loadingOrder } = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => getRestaurantOrders(currentRestaurantId!),
    enabled: !!currentRestaurantId && !!orderId,
    select: (data) => data.find(o => o.id === orderId),
  });

  const cart = usePalmCartStore();
  const draftItems = cart.getItems(orderId || null);

  const handleSendToKitchen = async () => {
    if (!orderId || draftItems.length === 0) return;
    setSending(true);
    try {
      // 1. Add items to order
      await addItemsToOrder(orderId, draftItems.map(item => ({
        product_id: item.product_id,
        variation_id: item.variation_id,
        quantity: item.quantity,
        notes: item.notes,
        flavors: item.flavors,
        additions: item.additions?.map(a => ({
          option_item_id: a.id,
          quantity: a.quantity
        }))
      })));

      // 2. Send to kitchen (trigger printing/KDS)
      await sendOrderToKitchen(orderId);

      // 3. Clear local cart
      cart.clearOrderCart(orderId);
      
      toast({
        title: "Pedido enviado!",
        description: "Os itens foram encaminhados para a cozinha.",
      });
      
      refetchOrder();
      setActiveTab("cart");
    } catch (error) {
      toast({
        title: "Erro ao enviar",
        description: "Não foi possível enviar os itens para a cozinha.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  if (loadingOrder) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!orders) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground">Pedido não encontrado.</p>
        <Button variant="link" onClick={() => navigate("/palm")}>Voltar</Button>
      </div>
    );
  }

  const tableInfo = orders.table?.name ? `Mesa ${orders.table.name}` : orders.service_mode === 'counter' ? 'Balcão' : 'Delivery';

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2 bg-white border-b flex justify-between items-center">
        <span className="font-bold text-sm">{tableInfo}</span>
        <span className="text-xs text-muted-foreground">#{orderId?.slice(0, 8)}</span>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
        <div className="px-4 pt-2">
          <TabsList className="grid w-full grid-cols-2 h-12">
            <TabsTrigger value="cart" className="flex gap-2">
              <ShoppingCart className="w-4 h-4" />
              Itens ({orders.order_items.length + draftItems.length})
            </TabsTrigger>
            <TabsTrigger value="menu" className="flex gap-2">
              <Plus className="w-4 h-4" />
              Adicionar
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="cart" className="flex-1 overflow-y-auto m-0 p-4 space-y-4">
          {/* Draft Items */}
          {draftItems.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase text-orange-600 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-600 animate-pulse" />
                Novos itens (não enviados)
              </h3>
              {draftItems.map((item) => (
                <div key={item.id} className="bg-orange-50/50 border border-orange-100 p-3 rounded-lg flex justify-between items-start gap-3">
                  <div className="flex-1">
                    <p className="font-bold text-sm">{item.name}</p>
                    {item.notes && <p className="text-xs text-muted-foreground italic">{item.notes}</p>}
                    <div className="flex items-center gap-4 mt-2">
                      <div className="flex items-center gap-2 bg-white border rounded-md px-1">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-7 w-7" 
                          onClick={() => cart.updateItemQuantity(orderId!, item.id, Math.max(1, item.quantity - 1))}
                        >
                          <Minus className="w-3 h-3" />
                        </Button>
                        <span className="text-sm font-bold w-4 text-center">{item.quantity}</span>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-7 w-7" 
                          onClick={() => cart.updateItemQuantity(orderId!, item.id, item.quantity + 1)}
                        >
                          <Plus className="w-3 h-3" />
                        </Button>
                      </div>
                      <span className="text-sm font-medium">{centsToBRL(item.unit_price_cents * item.quantity)}</span>
                    </div>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-destructive"
                    onClick={() => cart.removeItem(orderId!, item.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Sent Items */}
          {orders.order_items.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase text-muted-foreground">Itens enviados</h3>
              {orders.order_items.map((item) => (
                <div key={item.id} className="bg-white border p-3 rounded-lg flex justify-between items-start opacity-75">
                  <div>
                    <p className="font-bold text-sm">{item.quantity}x {item.product?.name}</p>
                    <p className="text-[10px] text-muted-foreground uppercase">{item.status}</p>
                  </div>
                  <span className="text-sm font-medium">{centsToBRL(item.unit_price_cents * item.quantity)}</span>
                </div>
              ))}
            </div>
          )}

          {draftItems.length === 0 && orders.order_items.length === 0 && (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
              <ShoppingCart className="w-12 h-12 mb-2 opacity-20" />
              <p>O carrinho está vazio.</p>
              <Button variant="link" onClick={() => setActiveTab("menu")}>Ver cardápio</Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="menu" className="flex-1 overflow-y-auto m-0">
          <PalmProductList orderId={orderId!} onAdded={() => setActiveTab("cart")} />
        </TabsContent>
      </Tabs>

      {draftItems.length > 0 && (
        <div className="p-4 bg-white border-t sticky bottom-0 z-10">
          <Button 
            className="w-full h-14 text-lg font-bold gap-2" 
            onClick={handleSendToKitchen}
            disabled={sending}
          >
            {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            Enviar para Cozinha
          </Button>
        </div>
      )}
    </div>
  );
};
