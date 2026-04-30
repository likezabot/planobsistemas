import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Search, Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { addItemsToOrder, Product } from "@/lib/orders/queries";
import { useToast } from "@/hooks/use-toast";

interface PDVProductSelectorProps {
  orderId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  restaurantId: string;
}

export function PDVProductSelector({ orderId, open, onOpenChange, onSuccess, restaurantId }: PDVProductSelectorProps) {
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    if (open && restaurantId) {
      const fetchProducts = async () => {
        setLoading(true);
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .eq('restaurant_id', restaurantId)
          .eq('active', true)
          .order('name');
        
        if (!error) setProducts(data || []);
        setLoading(false);
      };
      fetchProducts();
    }
  }, [open, restaurantId]);

  const handleAddProduct = async (product: Product) => {
    try {
      await addItemsToOrder(orderId, [{
        product_id: product.id,
        quantity: 1,
        customization: {}
      }]);
      toast({ title: "Adicionado", description: `${product.name} adicionado ao pedido.` });
      onSuccess();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Adicionar Item ao Pedido</DialogTitle>
        </DialogHeader>
        
        <div className="relative mb-4">
          <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
          <Input 
            className="pl-9" 
            placeholder="Buscar produto..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center"><Loader2 className="animate-spin" /></div>
        ) : (
          <ScrollArea className="flex-1 pr-4">
            <div className="grid grid-cols-2 gap-3">
              {filteredProducts.map(product => (
                <Card 
                  key={product.id} 
                  className="cursor-pointer hover:bg-accent transition-colors"
                  onClick={() => handleAddProduct(product)}
                >
                  <CardContent className="p-3">
                    <p className="font-bold text-sm">{product.name}</p>
                    <p className="text-xs text-primary">{formatCurrency(product.price_cents / 100)}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}