import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  getPublicRestaurant,
  getPublicCategories,
  getPublicProducts,
  type PublicRestaurant,
  type PublicCategory,
  type PublicProduct,
} from "@/lib/menu/publicQueries";
import { centsToBRL } from "@/lib/catalog/money";
import { useCart } from "@/lib/cart/cartStore";
import { Button } from "@/components/ui/button";
import { ShoppingCart, Plus, Minus } from "lucide-react";
import { toast } from "sonner";

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
  const { items, addItem, removeItem, updateQuantity, getTotal } = useCart();
  const navigate = useNavigate();

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

  const handleAddToCart = (product: PublicProduct) => {
    if (!restaurantSlug) return;
    addItem(restaurantSlug, {
      product_id: product.id,
      name: product.name,
      price_cents: product.price_cents,
      quantity: 1
    });
    toast.success(`${product.name} adicionado ao carrinho`);
  };

  return (
    <main className="min-h-screen bg-background pb-32">
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
              const itemsInCat = productsByCategory.get(cat.id) ?? [];
              if (itemsInCat.length === 0) return null;
              return (
                <CategoryBlock 
                  key={cat.id} 
                  title={cat.name} 
                  items={itemsInCat} 
                  onAdd={handleAddToCart}
                  cartItems={items}
                  onUpdateQty={updateQuantity}
                />
              );
            })}
            {uncategorized.length > 0 && (
              <CategoryBlock 
                title="Outros" 
                items={uncategorized} 
                onAdd={handleAddToCart}
                cartItems={items}
                onUpdateQty={updateQuantity}
              />
            )}
          </div>
        )}
      </div>

      {items.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur-md border-t border-border animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="mx-auto max-w-2xl">
            <Button 
              className="w-full h-14 text-lg font-semibold flex justify-between px-6"
              onClick={() => navigate(`/menu/${restaurantSlug}/checkout`)}
            >
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5" />
                <span>Ver Carrinho</span>
              </div>
              <span>{centsToBRL(getTotal())}</span>
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}

function CategoryBlock({ 
  title, 
  items, 
  onAdd,
  cartItems,
  onUpdateQty
}: { 
  title: string; 
  items: PublicProduct[]; 
  onAdd: (p: PublicProduct) => void;
  cartItems: any[];
  onUpdateQty: (id: string, qty: number) => void;
}) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      <ul className="grid gap-3">
        {items.map((p) => {
          const cartItem = cartItems.find(i => i.product_id === p.id);
          return (
            <li
              key={p.id}
              className="surface-panel flex items-start justify-between gap-4 p-4"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium">{p.name}</p>
                {p.description && (
                  <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2">{p.description}</p>
                )}
                <p className="mt-2 font-semibold tabular-nums text-primary">
                  {centsToBRL(p.price_cents)}
                </p>
              </div>
              
              <div className="shrink-0 flex items-center gap-2">
                {!cartItem ? (
                  <Button 
                    variant="outline" 
                    size="icon" 
                    className="rounded-full w-10 h-10"
                    onClick={() => onAdd(p)}
                  >
                    <Plus className="w-5 h-5" />
                  </Button>
                ) : (
                  <div className="flex items-center gap-3 bg-secondary rounded-full p-1">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="rounded-full w-8 h-8"
                      onClick={() => onUpdateQty(p.id, cartItem.quantity - 1)}
                    >
                      <Minus className="w-4 h-4" />
                    </Button>
                    <span className="font-semibold text-sm w-4 text-center">
                      {cartItem.quantity}
                    </span>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="rounded-full w-8 h-8"
                      onClick={() => onUpdateQty(p.id, cartItem.quantity + 1)}
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
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
