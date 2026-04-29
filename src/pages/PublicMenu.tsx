import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  getPublicRestaurant,
  getPublicCategories,
  getPublicProducts,
  type PublicRestaurant,
  type PublicCategory,
  type PublicProduct,
} from "@/lib/menu/publicQueries";
import { formatBRL } from "@/lib/catalog/money";

type State =
  | { status: "loading" }
  | { status: "not_found" }
  | { status: "disabled" }
  | { status: "error"; message: string }
  | {
      status: "ok";
      restaurant: PublicRestaurant;
      categories: PublicCategory[];
      products: PublicProduct[];
    };

export default function PublicMenu() {
  const { restaurantSlug } = useParams<{ restaurantSlug: string }>();
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!restaurantSlug) {
        setState({ status: "not_found" });
        return;
      }
      try {
        const restaurant = await getPublicRestaurant(restaurantSlug);
        if (!restaurant) {
          // RPC só devolve se public_menu_enabled=true; se vier null,
          // é "não existe" OU "desabilitado". Tratamos como indisponível.
          setState({ status: "not_found" });
          return;
        }
        const [categories, products] = await Promise.all([
          getPublicCategories(restaurantSlug),
          getPublicProducts(restaurantSlug),
        ]);
        if (cancelled) return;
        setState({ status: "ok", restaurant, categories, products });
      } catch (e) {
        if (cancelled) return;
        setState({ status: "error", message: (e as Error).message });
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [restaurantSlug]);

  useEffect(() => {
    if (state.status === "ok") {
      document.title = `${state.restaurant.name} — Cardápio`;
    } else {
      document.title = "Cardápio";
    }
  }, [state]);

  const productsByCategory = useMemo(() => {
    if (state.status !== "ok") return new Map<string | null, PublicProduct[]>();
    const map = new Map<string | null, PublicProduct[]>();
    for (const p of state.products) {
      const key = p.category_id;
      const arr = map.get(key) ?? [];
      arr.push(p);
      map.set(key, arr);
    }
    return map;
  }, [state]);

  if (state.status === "loading") {
    return <CenteredMessage title="Carregando cardápio..." />;
  }
  if (state.status === "not_found") {
    return (
      <CenteredMessage
        title="Cardápio indisponível"
        description="Este restaurante não existe ou o cardápio público está desativado."
      />
    );
  }
  if (state.status === "disabled") {
    return (
      <CenteredMessage
        title="Cardápio desativado"
        description="O responsável desativou o cardápio público temporariamente."
      />
    );
  }
  if (state.status === "error") {
    return <CenteredMessage title="Erro ao carregar" description={state.message} />;
  }

  const { restaurant, categories, products } = state;
  const uncategorized = productsByCategory.get(null) ?? [];

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto max-w-2xl px-4 py-6">
          <p className="text-mono-tag">cardápio</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{restaurant.name}</h1>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-6">
        {products.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Ainda não há produtos disponíveis neste cardápio.
          </p>
        ) : (
          <div className="grid gap-8">
            {categories.map((cat) => {
              const items = productsByCategory.get(cat.id) ?? [];
              if (items.length === 0) return null;
              return <CategoryBlock key={cat.id} title={cat.name} items={items} />;
            })}
            {uncategorized.length > 0 && (
              <CategoryBlock title="Outros" items={uncategorized} />
            )}
          </div>
        )}
      </div>

      <footer className="mt-12 border-t border-border py-6 text-center text-xs text-muted-foreground">
        Cardápio somente leitura · sem pedidos online ainda
      </footer>
    </main>
  );
}

function CategoryBlock({ title, items }: { title: string; items: PublicProduct[] }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      <ul className="grid gap-3">
        {items.map((p) => (
          <li
            key={p.id}
            className="surface-panel flex items-start justify-between gap-4 p-4"
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium">{p.name}</p>
              {p.description && (
                <p className="mt-0.5 text-sm text-muted-foreground">{p.description}</p>
              )}
            </div>
            <p className="shrink-0 text-sm font-semibold tabular-nums">
              {formatBRL(p.price_cents)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CenteredMessage({ title, description }: { title: string; description?: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="surface-panel max-w-md p-6 text-center">
        <h1 className="text-lg font-semibold">{title}</h1>
        {description && <p className="mt-2 text-sm text-muted-foreground">{description}</p>}
      </div>
    </main>
  );
}
