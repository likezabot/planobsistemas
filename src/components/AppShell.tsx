import { ReactNode, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useRestaurant } from "@/lib/auth/RestaurantProvider";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  LogOut, 
  Store, 
  LayoutDashboard, 
  ClipboardList, 
  BookOpen, 
  Printer, 
  Pizza,
  Calculator,
  Menu,
  User,
  ChevronRight,
  ChefHat,
  BarChart2,
  Users,
  MapPin,
  Ticket,
  Smartphone
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

interface NavItemProps {
  to: string;
  icon: React.ElementType;
  label: string;
  active?: boolean;
  onClick?: () => void;
}

function NavItem({ to, icon: Icon, label, active, onClick }: NavItemProps) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors group",
        active 
          ? "bg-primary text-white font-bold" 
          : "text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-white"
      )}
    >
      <Icon className={cn("w-4 h-4", active ? "text-white" : "group-hover:text-white")} />
      <span className="text-sm">{label}</span>
      {active && <ChevronRight className="ml-auto w-3.5 h-3.5 opacity-40" />}
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const { memberships, currentRestaurantId, currentMembership, setCurrentRestaurantId } = useRestaurant();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const accountingEnabled = currentMembership?.restaurants.accounting_reports_enabled ?? false;
  const role = currentMembership?.role;
  const isAdmin = role === "owner" || role === "manager";
  // Owner/manager sempre veem (para poder ativar). Cashier só vê quando ativo. Waiter/kitchen/anon nunca.
  const canSeeAccounting = isAdmin || (accountingEnabled && role === "cashier");
  const canSeeKDS = role === "owner" || role === "manager" || role === "kitchen";
  const canSeeReports = role === "owner" || role === "manager";
  const canSeePalm = role === "owner" || role === "manager" || role === "waiter" || role === "cashier";
  const canSeePDV = role === "owner" || role === "manager" || role === "cashier";

  const navItems = [
    { to: "/", icon: LayoutDashboard, label: "Dashboard" },
    ...(canSeePalm ? [{ to: "/palm", icon: Smartphone, label: "Atendimento" }] : []),
    ...(canSeePDV ? [{ to: "/pdv", icon: Ticket, label: "PDV" }] : []),
    { to: "/pedidos", icon: ClipboardList, label: "Pedidos" },
    { to: "/catalogo", icon: BookOpen, label: "Cardápio" },
    { to: "/impressao", icon: Printer, label: "Impressão" },
    ...(canSeeKDS ? [{ to: "/kds", icon: ChefHat, label: "Cozinha" }] : []),
    ...(canSeeReports ? [
      { to: "/relatorios", icon: BarChart2, label: "Relatórios" }, 
      { to: "/clientes", icon: Users, label: "Clientes" },
      { to: "/cupons", icon: Ticket, label: "Cupons" },
      { to: "/configuracoes/entrega", icon: MapPin, label: "Entrega" }
    ] : []),
    ...(canSeeAccounting ? [{ to: "/contador", icon: Calculator, label: "Contador" }] : []),
  ];


  return (
    <div className="flex min-h-screen bg-white text-foreground font-sans relative">
      {/* Mobile Overlay - Solid Tint */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar - Fixed Width, Solid */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-[260px] bg-sidebar-background opacity-100 border-r border-sidebar-border transform transition-transform duration-200 lg:relative lg:translate-x-0",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex flex-col h-full">
          <div className="p-6 mb-2">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary shadow-sm">
                <Store className="h-5 w-5 text-white" />
              </div>
              <div>
                <span className="text-lg font-bold text-white tracking-tight">Plano B</span>
                <p className="text-[9px] uppercase tracking-widest text-primary font-bold leading-none mt-0.5">Sistema Gestão</p>
              </div>
            </div>
          </div>

          <div className="px-4 flex-1 overflow-y-auto space-y-6">
            <div className="space-y-2">
              <p className="px-2 text-[10px] uppercase tracking-widest text-sidebar-foreground/30 font-bold">Unidade</p>
              <Select
                value={currentRestaurantId ?? undefined}
                onValueChange={setCurrentRestaurantId}
                disabled={memberships.length === 0}
              >
                <SelectTrigger className="h-10 w-full bg-sidebar-accent border-sidebar-border text-white rounded-lg focus:ring-primary text-xs">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent className="bg-sidebar-background border-sidebar-border text-white">
                  {memberships.map((m) => (
                    <SelectItem key={m.restaurant_id} value={m.restaurant_id} className="text-xs">
                      {m.restaurants.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <nav className="space-y-1">
              {navItems.map((item) => (
                <NavItem 
                  key={item.to} 
                  {...item} 
                  active={location.pathname === item.to || (item.to !== '/' && location.pathname.startsWith(item.to))}
                  onClick={() => setIsSidebarOpen(false)}
                />
              ))}
            </nav>
          </div>

          <div className="p-4 border-t border-sidebar-border bg-sidebar-background opacity-100">
            <div className="flex items-center gap-3 px-2 mb-3">
              <div className="w-8 h-8 rounded-full bg-sidebar-accent flex items-center justify-center text-primary border border-sidebar-border shrink-0">
                <User className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-white truncate">{user?.email?.split('@')[0]}</p>
                <p className="text-[10px] text-sidebar-foreground/40 truncate">{user?.email}</p>
              </div>
            </div>
            <Button 
              size="sm" 
              variant="ghost" 
              className="w-full h-9 justify-start text-sidebar-foreground/60 hover:text-white hover:bg-destructive/10 rounded-lg text-xs font-medium"
              onClick={signOut}
            >
              <LogOut className="mr-2 h-3.5 w-3.5" />
              Sair
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-white">
        <header className="h-14 border-b border-border bg-white flex items-center px-4 lg:hidden sticky top-0 z-30 shadow-sm">
          <Button variant="ghost" size="icon" className="rounded-lg" onClick={() => setIsSidebarOpen(true)}>
            <Menu className="w-5 h-5" />
          </Button>
          <div className="ml-3">
            <span className="font-bold text-secondary text-base">Plano B</span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 bg-white">
          <div className="max-w-[1400px] mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
