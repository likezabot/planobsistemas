import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listDiningTables, getOpenTableOrders, openTableOrder, closeOrder, sendOrderToKitchen, DiningTable } from "@/lib/orders/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, UserPlus, Receipt, ChefHat, Plus, Info } from "lucide-react";
import { useRestaurant } from "@/lib/auth/RestaurantProvider";
import { supabase } from "@/integrations/supabase/client";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription 
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function DiningTablesTab() {
  const { currentRestaurantId } = useRestaurant();
  const queryClient = useQueryClient();
  const [isCreateTableOpen, setIsCreateTableOpen] = useState(false);
  const [newTableName, setNewTableName] = useState("");
  const [newTableArea, setNewTableArea] = useState("");
  const [newTableSeats, setNewTableSeats] = useState("");

  const { data: tables, isLoading: isLoadingTables } = useQuery({
    queryKey: ["dining_tables", currentRestaurantId],
    queryFn: () => listDiningTables(currentRestaurantId!),
    enabled: !!currentRestaurantId,
  });

  const { data: openOrders, isLoading: isLoadingOrders } = useQuery({
    queryKey: ["open_table_orders", currentRestaurantId],
    queryFn: () => getOpenTableOrders(currentRestaurantId!),
    enabled: !!currentRestaurantId,
  });

  const createTableMutation = useMutation({
    mutationFn: async () => {
      const { data: restaurant } = await supabase
        .from('restaurants')
        .select('tenant_id')
        .eq('id', currentRestaurantId!)
        .single();

      const { error } = await supabase.from('dining_tables').insert({
        restaurant_id: currentRestaurantId!,
        tenant_id: restaurant?.tenant_id,
        name: newTableName,
        area: newTableArea || null,
        seats: newTableSeats ? parseInt(newTableSeats) : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dining_tables"] });
      toast.success("Mesa criada com sucesso!");
      setIsCreateTableOpen(false);
      setNewTableName("");
      setNewTableArea("");
      setNewTableSeats("");
    },
    onError: (error: any) => toast.error(error.message || "Erro ao criar mesa"),
  });

  const openOrderMutation = useMutation({
    mutationFn: (tableId: string) => openTableOrder(currentRestaurantId!, tableId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["open_table_orders"] });
      toast.success("Comanda aberta!");
    },
    onError: (error: any) => toast.error(error.message || "Erro ao abrir comanda"),
  });

  const closeOrderMutation = useMutation({
    mutationFn: ({ orderId, paymentMethod }: { orderId: string; paymentMethod: any }) => closeOrder(orderId, paymentMethod),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["open_table_orders", "orders"] });
      toast.success("Conta fechada com sucesso!");
    },
    onError: (error: any) => toast.error(error.message || "Erro ao fechar conta"),
  });

  const sendToKitchenMutation = useMutation({
    mutationFn: (orderId: string) => sendOrderToKitchen(orderId),
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["open_table_orders", "orders"] });
      toast.success(`${count} itens enviados para a cozinha!`);
    },
    onError: (error: any) => toast.error(error.message || "Erro ao enviar para cozinha"),
  });

  if (isLoadingTables || isLoadingOrders) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold flex items-center gap-2">
          Gestão de Mesas
          <Badge variant="outline" className="font-normal text-[10px] uppercase tracking-wider">F1 Fundação</Badge>
        </h2>
        <Button size="sm" onClick={() => setIsCreateTableOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Nova Mesa
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {tables?.map((table) => {
          const openOrder = openOrders?.find((o: any) => o.table_id === table.id);
          return (
            <Card key={table.id} className={openOrder ? "border-primary/20 shadow-sm" : "border-border opacity-80"}>
              <CardHeader className="p-4 pb-2">
                <div className="flex justify-between items-start">
                  <CardTitle className="text-md font-bold">{table.name}</CardTitle>
                  <Badge variant={openOrder ? "default" : "secondary"} className="text-[10px]">
                    {openOrder ? "OCUPADA" : "LIVRE"}
                  </Badge>
                </div>
                {table.area && <p className="text-[10px] text-muted-foreground uppercase">{table.area}</p>}
              </CardHeader>
              <CardContent className="p-4 pt-2 space-y-4">
                {openOrder ? (
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-medium">
                      <span>Pedido: {openOrder.id.slice(0, 8)}</span>
                    </div>
                    <div className="flex flex-col gap-2 pt-2">
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="w-full text-xs h-8"
                        onClick={() => sendToKitchenMutation.mutate(openOrder.id)}
                        disabled={sendToKitchenMutation.isPending}
                      >
                        <ChefHat className="w-3.5 h-3.5 mr-2" />
                        Cozinha
                      </Button>
                      <Button 
                        size="sm" 
                        className="w-full text-xs h-8 bg-success hover:bg-success/90"
                        onClick={() => {
                          const method = prompt("Método de pagamento (money, card, pix, online):", "money");
                          if (method && ["money", "card", "pix", "online"].includes(method)) {
                            closeOrderMutation.mutate({ orderId: openOrder.id, paymentMethod: method });
                          }
                        }}
                        disabled={closeOrderMutation.isPending}
                      >
                        <Receipt className="w-3.5 h-3.5 mr-2" />
                        Fechar Conta
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button 
                    variant="ghost" 
                    className="w-full border border-dashed border-border h-16 text-muted-foreground hover:text-primary hover:border-primary/50"
                    onClick={() => openOrderMutation.mutate(table.id)}
                    disabled={openOrderMutation.isPending}
                  >
                    <UserPlus className="w-4 h-4 mr-2" />
                    Abrir Comanda
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={isCreateTableOpen} onOpenChange={setIsCreateTableOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Mesa</DialogTitle>
            <DialogDescription>Cadastre uma nova mesa para atendimento.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nome da Mesa</Label>
              <Input placeholder="Ex: Mesa 01" value={newTableName} onChange={(e) => setNewTableName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Área/Setor</Label>
              <Input placeholder="Ex: Salão Principal" value={newTableArea} onChange={(e) => setNewTableArea(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Assentos</Label>
              <Input type="number" placeholder="4" value={newTableSeats} onChange={(e) => setNewTableSeats(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsCreateTableOpen(false)}>Cancelar</Button>
            <Button onClick={() => createTableMutation.mutate()} disabled={!newTableName || createTableMutation.isPending}>
              Salvar Mesa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
