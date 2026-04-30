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
import { useToast } from "@/hooks/use-toast";
import { registerCashMovement } from "@/lib/cash/queries";
import { Loader2 } from "lucide-react";

interface CashMovementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cashSessionId: string;
  movementType: "bleed" | "supply";
  onRegistered: () => void;
}

export function CashMovementDialog({
  open,
  onOpenChange,
  cashSessionId,
  movementType,
  onRegistered,
}: CashMovementDialogProps) {
  const { toast } = useToast();
  const [amount, setAmount] = useState("0,00");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setAmount("0,00");
      setReason("");
    }
  }, [open]);

  const isBleed = movementType === "bleed";
  const title = isBleed ? "Sangria" : "Suprimento";
  const description = isBleed
    ? "Retirada de dinheiro do caixa."
    : "Entrada de dinheiro no caixa (reforço de troco)";

  const parseCents = (s: string): number => {
    const normalized = s.replace(/\./g, "").replace(",", ".").trim();
    const n = parseFloat(normalized);
    if (Number.isNaN(n) || n <= 0) return -1;
    return Math.round(n * 100);
  };

  const handleSubmit = async () => {
    const cents = parseCents(amount);
    if (cents < 0) {
      toast({
        title: "Valor inválido",
        description: "Informe um valor maior que zero.",
        variant: "destructive",
      });
      return;
    }
    if (reason.trim().length < 3) {
      toast({
        title: "Motivo obrigatório",
        description: "Descreva o motivo (mínimo 3 caracteres).",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    try {
      await registerCashMovement(cashSessionId, movementType, cents, reason.trim());
      toast({ title: `${title} registrada`, description: "Movimento salvo no caixa." });
      onRegistered();
      onOpenChange(false);
    } catch (e: unknown) {
      const error = e as Error;
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label htmlFor="mov-amount">Valor (R$)</Label>
            <Input
              id="mov-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0,00"
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="mov-reason">Motivo</Label>
            <Textarea
              id="mov-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder={isBleed ? "Ex: Pagamento fornecedor" : "Ex: Reforço de troco"}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={loading} variant={isBleed ? "destructive" : "default"}>
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Confirmar {title.toLowerCase()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
