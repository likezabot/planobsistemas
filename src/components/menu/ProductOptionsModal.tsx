import { useState, useEffect } from "react";
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
  type PublicProduct, 
  type PublicProductDetails 
} from "@/lib/menu/publicQueries";
import { centsToBRL } from "@/lib/catalog/money";
import { Loader2, Plus, Minus } from "lucide-react";
import { useCart } from "@/lib/cart/cartStore";
import { toast } from "sonner";

interface ProductOptionsModalProps {
  product: PublicProduct | null;
  restaurantSlug: string | null;
  onClose: () => void;
}

export function ProductOptionsModal({ 
  product, 
  restaurantSlug, 
  onClose 
}: ProductOptionsModalProps) {
  const [details, setDetails] = useState<PublicProductDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string[]>>({});
  const { addItem } = useCart();

  useEffect(() => {
    if (product) {
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
          toast.error("Erro ao carregar detalhes do produto");
          onClose();
        });
    }
  }, [product]);

  if (!product) return null;

  const currentPrice = () => {
    let base = product.price_cents;
    if (product.type === "variable" && selectedVariantId && details) {
      const v = details.variants.find(v => v.id === selectedVariantId);
      base = v?.price_cents ?? 0;
    }
    
    let extras = 0;
    if (details) {
      Object.entries(selectedOptions).forEach(([groupId, itemIds]) => {
        const group = details.option_groups.find(g => g.id === groupId);
        if (group) {
          itemIds.forEach(itemId => {
            const item = group.items.find(i => i.id === itemId);
            if (item) extras += item.price_cents;
          });
        }
      });
    }

    return (base + extras) * quantity;
  };

  const handleToggleOption = (groupId: string, itemId: string, max: number) => {
    setSelectedOptions(prev => {
      const current = prev[groupId] ?? [];
      if (current.includes(itemId)) {
        return { ...prev, [groupId]: current.filter(id => id !== itemId) };
      }
      if (current.length < max) {
        return { ...prev, [groupId]: [...current, itemId] };
      }
      if (max === 1) {
        return { ...prev, [groupId]: [itemId] };
      }
      return prev;
    });
  };

  const handleConfirm = () => {
    if (!restaurantSlug || !details) return;

    // Validation
    for (const group of details.option_groups) {
      const selected = selectedOptions[group.id]?.length ?? 0;
      if (selected < group.min_options) {
        toast.error(`Selecione pelo menos ${group.min_options} em ${group.name}`);
        return;
      }
    }

    let finalName = product.name;
    let descriptionParts: string[] = [];

    if (product.type === "variable" && selectedVariantId) {
      const v = details.variants.find(v => v.id === selectedVariantId);
      if (v) {
        finalName += ` (${v.name})`;
      }
    }

    Object.entries(selectedOptions).forEach(([groupId, itemIds]) => {
      const group = details.option_groups.find(g => g.id === groupId);
      if (group) {
        itemIds.forEach(itemId => {
          const item = group.items.find(i => i.id === itemId);
          if (item) descriptionParts.push(item.name);
        });
      }
    });

    const allSelectedOptionIds = Object.values(selectedOptions).flat();

    addItem(restaurantSlug, {
      product_id: product.id,
      name: finalName,
      price_cents: currentPrice() / quantity,
      quantity,
      variation_id: selectedVariantId ?? null,
      selected_options: allSelectedOptionIds,
      customization: descriptionParts.length > 0 ? {
        description: descriptionParts.join(", "),
        details: { selectedVariantId, selectedOptions }
      } : undefined
    });

    toast.success(`${product.name} adicionado`);
    onClose();
  };

  return (
    <Dialog open={!!product} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto p-0 gap-0 border-none bg-white rounded-t-3xl sm:rounded-3xl">
        {loading ? (
          <div className="flex h-60 items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <div className="relative h-48 bg-muted">
              {product.image_url && (
                <img 
                  src={product.image_url} 
                  className="w-full h-full object-cover" 
                  alt={product.name} 
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              <div className="absolute bottom-4 left-6">
                <h2 className="text-xl font-bold text-white">{product.name}</h2>
                <p className="text-white/80 text-sm line-clamp-1">{product.description}</p>
              </div>
            </div>

            <div className="p-6 space-y-8">
              {/* Variações */}
              {product.type === "variable" && details?.variants && (
                <section>
                  <h3 className="font-bold text-secondary mb-4">Escolha o tamanho/tipo</h3>
                  <RadioGroup 
                    value={selectedVariantId || ""} 
                    onValueChange={setSelectedVariantId}
                    className="space-y-3"
                  >
                    {details.variants.map((v) => (
                      <div key={v.id} className="flex items-center justify-between p-3 rounded-xl border border-border hover:border-primary transition-colors cursor-pointer" onClick={() => setSelectedVariantId(v.id)}>
                        <div className="flex items-center gap-3">
                          <RadioGroupItem value={v.id} id={v.id} />
                          <Label htmlFor={v.id} className="font-medium cursor-pointer">{v.name}</Label>
                        </div>
                        <span className="text-sm font-bold text-secondary">{centsToBRL(v.price_cents)}</span>
                      </div>
                    ))}
                  </RadioGroup>
                </section>
              )}

              {/* Grupos de Opções */}
              {details?.option_groups.map((group) => (
                <section key={group.id}>
                  <div className="flex justify-between items-end mb-4">
                    <div>
                      <h3 className="font-bold text-secondary">{group.name}</h3>
                      <p className="text-[11px] text-muted-foreground">
                        {group.min_options > 0 ? `Obrigatório • ` : ""}
                        Escolha de {group.min_options} a {group.max_options}
                      </p>
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    {group.items.map((item) => {
                      const isSelected = selectedOptions[group.id]?.includes(item.id);
                      return (
                        <div 
                          key={item.id} 
                          className={cn(
                            "flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer",
                            isSelected ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"
                          )}
                          onClick={() => handleToggleOption(group.id, item.id, group.max_options)}
                        >
                          <div className="flex items-center gap-3">
                            <Checkbox checked={isSelected} id={item.id} className="rounded-md" />
                            <Label htmlFor={item.id} className="font-medium cursor-pointer text-sm">{item.name}</Label>
                          </div>
                          {item.price_cents > 0 && (
                            <span className="text-xs font-bold text-primary">+ {centsToBRL(item.price_cents)}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}

              {/* Quantidade */}
              <div className="flex items-center justify-between py-4 border-t border-border">
                <span className="font-bold text-secondary">Quantidade</span>
                <div className="flex items-center gap-4 bg-muted p-1 rounded-xl">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="w-10 h-10 rounded-lg text-primary"
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  >
                    <Minus className="w-4 h-4" />
                  </Button>
                  <span className="font-bold w-6 text-center">{quantity}</span>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="w-10 h-10 rounded-lg text-primary"
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
                onClick={handleConfirm}
              >
                <span>Adicionar</span>
                <span>{centsToBRL(currentPrice())}</span>
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Helper local since cn is not imported correctly in some environments sometimes
function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(" ");
}
