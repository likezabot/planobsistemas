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
  ChevronRight,
  Store,
  ExternalLink,
  Plus
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

type AppRole = Database["public"]["Enums"]["app_role"];

interface MemberRow {
  id: string;
  user_id: string;
  role: AppRole;
  created_at: string;
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
      .from("restaurant_members")
      .select("id, user_id, role, created_at")
      .eq("restaurant_id", currentRestaurantId)
      .then(({ data, error }) => {
        if (error) console.error(error);
        setMembers((data as MemberRow[]) ?? []);
        setLoadingMembers(false);
      });
  }, [currentRestaurantId]);

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-[60vh]">
          <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
      </AppShell>
    );
  }

  if (!currentMembership) {
    return (
      <AppShell>
        <div className="bg-card shadow-premium border border-border p-12 text-center rounded-[2.5rem] max-w-2xl mx-auto">
          <div className="w-20 h-20 bg-muted rounded-[2rem] flex items-center justify-center mx-auto mb-6">
            <Store className="w-10 h-10 text-muted-foreground" />
          </div>
          <h2 className="text-2xl font-display font-bold text-secondary">Nenhum restaurante encontrado</h2>
          <p className="mt-4 text-muted-foreground leading-relaxed">
            Você ainda não pertence a nenhum estabelecimento. Peça ao proprietário para te adicionar usando seu e-mail.
          </p>
          <Button className="mt-8 rounded-2xl h-14 px-8 font-bold" variant="secondary">
            Ver convites pendentes
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* Welcome Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-secondary">Olá, bem-vindo de volta!</h1>
            <p className="text-muted-foreground font-medium mt-1">
              Aqui está o que está acontecendo no <span className="text-primary font-bold">{currentMembership.restaurants.name}</span> hoje.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button asChild variant="outline" className="rounded-xl border-border h-12">
              <Link to={`/menu/${currentMembership.restaurants.slug}`} target="_blank">
                <ExternalLink className="w-4 h-4 mr-2" />
                Ver Cardápio Público
              </Link>
            </Button>
            <Button className="rounded-xl h-12 shadow-button">
              <Plus className="w-4 h-4 mr-2" />
              Novo Pedido (PDV)
            </Button>
          </div>
        </div>

        {/* Overview Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <DashboardStat 
            label="Vendas Hoje" 
            value="R$ 1.240,00" 
            trend="+12%" 
            icon={<TrendingUp className="w-5 h-5" />} 
            color="text-primary bg-primary/10" 
          />
          <DashboardStat 
            label="Pedidos Concluídos" 
            value="42" 
            trend="+5" 
            icon={<ShoppingBag className="w-5 h-5" />} 
            color="text-success bg-success/10" 
          />
          <DashboardStat 
            label="Membros Ativos" 
            value={members.length.toString()} 
            icon={<Users className="w-5 h-5" />} 
            color="text-secondary bg-secondary/10" 
          />
          <DashboardStat 
            label="Tempo Médio" 
            value="18 min" 
            trend="-2 min" 
            icon={<Clock className="w-5 h-5" />} 
            color="text-warning bg-warning/10" 
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Chart Area (Mock) */}
          <Card className="lg:col-span-2 rounded-[2rem] border-none shadow-card overflow-hidden">
            <CardHeader className="p-8 border-b border-border bg-card">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl font-display font-bold text-secondary">Desempenho Semanal</CardTitle>
                <Select defaultValue="7d">
                  <option value="7d">Últimos 7 dias</option>
                  <option value="30d">Últimos 30 dias</option>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="p-8">
              <div className="h-64 flex items-end justify-between gap-2">
                {[45, 60, 40, 75, 55, 90, 65].map((val, i) => (
                  <div key={i} className="flex-1 group flex flex-col items-center gap-2">
                    <div 
                      className="w-full bg-primary/20 group-hover:bg-primary transition-all rounded-t-lg relative" 
                      style={{ height: `${val}%` }}
                    >
                      <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-secondary text-white text-[10px] font-bold px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                        R$ {val * 10}
                      </div>
                    </div>
                    <span className="text-[10px] font-bold text-muted-foreground uppercase">
                      {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][i]}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Members Sidebar */}
          <Card className="rounded-[2.5rem] border-none shadow-card overflow-hidden h-fit">
            <CardHeader className="p-8 border-b border-border bg-card">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-display font-bold text-secondary">Equipe Ativa</CardTitle>
                <Badge className="bg-success/10 text-success border-success/20 uppercase text-[9px]">Online</Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loadingMembers ? (
                <div className="p-8 space-y-4">
                  {[1, 2, 3].map(i => <div key={i} className="h-12 bg-muted rounded-xl animate-pulse" />)}
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {members.map((m) => (
                    <div key={m.id} className="p-6 flex items-center justify-between hover:bg-muted/30 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                          {m.user_id.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-secondary">{m.user_id.slice(0, 8)}</p>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">{m.role}</p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  ))}
                </div>
              )}
              <div className="p-6">
                <Button variant="ghost" className="w-full rounded-xl text-xs font-bold text-primary hover:bg-primary/5">
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
    <Card className="border-none shadow-card hover:shadow-premium transition-all overflow-hidden bg-card">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", color)}>
            {icon}
          </div>
          {trend && (
            <div className={cn(
              "flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full",
              trend.startsWith('+') ? "text-success bg-success/10" : "text-destructive bg-destructive/10"
            )}>
              {trend.startsWith('+') ? <ArrowUpRight className="w-3 h-3 mr-0.5" /> : null}
              {trend}
            </div>
          )}
        </div>
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{label}</p>
        <p className="text-2xl font-display font-bold text-secondary mt-1">{value}</p>
      </CardContent>
    </Card>
  );
}

function Select({ children, defaultValue }: { children: React.ReactNode, defaultValue?: string }) {
  return (
    <select defaultValue={defaultValue} className="text-xs font-bold bg-muted border-none rounded-lg px-3 py-2 outline-none cursor-pointer hover:bg-muted/80 transition-colors">
      {children}
    </select>
  );
}