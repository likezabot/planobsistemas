import { useEffect, useMemo, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
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
import { ShoppingCart, Plus, Minus, Info, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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
  const { items, addItem, updateQuantity, getTotal } = useCart();
  const navigate = useNavigate();
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

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
        if (categories.length > 0) setActiveCategory(categories[0].id);
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

  const scrollToCategory = (id: string) => {
    setActiveCategory(id);
    const element = document.getElementById(`category-${id}`);
    if (element) {
      const offset = 120; // Category bar height + padding
      const bodyRect = document.body.getBoundingClientRect().top;
      const elementRect = element.getBoundingClientRect().top;
      const elementPosition = elementRect - bodyRect;
      const offsetPosition = elementPosition - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
    }
  };

  return (
    <main className="min-h-screen bg-background pb-32 font-sans selection:bg-primary/20">
      {/* Header Premium */}
      <div className="relative h-48 bg-secondary overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent z-10" />
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1504674900247-0877df9cc836?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center opacity-40 scale-105" />
        <div className="absolute bottom-6 left-6 right-6 z-20">
          <h1 className="text-3xl font-display font-bold text-white tracking-tight leading-tight">
            {restaurant.name}
          </h1>
          <div className="flex items-center gap-2 mt-2 text-white/90 text-sm">
            <span className="px-2 py-0.5 bg-success/20 text-success-foreground rounded-full text-xs font-semibold backdrop-blur-sm">Aberto agora</span>
            <span className="flex items-center gap-1">• <Info className="w-3 h-3" /> Info do restaurante</span>
          </div>
        </div>
      </div>

      {/* Navegação de Categorias Sticky */}
      <nav className="sticky top-0 z-30 bg-background/80 backdrop-blur-lg border-b border-border py-3">
        <div 
          ref={scrollContainerRef}
          className="flex gap-2 px-4 overflow-x-auto no-scrollbar scroll-smooth"
        >
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => scrollToCategory(cat.id)}
              className={cn(
                "whitespace-nowrap px-4 py-2 rounded-full text-sm font-medium transition-all",
                activeCategory === cat.id
                  ? "bg-primary text-white shadow-button scale-105"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              {cat.name}
            </button>
          ))}
          {uncategorized.length > 0 && (
            <button
              onClick={() => scrollToCategory('others')}
              className={cn(
                "whitespace-nowrap px-4 py-2 rounded-full text-sm font-medium transition-all",
                activeCategory === 'others'
                  ? "bg-primary text-white shadow-button scale-105"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              Outros
            </button>
          )}
        </div>
      </nav>

      <div className="mx-auto max-w-2xl px-4 py-8">
        {products.length === 0 ? (
          <div className="text-center py-20 bg-card rounded-3xl border border-dashed border-border">
            <p className="text-muted-foreground font-medium">
              Ainda não há produtos disponíveis neste cardápio.
            </p>
          </div>
        ) : (
          <div className="grid gap-12">
            {categories.map((cat) => {
              const itemsInCat = productsByCategory.get(cat.id) ?? [];
              if (itemsInCat.length === 0) return null;
              return (
                <section key={cat.id} id={`category-${cat.id}`}>
                  <h2 className="text-xl font-display font-bold text-secondary mb-6 flex items-center gap-2">
                    <span className="w-1.5 h-6 bg-primary rounded-full" />
                    {cat.name}
                  </h2>
                  <div className="grid gap-4">
                    {itemsInCat.map((p) => (
                      <ProductCard 
                        key={p.id} 
                        product={p} 
                        onAdd={handleAddToCart}
                        cartItem={items.find(i => i.product_id === p.id)}
                        onUpdateQty={updateQuantity}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
            {uncategorized.length > 0 && (
              <section id="category-others">
                <h2 className="text-xl font-display font-bold text-secondary mb-6 flex items-center gap-2">
                  <span className="w-1.5 h-6 bg-primary rounded-full" />
                  Outros
                </h2>
                <div className="grid gap-4">
                  {uncategorized.map((p) => (
                    <ProductCard 
                      key={p.id} 
                      product={p} 
                      onAdd={handleAddToCart}
                      cartItem={items.find(i => i.product_id === p.id)}
                      onUpdateQty={updateQuantity}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      {/* Carrinho Flutuante Elegante */}
      {items.length > 0 && (
        <div className="fixed bottom-6 left-0 right-0 px-4 z-40 animate-in fade-in slide-in-from-bottom-8 duration-500">
          <div className="mx-auto max-w-lg">
            <Button 
              className="w-full h-16 rounded-2xl text-lg font-bold flex justify-between px-8 bg-primary hover:bg-primary-hover shadow-premium border-2 border-white/10 group"
              onClick={() => navigate(`/menu/${restaurantSlug}/checkout`)}
            >
              <div className="flex items-center gap-3">
                <div className="relative">
                  <ShoppingCart className="w-6 h-6 group-hover:scale-110 transition-transform" />
                  <span className="absolute -top-2 -right-2 bg-secondary text-secondary-foreground w-5 h-5 rounded-full text-[10px] flex items-center justify-center font-bold border border-white">
                    {items.reduce((acc, i) => acc + i.quantity, 0)}
                  </span>
                </div>
                <span>Ver Carrinho</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="bg-white/20 px-3 py-1 rounded-lg text-sm font-bold">
                  {centsToBRL(getTotal())}
                </span>
                <ChevronRight className="w-5 h-5 opacity-50" />
              </div>
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}

function ProductCard({ 
  product, 
  onAdd,
  cartItem,
  onUpdateQty
}: { 
  product: PublicProduct; 
  onAdd: (p: PublicProduct) => void;
  cartItem?: any;
  onUpdateQty: (id: string, qty: number) => void;
}) {
  return (
    <div className="group bg-card rounded-2xl border border-border p-4 shadow-card hover:shadow-premium hover:border-primary/20 transition-all active:scale-[0.98]">
      <div className="flex gap-4">
        {/* Espaço para Imagem */}
        <div className="relative w-24 h-24 shrink-0 overflow-hidden rounded-xl bg-muted">
          {product.image_url ? (
            <img 
              src={product.image_url} 
              alt={product.name} 
              className="w-full h-full object-cover transition-transform group-hover:scale-110"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-muted/50 text-muted-foreground">
              <Plus className="w-6 h-6 opacity-20" />
            </div>
          )}
          <div className="absolute inset-0 ring-1 ring-inset ring-black/5 rounded-xl" />
        </div>

        <div className="flex-1 min-w-0 py-0.5 flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-secondary group-hover:text-primary transition-colors truncate">
              {product.name}
            </h3>
            {product.description && (
              <p className="mt-1 text-sm text-muted-foreground line-clamp-2 leading-snug">
                {product.description}
              </p>
            )}
          </div>
          
          <div className="mt-3 flex items-center justify-between gap-4">
            <span className="font-bold text-lg text-secondary tabular-nums">
              {centsToBRL(product.price_cents)}
            </span>
            
            <div className="flex items-center gap-1">
              {!cartItem ? (
                <Button 
                  size="sm"
                  className="rounded-xl px-4 font-bold bg-muted text-primary hover:bg-primary hover:text-white transition-all shadow-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAdd(product);
                  }}
                >
                  <Plus className="w-4 h-4 mr-1.5" />
                  Adicionar
                </Button>
              ) : (
                <div className="flex items-center gap-1 bg-muted p-1 rounded-xl">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="rounded-lg w-8 h-8 text-primary"
                    onClick={(e) => {
                      e.stopPropagation();
                      onUpdateQty(product.id, cartItem.quantity - 1);
                    }}
                  >
                    <Minus className="w-4 h-4" />
                  </Button>
                  <span className="font-bold text-sm w-6 text-center text-secondary">
                    {cartItem.quantity}
                  </span>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="rounded-lg w-8 h-8 text-primary"
                    onClick={(e) => {
                      e.stopPropagation();
                      onUpdateQty(product.id, cartItem.quantity + 1);
                    }}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CenteredMessage({ title, description }: { title: string; description?: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="bg-card shadow-premium border border-border max-w-md p-10 text-center rounded-[2rem]">
        <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <Info className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-2xl font-display font-bold text-secondary">{title}</h1>
        {description && <p className="mt-3 text-muted-foreground leading-relaxed">{description}</p>}
      </div>
    </main>
  );
}