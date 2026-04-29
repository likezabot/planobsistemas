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
import { ProductOptionsModal } from "@/components/menu/ProductOptionsModal";

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
  const [selectedProduct, setSelectedProduct] = useState<PublicProduct | null>(null);
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
    
    // If complex product, open modal
    if (product.type !== 'simple') {
      setSelectedProduct(product);
      return;
    }

    addItem(restaurantSlug, {
      product_id: product.id,
      name: product.name,
      price_cents: product.price_cents,
      quantity: 1
    });
    toast.success(`${product.name} adicionado`);
  };

  const scrollToCategory = (id: string) => {
    setActiveCategory(id);
    const element = document.getElementById(`category-${id}`);
    if (element) {
      const offset = 80;
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
    <main className="min-h-screen bg-white pb-32 font-sans">
      {/* Header Solid */}
      <div className="relative h-48 bg-secondary overflow-hidden">
        <div className="absolute inset-0 bg-black z-10 opacity-60" />
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1504674900247-0877df9cc836?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center opacity-70 scale-105" />
        <div className="absolute bottom-6 left-6 right-6 z-20">
          <h1 className="text-2xl font-bold text-white tracking-tight">
            {restaurant.name}
          </h1>
          <div className="flex items-center gap-2 mt-2 text-white/90 text-sm font-medium">
            <span className="flex items-center gap-1.5 px-2 py-0.5 bg-success rounded text-[10px] uppercase font-bold text-white shadow-sm">Aberto</span>
            <span className="flex items-center gap-1 opacity-60">• <Info className="w-3.5 h-3.5" /> Informações</span>
          </div>
        </div>
      </div>

      {/* Categorias - Solid, Sticky */}
      <nav className="sticky top-0 z-30 bg-white border-b border-border shadow-sm">
        <div 
          ref={scrollContainerRef}
          className="flex gap-2 px-4 py-3 overflow-x-auto no-scrollbar scroll-smooth max-w-[1400px] mx-auto"
        >
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => scrollToCategory(cat.id)}
              className={cn(
                "whitespace-nowrap px-4 py-1.5 rounded-full text-xs font-bold transition-all",
                activeCategory === cat.id
                  ? "bg-primary text-white shadow-sm scale-105"
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
                "whitespace-nowrap px-4 py-1.5 rounded-full text-xs font-bold transition-all",
                activeCategory === 'others'
                  ? "bg-primary text-white shadow-sm scale-105"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              Outros
            </button>
          )}
        </div>
      </nav>

      <div className="mx-auto max-w-[1400px] px-4 py-8">
        {products.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-xl border border-dashed border-border">
            <p className="text-muted-foreground font-medium text-sm">
              Nenhum produto disponível.
            </p>
          </div>
        ) : (
          <div className="space-y-12">
            {categories.map((cat) => {
              const itemsInCat = productsByCategory.get(cat.id) ?? [];
              if (itemsInCat.length === 0) return null;
              return (
                <section key={cat.id} id={`category-${cat.id}`}>
                  <h2 className="text-lg font-bold text-secondary mb-6 flex items-center gap-2">
                    <span className="w-1 h-5 bg-primary rounded-full" />
                    {cat.name}
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
                <h2 className="text-lg font-bold text-secondary mb-6 flex items-center gap-2">
                  <span className="w-1 h-5 bg-primary rounded-full" />
                  Outros
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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

      {/* Floating Cart Solid */}
      {items.length > 0 && (
        <div className="fixed bottom-6 left-0 right-0 px-4 z-40 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="mx-auto max-w-lg">
            <Button 
              className="w-full h-14 rounded-xl text-base font-bold flex justify-between px-6 bg-primary hover:bg-primary shadow-xl border-t border-white/10 group"
              onClick={() => navigate(`/menu/${restaurantSlug}/checkout`)}
            >
              <div className="flex items-center gap-3">
                <div className="relative">
                  <ShoppingCart className="w-5 h-5 group-hover:scale-110 transition-transform" />
                  <span className="absolute -top-1.5 -right-1.5 bg-secondary text-white w-4 h-4 rounded-full text-[9px] flex items-center justify-center font-bold border border-white">
                    {items.reduce((acc, i) => acc + i.quantity, 0)}
                  </span>
                </div>
                <span>Ver Carrinho</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="bg-white/20 px-3 py-1 rounded text-xs font-bold">
                  {centsToBRL(getTotal())}
                </span>
                <ChevronRight className="w-4 h-4 opacity-50" />
              </div>
            </Button>
          </div>
        </div>
      )}

      <ProductOptionsModal 
        product={selectedProduct}
        restaurantSlug={restaurantSlug || null}
        onClose={() => setSelectedProduct(null)}
      />
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
    <div className="group bg-white rounded-xl border border-border p-3 shadow-sm hover:shadow-md transition-shadow flex gap-3">
      <div className="relative w-20 h-20 shrink-0 overflow-hidden rounded-lg bg-muted">
        {product.image_url ? (
          <img 
            src={product.image_url} 
            alt={product.name} 
            className="w-full h-full object-cover transition-transform group-hover:scale-110"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-muted/30 text-muted-foreground">
            <Plus className="w-5 h-5 opacity-20" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
        <div>
          <h3 className="font-bold text-secondary text-sm group-hover:text-primary transition-colors truncate">
            {product.name}
          </h3>
          {product.description && (
            <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2 leading-tight">
              {product.description}
            </p>
          )}
        </div>
        
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="font-bold text-sm text-secondary tabular-nums">
            {centsToBRL(product.price_cents)}
          </span>
          
          <div className="flex items-center gap-1">
            {!cartItem ? (
              <Button 
                size="sm"
                className="h-8 rounded-lg px-3 font-bold bg-muted text-primary hover:bg-primary hover:text-white transition-all text-[11px]"
                onClick={(e) => {
                  e.stopPropagation();
                  onAdd(product);
                }}
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                Adicionar
              </Button>
            ) : (
              <div className="flex items-center gap-1 bg-muted p-0.5 rounded-lg">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="rounded-md w-7 h-7 text-primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    onUpdateQty(product.id, cartItem.quantity - 1);
                  }}
                >
                  <Minus className="w-3.5 h-3.5" />
                </Button>
                <span className="font-bold text-xs w-5 text-center text-secondary">
                  {cartItem.quantity}
                </span>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="rounded-md w-7 h-7 text-primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    onUpdateQty(product.id, cartItem.quantity + 1);
                  }}
                >
                  <Plus className="w-3.5 h-3.5" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CenteredMessage({ title, description }: { title: string; description?: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F8FAFC] px-4">
      <div className="bg-white shadow-xl border border-border max-w-sm p-8 text-center rounded-2xl">
        <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-4">
          <Info className="w-6 h-6 text-primary" />
        </div>
        <h1 className="text-xl font-bold text-secondary">{title}</h1>
        {description && <p className="mt-2 text-muted-foreground text-sm leading-relaxed">{description}</p>}
      </div>
    </main>
  );
}
