import { useState, useEffect } from "react";
import { useRestaurant } from "@/lib/auth/RestaurantProvider";
import { getActiveOrdersSummary, createCounterOrder, PDVActiveOrdersSummary } from "@/lib/orders/queries";
// ... keep existing code
export interface SelectedOrder {
  id: string;
  order_id?: string;
  type: 'counter' | 'table' | 'delivery';
  name?: string;
  customer_name?: string;
  status?: string;
}

export default function PDV() {
  const { currentRestaurantId } = useRestaurant();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PDVActiveOrdersSummary | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<SelectedOrder | null>(null);
  const [productSelectorOpen, setProductSelectorOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchData = async () => {
    if (!currentRestaurantId) return;
    try {
      const summary = await getActiveOrdersSummary(currentRestaurantId);
      setData(summary);
      
      // Update selected order if it exists
      if (selectedOrder) {
        // We might want to refresh details specifically, but for now we just keep the ID
      }
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
      
      const channel = supabase.channel('pdv_realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${currentRestaurantId}` }, () => fetchData())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => fetchData())
        .subscribe();
        
      return () => { supabase.removeChannel(channel); };
    }
  }, [currentRestaurantId]);

  const handleCreateCounterOrder = async () => {
    if (!currentRestaurantId) return;
    try {
      const orderId = await createCounterOrder(currentRestaurantId);
      toast({ title: "Sucesso", description: "Comanda balcão aberta." });
      setSelectedOrder({ id: orderId, type: 'counter' });
      fetchData();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-[70vh]">
      <Loader2 className="animate-spin w-10 h-10 text-primary mb-4" />
      <p className="text-muted-foreground">Carregando PDV...</p>
    </div>
  );

  return (
    <div className="flex flex-col h-[calc(100vh-140px)]">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <LayoutDashboard className="w-6 h-6 text-primary" /> PDV Desktop
        </h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <History className="w-4 h-4 mr-2" /> Histórico do Dia
          </Button>
          <Button size="sm" onClick={handleCreateCounterOrder}>
            <Plus className="w-4 h-4 mr-2" /> Novo Balcão
          </Button>
        </div>
      </div>

      {currentRestaurantId && (
        <div className="mb-4">
          <CashSessionBar restaurantId={currentRestaurantId} />
        </div>
      )}

      <div className="flex-1 grid grid-cols-12 gap-6 overflow-hidden">
        {/* Left Area: Filters and Search */}
        <div className="col-span-3 border-r pr-2 flex flex-col gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Buscar mesa/pedido..." 
              className="pl-9 h-9 text-xs"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <PDVOrderList 
            data={data} 
            selectedOrderId={selectedOrder?.order_id || selectedOrder?.id} 
            onSelectOrder={setSelectedOrder} 
          />
        </div>
        
        {/* Center Area: Active Orders Cards (already handled by PDVOrderList in this simplified layout) */}
        
        {/* Right Area: Order Details */}
        <div className="col-span-9 bg-white rounded-xl border shadow-sm overflow-hidden flex flex-col">
          <PDVOrderDetails 
            orderId={selectedOrder?.order_id || selectedOrder?.id || null} 
            onRefresh={fetchData} 
            onOpenProductSelector={() => setProductSelectorOpen(true)}
          />
        </div>
      </div>

      {selectedOrder && (
        <PDVProductSelector 
          orderId={selectedOrder.order_id || selectedOrder.id}
          open={productSelectorOpen}
          onOpenChange={setProductSelectorOpen}
          onSuccess={() => {
            fetchData();
            // The details component will refresh via its own effect on orderId
          }}
          restaurantId={currentRestaurantId!}
        />
      )}
    </div>
  );
}
