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
  Menu,
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
  const { memberships, currentRestaurantId, setCurrentRestaurantId } = useRestaurant();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const navItems = [
    { to: "/", icon: LayoutDashboard, label: "Dashboard" },
    { to: "/orders", icon: ClipboardList, label: "Pedidos" },
    { to: "/catalog/products", icon: BookOpen, label: "Cardápio" },
    { to: "/impressao", icon: Printer, label: "Impressão" },
  ];

  return (
    <div className="flex min-h-screen bg-white text-foreground font-sans relative">
      {/* Mobile Overlay - Solid Tint (no opacity class if possible, but black is needed) */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar - Fixed Width, Solid */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-[260px] bg-sidebar-background border-r border-sidebar-border transform transition-transform duration-200 lg:relative lg:translate-x-0",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
... // keep existing code
          <div className="p-4 border-t border-sidebar-border bg-sidebar-background">
... // keep existing code
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-white">
        <header className="h-14 border-b border-border bg-white flex items-center px-4 lg:hidden sticky top-0 z-30 shadow-sm">
... // keep existing code
        {/* Content - Full visibility, no blur */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 bg-white">
          <div className="max-w-[1400px] mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
