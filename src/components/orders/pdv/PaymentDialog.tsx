import { useEffect, useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, cn } from "@/lib/utils";
import {
  listOrderPayments,
  registerOrderPayment,
  type OrderPayment,
  type PaymentMethod,
} from "@/lib/orders/paymentsQueries";
import { getOpenCashSession } from "@/lib/cash/queries";
import { useRestaurant } from "@/lib/auth/RestaurantProvider";
import { CreditCard, DollarSign, Loader2, Smartphone, Globe, AlertCircle } from "lucide-react";

interface PaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  onPaid: () => void;
}

const METHOD_LABELS: Record<PaymentMethod, string> = {
  money: "Dinheiro",
  card: "Cartão",
  pix: "Pix",
  online: "Online",
};

const METHOD_ICONS: Record<PaymentMethod, React.ReactNode> = {
  money: <DollarSign className="w-3 h-3" />,
  card: <CreditCard className="w-3 h-3" />,
  pix: <Smartphone className="w-3 h-3" />,
  online: <Globe className="w-3 h-3" />,
};

const parseCents = (s: string): number => {
  const normalized = s.replace(/\./g, "").replace(",", ".").trim();
  const n = parseFloat(normalized);
  if (Number.isNaN(n) || n < 0) return -1;
  return Math.round(n * 100);
};

const formatInput = (cents: number) =>
  (cents / 100).toFixed(2).replace(".", ",");

