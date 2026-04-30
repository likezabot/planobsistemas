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
import { openCashSession } from "@/lib/cash/queries";
import { Loader2 } from "lucide-react";

interface OpenCashDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  restaurantId: string;
  onOpened: () => void;
}

export function OpenCashDialog({
  open,
  onOpenChange,
  restaurantId,
  onOpened,
}: OpenCashDialogProps) {
  const { toast } = useToast();
  const [amount, setAmount] = useState("0,00");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setAmount("0,00");
      setNotes("");
    }
  }, [open]);

  const parseCents = (s: string): number => {
    const normalized = s.replace(/\./g, "").replace(",", ".").trim();
    const n = parseFloat(normalized);
    if (Number.isNaN(n) || n < 0) return -1;
    return Math.round(n * 100);
  };

  const handleSubmit = async () => {
    const cents = parseCents(amount);
    if (cents < 0) {
      toast({
        title: "Valor inválido",
        description: "Informe um valor maior ou igual a zero.",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    try {
      await openCashSession(restaurantId, cents, notes || undefined);
      toast({ title: "Caixa aberto", description: "Sessão iniciada com sucesso." });
      onOpened();
      onOpenChange(false);
    } catch (e: unknown) {
      const error = e as Error;
      toast({
        title: "Erro ao abrir caixa",
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
          <DialogTitle>Abrir caixa</DialogTitle>
          <DialogDescription>
            Informe o valor de troco inicial em dinheiro.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label htmlFor="opening">Troco inicial (R$)</Label>
            <Input
              id="opening"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0,00"
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="notes">Observações (opcional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Abrir caixa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
