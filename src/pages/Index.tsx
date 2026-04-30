import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useRestaurant } from "@/lib/auth/RestaurantProvider";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { 
  TrendingUp, 
  Users, 
  ShoppingBag, 
  Clock, 
  ArrowUpRight, 
  Store,
  ExternalLink,
  Plus,
  Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { getDashboardMetrics } from "@/lib/orders/queries";
import { centsToBRL } from "@/lib/catalog/money";

type AppRole = Database["public"]["Enums"]["app_role"];

interface MemberRow {
  id: string;
  user_id: string;
  role: AppRole;
  created_at: string;
  full_name: string | null;
  email: string | null;
}

export default function Index() {
  const { currentMembership, currentRestaurantId, loading } = useRestaurant();
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  useEffect(() => {
    document.title = "Painel — Plano B SaaS Clean";
  }, []);

  useEffect(() => {
    if (!currentRestaurantId) return;
    setLoadingMembers(true);
    supabase
      .rpc("get_restaurant_team", { _restaurant_id: currentRestaurantId })
      .then(({ data, error }) => {
        if (error) console.error(error);
        setMembers((data as MemberRow[]) ?? []);
        setLoadingMembers(false);
      });
  }, [currentRestaurantId]);

  const { data: metrics, isLoading: loadingMetrics } = useQuery({
    queryKey: ["dashboard-metrics", currentRestaurantId],
    queryFn: () => getDashboardMetrics(currentRestaurantId!),
    enabled: !!currentRestaurantId,
    refetchInterval: 30000,
  });

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
        </div>
      </AppShell>
    );
  }

  if (!currentMembership) {
    return (
      <AppShell>
        <div className="bg-white border border-border p-12 text-center rounded-2xl max-w-xl mx-auto shadow-sm">
          <div className="w-16 h-16 bg-muted rounded-xl flex items-center justify-center mx-auto mb-6">
            <Store className="w-8 h-8 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-bold text-secondary">Bem-vindo ao Plano B</h2>
          <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
            Você ainda não pertence a nenhum estabelecimento cadastrado.
          </p>
          <Button className="mt-8 rounded-lg h-12 px-8 font-bold" variant="secondary">
            Verificar Convites
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-8 animate-in fade-in duration-500">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-secondary tracking-tight">Painel de Controle</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Bem-vindo ao <span className="text-primary font-bold">{currentMembership.restaurants.name}</span>.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" className="rounded-lg border-border h-10 shadow-sm">
              <Link to={`/menu/${currentMembership.restaurants.slug}`} target="_blank">
                <ExternalLink className="w-4 h-4 mr-2" />
                Abrir Cardápio
              </Link>
            </Button>
            <Button asChild className="rounded-lg h-10 shadow-sm font-bold">
              <Link to="/pedidos?novo=1">
                <Plus className="w-4 h-4 mr-2" />
                Novo Pedido
              </Link>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <DashboardStat 
            label="Vendas Hoje" 
            value={loadingMetrics ? "..." : centsToBRL(metrics?.salesToday || 0)} 
            trend={metrics?.trend} 
            icon={<TrendingUp className="w-5 h-5" />} 
            color="bg-primary" 
          />
          <DashboardStat 
            label="Pedidos" 
            value={loadingMetrics ? "..." : (metrics?.ordersToday || 0).toString()} 
            icon={<ShoppingBag className="w-5 h-5" />} 
            color="bg-success" 
          />
          <DashboardStat 
            label="Equipe" 
            value={members.length.toString()} 
            icon={<Users className="w-5 h-5" />} 
            color="bg-secondary" 
          />
          <DashboardStat 
            label="Médio Preparo" 
            value={loadingMetrics ? "..." : metrics?.avgPrepTime || "-- min"} 
            icon={<Clock className="w-5 h-5" />} 
            color="bg-warning" 
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 rounded-xl border-border bg-white shadow-sm overflow-hidden">
            <CardHeader className="p-6 border-b border-border">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-bold text-secondary">Vendas Semanais</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <div className="h-64 flex items-end justify-between gap-2 pt-10">
                {metrics?.weeklySales && metrics.weeklySales.length > 0 ? (
                  metrics.weeklySales.map((item, i) => (
                    <div key={i} className="flex-1 group flex flex-col items-center gap-2">
                      <div 
                        className="w-full bg-muted group-hover:bg-primary transition-all rounded-t-lg relative" 
                        style={{ height: `${Math.min((item.sales_cents / (metrics.maxWeeklySales || 1)) * 100, 100)}%` }}
                      >
                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-secondary text-white text-[10px] font-bold px-2 py-1 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                          {centsToBRL(item.sales_cents)}
                        </div>
                      </div>
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                        {item.dayLabel}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm italic">
                    Nenhum dado de venda nos últimos 7 dias.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-xl border-border bg-white shadow-sm overflow-hidden h-fit">
            <CardHeader className="p-6 border-b border-border">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-bold text-secondary">Equipe</CardTitle>
                <Badge className="bg-success text-white uppercase text-[8px] font-bold tracking-widest border-none">Online</Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loadingMembers ? (
                <div className="p-6 space-y-4">
                  {[1, 2, 3].map(i => <div key={i} className="h-10 bg-muted rounded-lg animate-pulse" />)}
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {members.map((m) => {
                    const displayName = m.full_name?.trim() || m.email || `Usuário ${m.user_id.slice(0, 6)}`;
                    const initial = (displayName[0] || "?").toUpperCase();
                    return (
                      <div key={m.id} className="p-4 flex items-center justify-between hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center text-white font-bold text-xs shrink-0">
                            {initial}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-secondary truncate" title={displayName}>{displayName}</p>
                            <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">{m.role}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="p-4">
                <Button variant="ghost" className="w-full rounded-lg text-xs font-bold text-primary hover:bg-muted">
                  Gerenciar Equipe
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function DashboardStat({ label, value, trend, icon, color }: { label: string, value: string, trend?: string, icon: React.ReactNode, color: string }) {
  return (
    <Card className="border-border bg-white shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center text-white shadow-sm", color)}>
            {icon}
          </div>
          {trend && (
            <div className={cn(
              "flex items-center text-[10px] font-bold px-2 py-0.5 rounded border border-current opacity-70",
              trend.startsWith('+') ? "text-success" : "text-destructive"
            )}>
              {trend.startsWith('+') ? <ArrowUpRight className="w-3 h-3 mr-0.5" /> : null}
              {trend}
            </div>
          )}
        </div>
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{label}</p>
        <p className="text-xl font-bold text-secondary mt-1 tracking-tight">{value}</p>
      </CardContent>
    </Card>
  );
}
