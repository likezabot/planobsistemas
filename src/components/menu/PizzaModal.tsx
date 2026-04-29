import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  getPublicProductDetails,
  type PublicProduct,
  type PublicProductDetails,
} from "@/lib/menu/publicQueries";
import { centsToBRL } from "@/lib/catalog/money";
import { Loader2, Plus, Minus, Pizza } from "lucide-react";
import { useCart } from "@/lib/cart/cartStore";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface PizzaModalProps {
  product: PublicProduct | null;
  restaurantSlug: string | null;
  onClose: () => void;
  inventoryEnabled?: boolean;
  inventoryMode?: "simple" | "advanced";
}

/**
 * Fluxo público próprio para pizzas:
 *  - Escolher tamanho (variant)
 *  - Escolher sabores até `max_flavors`, com contador e bloqueio
 *  - Escolher borda/adicionais (option_groups), com override de preço por tamanho
 *  - Observação
 *  - Mostra total estimado, mas backend recalcula tudo
 */
export function PizzaModal({ 
  product, 
  restaurantSlug, 
  onClose,
  inventoryEnabled,
  inventoryMode 
}: PizzaModalProps) {
  const [details, setDetails] = useState<PublicProductDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [selectedFlavorIds, setSelectedFlavorIds] = useState<string[]>([]);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string[]>>({});
  const [note, setNote] = useState("");
  const { addItem } = useCart();

  useEffect(() => {
    if (!product) return;
    setLoading(true);
    setSelectedFlavorIds([]);
    setSelectedOptions({});
    setNote("");
    setQuantity(1);
    getPublicProductDetails(product.id)
      .then((data) => {
        setDetails(data);
        if (data.variants.length > 0) {
          setSelectedVariantId(data.variants[0].id);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        toast.error("Erro ao carregar pizza");
        onClose();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id]);

  const maxFlavors = details?.pizza_config?.max_flavors ?? 1;
  const priceRule = details?.pizza_config?.price_rule ?? "max";
  const flavors = details?.pizza_flavors ?? [];

  // Categorias dos sabores para agrupar
  const flavorCategories = useMemo(() => {
    const groups = new Map<string, typeof flavors>();
    for (const f of flavors) {
      const key = f.category ?? "Sabores";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(f);
    }
    return Array.from(groups.entries());
  }, [flavors]);

  function variantPrice(): number {
    if (!details || !selectedVariantId) return 0;
    return details.variants.find((v) => v.id === selectedVariantId)?.price_cents ?? 0;
  }

  function flavorAdditional(): number {
    if (!details || !selectedVariantId) return 0;
    const prices = selectedFlavorIds.map(
      (fid) => flavors.find((f) => f.id === fid)?.prices?.[selectedVariantId] ?? 0,
    );
    if (prices.length === 0) return 0;
    if (priceRule === "max") return Math.max(...prices);
    if (priceRule === "sum") return prices.reduce((a, b) => a + b, 0);
    // average
    return Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
  }

  function optionsPrice(): number {
    if (!details) return 0;
    let total = 0;
    Object.entries(selectedOptions).forEach(([gid, ids]) => {
      const g = details.option_groups.find((og) => og.id === gid);
      if (!g) return;
      for (const itemId of ids) {
        const item = g.items.find((i) => i.id === itemId);
        if (!item) continue;
        const override = selectedVariantId ? item.price_overrides?.[selectedVariantId] : undefined;
        total += override ?? item.price_cents;
      }
    });
    return total;
  }

  const unitPrice = variantPrice() + flavorAdditional() + optionsPrice();
  const totalPrice = unitPrice * quantity;

  function toggleFlavor(flavorId: string) {
    setSelectedFlavorIds((prev) => {
      if (prev.includes(flavorId)) {
        return prev.filter((id) => id !== flavorId);
      }
      // BLOQUEIO: nunca passar do máximo
      if (prev.length >= maxFlavors) {
        toast.error(`Máximo de ${maxFlavors} sabor${maxFlavors > 1 ? "es" : ""}.`);
        return prev;
      }
      return [...prev, flavorId];
    });
  }

  function toggleOption(groupId: string, itemId: string, max: number) {
    setSelectedOptions((prev) => {
      const current = prev[groupId] ?? [];
      if (current.includes(itemId)) {
        return { ...prev, [groupId]: current.filter((id) => id !== itemId) };
      }
      if (max === 1) return { ...prev, [groupId]: [itemId] };
      if (current.length < max) return { ...prev, [groupId]: [...current, itemId] };
      return prev;
    });
  }

  function handleAdd() {
    if (!restaurantSlug || !details || !product) return;

    if (!selectedVariantId) {
      toast.error("Escolha o tamanho.");
      return;
    }
    if (selectedFlavorIds.length === 0) {
      toast.error("Escolha pelo menos um sabor.");
      return;
    }
    if (selectedFlavorIds.length > maxFlavors) {
      toast.error(`Máximo de ${maxFlavors} sabor(es).`);
      return;
    }

    for (const g of details.option_groups) {
      const sel = selectedOptions[g.id]?.length ?? 0;
      if (g.is_required && sel < g.min_options) {
        toast.error(`Selecione pelo menos ${g.min_options} em ${g.name}.`);
        return;
      }
    }

    const variant = details.variants.find((v) => v.id === selectedVariantId);
    const flavorNames = selectedFlavorIds
      .map((fid) => flavors.find((f) => f.id === fid)?.name)
      .filter(Boolean);
    const optionNames: string[] = [];
    Object.entries(selectedOptions).forEach(([gid, ids]) => {
      const g = details.option_groups.find((og) => og.id === gid);
      if (!g) return;
      for (const id of ids) {
        const it = g.items.find((i) => i.id === id);
        if (it) optionNames.push(it.name);
      }
    });

    const allOptionIds = Object.values(selectedOptions).flat();
    const descParts: string[] = [];
    if (variant) descParts.push(variant.name);
    if (flavorNames.length) descParts.push(`Sabores: ${flavorNames.join(" + ")}`);
    if (optionNames.length) descParts.push(optionNames.join(", "));

    addItem(restaurantSlug, {
      product_id: product.id,
      name: product.name,
      price_cents: unitPrice,
      quantity,
      note: note.trim() || undefined,
      variation_id: selectedVariantId,
      selected_options: allOptionIds,
      pizza_flavors: selectedFlavorIds,
      customization: {
        description: descParts.join(" • "),
        details: {
          selectedVariantId,
          selectedFlavorIds,
          selectedOptions,
          priceRule,
        },
      },
    });

    toast.success(`${product.name} adicionada`);
    onClose();
  }

  if (!product) return null;

  return (
    <Dialog open={!!product} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto p-0 gap-0 border-none bg-white rounded-t-3xl sm:rounded-3xl">
        {loading || !details ? (
          <div className="flex h-60 items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* Hero */}
            <div className="relative h-44 bg-secondary">
              {product.image_url ? (
                <img
                  src={product.image_url}
                  alt={product.name}
                  className="w-full h-full object-cover opacity-80"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Pizza className="w-20 h-20 text-white/20" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
              <div className="absolute bottom-4 left-6 right-6">
                <span className="text-[10px] uppercase tracking-widest font-bold text-primary">
                  Monte sua pizza
                </span>
                <h2 className="text-2xl font-bold text-white">{product.name}</h2>
                {product.description && (
                  <p className="text-white/70 text-xs mt-1 line-clamp-1">{product.description}</p>
                )}
              </div>
            </div>

            <div className="p-6 space-y-7">
              {/* TAMANHO */}
              {details.variants.length > 0 && (
                <section>
                  <h3 className="font-bold text-secondary text-sm mb-3 flex items-center gap-2">
                    <span className="w-1 h-4 bg-primary rounded-full" />
                    1. Escolha o tamanho
                  </h3>
                  <RadioGroup
                    value={selectedVariantId ?? ""}
                    onValueChange={(v) => {
                      setSelectedVariantId(v);
                    }}
                    className="space-y-2"
                  >
                    {details.variants.map((v) => {
                      const isVariantOutOfStock = inventoryEnabled && inventoryMode === 'advanced' && v.track_stock && v.stock_quantity <= 0 && !v.allow_out_of_stock_sale;
                      
                      return (
                        <div
                          key={v.id}
                          className={cn(
                            "flex items-center justify-between p-3 rounded-xl border transition-all",
                            selectedVariantId === v.id
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-muted-foreground/30",
                            isVariantOutOfStock ? "opacity-50 cursor-not-allowed grayscale-[0.5]" : "cursor-pointer",
                          )}
                          onClick={() => !isVariantOutOfStock && setSelectedVariantId(v.id)}
                        >
                          <div className="flex items-center gap-3">
                            <RadioGroupItem value={v.id} id={`var-${v.id}`} disabled={isVariantOutOfStock} />
                            <Label htmlFor={`var-${v.id}`} className={cn("font-medium", isVariantOutOfStock ? "cursor-not-allowed" : "cursor-pointer")}>
                              {v.name}
                              {(v.diameter_cm || v.slices) && (
                                <span className="ml-2 text-[10px] text-muted-foreground font-normal">
                                  {v.diameter_cm ? `${v.diameter_cm}cm` : ""}
                                  {v.diameter_cm && v.slices ? " · " : ""}
                                  {v.slices ? `${v.slices} fatias` : ""}
                                </span>
                              )}
                              {isVariantOutOfStock && <span className="ml-2 text-[10px] uppercase font-bold text-destructive">Esgotado</span>}
                            </Label>
                          </div>
                          <span className="text-sm font-bold text-secondary tabular-nums">
                            {centsToBRL(v.price_cents)}
                          </span>
                        </div>
                      );
                    })}
                  </RadioGroup>
                </section>
              )}

              {/* SABORES */}
              <section>
                <div className="flex items-end justify-between mb-3">
                  <h3 className="font-bold text-secondary text-sm flex items-center gap-2">
                    <span className="w-1 h-4 bg-primary rounded-full" />
                    2. Escolha os sabores
                  </h3>
                  <span
                    className={cn(
                      "text-xs font-bold tabular-nums px-2 py-1 rounded-full",
                      selectedFlavorIds.length === maxFlavors
                        ? "bg-primary text-white"
                        : "bg-muted text-muted-foreground",
                    )}
                    data-testid="flavor-counter"
                  >
                    {selectedFlavorIds.length} de {maxFlavors}
                  </span>
                </div>
                {priceRule !== "max" && (
                  <p className="text-[11px] text-muted-foreground mb-2">
                    Regra de preço: {priceRule === "sum" ? "soma dos sabores" : "média dos sabores"}.
                  </p>
                )}

                {flavors.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic p-4 bg-muted/30 rounded-lg">
                    Nenhum sabor configurado.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {flavorCategories.map(([catName, list]) => (
                      <div key={catName}>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                          {catName}
                        </p>
                        <div className="space-y-2">
                          {list.map((f) => {
                            const checked = selectedFlavorIds.includes(f.id);
                            const extra = selectedVariantId ? f.prices?.[selectedVariantId] ?? 0 : 0;
                            const isFlavorOutOfStock = inventoryEnabled && inventoryMode === 'advanced' && f.track_stock && f.stock_quantity <= 0 && !f.allow_out_of_stock_sale;
                            const reachedMax =
                              selectedFlavorIds.length >= maxFlavors && !checked;
                            return (
                              <div
                                key={f.id}
                                className={cn(
                                  "flex items-start justify-between p-3 rounded-xl border transition-all",
                                  checked
                                    ? "border-primary bg-primary/5"
                                    : reachedMax
                                      ? "border-border opacity-50 cursor-not-allowed"
                                      : "border-border hover:border-muted-foreground/30 cursor-pointer",
                                  isFlavorOutOfStock && "opacity-50 cursor-not-allowed grayscale-[0.5]"
                                )}
                                onClick={() => {
                                  if (reachedMax || isFlavorOutOfStock) return;
                                  toggleFlavor(f.id);
                                }}
                                data-testid={`flavor-${f.id}`}
                              >
                                <div className="flex gap-3 min-w-0">
                                  <Checkbox
                                    checked={checked}
                                    disabled={reachedMax || isFlavorOutOfStock}
                                    className="mt-0.5 rounded-md"
                                  />
                                  <div className="min-w-0">
                                    <p className="font-medium text-sm text-secondary">
                                      {f.name}
                                      {isFlavorOutOfStock && <span className="ml-2 text-[10px] uppercase font-bold text-destructive">Esgotado</span>}
                                    </p>
                                    {(f.description || f.ingredients) && (
                                      <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">
                                        {f.description || f.ingredients}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                {extra > 0 && (
                                  <span className="text-[11px] font-bold text-primary shrink-0 ml-2">
                                    + {centsToBRL(extra)}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* BORDAS / ADICIONAIS */}
              {details.option_groups.length > 0 && (
                <section>
                  <h3 className="font-bold text-secondary text-sm mb-3 flex items-center gap-2">
                    <span className="w-1 h-4 bg-primary rounded-full" />
                    3. Borda e adicionais
                  </h3>
                  <div className="space-y-5">
                    {details.option_groups.map((g) => (
                      <div key={g.id}>
                        <div className="flex items-end justify-between mb-2">
                          <p className="font-semibold text-sm text-secondary">{g.name}</p>
                          <span className="text-[10px] text-muted-foreground">
                            {g.is_required ? "Obrigatório • " : ""}
                            até {g.max_options}
                          </span>
                        </div>
                        <div className="space-y-2">
                          {g.items.map((it) => {
                            const checked = selectedOptions[g.id]?.includes(it.id) ?? false;
                            const price = selectedVariantId
                              ? it.price_overrides?.[selectedVariantId] ?? it.price_cents
                              : it.price_cents;
                            const isItemOutOfStock = inventoryEnabled && inventoryMode === 'advanced' && it.track_stock && it.stock_quantity <= 0 && !it.allow_out_of_stock_sale;

                            return (
                              <div
                                key={it.id}
                                className={cn(
                                  "flex items-center justify-between p-3 rounded-xl border transition-all",
                                  checked
                                    ? "border-primary bg-primary/5"
                                    : "border-border hover:border-muted-foreground/30",
                                  isItemOutOfStock ? "opacity-50 cursor-not-allowed grayscale-[0.5]" : "cursor-pointer",
                                )}
                                onClick={() => !isItemOutOfStock && toggleOption(g.id, it.id, g.max_options)}
                              >
                                <div className="flex items-center gap-3">
                                  <Checkbox checked={checked} disabled={isItemOutOfStock} className="rounded-md" />
                                  <Label className={cn("text-sm font-medium", isItemOutOfStock ? "cursor-not-allowed" : "cursor-pointer")}>
                                    {it.name}
                                    {isItemOutOfStock && <span className="ml-2 text-[10px] uppercase font-bold text-destructive">Esgotado</span>}
                                  </Label>
                                </div>
                                {price > 0 && (
                                  <span className="text-xs font-bold text-primary">
                                    + {centsToBRL(price)}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* OBSERVAÇÃO */}
              <section>
                <h3 className="font-bold text-secondary text-sm mb-2 flex items-center gap-2">
                  <span className="w-1 h-4 bg-primary rounded-full" />
                  Observação (opcional)
                </h3>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder="Ex: sem cebola, bem assada..."
                  className="text-sm rounded-lg"
                />
              </section>

              {/* QUANTIDADE */}
              <div className="flex items-center justify-between border-t border-border pt-4">
                <span className="font-bold text-secondary text-sm">Quantidade</span>
                <div className="flex items-center gap-3 bg-muted p-1 rounded-xl">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-9 h-9 rounded-lg text-primary"
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  >
                    <Minus className="w-4 h-4" />
                  </Button>
                  <span className="font-bold w-6 text-center tabular-nums">{quantity}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-9 h-9 rounded-lg text-primary"
                    onClick={() => setQuantity(quantity + 1)}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>

            <DialogFooter className="p-4 bg-white border-t border-border sticky bottom-0">
              <Button
                className="w-full h-14 rounded-xl font-bold text-base bg-primary hover:bg-primary/90 flex justify-between px-6"
                onClick={handleAdd}
                disabled={selectedFlavorIds.length === 0 || !selectedVariantId}
                data-testid="pizza-add-button"
              >
                <span>Adicionar ao carrinho</span>
                <span className="tabular-nums">{centsToBRL(totalPrice)}</span>
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
