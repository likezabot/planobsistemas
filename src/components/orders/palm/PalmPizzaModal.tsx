import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  getPublicProductDetails,
  type PublicProductDetails,
} from "@/lib/menu/publicQueries";
import { centsToBRL } from "@/lib/catalog/money";
import { Loader2, Plus, Minus } from "lucide-react";
import { usePalmCartStore } from "@/lib/orders/palmCartStore";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface PalmPizzaModalProps {
  product: any | null;
  orderId: string;
  onClose: () => void;
  onAdded?: () => void;
}

export function PalmPizzaModal({ 
  product, 
  orderId,
  onClose,
  onAdded 
}: PalmPizzaModalProps) {
  const [details, setDetails] = useState<PublicProductDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [selectedFlavorIds, setSelectedFlavorIds] = useState<string[]>([]);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string[]>>({});
  const { addItem } = usePalmCartStore();

  useEffect(() => {
    if (!product) return;
    setLoading(true);
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
  }, [product?.id]);

  const maxFlavors = details?.pizza_config?.max_flavors ?? 1;
  const priceRule = details?.pizza_config?.price_rule ?? "max";
  const flavors = details?.pizza_flavors ?? [];

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

  function toggleFlavor(flavorId: string) {
    setSelectedFlavorIds((prev) => {
      if (prev.includes(flavorId)) {
        return prev.filter((id) => id !== flavorId);
      }
      if (prev.length >= maxFlavors) {
        toast.error(`Máximo de ${maxFlavors} sabores.`);
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
    if (!details || !product) return;

    if (!selectedVariantId) {
      toast.error("Escolha o tamanho.");
      return;
    }
    if (selectedFlavorIds.length === 0) {
      toast.error("Escolha pelo menos um sabor.");
      return;
    }

    const flavorNames = selectedFlavorIds
      .map((fid) => flavors.find((f) => f.id === fid)?.name)
      .join(" + ");

    addItem(orderId, {
      product_id: product.id,
      name: `${product.name} (${flavorNames})`,
      unit_price_cents: unitPrice,
      quantity,
      variation_id: selectedVariantId,
      flavors: selectedFlavorIds,
      additions: Object.entries(selectedOptions).flatMap(([gid, ids]) => {
        const g = details.option_groups.find(og => og.id === gid);
        return ids.map(id => {
          const item = g?.items.find(i => i.id === id);
          return {
            id,
            name: item?.name || "",
            price_cents: (selectedVariantId && item?.price_overrides?.[selectedVariantId]) ?? item?.price_cents ?? 0,
            quantity: 1
          };
        });
      })
    });

    toast.success(`${product.name} adicionada`);
    onAdded?.();
    onClose();
  }

  if (!product) return null;

  return (
    <Dialog open={!!product} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto p-0 flex flex-col">
        {loading || !details ? (
          <div className="flex h-60 items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <DialogHeader className="p-4 border-b bg-white sticky top-0 z-10">
              <DialogTitle>Pizza: {product.name}</DialogTitle>
            </DialogHeader>

            <div className="p-4 space-y-7 flex-1">
              <section>
                <h3 className="font-bold text-sm mb-3">1. Tamanho</h3>
                <RadioGroup
                  value={selectedVariantId ?? ""}
                  onValueChange={setSelectedVariantId}
                  className="space-y-2"
                >
                  {details.variants.map((v) => (
                    <div
                      key={v.id}
                      className={cn(
                        "flex items-center justify-between p-3 rounded-lg border",
                        selectedVariantId === v.id ? "border-primary bg-primary/5" : "border-border cursor-pointer",
                      )}
                      onClick={() => setSelectedVariantId(v.id)}
                    >
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value={v.id} id={v.id} />
                        <Label htmlFor={v.id} className="font-medium cursor-pointer">{v.name}</Label>
                      </div>
                      <span className="text-sm font-bold">{centsToBRL(v.price_cents)}</span>
                    </div>
                  ))}
                </RadioGroup>
              </section>

              <section>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-sm">2. Sabores ({selectedFlavorIds.length}/{maxFlavors})</h3>
                </div>
                <div className="space-y-4">
                  {flavorCategories.map(([cat, list]) => (
                    <div key={cat}>
                      <p className="text-[10px] font-bold uppercase text-muted-foreground mb-2">{cat}</p>
                      <div className="space-y-2">
                        {list.map((f) => {
                          const checked = selectedFlavorIds.includes(f.id);
                          const extra = selectedVariantId ? f.prices?.[selectedVariantId] ?? 0 : 0;
                          return (
                            <div
                              key={f.id}
                              className={cn(
                                "flex items-center justify-between p-3 rounded-lg border",
                                checked ? "border-primary bg-primary/5" : "border-border cursor-pointer",
                              )}
                              onClick={() => toggleFlavor(f.id)}
                            >
                              <div className="flex items-center gap-2">
                                <Checkbox checked={checked} />
                                <span className="text-sm font-medium">{f.name}</span>
                              </div>
                              {extra > 0 && <span className="text-xs font-bold text-primary">+ {centsToBRL(extra)}</span>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h3 className="font-bold text-sm mb-3">3. Opcionais</h3>
                <div className="space-y-4">
                  {details.option_groups.map((g) => (
                    <div key={g.id}>
                      <p className="text-xs font-semibold mb-2">{g.name}</p>
                      <div className="space-y-2">
                        {g.items.map((it) => {
                          const checked = selectedOptions[g.id]?.includes(it.id);
                          const price = (selectedVariantId && it.price_overrides?.[selectedVariantId]) ?? it.price_cents;
                          return (
                            <div
                              key={it.id}
                              className={cn(
                                "flex items-center justify-between p-3 rounded-lg border",
                                checked ? "border-primary bg-primary/5" : "border-border cursor-pointer",
                              )}
                              onClick={() => toggleOption(g.id, it.id, g.max_options)}
                            >
                              <div className="flex items-center gap-2">
                                <Checkbox checked={checked} />
                                <span className="text-sm">{it.name}</span>
                              </div>
                              {price > 0 && <span className="text-xs font-bold text-primary">+ {centsToBRL(price)}</span>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <div className="flex items-center justify-between py-4 border-t">
                <span className="font-bold text-sm">Quantidade</span>
                <div className="flex items-center gap-4 bg-muted p-1 rounded-lg">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setQuantity(Math.max(1, quantity - 1))}><Minus className="w-3 h-3" /></Button>
                  <span className="font-bold">{quantity}</span>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setQuantity(quantity + 1)}><Plus className="w-3 h-3" /></Button>
                </div>
              </div>
            </div>

            <DialogFooter className="p-4 bg-white border-t sticky bottom-0">
              <Button className="w-full h-12 font-bold flex justify-between px-6" onClick={handleAdd}>
                <span>Adicionar</span>
                <span>{centsToBRL(unitPrice * quantity)}</span>
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
