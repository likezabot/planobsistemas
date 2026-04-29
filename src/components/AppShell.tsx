import { ReactNode } from "react";
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
import { LogOut, Store } from "lucide-react";

export function AppShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const { memberships, currentRestaurantId, currentMembership, setCurrentRestaurantId } =
    useRestaurant();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Store className="h-4 w-4" />
            </div>
            <span className="text-sm font-semibold tracking-tight">Plano B</span>
            <span className="text-mono-tag ml-1">saas clean</span>
          </div>

          <div className="ml-4 flex items-center gap-2">
            <span className="text-mono-tag">restaurante</span>
            <Select
              value={currentRestaurantId ?? undefined}
              onValueChange={setCurrentRestaurantId}
              disabled={memberships.length === 0}
            >
              <SelectTrigger className="h-8 w-[240px]">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {memberships.map((m) => (
                  <SelectItem key={m.restaurant_id} value={m.restaurant_id}>
                    {m.restaurants.name}
                    <span className="ml-2 text-xs text-muted-foreground">{m.role}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {currentMembership && (
              <span className="text-mono-tag">role · {currentMembership.role}</span>
            )}
          </div>

          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {user?.email}
            </span>
            <Button size="sm" variant="ghost" onClick={signOut}>
              <LogOut className="mr-2 h-4 w-4" />
              Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>

      <footer className="border-t border-border py-3">
        <div className="mx-auto max-w-7xl px-4 text-mono-tag">
          PRINT_ENGINE: n/a · APP_BUILD: dev · isolamento multi-tenant ativo
        </div>
      </footer>
    </div>
  );
}
