import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils";
import { PDVActiveOrdersSummary, PDVTableSummary, PDVOrderSummary } from "@/lib/orders/queries";
import { SelectedOrder } from "@/pages/PDV";

interface PDVOrderListProps {
  data: PDVActiveOrdersSummary | null;
  selectedOrderId: string | null;
  onSelectOrder: (order: SelectedOrder) => void;
}

export function PDVOrderList({ data, selectedOrderId, onSelectOrder }: PDVOrderListProps) {
  return (
    <div className="h-full flex flex-col">
      <Tabs defaultValue="tables" className="flex-1 flex flex-col">
        <TabsList className="grid grid-cols-3 mb-4">
          <TabsTrigger value="tables">Mesas</TabsTrigger>
          <TabsTrigger value="counter">Balcão</TabsTrigger>
          <TabsTrigger value="delivery">Delivery</TabsTrigger>
        </TabsList>

        <ScrollArea className="flex-1 pr-4">
          <TabsContent value="tables" className="m-0">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {data?.tables?.map((table: PDVTableSummary) => (
                <Card 
                  key={table.id}
                  className={cn(
                    "cursor-pointer transition-all hover:ring-2 hover:ring-primary",
                    table.status === 'occupied' ? "bg-primary/5 border-primary/20" : "bg-white",
                    selectedOrderId === table.order_id && "ring-2 ring-primary bg-primary/10"
                  )}
                  onClick={() => onSelectOrder({ ...table, type: 'table' })}
                >
                  <CardContent className="p-3 text-center">
                    <p className="font-bold text-sm">{table.name}</p>
                    {table.status === 'occupied' ? (
                      <div className="mt-1">
                        <p className="text-[10px] text-muted-foreground">{formatCurrency(table.total_cents / 100)}</p>
                        <Badge variant="outline" className="text-[8px] h-4">Ocupada</Badge>
                      </div>
                    ) : (
                      <p className="text-[10px] text-muted-foreground mt-1">Livre</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="counter" className="m-0">
            <div className="space-y-2">
              {data?.counter_orders?.map((order: any) => (
                <Card 
                  key={order.id}
                  className={cn(
                    "cursor-pointer transition-all hover:bg-accent",
                    selectedOrderId === order.id && "bg-accent border-primary"
                  )}
                  onClick={() => onSelectOrder({ ...order, type: 'counter' })}
                >
                  <CardContent className="p-3 flex justify-between items-center">
                    <div>
                      <p className="font-bold text-sm">#{order.id.slice(0, 4)} - {order.customer_name || 'Balcão'}</p>
                      <p className="text-[10px] text-muted-foreground">{new Date(order.opened_at).toLocaleTimeString()}</p>
                    </div>
                    <p className="font-bold text-primary">{formatCurrency(order.total_cents / 100)}</p>
                  </CardContent>
                </Card>
              ))}
              {(!data?.counter_orders || data.counter_orders.length === 0) && (
                <p className="text-center py-10 text-muted-foreground text-sm">Nenhum pedido no balcão</p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="delivery" className="m-0">
            <div className="space-y-2">
              {data?.delivery_orders?.map((order: any) => (
                <Card 
                  key={order.id}
                  className={cn(
                    "cursor-pointer transition-all hover:bg-accent",
                    selectedOrderId === order.id && "bg-accent border-primary"
                  )}
                  onClick={() => onSelectOrder({ ...order, type: 'delivery' })}
                >
                  <CardContent className="p-3 flex justify-between items-center">
                    <div>
                      <p className="font-bold text-sm">#{order.id.slice(0, 4)} - {order.customer_name || 'Delivery'}</p>
                      <Badge className="text-[8px] h-4 mt-1">{order.status}</Badge>
                    </div>
                    <p className="font-bold text-primary">{formatCurrency(order.total_cents / 100)}</p>
                  </CardContent>
                </Card>
              ))}
              {(!data?.delivery_orders || data.delivery_orders.length === 0) && (
                <p className="text-center py-10 text-muted-foreground text-sm">Nenhum pedido delivery</p>
              )}
            </div>
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  );
}