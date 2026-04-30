import { useState, useEffect } from "react";
import { useRestaurant } from "@/lib/auth/RestaurantProvider";
import { getActiveOrdersSummary, createCounterOrder, addItemsToOrder, sendOrderToKitchen, cancelOrderItem, closeOrder, requestAccountPrint } from "@/lib/orders/queries";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Printer, Trash2, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export default function PDV() {
  const { currentRestaurantId } = useRestaurant();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);

  const fetchData = async () => {
    if (!currentRestaurantId) return;
    try {
      const summary = await getActiveOrdersSummary(currentRestaurantId);
      setData(summary);
    } catch (error) {
      console.error(error);
      toast({ title: "Erro", description: "Falha ao carregar pedidos.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentRestaurantId) {
      fetchData();
      
      const channel = supabase.channel('orders_channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => fetchData())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => fetchData())
        .subscribe();
        
      return () => { supabase.removeChannel(channel); };
    }
  }, [currentRestaurantId]);

  if (loading) return <div className="flex justify-center p-10"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="grid grid-cols-12 gap-6 h-[80vh]">
      <div className="col-span-3 border-r pr-4">
        <h2 className="text-lg font-bold mb-4">Mesas / Comandas</h2>
        <div className="space-y-2 overflow-y-auto max-h-[70vh]">
          {data?.tables?.map((t: any) => (
            <Button key={t.id} variant={t.status === 'occupied' ? 'default' : 'outline'} className="w-full justify-between" onClick={() => setSelectedOrder(t)}>
              {t.name} {t.status === 'occupied' && '(Ocupado)'}
            </Button>
          ))}
        </div>
      </div>
      
      <div className="col-span-6 border-r pr-4">
        <h2 className="text-lg font-bold mb-4">Detalhes do Pedido</h2>
        {selectedOrder ? (
          <div>
            <p>Pedido: {selectedOrder.order_id || 'Nenhum'}</p>
            <div className="mt-4 flex gap-2">
              <Button onClick={() => requestAccountPrint(selectedOrder.order_id)}>Imprimir Conta</Button>
              <Button variant="destructive" onClick={() => closeOrder(selectedOrder.order_id, 'cash')}>Fechar Pedido (Dinheiro)</Button>
            </div>
          </div>
        ) : <p>Selecione uma mesa ou comando.</p>}
      </div>
      
      <div className="col-span-3">
        <h2 className="text-lg font-bold mb-4">Ações Rápidas</h2>
        <Button className="w-full mb-2" onClick={async () => {
          if (!currentRestaurantId) return;
          const id = await createCounterOrder(currentRestaurantId);
          toast({ title: "Sucesso", description: "Comanda balcão aberta." });
        }}>Novo Pedido Balcão</Button>
      </div>
    </div>
  );
}