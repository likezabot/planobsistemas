import { useState, useMemo } from "react";
import { AppShell } from "@/components/AppShell";
import { useRestaurant } from "@/lib/auth/RestaurantProvider";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogDescription
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { 
  Search, 
  User, 
  Users,
  MessageCircle, 
  History, 
  ArrowUpDown,
  ShoppingBag,
  CreditCard,
  Calendar,
  ChevronRight,
  Loader2,
  TrendingUp
} from "lucide-react";
import { centsToBRL } from "@/lib/catalog/money";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface CustomerOrderHistory {
  id: string;
  created_at: string;
  total_cents: number;
  status: string;
  items: string[];
}

interface CustomerSummary {
  phone: string;
  name: string;
  order_count: number;
  total_spent_cents: number;
  avg_ticket_cents: number;
  last_visit: string;
  favorite_product: string;
  history: CustomerOrderHistory[];
}

type SortField = 'order_count' | 'total_spent_cents' | 'last_visit';

export default function Customers() {
  const { currentRestaurantId } = useRestaurant();
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<SortField>('last_visit');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSummary | null>(null);

  const { data: customers, isLoading, error } = useQuery({
    queryKey: ["customers-summary", currentRestaurantId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_customer_summary", {
        _restaurant_id: currentRestaurantId
      });
      if (error) throw error;
      return data as unknown as CustomerSummary[];
    },
    enabled: !!currentRestaurantId,
  });

  const filteredAndSortedCustomers = useMemo(() => {
    if (!customers) return [];

    let filtered = customers.filter(c => 
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      c.phone.includes(searchTerm)
    );

    return filtered.sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];

      if (sortField === 'last_visit') {
        const aDate = new Date(a.last_visit).getTime();
        const bDate = new Date(b.last_visit).getTime();
        return sortOrder === 'desc' ? bDate - aDate : aDate - bDate;
      }

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
      }

      return 0;
    });
  }, [customers, searchTerm, sortField, sortOrder]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  if (error) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center h-[60vh] gap-4 text-center">
          <p className="text-destructive font-bold">Erro ao carregar clientes.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-8 animate-in fade-in duration-500">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-secondary tracking-tight">Gestão de Clientes</h1>
            <p className="text-muted-foreground text-sm mt-1">Histórico e insights baseados nos pedidos realizados.</p>
          </div>
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Buscar por nome ou telefone..." 
              className="pl-9 bg-white border-border rounded-lg"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : filteredAndSortedCustomers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center bg-white rounded-xl border border-border">
            <Users className="w-12 h-12 text-muted-foreground/30 mb-4" />
            <p className="text-base font-bold text-secondary"> Nenhum cliente ainda </p>
            <p className="text-sm text-muted-foreground mt-1 mb-6"> Seus clientes aparecerão aqui assim que realizarem o primeiro pedido. </p>
          </div>
        ) : (
          <div className="bg-white border border-border rounded-xl overflow-hidden shadow-sm">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="font-bold text-secondary">Cliente</TableHead>
                  <TableHead className="cursor-pointer hover:text-primary transition-colors" onClick={() => toggleSort('order_count')}>
                    <div className="flex items-center gap-1">
                      Pedidos <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </TableHead>
                  <TableHead className="cursor-pointer hover:text-primary transition-colors" onClick={() => toggleSort('total_spent_cents')}>
                    <div className="flex items-center gap-1">
                      Total Gasto <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </TableHead>
                  <TableHead className="hidden md:table-cell cursor-pointer hover:text-primary transition-colors" onClick={() => toggleSort('last_visit')}>
                    <div className="flex items-center gap-1">
                      Última Visita <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </TableHead>
                  <TableHead className="hidden lg:table-cell font-bold text-secondary">Favorito</TableHead>
                  <TableHead className="text-right font-bold text-secondary">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAndSortedCustomers.map((customer) => (
                  <TableRow key={customer.phone} className="group hover:bg-muted/30 transition-colors">
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-bold text-secondary">{customer.name || "Sem nome"}</span>
                        <span className="text-xs text-muted-foreground">{customer.phone}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{customer.order_count}</TableCell>
                    <TableCell className="font-bold text-success">{centsToBRL(customer.total_spent_cents)}</TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                      {format(new Date(customer.last_visit), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {customer.favorite_product ? (
                        <Badge variant="secondary" className="bg-primary/5 text-primary text-[10px] font-black uppercase">
                          {customer.favorite_product}
                        </Badge>
                      ) : "--"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="rounded-lg hover:bg-secondary hover:text-white"
                        onClick={() => setSelectedCustomer(customer)}
                      >
                        Ver Detalhes
                        <ChevronRight className="w-4 h-4 ml-2" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <CustomerDetailModal 
        customer={selectedCustomer} 
        open={!!selectedCustomer} 
        onOpenChange={(open) => !open && setSelectedCustomer(null)} 
      />
    </AppShell>
  );
}

function CustomerDetailModal({ customer, open, onOpenChange }: { 
  customer: CustomerSummary | null, 
  open: boolean, 
  onOpenChange: (open: boolean) => void 
}) {
  if (!customer) return null;

  const whatsappUrl = `https://wa.me/55${customer.phone}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 overflow-hidden border-none shadow-2xl">
        <DialogHeader className="p-6 bg-secondary text-white shrink-0">
          <div className="flex justify-between items-start pr-8">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center text-white shadow-lg">
                <User className="w-6 h-6" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold text-white uppercase">{customer.name || "Sem Nome"}</DialogTitle>
                <DialogDescription className="text-white/60 font-bold">{customer.phone}</DialogDescription>
              </div>
            </div>
            <Button asChild size="sm" className="bg-success hover:bg-success/90 text-white font-black uppercase tracking-widest h-10 gap-2">
              <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="w-4 h-4" />
                WhatsApp
              </a>
            </Button>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-3 divide-x divide-border bg-muted/30 p-4 border-b border-border shrink-0">
          <div className="text-center p-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1 flex items-center justify-center gap-1">
              <ShoppingBag className="w-3 h-3" /> Pedidos
            </p>
            <p className="text-lg font-black text-secondary">{customer.order_count}</p>
          </div>
          <div className="text-center p-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1 flex items-center justify-center gap-1">
              <CreditCard className="w-3 h-3" /> Total Gasto
            </p>
            <p className="text-lg font-black text-success">{centsToBRL(customer.total_spent_cents)}</p>
          </div>
          <div className="text-center p-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1 flex items-center justify-center gap-1">
              <TrendingUp className="w-3 h-3" /> Ticket Médio
            </p>
            <p className="text-lg font-black text-secondary">{centsToBRL(customer.avg_ticket_cents)}</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div>
            <h3 className="text-sm font-black uppercase tracking-[0.2em] text-secondary flex items-center gap-2 mb-4">
              <History className="w-4 h-4 text-primary" /> Histórico de Pedidos
            </h3>
            <div className="space-y-3">
              {customer.history.map((order) => (
                <div key={order.id} className="bg-white border border-border rounded-xl p-4 shadow-sm hover:shadow-md transition-all group">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-primary" />
                      <span className="text-xs font-black text-secondary uppercase tracking-wider">
                        {format(new Date(order.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </span>
                    </div>
                    <Badge variant="outline" className={cn(
                      "text-[9px] font-black uppercase tracking-widest border-none px-2 py-0.5 shadow-sm",
                      order.status === 'completed' || order.status === 'delivered' ? 'bg-success text-white' : 
                      order.status === 'cancelled' ? 'bg-destructive text-white' : 'bg-warning text-white'
                    )}>
                      {order.status}
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground italic mb-2">
                    {order.items.join(", ")}
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-dashed border-border mt-2">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                      <Calendar className="w-3 h-3" /> ID: {order.id.slice(0, 8)}
                    </span>
                    <span className="font-black text-secondary">{centsToBRL(order.total_cents)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
