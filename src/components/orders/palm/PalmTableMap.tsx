import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useRestaurant } from "@/lib/auth/RestaurantProvider";
import { listDiningTables, getOpenTableOrders, openTableOrder } from "@/lib/orders/queries";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Users } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export const PalmTableMap = () => {
  const navigate = useNavigate();
  const { currentRestaurantId } = useRestaurant();
  const { toast } = useToast();
  const [openingTableId, setOpeningTableId] = useState<string | null>(null);

  const { data: tables, isLoading: loadingTables } = useQuery({
    queryKey: ["dining-tables", currentRestaurantId],
    queryFn: () => listDiningTables(currentRestaurantId!),
    enabled: !!currentRestaurantId,
  });

  const { data: openOrders, isLoading: loadingOrders } = useQuery({
    queryKey: ["open-table-orders", currentRestaurantId],
    queryFn: () => getOpenTableOrders(currentRestaurantId!),
    enabled: !!currentRestaurantId,
  });

  const handleTableClick = async (tableId: string) => {
    if (!currentRestaurantId) return;
    
    // Check if there is already an open order for this table
    const existingOrder = openOrders?.find(o => o.table_id === tableId);
    if (existingOrder) {
      navigate(`/palm/order/${existingOrder.id}`);
      return;
    }

    // Otherwise open a new one
    setOpeningTableId(tableId);
    try {
      const orderId = await openTableOrder(currentRestaurantId, tableId);
      navigate(`/palm/order/${orderId}`);
    } catch (error) {
      toast({
        title: "Erro ao abrir mesa",
        description: "Não foi possível abrir a mesa selecionada.",
        variant: "destructive",
      });
    } finally {
      setOpeningTableId(null);
    }
  };

  if (loadingTables || loadingOrders) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="grid grid-cols-2 gap-4">
        {tables?.map((table) => {
          const hasOrder = openOrders?.some(o => o.table_id === table.id);
          const isOpening = openingTableId === table.id;

          return (
            <Button
              key={table.id}
              variant="outline"
              className={cn(
                "h-32 flex flex-col gap-2 border-2",
                hasOrder && "border-primary bg-primary/5",
                !hasOrder && "border-gray-200"
              )}
              onClick={() => handleTableClick(table.id)}
              disabled={!!openingTableId}
            >
              {isOpening ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : (
                <>
                  <span className="text-xl font-bold">{table.name}</span>
                  {hasOrder && (
                    <div className="flex items-center gap-1 text-primary text-xs font-medium">
                      <Users className="w-3 h-3" />
                      Ocupada
                    </div>
                  )}
                  {!hasOrder && (
                    <span className="text-muted-foreground text-xs">Disponível</span>
                  )}
                </>
              )}
            </Button>
          );
        })}
      </div>
    </div>
  );
};
