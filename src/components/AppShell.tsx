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
  Settings,
  Menu,
  X,
  User,
  ChevronRight
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
        "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group",
        active 
          ? "bg-primary text-white shadow-button scale-[1.02]" 
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-white"
      )}
    >
      <Icon className={cn("w-5 h-5", active ? "text-white" : "group-hover:scale-110 transition-transform")} />
      <span className="font-semibold">{label}</span>
      {active && <ChevronRight className="ml-auto w-4 h-4 opacity-50" />}
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const { memberships, currentRestaurantId, currentMembership, setCurrentRestaurantId } = useRestaurant();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const navItems = [
    { to: "/", icon: LayoutDashboard, label: "Dashboard" },
    { to: "/orders", icon: ClipboardList, label: "Pedidos" },
    { to: "/catalog/products", icon: BookOpen, label: "Cardápio" },
    { to: "/impressao", icon: Printer, label: "Impressão" },
  ];

  return (
    <div className="flex min-h-screen bg-background text-foreground font-sans">
      {/* Mobile Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden transition-opacity"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-72 bg-sidebar-background border-r border-sidebar-border transform transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 shadow-premium",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex flex-col h-full p-6">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-10 px-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary shadow-button">
              <Store className="h-6 w-6 text-white" />
            </div>
            <div>
              <span className="text-xl font-display font-bold text-white tracking-tight">Plano B</span>
              <p className="text-[10px] uppercase tracking-widest text-primary font-bold">Gastronomia SaaS</p>
            </div>
          </div>

          {/* Restaurant Selector */}
          <div className="mb-8 px-2">
            <Label className="text-[10px] uppercase tracking-widest text-sidebar-foreground/40 font-bold mb-2 block">
              Estabelecimento
            </Label>
            <Select
              value={currentRestaurantId ?? undefined}
              onValueChange={setCurrentRestaurantId}
              disabled={memberships.length === 0}
            >
              <SelectTrigger className="h-12 w-full bg-sidebar-accent border-sidebar-border text-white rounded-xl focus:ring-primary">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent className="bg-sidebar-background border-sidebar-border text-white">
                {memberships.map((m) => (
                  <SelectItem key={m.restaurant_id} value={m.restaurant_id} className="hover:bg-sidebar-accent">
                    {m.restaurants.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Nav Links */}
          <nav className="flex-1 space-y-2">
            {navItems.map((item) => (
              <NavItem 
                key={item.to} 
                {...item} 
                active={location.pathname === item.to || (item.to !== '/' && location.pathname.startsWith(item.to))}
                onClick={() => setIsSidebarOpen(false)}
              />
            ))}
          </nav>

          {/* Footer User Profile */}
          <div className="mt-auto pt-6 border-t border-sidebar-border px-2">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-sidebar-accent flex items-center justify-center text-primary border border-sidebar-border">
                <User className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white truncate">{user?.email?.split('@')[0]}</p>
                <p className="text-[10px] text-sidebar-foreground/40 truncate">{user?.email}</p>
              </div>
            </div>
            <Button 
              size="sm" 
              variant="ghost" 
              className="w-full justify-start text-sidebar-foreground/70 hover:text-white hover:bg-destructive/10 rounded-xl"
              onClick={signOut}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Encerrar Sessão
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header Mobile Only */}
        <header className="h-16 border-b border-border bg-card flex items-center px-4 lg:hidden sticky top-0 z-30">
          <Button variant="ghost" size="icon" className="rounded-xl" onClick={() => setIsSidebarOpen(true)}>
            <Menu className="w-6 h-6" />
          </Button>
          <div className="ml-4">
            <span className="font-display font-bold text-secondary">Plano B</span>
          </div>
        </header>

        {/* Dynamic Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8 bg-background">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

function Label({ children, className }: { children: ReactNode, className?: string }) {
  return <span className={cn("text-sm font-medium", className)}>{children}</span>;
}