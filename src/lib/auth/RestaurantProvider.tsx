import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./AuthProvider";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

export interface RestaurantMembership {
  restaurant_id: string;
  tenant_id: string;
  role: AppRole;
  restaurants: {
    id: string;
    name: string;
    slug: string;
    tenant_id: string;
    inventory_enabled: boolean;
    inventory_mode: "simple" | "advanced";
    accounting_reports_enabled: boolean;
    pizza_module_enabled: boolean;
  };
}

interface RestaurantContextValue {
  memberships: RestaurantMembership[];
  currentRestaurantId: string | null;
  currentMembership: RestaurantMembership | null;
  setCurrentRestaurantId: (id: string) => void;
  loading: boolean;
  refresh: () => Promise<void>;
}

const RestaurantContext = createContext<RestaurantContextValue | undefined>(undefined);

const STORAGE_KEY = "planob.currentRestaurantId";

export function RestaurantProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [memberships, setMemberships] = useState<RestaurantMembership[]>([]);
  const [currentRestaurantId, setCurrentRestaurantIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMemberships = useCallback(async () => {
    if (!user) {
      setMemberships([]);
      setCurrentRestaurantIdState(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("restaurant_members")
      .select("restaurant_id, tenant_id, role, restaurants!inner(id, name, slug, tenant_id, inventory_enabled, inventory_mode, accounting_reports_enabled, pizza_module_enabled)")
      .eq("user_id", user.id);

    if (error) {
      console.error("[RestaurantProvider] failed to load memberships", error);
      setMemberships([]);
      setLoading(false);
      return;
    }

    const list = (data ?? []) as unknown as RestaurantMembership[];
    setMemberships(list);

    const stored = localStorage.getItem(STORAGE_KEY);
    const validStored = stored && list.find((m) => m.restaurant_id === stored);
    const next = validStored ? stored : list[0]?.restaurant_id ?? null;
    setCurrentRestaurantIdState(next);
    if (next) localStorage.setItem(STORAGE_KEY, next);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchMemberships();
  }, [fetchMemberships]);

  const setCurrentRestaurantId = (id: string) => {
    setCurrentRestaurantIdState(id);
    localStorage.setItem(STORAGE_KEY, id);
  };

  const currentMembership =
    memberships.find((m) => m.restaurant_id === currentRestaurantId) ?? null;

  return (
    <RestaurantContext.Provider
      value={{
        memberships,
        currentRestaurantId,
        currentMembership,
        setCurrentRestaurantId,
        loading,
        refresh: fetchMemberships,
      }}
    >
      {children}
    </RestaurantContext.Provider>
  );
}

export function useRestaurant() {
  const ctx = useContext(RestaurantContext);
  if (!ctx) throw new Error("useRestaurant must be used within RestaurantProvider");
  return ctx;
}

/**
 * Lança erro se a tela tentar consultar dados sem escopo definido.
 * Critério obrigatório do projeto: nenhuma tela lê/escreve sem restaurante selecionado.
 */
export function useRequiredRestaurantId(): string {
  const { currentRestaurantId } = useRestaurant();
  if (!currentRestaurantId) {
    throw new Error("Restaurante não selecionado — escopo obrigatório.");
  }
  return currentRestaurantId;
}
