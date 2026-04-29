import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useRestaurant } from "@/lib/auth/RestaurantProvider";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

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

  return (
    <AppShell>
      {loading ? (
        <p className="text-muted-foreground">Carregando escopo...</p>
      ) : !currentMembership ? (
        <div className="surface-panel p-6">
          <h2 className="text-lg font-semibold">Nenhum restaurante</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Você ainda não pertence a nenhum restaurante. Peça a um owner para te adicionar.
          </p>
        </div>
      ) : (
        <div className="grid gap-6">
          <section className="surface-panel p-6">
            <p className="text-mono-tag">restaurante atual</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">
              {currentMembership.restaurants.name}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Tenant <span className="font-mono">{currentMembership.tenant_id.slice(0, 8)}</span> ·
              papel <span className="font-mono">{currentMembership.role}</span>
            </p>
          </section>

          <section className="surface-panel">
            <header className="flex items-center justify-between border-b border-border p-4">
              <h2 className="text-sm font-semibold">Membros do restaurante</h2>
              <span className="text-mono-tag">RLS isolada por restaurant_id</span>
            </header>
            {loadingMembers ? (
              <p className="p-4 text-sm text-muted-foreground">Carregando...</p>
            ) : members.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">Sem membros visíveis.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-mono-tag">
                  <tr className="border-b border-border">
                    <th className="px-4 py-2 text-left font-normal">user_id</th>
                    <th className="px-4 py-2 text-left font-normal">papel</th>
                    <th className="px-4 py-2 text-left font-normal">desde</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-2 font-mono text-xs">{m.user_id}</td>
                      <td className="px-4 py-2">{m.role}</td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {new Date(m.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="surface-panel p-6">
            <h2 className="text-sm font-semibold">Módulos</h2>
            <ul className="mt-3 grid gap-2 text-sm">
              <li>
                <a className="text-accent hover:underline" href="/pedidos">→ Gestão de Pedidos (PDV)</a>
              </li>
              <li>
                <a className="text-accent hover:underline" href="/catalogo">→ Catálogo de produtos</a>
              </li>
              <li>
                <a className="text-accent hover:underline" href="/catalogo/categorias">→ Categorias</a>
              </li>
              <li>
                <a
                  className="text-accent hover:underline"
                  href={`/menu/${currentMembership.restaurants.slug}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  → Cardápio público (somente leitura)
                </a>
              </li>
            </ul>
            <h2 className="mt-6 text-sm font-semibold">Próximos passos</h2>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li>Cardápio público por restaurante.</li>
              <li>Checkout idempotente com cálculo no banco.</li>
              <li>Pedidos, PDV e print_jobs.</li>
              <li>Ledger de pontos de fidelidade.</li>
            </ul>
          </section>
        </div>
      )}
    </AppShell>
  );
}
