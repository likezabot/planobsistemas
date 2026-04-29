import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useCart } from "@/lib/cart/cartStore";
import { createPublicOrder } from "@/lib/checkout/queries";
import { centsToBRL } from "@/lib/catalog/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { ChevronLeft, ShoppingBag, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

const checkoutSchema = z.object({
  customer_phone: z.string().min(8, "Telefone inválido"),
  customer_name: z.string().min(2, "Nome muito curto"),
  order_type: z.enum(["pickup", "delivery"]),
  address: z.string().optional(),
  payment_method: z.enum(["money", "card", "pix", "online"]),
  notes: z.string().optional(),
}).refine((data) => {
  if (data.order_type === "delivery" && (!data.address || data.address.length < 5)) {
    return false;
  }
  return true;
}, {
  message: "Endereço é obrigatório para entrega",
  path: ["address"],
});

type CheckoutForm = z.infer<typeof checkoutSchema>;

export default function PublicCheckout() {
  const { restaurantSlug } = useParams<{ restaurantSlug: string }>();
  const navigate = useNavigate();
  const { items, getTotal, clearCart } = useCart();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState<string | null>(null);

  const form = useForm<CheckoutForm>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      order_type: "pickup",
      payment_method: "money",
    },
  });

  const orderType = form.watch("order_type");

  useEffect(() => {
    if (items.length === 0 && !orderSuccess) {
      navigate(`/menu/${restaurantSlug}`);
    }
  }, [items, orderSuccess, navigate, restaurantSlug]);

  const onSubmit = async (data: CheckoutForm) => {
    if (!restaurantSlug) return;
    setIsSubmitting(true);
    
    try {
      const idempotencyKey = `checkout-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      const result = await createPublicOrder({
        restaurant_slug: restaurantSlug,
        customer_name: data.customer_name,
        customer_phone: data.customer_phone,
        order_type: data.order_type,
        payment_method: data.payment_method,
        idempotency_key: idempotencyKey,
        items: items.map(i => ({
          product_id: i.product_id,
          quantity: i.quantity,
          note: i.note
        })),
        address: data.address,
        notes: data.notes
      });

      setOrderSuccess(result.order_id);
      clearCart();
      toast.success("Pedido realizado com sucesso!");
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Erro ao finalizar pedido");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (orderSuccess) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="surface-panel max-w-md w-full p-8 text-center animate-in fade-in zoom-in duration-300">
          <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-6">
            <CheckCircle2 className="w-10 h-10 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Pedido Confirmado!</h1>
          <p className="text-muted-foreground mb-6">
            Seu pedido foi recebido e já está em processamento.
          </p>
          <div className="bg-secondary p-4 rounded-lg mb-8 text-left">
            <p className="text-xs uppercase font-semibold text-muted-foreground mb-1">Código do Pedido</p>
            <p className="font-mono text-sm">{orderSuccess}</p>
          </div>
          <Button className="w-full" variant="outline" onClick={() => navigate(`/menu/${restaurantSlug}`)}>
            Voltar ao Cardápio
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="mx-auto max-w-2xl px-4 h-16 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ChevronLeft className="w-6 h-6" />
          </Button>
          <h1 className="text-lg font-semibold">Finalizar Pedido</h1>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-8">
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          {/* 1. Telefone & 2. Nome */}
          <section className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Identificação</h2>
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="customer_phone">Telefone (WhatsApp)</Label>
                <Input 
                  id="customer_phone" 
                  placeholder="(11) 99999-9999" 
                  {...form.register("customer_phone")}
                />
                {form.formState.errors.customer_phone && (
                  <p className="text-xs text-destructive">{form.formState.errors.customer_phone.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="customer_name">Nome completo</Label>
                <Input 
                  id="customer_name" 
                  placeholder="Como devemos te chamar?" 
                  {...form.register("customer_name")}
                />
                {form.formState.errors.customer_name && (
                  <p className="text-xs text-destructive">{form.formState.errors.customer_name.message}</p>
                )}
              </div>
            </div>
          </section>

          {/* 3. Tipo: Retirada / Entrega */}
          <section className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Tipo de Pedido</h2>
            <RadioGroup 
              defaultValue="pickup" 
              className="grid grid-cols-2 gap-4"
              onValueChange={(val) => form.setValue("order_type", val as any)}
            >
              <div>
                <RadioGroupItem value="pickup" id="pickup" className="peer sr-only" />
                <Label
                  htmlFor="pickup"
                  className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                >
                  <ShoppingBag className="mb-3 h-6 w-6" />
                  Retirada
                </Label>
              </div>
              <div>
                <RadioGroupItem value="delivery" id="delivery" className="peer sr-only" />
                <Label
                  htmlFor="delivery"
                  className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                >
                  <Loader2 className="mb-3 h-6 w-6" />
                  Entrega
                </Label>
              </div>
            </RadioGroup>
          </section>

          {/* 4. Endereço se entrega */}
          {orderType === "delivery" && (
            <section className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Endereço de Entrega</h2>
              <div className="space-y-2">
                <Label htmlFor="address">Rua, número, bairro e complemento</Label>
                <Textarea 
                  id="address" 
                  placeholder="Ex: Rua das Flores, 123, Apto 45 - Centro" 
                  {...form.register("address")}
                />
                {form.formState.errors.address && (
                  <p className="text-xs text-destructive">{form.formState.errors.address.message}</p>
                )}
              </div>
            </section>
          )}

          {/* 5. Pagamento */}
          <section className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Forma de Pagamento</h2>
            <RadioGroup 
              defaultValue="money" 
              className="grid gap-2"
              onValueChange={(val) => form.setValue("payment_method", val as any)}
            >
              <div className="flex items-center space-x-2 border p-3 rounded-md">
                <RadioGroupItem value="money" id="money" />
                <Label htmlFor="money" className="flex-1 cursor-pointer">Dinheiro</Label>
              </div>
              <div className="flex items-center space-x-2 border p-3 rounded-md">
                <RadioGroupItem value="card" id="card" />
                <Label htmlFor="card" className="flex-1 cursor-pointer">Cartão (na entrega/retirada)</Label>
              </div>
              <div className="flex items-center space-x-2 border p-3 rounded-md">
                <RadioGroupItem value="pix" id="pix" />
                <Label htmlFor="pix" className="flex-1 cursor-pointer">PIX</Label>
              </div>
            </RadioGroup>
          </section>

          {/* 6. Observação */}
          <section className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Observações Adicionais</h2>
            <Textarea 
              placeholder="Algum detalhe sobre a entrega ou o pedido?" 
              {...form.register("notes")}
            />
          </section>

          {/* 7. Resumo do pedido */}
          <section className="space-y-4 border-t border-border pt-8">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Resumo</h2>
            <div className="space-y-3">
              {items.map((item) => (
                <div key={item.product_id} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    <span className="font-semibold text-foreground">{item.quantity}x</span> {item.name}
                  </span>
                  <span className="tabular-nums font-medium">{centsToBRL(item.price_cents * item.quantity)}</span>
                </div>
              ))}
              <div className="border-t border-dashed pt-3 flex justify-between font-bold text-lg">
                <span>Total</span>
                <span className="tabular-nums">{centsToBRL(getTotal())}</span>
              </div>
            </div>
          </section>

          {/* 8. Finalizar pedido */}
          <div className="pt-4">
            <Button 
              type="submit" 
              className="w-full h-14 text-lg font-bold" 
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Processando...
                </>
              ) : (
                "Finalizar Pedido"
              )}
            </Button>
          </div>
        </form>
      </div>
    </main>
  );
}
