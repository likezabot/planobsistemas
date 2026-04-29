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
import { 
  ChevronLeft, 
  ShoppingBag, 
  CheckCircle2, 
  Loader2, 
  MapPin, 
  CreditCard, 
  Banknote, 
  QrCode,
  User,
  Phone,
  ClipboardList
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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
  const [step, setStep] = useState(1);

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
          note: i.note,
          variation_id: i.variation_id ?? null,
          selected_options: i.selected_options ?? [],
          pizza_flavors: i.pizza_flavors ?? [],
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

  const nextStep = async () => {
    const fieldsToValidate = step === 1 
      ? ["customer_phone", "customer_name"] as const
      : step === 2 
        ? ["order_type", "address", "payment_method"] as const
        : [] as const;
    
    const isValid = await form.trigger(fieldsToValidate);
    if (isValid) setStep(s => s + 1);
  };

  if (orderSuccess) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-white px-4">
        <div className="bg-white shadow-xl border border-border max-w-md w-full p-10 text-center rounded-2xl animate-in fade-in zoom-in duration-500">
          <div className="mx-auto w-16 h-16 bg-success rounded-xl flex items-center justify-center mb-6">
            <CheckCircle2 className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-secondary mb-2">Pedido Enviado!</h1>
          <p className="text-muted-foreground mb-6 text-sm">
            Seu pedido foi recebido e já está em processamento pelo restaurante.
          </p>
          <div className="bg-muted p-4 rounded-xl mb-6 text-center border border-border">
            <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground mb-1">Código do Pedido</p>
            <p className="font-mono text-base font-bold text-secondary">{orderSuccess}</p>
          </div>
          <Button 
            className="w-full h-12 rounded-xl font-bold" 
            variant="secondary" 
            onClick={() => navigate(`/menu/${restaurantSlug}`)}
          >
            Voltar ao Cardápio
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white pb-12 font-sans">
      <header className="border-b border-border bg-white sticky top-0 z-30 shadow-sm">
        <div className="mx-auto max-w-2xl px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="rounded-lg h-9 w-9" onClick={() => step > 1 ? setStep(s => s - 1) : navigate(-1)}>
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-base font-bold text-secondary leading-none">Checkout</h1>
              <p className="text-[10px] text-muted-foreground mt-1 uppercase font-bold tracking-wider">Passo {step} de 3</p>
            </div>
          </div>
          <div className="flex gap-1">
            {[1, 2, 3].map(i => (
              <div 
                key={i} 
                className={cn(
                  "h-1 rounded-full transition-all duration-300",
                  step >= i ? "w-6 bg-primary" : "w-2 bg-muted"
                )} 
              />
            ))}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-8">
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          {step === 1 && (
            <section className="space-y-6 animate-in fade-in duration-300">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center">
                  <User className="w-5 h-5 text-white" />
                </div>
                <h2 className="text-xl font-bold text-secondary">Identificação</h2>
              </div>
              
              <div className="grid gap-5">
                <div className="space-y-1.5">
                  <Label htmlFor="customer_phone" className="text-xs font-bold text-secondary uppercase tracking-wider">WhatsApp</Label>
                  <Input 
                    id="customer_phone" 
                    placeholder="(11) 99999-9999" 
                    className="h-12 px-4 rounded-xl border-border bg-white shadow-sm"
                    {...form.register("customer_phone")}
                  />
                  {form.formState.errors.customer_phone && (
                    <p className="text-xs font-bold text-destructive">{form.formState.errors.customer_phone.message}</p>
                  )}
                </div>
                
                <div className="space-y-1.5">
                  <Label htmlFor="customer_name" className="text-xs font-bold text-secondary uppercase tracking-wider">Seu Nome</Label>
                  <Input 
                    id="customer_name" 
                    placeholder="Seu nome" 
                    className="h-12 px-4 rounded-xl border-border bg-white shadow-sm"
                    {...form.register("customer_name")}
                  />
                  {form.formState.errors.customer_name && (
                    <p className="text-xs font-bold text-destructive">{form.formState.errors.customer_name.message}</p>
                  )}
                </div>
              </div>
              
              <Button type="button" className="w-full h-12 rounded-xl font-bold text-base" onClick={nextStep}>
                Continuar
              </Button>
            </section>
          )}

          {step === 2 && (
            <section className="space-y-8 animate-in fade-in duration-300">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center">
                    <MapPin className="w-5 h-5 text-white" />
                  </div>
                  <h2 className="text-xl font-bold text-secondary">Entrega ou Retirada?</h2>
                </div>
                
                <RadioGroup 
                  defaultValue="pickup" 
                  className="grid grid-cols-2 gap-3"
                  onValueChange={(val) => form.setValue("order_type", val as any)}
                >
                  <Label
                    htmlFor="pickup"
                    className={cn(
                      "flex flex-col items-center justify-center gap-2 rounded-xl border-2 p-5 transition-all cursor-pointer",
                      orderType === "pickup" 
                        ? "border-primary bg-muted shadow-sm" 
                        : "border-border bg-white hover:bg-muted"
                    )}
                  >
                    <RadioGroupItem value="pickup" id="pickup" className="sr-only" />
                    <ShoppingBag className={cn("w-6 h-6", orderType === "pickup" ? "text-primary" : "text-muted-foreground")} />
                    <span className={cn("font-bold", orderType === "pickup" ? "text-primary" : "text-secondary")}>Retirada</span>
                  </Label>
                  <Label
                    htmlFor="delivery"
                    className={cn(
                      "flex flex-col items-center justify-center gap-2 rounded-xl border-2 p-5 transition-all cursor-pointer",
                      orderType === "delivery" 
                        ? "border-primary bg-muted shadow-sm" 
                        : "border-border bg-white hover:bg-muted"
                    )}
                  >
                    <RadioGroupItem value="delivery" id="delivery" className="sr-only" />
                    <Loader2 className={cn("w-6 h-6", orderType === "delivery" ? "text-primary animate-spin" : "text-muted-foreground")} />
                    <span className={cn("font-bold", orderType === "delivery" ? "text-primary" : "text-secondary")}>Entrega</span>
                  </Label>
                </RadioGroup>
              </div>

              {orderType === "delivery" && (
                <div className="space-y-1.5 animate-in slide-in-from-top-2 duration-200">
                  <Label htmlFor="address" className="text-xs font-bold text-secondary uppercase tracking-wider">Endereço Completo</Label>
                  <Textarea 
                    id="address" 
                    placeholder="Rua, número, bairro..." 
                    className="min-h-[80px] rounded-xl border-border bg-white shadow-sm p-3 text-sm"
                    {...form.register("address")}
                  />
                  {form.formState.errors.address && (
                    <p className="text-xs font-bold text-destructive">{form.formState.errors.address.message}</p>
                  )}
                </div>
              )}

              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center">
                    <CreditCard className="w-5 h-5 text-white" />
                  </div>
                  <h2 className="text-xl font-bold text-secondary">Forma de Pagamento</h2>
                </div>
                
                <RadioGroup 
                  defaultValue="money" 
                  className="grid gap-2"
                  onValueChange={(val) => form.setValue("payment_method", val as any)}
                >
                  <PaymentMethodItem value="money" id="money" label="Dinheiro" icon={<Banknote className="w-4 h-4" />} />
                  <PaymentMethodItem value="card" id="card" label="Cartão (na entrega/retirada)" icon={<CreditCard className="w-4 h-4" />} />
                  <PaymentMethodItem value="pix" id="pix" label="PIX" icon={<QrCode className="w-4 h-4" />} />
                </RadioGroup>
              </div>
              
              <Button type="button" className="w-full h-12 rounded-xl font-bold text-base" onClick={nextStep}>
                Revisar Pedido
              </Button>
            </section>
          )}

          {step === 3 && (
            <section className="space-y-8 animate-in fade-in duration-300">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center">
                  <ClipboardList className="w-5 h-5 text-white" />
                </div>
                <h2 className="text-xl font-bold text-secondary">Revisão Final</h2>
              </div>

              <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
                <div className="p-4 bg-muted border-b border-border">
                  <h3 className="font-bold text-secondary text-sm">Resumo do Pedido</h3>
                </div>
                <div className="p-4 space-y-3">
                  {items.map((item) => (
                    <div key={item.line_id} className="flex flex-col gap-0.5">
                      <div className="flex justify-between items-start text-sm">
                        <div className="flex gap-2 min-w-0">
                          <span className="font-bold text-primary">{item.quantity}x</span>
                          <span className="font-semibold text-secondary truncate">{item.name}</span>
                        </div>
                        <span className="tabular-nums font-bold text-secondary shrink-0">{centsToBRL(item.price_cents * item.quantity)}</span>
                      </div>
                      {item.customization?.description && (
                        <p className="text-[10px] text-muted-foreground ml-7 italic leading-tight">
                          {item.customization.description}
                        </p>
                      )}
                    </div>
                  ))}
                  <div className="border-t border-dashed border-border pt-4 flex justify-between items-center">
                    <span className="text-base font-bold text-secondary">Total</span>
                    <span className="text-xl font-bold text-primary tabular-nums">
                      {centsToBRL(getTotal())}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="notes" className="text-xs font-bold text-secondary uppercase tracking-wider">Observações?</Label>
                <Textarea 
                  id="notes" 
                  placeholder="Ex: Sem cebola..." 
                  className="rounded-xl border-border bg-white shadow-sm p-3 text-sm"
                  {...form.register("notes")}
                />
              </div>

              <div className="space-y-4">
                <Button 
                  type="submit" 
                  className="w-full h-14 rounded-xl text-lg font-bold shadow-sm" 
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Finalizando...
                    </>
                  ) : "Finalizar Pedido"}
                </Button>
                <p className="text-center text-[10px] text-muted-foreground uppercase font-bold tracking-widest">
                  Seu pedido será enviado agora
                </p>
              </div>
            </section>
          )}
        </form>
      </div>
    </main>
  );
}

function PaymentMethodItem({ value, id, label, icon }: { value: string, id: string, label: string, icon: React.ReactNode }) {
  return (
    <div className="relative">
      <RadioGroupItem value={value} id={id} className="peer sr-only" />
      <Label
        htmlFor={id}
        className="flex items-center gap-3 px-4 py-3 rounded-xl border border-border bg-white cursor-pointer transition-all peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-muted hover:bg-muted/50"
      >
        <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-secondary">
          {icon}
        </div>
        <span className="font-bold text-sm text-secondary">{label}</span>
      </Label>
    </div>
  );
}
