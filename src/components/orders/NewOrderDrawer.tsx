import { useState, useMemo } from "react";
import { useRestaurant } from "@/lib/auth/RestaurantProvider";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle,
  SheetDescription,
  SheetFooter
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Search, 
  Plus, 
  Minus, 
  Trash2, 
  ShoppingBag,
  User,
  Phone,
  CreditCard,
  Banknote,
  QrCode,
  Loader2
} from "lucide-react";
import { centsToBRL } from "@/lib/catalog/money";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface CartItem {
  product_id: string;
  name: string;
  price_cents: number;
  quantity: number;
  variation_id?: string;
  variation_name?: string;
}

export function NewOrderDrawer({ open, onOpenChange }: { open: boolean, onOpenChange: (open: boolean) => void }) {
  const { currentRestaurantId } = useRestaurant();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"money" | "card" | "pix">("money");

  const { data: products, isLoading: loadingProducts } = useQuery({
    queryKey: ["pos-products", currentRestaurantId, searchTerm],
    queryFn: async () => {
      let query = supabase
        .from("products")
        .select(`
          id, 
          name, 
          price_cents, 
          type,
          product_variants (id, name, price_cents, active)
        `)
        .eq("restaurant_id", currentRestaurantId!)
        .eq("active", true);

      if (searchTerm) {
        query = query.ilike("name", `%${searchTerm}%`);
      }

      const { data, error } = await query.limit(20);
      if (error) throw error;
      return data;
    },
    enabled: !!currentRestaurantId && open,
  });

  const cartTotal = useMemo(() => {
    return cart.reduce((acc, item) => acc + item.price_cents * item.quantity, 0);
  }, [cart]);

  const addToCart = (product: any, variation?: any) => {
    const productId = product.id;
    const variationId = variation?.id;
    const price = variation ? variation.price_cents : product.price_cents;
    const name = product.name;
    const vName = variation?.name;

    setCart(current => {
      const existingIndex = current.findIndex(
        item => item.product_id === productId && item.variation_id === variationId
      );

      if (existingIndex > -1) {
        const updated = [...current];
        updated[existingIndex].quantity += 1;
        return updated;
      }

      return [...current, {
        product_id: productId,
        name,
        price_cents: price,
        quantity: 1,
        variation_id: variationId,
        variation_name: vName
      }];
    });
    toast.success(`${name} adicionado!`);
  };

  const updateQuantity = (index: number, delta: number) => {
    setCart(current => {
      const updated = [...current];
      const newQty = updated[index].quantity + delta;
      if (newQty <= 0) {
        updated.splice(index, 1);
      } else {
        updated[index].quantity = newQty;
      }
      return updated;
    });
  };

  const createOrderMutation = useMutation({
    mutationFn: async () => {
      if (!customerName) throw new Error("Nome do cliente é obrigatório");
      if (cart.length === 0) throw new Error("Carrinho está vazio");

      const items = cart.map(item => ({
        product_id: item.product_id,
        quantity: item.quantity,
        variation_id: item.variation_id,
        // Simplificado para PDV básico, sem pizzas complexas ou opções aqui por enquanto
      }));

      const { data, error } = await supabase.rpc("create_internal_order", {
        _restaurant_id: currentRestaurantId,
        _customer_name: customerName,
        _customer_phone: customerPhone,
        _order_type: "pickup", // Default PDV
        _payment_method: paymentMethod,
        _idempotency_key: crypto.randomUUID(),
        _items: items,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Pedido criado com sucesso!");
      setCart([]);
      setCustomerName("");
      setCustomerPhone("");
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao criar pedido");
    }
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-xl w-full flex flex-col p-0 border-none shadow-2xl overflow-hidden">
        <SheetHeader className="p-6 bg-secondary text-white shrink-0">
          <SheetTitle className="text-white text-xl font-bold flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-primary" />
            Novo Pedido PDV
          </SheetTitle>
          <SheetDescription className="text-white/60">
            Crie um pedido interno rapidamente.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-2 flex-1 min-h-0 overflow-hidden">
            {/* Produtos */}
            <div className="flex flex-col border-r border-border min-h-0">
              <div className="p-4 bg-muted/30 border-b border-border">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input 
                    placeholder="Buscar produto..." 
                    className="pl-9 bg-white"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>

              <ScrollArea className="flex-1 p-4">
                {loadingProducts ? (
                  <div className="flex justify-center py-12"><Loader2 className="animate-spin text-primary" /></div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 pb-8">
                    {products?.map(p => (
                      <Card key={p.id} className="shadow-none border-border hover:border-primary/50 transition-colors cursor-pointer" onClick={() => {
                        if (p.type === 'simple') {
                          addToCart(p);
                        }
                      }}>
                        <CardContent className="p-3">
                          <div className="flex justify-between items-start gap-2">
                            <div className="min-w-0">
                              <p className="font-bold text-sm text-secondary truncate">{p.name}</p>
                              {p.type === 'simple' && (
                                <p className="text-xs text-primary font-bold mt-1">{centsToBRL(p.price_cents)}</p>
                              )}
                            </div>
                            {p.type === 'simple' && (
                              <Button size="icon" variant="ghost" className="h-7 w-7 rounded-lg text-primary">
                                <Plus className="w-4 h-4" />
                              </Button>
                            )}
                          </div>

                          {p.type !== 'simple' && (
                            <div className="mt-2 space-y-1.5 pt-2 border-t border-border">
                              {p.product_variants
                                ?.filter((v: any) => v.active)
                                .map((v: any) => (
                                  <Button 
                                    key={v.id} 
                                    variant="outline" 
                                    size="sm" 
                                    className="w-full justify-between h-8 text-[10px] rounded-md border-muted hover:border-primary px-2"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      addToCart(p, v);
                                    }}
                                  >
                                    <span className="truncate max-w-[100px]">{v.name}</span>
                                    <span className="font-bold text-primary">{centsToBRL(v.price_cents)}</span>
                                  </Button>
                                ))
                              }
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                    {!loadingProducts && products?.length === 0 && (
                      <div className="text-center py-12 opacity-40">
                        <ShoppingBag className="w-8 h-8 mx-auto mb-2" />
                        <p className="text-xs">Nenhum produto encontrado</p>
                      </div>
                    )}
                  </div>
                )}
              </ScrollArea>
            </div>

            {/* Carrinho e Cliente */}
            <div className="flex flex-col min-h-0 bg-[#F8FAFC]">
              <div className="p-4 border-b border-border bg-white space-y-3">
                <div className="space-y-1">
                  <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <User className="w-3 h-3" /> Cliente
                  </Label>
                  <Input 
                    placeholder="Nome do cliente" 
                    className="h-9 text-xs"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <Phone className="w-3 h-3" /> WhatsApp
                  </Label>
                  <Input 
                    placeholder="(00) 00000-0000" 
                    className="h-9 text-xs"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                  />
                </div>
              </div>

              <div className="p-4 bg-muted/10 text-[10px] font-bold uppercase tracking-widest text-muted-foreground border-b border-border">
                Itens no Carrinho ({cart.length})
              </div>

              <ScrollArea className="flex-1">
                <div className="p-4 space-y-3">
                  {cart.map((item, index) => (
                    <div key={`${item.product_id}-${item.variation_id}`} className="flex justify-between items-center gap-3 group">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-secondary truncate">{item.name}</p>
                        {item.variation_name && (
                          <p className="text-[9px] text-muted-foreground">{item.variation_name}</p>
                        )}
                        <p className="text-[10px] font-bold text-primary">{centsToBRL(item.price_cents)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center bg-white border border-border rounded-lg p-0.5">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-6 w-6 rounded-md"
                            onClick={() => updateQuantity(index, -1)}
                          >
                            {item.quantity === 1 ? <Trash2 className="w-3 h-3 text-destructive" /> : <Minus className="w-3 h-3" />}
                          </Button>
                          <span className="w-6 text-center text-xs font-bold">{item.quantity}</span>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-6 w-6 rounded-md"
                            onClick={() => updateQuantity(index, 1)}
                          >
                            <Plus className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {cart.length === 0 && (
                    <div className="text-center py-12 opacity-20">
                      <ShoppingBag className="w-8 h-8 mx-auto mb-2" />
                      <p className="text-[10px]">Carrinho vazio</p>
                    </div>
                  )}
                </div>
              </ScrollArea>

              <div className="p-6 bg-white border-t border-border space-y-4 shrink-0 shadow-[0_-4px_12px_rgba(0,0,0,0.03)]">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Forma de Pagamento</span>
                  <div className="flex items-center gap-1 p-1 bg-muted rounded-lg">
                    <Button 
                      size="sm" 
                      variant={paymentMethod === 'money' ? 'secondary' : 'ghost'}
                      className={cn("h-7 px-2 text-[9px] font-bold rounded-md", paymentMethod === 'money' && "shadow-sm")}
                      onClick={() => setPaymentMethod('money')}
                    >
                      <Banknote className="w-3 h-3 mr-1" /> Dinheiro
                    </Button>
                    <Button 
                      size="sm" 
                      variant={paymentMethod === 'card' ? 'secondary' : 'ghost'}
                      className={cn("h-7 px-2 text-[9px] font-bold rounded-md", paymentMethod === 'card' && "shadow-sm")}
                      onClick={() => setPaymentMethod('card')}
                    >
                      <CreditCard className="w-3 h-3 mr-1" /> Cartão
                    </Button>
                    <Button 
                      size="sm" 
                      variant={paymentMethod === 'pix' ? 'secondary' : 'ghost'}
                      className={cn("h-7 px-2 text-[9px] font-bold rounded-md", paymentMethod === 'pix' && "shadow-sm")}
                      onClick={() => setPaymentMethod('pix')}
                    >
                      <QrCode className="w-3 h-3 mr-1" /> PIX
                    </Button>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-2">
                  <span className="text-xs font-bold uppercase tracking-widest text-secondary">Total do Pedido</span>
                  <span className="text-xl font-black text-secondary">{centsToBRL(cartTotal)}</span>
                </div>

                <Button 
                  className="w-full h-12 rounded-xl font-bold bg-success hover:bg-success/90 text-white shadow-lg shadow-success/20 transition-all active:scale-[0.98]"
                  disabled={cart.length === 0 || !customerName || createOrderMutation.isPending}
                  onClick={() => createOrderMutation.mutate()}
                >
                  {createOrderMutation.isPending ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>Confirmar Pedido</>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
