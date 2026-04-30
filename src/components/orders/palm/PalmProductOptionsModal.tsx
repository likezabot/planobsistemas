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
  type PublicProductDetails 
} from "@/lib/menu/publicQueries";
import { centsToBRL } from "@/lib/catalog/money";
import { Loader2, Plus, Minus } from "lucide-react";
import { usePalmCartStore } from "@/lib/orders/palmCartStore";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface PalmProductOptionsModalProps {
  product: any | null;
  orderId: string;
  onClose: () => void;
  onAdded?: () => void;
}

export function PalmProductOptionsModal({ 
  product, 
  orderId,
  onClose,
  onAdded
}: PalmProductOptionsModalProps) {
  const [details, setDetails] = useState<PublicProductDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string[]>>({});
  const { addItem } = usePalmCartStore();

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

    return (base + extras);
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
    if (!details) return;

    // Validation
    for (const group of details.option_groups) {
      const selected = selectedOptions[group.id]?.length ?? 0;
      if (selected < group.min_options) {
        toast.error(`Selecione pelo menos ${group.min_options} em ${group.name}`);
        return;
      }
    }

    let finalName = product.name;
    let additions: any[] = [];

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
          if (item) {
            additions.push({
              id: item.id,
              name: item.name,
              price_cents: item.price_cents,
              quantity: 1
            });
          }
        });
      }
    });

    addItem(orderId, {
      product_id: product.id,
      name: finalName,
      unit_price_cents: currentPrice(),
      quantity,
      variation_id: selectedVariantId ?? null,
      additions: additions.length > 0 ? additions : undefined,
    });

    toast.success(`${product.name} adicionado`);
    onAdded?.();
    onClose();
  };

  return (
    <Dialog open={!!product} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto p-0 flex flex-col">
        {loading ? (
          <div className="flex h-60 items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <DialogHeader className="p-4 border-b sticky top-0 bg-white z-10">
              <DialogTitle>{product.name}</DialogTitle>
            </DialogHeader>

            <div className="p-4 space-y-6 flex-1 overflow-y-auto">
              {/* Variações */}
              {product.type === "variable" && details?.variants && (
                <section>
                  <h3 className="font-bold text-sm mb-3">Tamanho/Tipo</h3>
                  <RadioGroup 
                    value={selectedVariantId || ""} 
                    onValueChange={setSelectedVariantId}
                    className="space-y-2"
                  >
                    {details.variants.map((v) => (
                      <div 
                        key={v.id} 
                        className={cn(
                          "flex items-center justify-between p-3 rounded-lg border",
                          selectedVariantId === v.id ? "border-primary bg-primary/5" : "border-border"
                        )} 
                        onClick={() => setSelectedVariantId(v.id)}
                      >
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value={v.id} id={v.id} />
                          <Label htmlFor={v.id} className="font-medium">{v.name}</Label>
                        </div>
                        <span className="text-sm font-bold">{centsToBRL(v.price_cents)}</span>
                      </div>
                    ))}
                  </RadioGroup>
                </section>
              )}

              {/* Grupos de Opções */}
              {details?.option_groups.map((group) => (
                <section key={group.id}>
                  <div className="mb-3">
                    <h3 className="font-bold text-sm">{group.name}</h3>
                    <p className="text-[10px] text-muted-foreground">
                      {group.min_options > 0 ? `Obrigatório • ` : ""}
                      Escolha até {group.max_options}
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    {group.items.map((item) => {
                      const isSelected = selectedOptions[group.id]?.includes(item.id);
                      return (
                        <div 
                          key={item.id} 
                          className={cn(
                            "flex items-center justify-between p-3 rounded-lg border",
                            isSelected ? "border-primary bg-primary/5" : "border-border"
                          )}
                          onClick={() => handleToggleOption(group.id, item.id, group.max_options)}
                        >
                          <div className="flex items-center gap-2">
                            <Checkbox checked={isSelected} id={item.id} />
                            <Label htmlFor={item.id} className="font-medium text-sm">{item.name}</Label>
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
              <div className="flex items-center justify-between py-4 border-t">
                <span className="font-bold text-sm">Quantidade</span>
                <div className="flex items-center gap-4 bg-muted p-1 rounded-lg">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="w-8 h-8 rounded-md"
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  >
                    <Minus className="w-3 h-3" />
                  </Button>
                  <span className="font-bold w-4 text-center">{quantity}</span>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="w-8 h-8 rounded-md"
                    onClick={() => setQuantity(quantity + 1)}
                  >
                    <Plus className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </div>

            <DialogFooter className="p-4 bg-white border-t sticky bottom-0">
              <Button 
                className="w-full h-12 font-bold flex justify-between px-6"
                onClick={handleConfirm}
              >
                <span>Adicionar</span>
                <span>{centsToBRL(currentPrice() * quantity)}</span>
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
