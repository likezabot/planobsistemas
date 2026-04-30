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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
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
  splitOrderEqual,
  splitOrderByItems,
  type SplitEqualResult,
  type SplitItemsResult,
} from "@/lib/orders/splitQueries";
import {
  registerOrderPayment,
  type PaymentMethod,
} from "@/lib/orders/paymentsQueries";
import { Loader2, Users, ListChecks } from "lucide-react";

interface SplitBillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  onPaymentRegistered: () => void;
}

interface OrderLite {
  total_cents: number;
  paid_amount_cents: number;
  payment_status: string;
}

interface ItemLite {
  id: string;
  quantity: number;
  total_price_cents: number;
  status: string;
  product?: { name: string } | null;
}

export function SplitBillDialog({
  open,
  onOpenChange,
  orderId,
  onPaymentRegistered,
}: SplitBillDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState<OrderLite | null>(null);
  const [items, setItems] = useState<ItemLite[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Equal split state
  const [parts, setParts] = useState<number>(2);
  const [equalPreview, setEqualPreview] = useState<SplitEqualResult | null>(null);
  const [partsPaid, setPartsPaid] = useState(0);

  // Items split state
  const [selectedQty, setSelectedQty] = useState<Record<string, number>>({});
  const [itemsPreview, setItemsPreview] = useState<SplitItemsResult | null>(null);

  // Payment method for the part
  const [method, setMethod] = useState<PaymentMethod>("money");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { data: o, error: oerr } = await supabase
        .from("orders")
        .select("total_cents, paid_amount_cents, payment_status")
        .eq("id", orderId)
        .single();
      if (oerr) throw oerr;
      setOrder(o as unknown as OrderLite);

      const { data: its, error: ierr } = await supabase
        .from("order_items")
        .select("id, quantity, total_price_cents, status, product:products(name)")
        .eq("order_id", orderId)
        .neq("status", "cancelled")
        .order("created_at", { ascending: true });
      if (ierr) throw ierr;
      setItems((its ?? []) as unknown as ItemLite[]);
    } catch (e: unknown) {
      const error = e as Error;
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [orderId, toast]);

  useEffect(() => {
    if (open) {
      setPartsPaid(0);
      setParts(2);
      setEqualPreview(null);
      setSelectedQty({});
      setItemsPreview(null);
      setMethod("money");
      refresh();
    }
  }, [open, refresh]);

  const remaining = order
    ? Math.max(order.total_cents - order.paid_amount_cents, 0)
    : 0;
  const isPaid = (order?.payment_status === "paid") || remaining === 0;

  // ---- Equal split ----
  const computeEqual = async () => {
    if (parts < 2) {
      toast({
        title: "Inválido",
        description: "Mínimo de 2 partes.",
        variant: "destructive",
      });
      return;
    }
    try {
      const r = await splitOrderEqual(orderId, parts);
      setEqualPreview(r);
      setPartsPaid(0);
    } catch (e: unknown) {
      const error = e as Error;
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
  };

  const payOnePart = async () => {
    if (!equalPreview || !order) return;
    const remainingParts = equalPreview.parts - partsPaid;
    if (remainingParts <= 0) return;

    // Last part includes remainder cents
    const isLast = remainingParts === 1;
    const amount =
      equalPreview.amount_per_part_cents +
      (isLast ? equalPreview.remainder_cents : 0);

    setSubmitting(true);
    try {
      const result = await registerOrderPayment(orderId, method, amount, 0);
      setPartsPaid((p) => p + 1);
      onPaymentRegistered();

      if (result.payment_status === "paid") {
        toast({
          title: "Pedido quitado",
          description: "Todas as partes foram pagas.",
        });
        onOpenChange(false);
      } else {
        toast({
          title: "Parte registrada",
          description: `Restam ${formatCurrency(result.remaining_cents / 100)}`,
        });
        await refresh();
      }
    } catch (e: any) {
      toast({
        title: "Erro",
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  // ---- Items split ----
  const toggleItem = (itemId: string, maxQty: number, checked: boolean) => {
    setItemsPreview(null);
    setSelectedQty((prev) => {
      const next = { ...prev };
      if (checked) next[itemId] = maxQty;
      else delete next[itemId];
      return next;
    });
  };

  const setItemQty = (itemId: string, qty: number, max: number) => {
    setItemsPreview(null);
    const clamped = Math.max(1, Math.min(max, qty));
    setSelectedQty((prev) => ({ ...prev, [itemId]: clamped }));
  };

  const computeItems = async () => {
    const list = Object.entries(selectedQty)
      .filter(([, q]) => q > 0)
      .map(([order_item_id, quantity]) => ({ order_item_id, quantity }));
    if (list.length === 0) {
      toast({
        title: "Selecione itens",
        description: "Marque ao menos um item.",
        variant: "destructive",
      });
      return;
    }
    try {
      const r = await splitOrderByItems(orderId, list);
      setItemsPreview(r);
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  const payItemsSelected = async () => {
    if (!itemsPreview) return;
    if (itemsPreview.amount_cents <= 0) {
      toast({
        title: "Sem valor",
        description: "Nada a cobrar nessa seleção.",
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    try {
      const result = await registerOrderPayment(
        orderId,
        method,
        itemsPreview.amount_cents,
        0,
      );
      onPaymentRegistered();
      if (result.payment_status === "paid") {
        toast({ title: "Pedido quitado" });
        onOpenChange(false);
      } else {
        toast({
          title: "Pagamento registrado",
          description: `Restam ${formatCurrency(result.remaining_cents / 100)}`,
        });
        setSelectedQty({});
        setItemsPreview(null);
        await refresh();
      }
    } catch (e: any) {
      toast({
        title: "Erro",
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Dividir conta</DialogTitle>
          <DialogDescription>
            O cálculo considera descontos e taxa de serviço já aplicados ao pedido.
          </DialogDescription>
        </DialogHeader>

        {loading || !order ? (
          <div className="py-8 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Resumo */}
            <div className="grid grid-cols-3 gap-2 rounded-lg border bg-muted/20 p-3 text-sm">
              <Cell label="Total" value={order.total_cents} />
              <Cell label="Pago" value={order.paid_amount_cents} className="text-emerald-600" />
              <Cell label="Restante" value={remaining} className="text-primary font-bold" />
            </div>

            {isPaid ? (
              <div className="text-center py-6 text-emerald-600 font-medium">
                Pedido já está quitado.
              </div>
            ) : (
              <>
                {/* Forma de pagamento (compartilhada entre as abas) */}
                <div className="flex items-center gap-3">
                  <Label className="text-xs text-muted-foreground">Forma:</Label>
                  <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
                    <SelectTrigger className="h-8 w-40 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="money">Dinheiro</SelectItem>
                      <SelectItem value="card">Cartão</SelectItem>
                      <SelectItem value="pix">Pix</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Tabs defaultValue="equal">
                  <TabsList className="grid grid-cols-2">
                    <TabsTrigger value="equal">
                      <Users className="w-4 h-4 mr-1" /> Por pessoas
                    </TabsTrigger>
                    <TabsTrigger value="items">
                      <ListChecks className="w-4 h-4 mr-1" /> Por itens
                    </TabsTrigger>
                  </TabsList>

                  {/* Equal */}
                  <TabsContent value="equal" className="space-y-3 pt-3">
                    <div className="flex items-end gap-2">
                      <div className="space-y-1 flex-1">
                        <Label htmlFor="parts" className="text-xs">
                          Número de pessoas
                        </Label>
                        <Input
                          id="parts"
                          type="number"
                          min={2}
                          value={parts}
                          onChange={(e) => {
                            setParts(parseInt(e.target.value) || 2);
                            setEqualPreview(null);
                            setPartsPaid(0);
                          }}
                        />
                      </div>
                      <Button variant="outline" onClick={computeEqual}>
                        Calcular
                      </Button>
                    </div>

                    {equalPreview && (
                      <div className="rounded-lg border p-3 space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Valor por pessoa</span>
                          <span className="font-medium">
                            {formatCurrency(equalPreview.amount_per_part_cents / 100)}
                          </span>
                        </div>
                        {equalPreview.remainder_cents > 0 && (
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">
                              Sobra (somada na última parte)
                            </span>
                            <span>
                              {formatCurrency(equalPreview.remainder_cents / 100)}
                            </span>
                          </div>
                        )}
                        <Separator />
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Partes pagas</span>
                          <span className="font-medium">
                            {partsPaid} / {equalPreview.parts}
                          </span>
                        </div>
                        <Button
                          className="w-full mt-2"
                          onClick={payOnePart}
                          disabled={
                            submitting || partsPaid >= equalPreview.parts
                          }
                        >
                          {submitting && (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          )}
                          {partsPaid >= equalPreview.parts
                            ? "Todas as partes pagas"
                            : `Cobrar 1 parte (${formatCurrency(
                                (equalPreview.amount_per_part_cents +
                                  (equalPreview.parts - partsPaid === 1
                                    ? equalPreview.remainder_cents
                                    : 0)) /
                                  100,
                              )})`}
                        </Button>
                      </div>
                    )}
                  </TabsContent>

                  {/* Items */}
                  <TabsContent value="items" className="space-y-3 pt-3">
                    <ScrollArea className="max-h-64 rounded-md border">
                      <div className="p-2 space-y-1">
                        {items.length === 0 && (
                          <p className="text-xs text-muted-foreground p-3 text-center">
                            Sem itens disponíveis.
                          </p>
                        )}
                        {items.map((it) => {
                          const checked = it.id in selectedQty;
                          const qty = selectedQty[it.id] ?? it.quantity;
                          const perUnit =
                            it.quantity > 0
                              ? it.total_price_cents / it.quantity
                              : 0;
                          const lineValue = perUnit * qty;
                          return (
                            <div
                              key={it.id}
                              className={cn(
                                "flex items-center gap-2 px-2 py-1.5 rounded text-sm",
                                checked && "bg-primary/5",
                              )}
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(c) =>
                                  toggleItem(it.id, it.quantity, !!c)
                                }
                              />
                              <div className="flex-1">
                                <div className="font-medium">
                                  {it.product?.name ?? "Item"}
                                </div>
                                <div className="text-[10px] text-muted-foreground">
                                  {formatCurrency(perUnit / 100)} / un · disponível {it.quantity}
                                </div>
                              </div>
                              {checked && (
                                <Input
                                  type="number"
                                  min={1}
                                  max={it.quantity}
                                  value={qty}
                                  onChange={(e) =>
                                    setItemQty(
                                      it.id,
                                      parseInt(e.target.value) || 1,
                                      it.quantity,
                                    )
                                  }
                                  className="h-7 w-16 text-xs"
                                />
                              )}
                              <span
                                className={cn(
                                  "w-20 text-right text-xs",
                                  checked ? "font-medium" : "text-muted-foreground",
                                )}
                              >
                                {formatCurrency(lineValue / 100)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </ScrollArea>

                    <div className="flex items-center gap-2">
                      <Button variant="outline" onClick={computeItems} className="flex-1">
                        Calcular seleção
                      </Button>
                    </div>

                    {itemsPreview && (
                      <div className="rounded-lg border p-3 space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Total da seleção</span>
                          <span className="font-bold">
                            {formatCurrency(itemsPreview.amount_cents / 100)}
                          </span>
                        </div>
                        <Button
                          className="w-full"
                          onClick={payItemsSelected}
                          disabled={submitting || itemsPreview.amount_cents <= 0}
                        >
                          {submitting && (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          )}
                          Cobrar selecionados
                        </Button>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Cell({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className?: string;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] text-muted-foreground uppercase">{label}</span>
      <span className={cn("text-sm", className)}>{formatCurrency(value / 100)}</span>
    </div>
  );
}
