import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Wallet, ArrowDownToLine, ArrowUpToLine, Lock, Unlock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getOpenCashSession, type CashSession } from "@/lib/cash/queries";
import { formatCurrency } from "@/lib/utils";
import { OpenCashDialog } from "./OpenCashDialog";
import { CashMovementDialog } from "./CashMovementDialog";
import { CloseCashDialog } from "./CloseCashDialog";

import { useRestaurant } from "@/lib/auth/RestaurantProvider";

interface CashSessionBarProps {
  restaurantId: string;
}

export function CashSessionBar({ restaurantId }: CashSessionBarProps) {
  const { toast } = useToast();
  const { currentMembership } = useRestaurant();
  const cashRequired =
    currentMembership?.restaurants.cash_session_required ?? true;
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<CashSession | null>(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [closeDialog, setCloseDialog] = useState(false);
  const [movementType, setMovementType] = useState<"bleed" | "supply" | null>(null);

  const refresh = useCallback(async () => {
    try {
      const s = await getOpenCashSession(restaurantId);
      setSession(s);
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [restaurantId, toast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-muted/30 border rounded-lg text-xs text-muted-foreground">
        <Loader2 className="w-3 h-3 animate-spin" /> Verificando caixa...
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3 px-4 py-2 bg-muted/30 border rounded-lg">
        <div className="flex items-center gap-3 text-sm">
          <Wallet className="w-4 h-4 text-primary" />
          {session ? (
            <>
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                <Unlock className="w-3 h-3 mr-1" /> Caixa aberto
              </Badge>
              <span className="text-muted-foreground">
                Aberto em <strong>{new Date(session.opened_at).toLocaleTimeString()}</strong>
              </span>
              <span className="text-muted-foreground">
                Troco: <strong>{formatCurrency(session.opening_amount_cents / 100)}</strong>
              </span>
            </>
          ) : cashRequired ? (
            <>
              <Badge variant="outline" className="bg-muted text-muted-foreground">
                <Lock className="w-3 h-3 mr-1" /> Caixa fechado
              </Badge>
              <span className="text-xs text-muted-foreground">
                Vendas em dinheiro não serão vinculadas a uma sessão até abrir o caixa.
              </span>
            </>
          ) : (
            <>
              <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-200">
                Operando sem caixa
              </Badge>
              <span className="text-xs text-muted-foreground">
                Abertura de caixa é opcional neste restaurante.
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {session ? (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setMovementType("supply")}
              >
                <ArrowDownToLine className="w-4 h-4 mr-1" /> Suprimento
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setMovementType("bleed")}
              >
                <ArrowUpToLine className="w-4 h-4 mr-1" /> Sangria
              </Button>
              <Button size="sm" variant="destructive" onClick={() => setCloseDialog(true)}>
                <Lock className="w-4 h-4 mr-1" /> Fechar caixa
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={() => setOpenDialog(true)}>
              <Unlock className="w-4 h-4 mr-1" /> Abrir caixa
            </Button>
          )}
        </div>
      </div>

      <OpenCashDialog
        open={openDialog}
        onOpenChange={setOpenDialog}
        restaurantId={restaurantId}
        onOpened={refresh}
      />

      {session && (
        <>
          <CashMovementDialog
            open={movementType !== null}
            onOpenChange={(o) => !o && setMovementType(null)}
            cashSessionId={session.id}
            movementType={movementType ?? "bleed"}
            onRegistered={refresh}
          />
          <CloseCashDialog
            open={closeDialog}
            onOpenChange={setCloseDialog}
            session={session}
            onClosed={refresh}
          />
        </>
      )}
    </>
  );
}
