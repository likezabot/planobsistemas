import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRestaurant } from "@/lib/auth/RestaurantProvider";
import { listCategories, listPublicMenu } from "@/lib/catalog/queries";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Search, X, Plus } from "lucide-react";
import { centsToBRL } from "@/lib/catalog/money";
import { cn } from "@/lib/utils";
import { usePalmCartStore } from "@/lib/orders/palmCartStore";
import { PalmProductOptionsModal } from "./PalmProductOptionsModal";
import { PalmPizzaModal } from "./PalmPizzaModal";

interface PalmProductListProps {
  orderId: string;
  onAdded?: () => void;
}

export const PalmProductList = ({ orderId, onAdded }: PalmProductListProps) => {
  const { currentRestaurantId } = useRestaurant();
  const [search, setSearch] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);

  const { data: categories, isLoading: loadingCats } = useQuery({
    queryKey: ["palm-categories", currentRestaurantId],
    queryFn: () => listCategories(currentRestaurantId!).then(res => res.data),
    enabled: !!currentRestaurantId,
  });

  const { data: products, isLoading: loadingProds } = useQuery({
    queryKey: ["palm-products", currentRestaurantId],
    queryFn: () => listPublicMenu(currentRestaurantId!).then(res => res.data),
    enabled: !!currentRestaurantId,
  });

  const filteredProducts = products?.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = !selectedCategoryId || p.category_id === selectedCategoryId;
    return matchesSearch && matchesCategory;
  });

  const handleAddSimple = (product: any) => {
    if (product.type === "variable" || product.type === "pizza") {
      setSelectedProduct(product);
      return;
    }

    usePalmCartStore.getState().addItem(orderId, {
      product_id: product.id,
      name: product.name,
      quantity: 1,
      unit_price_cents: product.price_cents,
    });
    onAdded?.();
  };

  if (loadingCats || loadingProds) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="p-4 bg-white border-b sticky top-0 z-10 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Buscar produto..." 
            className="pl-9 bg-gray-50" 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <Button 
              variant="ghost" 
              size="icon" 
              className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
              onClick={() => setSearch("")}
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          <Button
            variant={selectedCategoryId === null ? "default" : "outline"}
            size="sm"
            className="rounded-full whitespace-nowrap"
            onClick={() => setSelectedCategoryId(null)}
          >
            Todos
          </Button>
          {categories?.map((cat) => (
            <Button
              key={cat.id}
              variant={selectedCategoryId === cat.id ? "default" : "outline"}
              size="sm"
              className="rounded-full whitespace-nowrap"
              onClick={() => setSelectedCategoryId(cat.id)}
            >
              {cat.name}
            </Button>
          ))}
        </div>
      </div>

      <div className="p-4 grid grid-cols-1 gap-3 overflow-y-auto">
        {filteredProducts?.map((p) => (
          <Button
            key={p.id}
            variant="outline"
            className="flex h-auto p-3 items-center justify-between text-left border bg-white hover:bg-gray-50"
            onClick={() => handleAddSimple(p)}
          >
            <div className="flex-1 min-w-0 pr-4">
              <p className="font-bold text-sm truncate">{p.name}</p>
              <p className="text-xs text-primary font-semibold">{centsToBRL(p.price_cents)}</p>
            </div>
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <Plus className="w-4 h-4" />
            </div>
          </Button>
        ))}
        {filteredProducts?.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm">
            Nenhum produto encontrado.
          </div>
        )}
      </div>

      {selectedProduct && selectedProduct.type === "pizza" && (
        <PalmPizzaModal 
          product={selectedProduct} 
          orderId={orderId}
          onClose={() => setSelectedProduct(null)}
          onAdded={onAdded}
        />
      )}

      {selectedProduct && selectedProduct.type !== "pizza" && (
        <PalmProductOptionsModal 
          product={selectedProduct} 
          orderId={orderId}
          onClose={() => setSelectedProduct(null)}
          onAdded={onAdded}
        />
      )}
    </div>
  );
};