export function PaymentDialog({
  open,
  onOpenChange,
  orderId,
  onPaid,
}: PaymentDialogProps) {
  const { toast } = useToast();
  const { currentRestaurantId } = useRestaurant();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [totalCents, setTotalCents] = useState(0);
  const [paidCents, setPaidCents] = useState(0);
  const [paymentStatus, setPaymentStatus] = useState<string>("open");
  const [payments, setPayments] = useState<OrderPayment[]>([]);
  const [hasOpenSession, setHasOpenSession] = useState(true);

  const [method, setMethod] = useState<PaymentMethod>("money");
  const [amountInput, setAmountInput] = useState("0,00");
  const [tenderedInput, setTenderedInput] = useState("0,00");

  const remaining = Math.max(totalCents - paidCents, 0);
  const isPaid = paymentStatus === "paid" || remaining === 0;

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { data: order, error: oerr } = await supabase
        .from("orders")
        .select("total_cents, paid_amount_cents, payment_status")
        .eq("id", orderId)
        .single();
      if (oerr) throw oerr;

      const list = await listOrderPayments(orderId);

      const total = order.total_cents ?? 0;
      const paid = order.paid_amount_cents ?? 0;
      setTotalCents(total);
      setPaidCents(paid);
      setPaymentStatus(order.payment_status ?? "open");
      setPayments(list);

      if (currentRestaurantId) {
        try {
          const s = await getOpenCashSession(currentRestaurantId);
          setHasOpenSession(!!s);
        } catch {
          setHasOpenSession(false);
        }
      }

      const newRemaining = Math.max(total - paid, 0);
      setAmountInput(formatInput(newRemaining));
      setTenderedInput(formatInput(newRemaining));
    } catch (e: unknown) {
      const error = e as Error;
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [orderId, toast, currentRestaurantId]);

  useEffect(() => {
    if (open) {
      refresh();
    }
  }, [open, refresh]);

  useEffect(() => {
    if (method !== "money") {
      setTenderedInput(amountInput);
    }
  }, [method, amountInput]);

  const fillRemaining = () => {
    setAmountInput(formatInput(remaining));
    setTenderedInput(formatInput(remaining));
  };

  const handleSubmit = async () => {
    const amountCents = parseCents(amountInput);
    if (amountCents <= 0) {
      toast({
        title: "Valor inválido",
        description: "Informe um valor maior que zero.",
        variant: "destructive",
      });
      return;
    }

    let changeCents = 0;
    if (method === "money") {
      const tendered = parseCents(tenderedInput);
      if (tendered < amountCents) {
        toast({
          title: "Valor recebido insuficiente",
          description: "O valor recebido não pode ser menor que o pagamento.",
          variant: "destructive",
        });
        return;
      }
      changeCents = tendered - amountCents;
    }

    if (amountCents > remaining && method !== "money") {
      toast({
        title: "Valor excede o restante",
        description: `Restante: ${formatCurrency(remaining / 100)}`,
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      let rpcAmount: number;
      let rpcChange: number;
      if (method === "money") {
        const tendered = parseCents(tenderedInput);
        rpcAmount = tendered;
        rpcChange = tendered - amountCents;
        if (amountCents > remaining) {
          toast({
            title: "Valor excede o restante",
            description: `Restante: ${formatCurrency(remaining / 100)}`,
            variant: "destructive",
          });
          setSubmitting(false);
          return;
        }
      } else {
        rpcAmount = amountCents;
        rpcChange = 0;
      }

      const result = await registerOrderPayment(
        orderId,
        method,
        rpcAmount,
        rpcChange,
      );

      if (result.payment_status === "paid") {
        toast({
          title: "Pedido quitado",
          description: "Todos os pagamentos foram registrados.",
        });
        onPaid();
        onOpenChange(false);
      } else {
        toast({
          title: "Pagamento parcial registrado",
          description: `Restante: ${formatCurrency(result.remaining_cents / 100)}`,
        });
        onPaid();
        await refresh();
      }
    } catch (e: unknown) {
      const error = e as Error;
      toast({
        title: "Erro ao registrar pagamento",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Pagamento do pedido</DialogTitle>
          <DialogDescription>
            Registre um ou mais pagamentos parciais. O saldo é atualizado pelo servidor.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/20 p-3 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total do pedido</span>
                <span className="font-medium">{formatCurrency(totalCents / 100)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Já pago</span>
                <span className="font-medium text-emerald-600">
                  {formatCurrency(paidCents / 100)}
                </span>
              </div>
              <Separator className="my-1" />
              <div className="flex justify-between text-base font-bold">
                <span>Restante</span>
                <span className={cn(remaining === 0 ? "text-emerald-600" : "text-primary")}>
                  {formatCurrency(remaining / 100)}
                </span>
              </div>
              {isPaid && (
                <Badge className="w-full justify-center mt-2 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                  QUITADO
                </Badge>
              )}
            </div>

            {payments.length > 0 && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground uppercase">
                  Pagamentos registrados
                </Label>
                <ScrollArea className="max-h-32 rounded-md border">
                  <div className="p-2 space-y-1">
                    {payments.map((p) => {
                      const applied = p.amount_cents - p.change_cents;
                      return (
                        <div
                          key={p.id}
                          className="flex items-center justify-between text-xs px-2 py-1 rounded hover:bg-muted/50"
                        >
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px] h-5 gap-1">
                              {METHOD_ICONS[p.payment_method]}
                              {METHOD_LABELS[p.payment_method]}
                            </Badge>
                            <span className="text-muted-foreground">
                              {new Date(p.created_at).toLocaleTimeString()}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">
                              {formatCurrency(applied / 100)}
                            </span>
                            {p.change_cents > 0 && (
                              <span className="text-[10px] text-muted-foreground">
                                (troco {formatCurrency(p.change_cents / 100)})
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>
            )}

            {!isPaid && (
              <div className="space-y-3 rounded-lg border p-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="pay-method" className="text-xs">Forma</Label>
                    <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
                      <SelectTrigger id="pay-method">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="money">Dinheiro</SelectItem>
                        <SelectItem value="card">Cartão</SelectItem>
                        <SelectItem value="pix">Pix</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="pay-amount" className="text-xs">
                      Valor a pagar (R$)
                    </Label>
                    <div className="flex gap-1">
                      <Input
                        id="pay-amount"
                        inputMode="decimal"
                        value={amountInput}
                        onChange={(e) => setAmountInput(e.target.value)}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-[10px] px-2"
                        onClick={fillRemaining}
                      >
                        Restante
                      </Button>
                    </div>
                  </div>
                </div>

                {method === "money" && (
                  <div className="space-y-1">
                    <Label htmlFor="pay-tendered" className="text-xs">
                      Valor recebido (R$)
                    </Label>
                    <Input
                      id="pay-tendered"
                      inputMode="decimal"
                      value={tenderedInput}
                      onChange={(e) => setTenderedInput(e.target.value)}
                    />
                    {(() => {
                      const a = parseCents(amountInput);
                      const t = parseCents(tenderedInput);
                      if (a > 0 && t > a) {
                        return (
                          <p className="text-xs text-amber-700">
                            Troco: <strong>{formatCurrency((t - a) / 100)}</strong>
                          </p>
                        );
                      }
                      return null;
                    })()}
                  </div>
                )}

                {method === "money" && !hasOpenSession && (
                  <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800">
                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>
                      Sem sessão de caixa aberta — este pagamento em dinheiro
                      não aparecerá no relatório de fechamento de caixa.
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Fechar
          </Button>
          {!isPaid && (
            <Button onClick={handleSubmit} disabled={submitting || loading}>
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Registrar pagamento
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
