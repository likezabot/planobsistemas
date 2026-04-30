import { useState, useEffect } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  closeCashSession,
  listCashMovements,
  type CashSession,
  type CloseCashResult,
} from "@/lib/cash/queries";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

interface CloseCashDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: CashSession;
  onClosed: () => void;
}

export function CloseCashDialog({
  open,
  onOpenChange,
  session,
  onClosed,
}: CloseCashDialogProps) {
  const { toast } = useToast();
  const [counted, setCounted] = useState("0,00");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<{
    supplies: number;
    bleeds: number;
    salesMoney: number;
    expected: number;
  } | null>(null);
  const [result, setResult] = useState<CloseCashResult | null>(null);

  useEffect(() => {
    if (!open) {
      setCounted("0,00");
      setNotes("");
      setPreview(null);
      setResult(null);
      return;
    }

    (async () => {
      try {
        const movements = await listCashMovements(session.id);
        const supplies = movements
          .filter((m) => m.movement_type === "supply")
          .reduce((s, m) => s + m.amount_cents, 0);
        const bleeds = movements
          .filter((m) => m.movement_type === "bleed")
          .reduce((s, m) => s + m.amount_cents, 0);

        const { data: payments } = await supabase
          .from("order_payments")
          .select("amount_cents, payment_method")
          .eq("cash_session_id", session.id)
          .eq("payment_method", "money");
        const salesMoney = (payments ?? []).reduce(
          (s, p) => s + (p.amount_cents ?? 0),
          0,
        );

        const expected =
          session.opening_amount_cents + supplies - bleeds + salesMoney;
        setPreview({ supplies, bleeds, salesMoney, expected });
        setCounted((expected / 100).toFixed(2).replace(".", ","));
      } catch (e: any) {
        toast({
          title: "Erro",
          description: e.message,
          variant: "destructive",
        });
      }
    })();
  }, [open, session.id, session.opening_amount_cents, toast]);

  const parseCents = (s: string): number => {
    const normalized = s.replace(/\./g, "").replace(",", ".").trim();
    const n = parseFloat(normalized);
    if (Number.isNaN(n) || n < 0) return -1;
    return Math.round(n * 100);
  };

  const handleSubmit = async () => {
    const cents = parseCents(counted);
    if (cents < 0) {
      toast({
        title: "Valor inválido",
        description: "Informe um valor válido.",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    try {
      const r = await closeCashSession(session.id, cents, notes || undefined);
      setResult(r);
      toast({
        title: "Caixa fechado",
        description: "Sessão encerrada com sucesso.",
      });
      onClosed();
    } catch (e: any) {
      toast({
        title: "Erro ao fechar caixa",
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Fechar caixa</DialogTitle>
          <DialogDescription>
            Confira o resumo e informe o valor contado em dinheiro.
          </DialogDescription>
        </DialogHeader>

        {!result && preview && (
          <div className="space-y-3 py-2 text-sm">
            <Row label="Troco inicial" value={session.opening_amount_cents} />
            <Row label="Suprimentos" value={preview.supplies} />
            <Row label="Sangrias" value={-preview.bleeds} />
            <Row label="Vendas em dinheiro" value={preview.salesMoney} />
            <Separator />
            <Row label="Esperado em caixa" value={preview.expected} bold />

            <div className="space-y-1 pt-2">
              <Label htmlFor="counted">Valor contado (R$)</Label>
              <Input
                id="counted"
                inputMode="decimal"
                value={counted}
                onChange={(e) => setCounted(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="close-notes">Observações (opcional)</Label>
              <Textarea
                id="close-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>
        )}

        {result && (
          <div className="space-y-3 py-2 text-sm">
            <Row label="Troco inicial" value={result.opening_amount_cents} />
            <Row label="Suprimentos" value={result.supplies_cents} />
            <Row label="Sangrias" value={-result.bleeds_cents} />
            <Row label="Vendas em dinheiro" value={result.sales_money_cents} />
            <Separator />
            <Row label="Esperado" value={result.expected_amount_cents} />
            <Row label="Contado" value={result.counted_amount_cents} />
            <Row
              label="Diferença"
              value={result.difference_cents}
              bold
              className={cn(
                result.difference_cents === 0 && "text-emerald-600",
                result.difference_cents < 0 && "text-destructive",
                result.difference_cents > 0 && "text-amber-600",
              )}
            />
          </div>
        )}

        <DialogFooter>
          {!result ? (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
                Cancelar
              </Button>
              <Button onClick={handleSubmit} disabled={loading || !preview}>
                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Confirmar fechamento
              </Button>
            </>
          ) : (
            <Button onClick={() => onOpenChange(false)}>Concluir</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({
  label,
  value,
  bold,
  className,
}: {
  label: string;
  value: number;
  bold?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex justify-between items-center",
        bold && "font-bold text-base",
        className,
      )}
    >
      <span className="text-muted-foreground">{label}</span>
      <span>{formatCurrency(value / 100)}</span>
    </div>
  );
}
