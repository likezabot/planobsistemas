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
          customization: i.customization
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
      <main className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="bg-card shadow-premium border border-border max-w-md w-full p-10 text-center rounded-[2.5rem] animate-in fade-in zoom-in duration-500">
          <div className="mx-auto w-20 h-20 bg-success/10 rounded-3xl flex items-center justify-center mb-8">
            <CheckCircle2 className="w-12 h-12 text-success" />
          </div>
          <h1 className="text-3xl font-display font-bold text-secondary mb-3">Pedido Enviado!</h1>
          <p className="text-muted-foreground mb-8 leading-relaxed">
            Seu pedido foi recebido e já está em processamento pelo restaurante.
          </p>
          <div className="bg-muted p-5 rounded-2xl mb-8 text-center border border-border">
            <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground mb-2">Código do Pedido</p>
            <p className="font-mono text-lg font-bold text-secondary">{orderSuccess}</p>
          </div>
          <Button 
            className="w-full h-14 rounded-2xl font-bold text-lg" 
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
    <main className="min-h-screen bg-background pb-12 font-sans">
      <header className="border-b border-border bg-card/80 backdrop-blur-md sticky top-0 z-30">
        <div className="mx-auto max-w-2xl px-4 h-18 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" className="rounded-xl" onClick={() => step > 1 ? setStep(s => s - 1) : navigate(-1)}>
              <ChevronLeft className="w-6 h-6" />
            </Button>
            <div>
              <h1 className="text-lg font-display font-bold text-secondary leading-none">Checkout</h1>
              <p className="text-xs text-muted-foreground mt-1">Passo {step} de 3</p>
            </div>
          </div>
          <div className="flex gap-1.5">
            {[1, 2, 3].map(i => (
              <div 
                key={i} 
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  step >= i ? "w-8 bg-primary" : "w-3 bg-muted"
                )} 
              />
            ))}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-8">
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-10">
          {/* Passo 1: Identificação */}
          {step === 1 && (
            <section className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                  <User className="w-5 h-5 text-primary" />
                </div>
                <h2 className="text-xl font-display font-bold text-secondary">Sua Identificação</h2>
              </div>
              
              <div className="grid gap-6">
                <div className="space-y-2">
                  <Label htmlFor="customer_phone" className="text-sm font-semibold text-secondary ml-1">WhatsApp</Label>
                  <div className="relative">
                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input 
                      id="customer_phone" 
                      placeholder="(11) 99999-9999" 
                      className="h-14 pl-12 rounded-2xl border-border bg-card shadow-sm focus:ring-primary focus:border-primary text-lg"
                      {...form.register("customer_phone")}
                    />
                  </div>
                  {form.formState.errors.customer_phone && (
                    <p className="text-xs font-medium text-destructive ml-1">{form.formState.errors.customer_phone.message}</p>
                  )}
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="customer_name" className="text-sm font-semibold text-secondary ml-1">Seu Nome</Label>
                  <Input 
                    id="customer_name" 
                    placeholder="Como devemos te chamar?" 
                    className="h-14 px-4 rounded-2xl border-border bg-card shadow-sm focus:ring-primary focus:border-primary text-lg"
                    {...form.register("customer_name")}
                  />
                  {form.formState.errors.customer_name && (
                    <p className="text-xs font-medium text-destructive ml-1">{form.formState.errors.customer_name.message}</p>
                  )}
                </div>
              </div>
              
              <Button type="button" className="w-full h-14 rounded-2xl text-lg font-bold shadow-premium" onClick={nextStep}>
                Continuar
              </Button>
            </section>
          )}

          {/* Passo 2: Entrega e Pagamento */}
          {step === 2 && (
            <section className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
              {/* Tipo de Pedido */}
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                    <MapPin className="w-5 h-5 text-primary" />
                  </div>
                  <h2 className="text-xl font-display font-bold text-secondary">Entrega ou Retirada?</h2>
                </div>
                
                <RadioGroup 
                  defaultValue="pickup" 
                  className="grid grid-cols-2 gap-4"
                  onValueChange={(val) => form.setValue("order_type", val as any)}
                >
                  <Label
                    htmlFor="pickup"
                    className={cn(
                      "flex flex-col items-center justify-center gap-3 rounded-2xl border-2 p-6 transition-all cursor-pointer",
                      orderType === "pickup" 
                        ? "border-primary bg-primary/5 shadow-premium scale-105" 
                        : "border-border bg-card hover:bg-muted"
                    )}
                  >
                    <RadioGroupItem value="pickup" id="pickup" className="sr-only" />
                    <ShoppingBag className={cn("w-8 h-8", orderType === "pickup" ? "text-primary" : "text-muted-foreground")} />
                    <span className={cn("font-bold text-lg", orderType === "pickup" ? "text-primary" : "text-secondary")}>Retirada</span>
                  </Label>
                  <Label
                    htmlFor="delivery"
                    className={cn(
                      "flex flex-col items-center justify-center gap-3 rounded-2xl border-2 p-6 transition-all cursor-pointer",
                      orderType === "delivery" 
                        ? "border-primary bg-primary/5 shadow-premium scale-105" 
                        : "border-border bg-card hover:bg-muted"
                    )}
                  >
                    <RadioGroupItem value="delivery" id="delivery" className="sr-only" />
                    <Loader2 className={cn("w-8 h-8", orderType === "delivery" ? "text-primary animate-spin" : "text-muted-foreground")} />
                    <span className={cn("font-bold text-lg", orderType === "delivery" ? "text-primary" : "text-secondary")}>Entrega</span>
                  </Label>
                </RadioGroup>
              </div>

              {/* Endereço se entrega */}
              {orderType === "delivery" && (
                <div className="space-y-2 animate-in slide-in-from-top-4 duration-300">
                  <Label htmlFor="address" className="text-sm font-semibold text-secondary ml-1">Endereço Completo</Label>
                  <Textarea 
                    id="address" 
                    placeholder="Rua, número, bairro e algum ponto de referência..." 
                    className="min-h-[100px] rounded-2xl border-border bg-card shadow-sm p-4 focus:ring-primary focus:border-primary text-base"
                    {...form.register("address")}
                  />
                  {form.formState.errors.address && (
                    <p className="text-xs font-medium text-destructive ml-1">{form.formState.errors.address.message}</p>
                  )}
                </div>
              )}

              {/* Pagamento */}
              <div className="space-y-4 pt-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                    <CreditCard className="w-5 h-5 text-primary" />
                  </div>
                  <h2 className="text-xl font-display font-bold text-secondary">Forma de Pagamento</h2>
                </div>
                
                <RadioGroup 
                  defaultValue="money" 
                  className="grid gap-3"
                  onValueChange={(val) => form.setValue("payment_method", val as any)}
                >
                  <PaymentMethodItem value="money" id="money" label="Dinheiro" icon={<Banknote className="w-5 h-5" />} />
                  <PaymentMethodItem value="card" id="card" label="Cartão (na entrega/retirada)" icon={<CreditCard className="w-5 h-5" />} />
                  <PaymentMethodItem value="pix" id="pix" label="PIX" icon={<QrCode className="w-5 h-5" />} />
                </RadioGroup>
              </div>
              
              <Button type="button" className="w-full h-14 rounded-2xl text-lg font-bold shadow-premium" onClick={nextStep}>
                Revisar Pedido
              </Button>
            </section>
          )}

          {/* Passo 3: Revisão e Finalização */}
          {step === 3 && (
            <section className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                  <ClipboardList className="w-5 h-5 text-primary" />
                </div>
                <h2 className="text-xl font-display font-bold text-secondary">Revisão Final</h2>
              </div>

              {/* Resumo dos Itens */}
              <div className="bg-card rounded-[2rem] border border-border shadow-card overflow-hidden">
                <div className="p-6 bg-muted/50 border-b border-border">
                  <h3 className="font-bold text-secondary">Seu Pedido</h3>
                </div>
                <div className="p-6 space-y-4">
                  {items.map((item) => (
                    <div key={item.product_id} className="flex flex-col gap-1">
                      <div className="flex justify-between items-start">
                        <div className="flex gap-2">
                          <span className="font-bold text-primary">{item.quantity}x</span>
                          <span className="font-semibold text-secondary">{item.name}</span>
                        </div>
                        <span className="tabular-nums font-bold text-secondary">{centsToBRL(item.price_cents * item.quantity)}</span>
                      </div>
                      {item.customization?.description && (
                        <p className="text-xs text-muted-foreground ml-7 italic">
                          {item.customization.description}
                        </p>
                      )}
                    </div>
                  ))}
                  <div className="border-t border-dashed border-border pt-4 flex justify-between items-center">
                    <span className="text-lg font-display font-bold text-secondary">Total</span>
                    <span className="text-2xl font-display font-bold text-primary tabular-nums">
                      {centsToBRL(getTotal())}
                    </span>
                  </div>
                </div>
              </div>

              {/* Observações */}
              <div className="space-y-2">
                <Label htmlFor="notes" className="text-sm font-semibold text-secondary ml-1">Alguma observação?</Label>
                <Textarea 
                  id="notes" 
                  placeholder="Ex: Sem cebola, caprichar no molho..." 
                  className="rounded-2xl border-border bg-card shadow-sm p-4 focus:ring-primary focus:border-primary"
                  {...form.register("notes")}
                />
              </div>

              <div className="space-y-4">
                <Button 
                  type="submit" 
                  className="w-full h-16 rounded-2xl text-xl font-bold shadow-premium group" 
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-6 w-6 animate-spin" />
                      Finalizando...
                    </>
                  ) : (
                    <span className="flex items-center gap-2">
                      Finalizar Pedido
                      <CheckCircle2 className="w-6 h-6 group-hover:scale-110 transition-transform" />
                    </span>
                  )}
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  Ao finalizar, seu pedido será enviado diretamente para a cozinha.
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
        className="flex items-center gap-4 p-4 rounded-2xl border-2 border-border bg-card cursor-pointer transition-all peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 hover:bg-muted"
      >
        <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-secondary transition-colors peer-data-[state=checked]:bg-primary/20 peer-data-[state=checked]:text-primary">
          {icon}
        </div>
        <span className="font-bold text-secondary flex-1">{label}</span>
        <div className="w-5 h-5 rounded-full border-2 border-border flex items-center justify-center peer-data-[state=checked]:border-primary">
          <div className="w-2.5 h-2.5 rounded-full bg-primary opacity-0 transition-opacity peer-data-[state=checked]:opacity-100" />
        </div>
      </Label>
    </div>
  );
}