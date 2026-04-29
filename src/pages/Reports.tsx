import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useRestaurant } from "@/lib/auth/RestaurantProvider";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { centsToBRL } from "@/lib/catalog/money";
import { 
  TrendingUp, 
  ShoppingBag, 
  Clock, 
  Calendar,
  AlertCircle,
  Info
} from "lucide-react";
import {
  Tooltip as UiTooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

function InfoBalloon({ text }: { text: string }) {
  return (
    <TooltipProvider>
      <UiTooltip>
        <TooltipTrigger asChild>
          <div className="inline-flex items-center justify-center ml-1 cursor-help text-primary hover:text-primary/80 transition-colors">
            <Info className="w-3.5 h-3.5" />
          </div>
        </TooltipTrigger>
        <TooltipContent className="bg-secondary text-white border-none p-3 max-w-xs shadow-xl">
          <p className="text-xs leading-relaxed font-medium">{text}</p>
        </TooltipContent>
      </UiTooltip>
    </TooltipProvider>
  );
}

interface DashboardStats {
  daily_sales: { day: string; sales_cents: number; order_count: number }[];
  avg_ticket: number;
  best_dow: number | null;
  peak_hour: number | null;
  top_products: { name: string; qty: number }[];
  channel_stats: { name: string; value: number }[];
  pizza_enabled: boolean;
  pizza_ratio: { name: string; total_cents: number; order_count: number }[];
  pizza_flavors: { name: string; value: number }[];
  pizza_sizes: { name: string; value: number }[];
}

const COLORS = ['#E63946', '#1D3557', '#A8DADC', '#F4A261', '#E9C46A'];

const DOW_MAP: Record<number, string> = {
  0: "Domingo",
  1: "Segunda",
  2: "Terça",
  3: "Quarta",
  4: "Quinta",
  5: "Sexta",
  6: "Sábado"
};

export default function Reports() {
  const { currentRestaurantId } = useRestaurant();
  const [days, setDays] = useState("7");

  const { data, isLoading, error } = useQuery({
    queryKey: ["reports-stats", currentRestaurantId, days],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_dashboard_stats", {
        _restaurant_id: currentRestaurantId,
        _days_back: parseInt(days)
      });
      if (error) throw error;
      return data as unknown as DashboardStats;
    },
    enabled: !!currentRestaurantId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  if (error) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center h-[60vh] gap-4 text-center">
          <AlertCircle className="w-12 h-12 text-destructive" />
          <h2 className="text-xl font-bold text-secondary">Erro ao carregar relatórios</h2>
          <p className="text-muted-foreground max-w-md">Não foi possível buscar os dados de gestão. Tente novamente em instantes.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-8 animate-in fade-in duration-500">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-secondary tracking-tight">Relatórios de Gestão</h1>
            <p className="text-muted-foreground text-sm mt-1">Análise visual de performance e tendências.</p>
          </div>
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-[180px] bg-white border-border rounded-lg h-10 shadow-sm font-bold">
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent className="bg-white border-border">
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="90">Últimos 90 dias</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <ReportsSkeleton />
        ) : !data || data.daily_sales.length === 0 ? (
          <div className="bg-white border-2 border-dashed border-border p-20 text-center rounded-2xl opacity-40">
            <ShoppingBag className="w-12 h-12 mx-auto mb-4" />
            <p className="font-bold text-lg">Sem dados no período</p>
            <p className="text-sm">Tente selecionar um período maior ou aguarde novas vendas.</p>
          </div>
        ) : (
          <div className="space-y-8 pb-10">
            {/* Top Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <ReportMetricCard 
                label="Ticket Médio" 
                value={centsToBRL(data.avg_ticket)} 
                icon={<TrendingUp className="w-5 h-5" />} 
                color="bg-primary" 
              />
              <ReportMetricCard 
                label="Melhor Dia" 
                value={data.best_dow !== null ? DOW_MAP[data.best_dow] : "--"} 
                icon={<Calendar className="w-5 h-5" />} 
                color="bg-secondary" 
              />
              <ReportMetricCard 
                label="Horário Pico" 
                value={data.peak_hour !== null ? `${data.peak_hour}:00` : "--"} 
                icon={<Clock className="w-5 h-5" />} 
                color="bg-warning" 
              />
              <ReportMetricCard 
                label="Total Pedidos" 
                value={data.daily_sales.reduce((acc, curr) => acc + curr.order_count, 0).toString()} 
                icon={<ShoppingBag className="w-5 h-5" />} 
                color="bg-success" 
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Sales Chart */}
              <Card className="lg:col-span-2 rounded-xl border-border bg-white shadow-sm overflow-hidden">
                <CardHeader className="p-6 border-b border-border">
                  <CardTitle className="text-lg font-bold text-secondary">Vendas por Dia (R$)</CardTitle>
                </CardHeader>
                <CardContent className="p-6 h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.daily_sales}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                      <XAxis 
                        dataKey="day" 
                        fontSize={10} 
                        fontWeight="bold" 
                        tickFormatter={(val) => val.split('-').reverse().slice(0, 2).join('/')}
                      />
                      <YAxis 
                        fontSize={10} 
                        fontWeight="bold" 
                        tickFormatter={(val) => `R$${val/100}`}
                      />
                      <Tooltip 
                        formatter={(val: number) => centsToBRL(val)}
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                      />
                      <Bar dataKey="sales_cents" fill="#E63946" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Channel Stats */}
              <Card className="rounded-xl border-border bg-white shadow-sm overflow-hidden">
                <CardHeader className="p-6 border-b border-border">
                  <CardTitle className="text-lg font-bold text-secondary">Pedidos por Canal</CardTitle>
                </CardHeader>
                <CardContent className="p-6 h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data.channel_stats}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={5}
                        dataKey="value"
                        label={({ name, percent }) => `${name === 'pickup' ? 'Retirada' : 'Entrega'} ${(percent * 100).toFixed(0)}%`}
                      >
                        {data.channel_stats.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend verticalAlign="bottom" height={36}/>
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* Top Products */}
            <Card className="rounded-xl border-border bg-white shadow-sm overflow-hidden">
              <CardHeader className="p-6 border-b border-border">
                <CardTitle className="text-lg font-bold text-secondary">Top 10 Produtos Mais Vendidos (Qtd)</CardTitle>
              </CardHeader>
              <CardContent className="p-6 h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart 
                    layout="vertical" 
                    data={data.top_products}
                    margin={{ left: 40 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} opacity={0.3} />
                    <XAxis type="number" fontSize={10} fontWeight="bold" />
                    <YAxis 
                      dataKey="name" 
                      type="category" 
                      fontSize={10} 
                      fontWeight="bold" 
                      width={120}
                    />
                    <Tooltip 
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                    />
                    <Bar dataKey="qty" fill="#1D3557" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Pizza Section */}
            {data.pizza_enabled && (
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className="h-0.5 flex-1 bg-border/50" />
                  <h2 className="text-xl font-black text-secondary uppercase tracking-widest flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-primary" /> Módulo Pizza
                  </h2>
                  <div className="h-0.5 flex-1 bg-border/50" />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Top Flavors */}
                  <Card className="rounded-xl border-border bg-white shadow-sm overflow-hidden">
                    <CardHeader className="p-6 border-b border-border">
                      <CardTitle className="text-lg font-bold text-secondary">Top 5 Sabores de Pizza</CardTitle>
                    </CardHeader>
                    <CardContent className="p-6 h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.pizza_flavors} layout="vertical" margin={{ left: 20 }}>
                          <XAxis type="number" hide />
                          <YAxis dataKey="name" type="category" width={100} fontSize={10} fontWeight="bold" />
                          <Tooltip />
                          <Bar dataKey="value" fill="#E63946" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  {/* Top Sizes */}
                  <Card className="rounded-xl border-border bg-white shadow-sm overflow-hidden">
                    <CardHeader className="p-6 border-b border-border">
                      <CardTitle className="text-lg font-bold text-secondary">Top 3 Tamanhos</CardTitle>
                    </CardHeader>
                    <CardContent className="p-6 h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={data.pizza_sizes}
                            innerRadius={50}
                            outerRadius={80}
                            paddingAngle={5}
                            dataKey="value"
                            label
                          >
                            {data.pizza_sizes.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function ReportMetricCard({ label, value, icon, color }: { label: string; value: string; icon: React.ReactNode; color: string }) {
  return (
    <Card className="border-border bg-white shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-white shadow-sm ${color}`}>
            {icon}
          </div>
        </div>
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{label}</p>
        <p className="text-xl font-bold text-secondary mt-1 tracking-tight">{value}</p>
      </CardContent>
    </Card>
  );
}

function ReportsSkeleton() {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-32 w-full rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Skeleton className="h-[460px] lg:col-span-2 rounded-xl" />
        <Skeleton className="h-[460px] rounded-xl" />
      </div>
    </div>
  );
}
