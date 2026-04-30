import { useState, useEffect } from "react";
import { Settings2, Loader2, Wallet } from "lucide-react";
import { useRestaurant } from "@/lib/auth/RestaurantProvider";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function RestaurantSettings() {
  const { currentMembership, currentRestaurantId, refresh } = useRestaurant();
  const { toast } = useToast();
  const [cashRequired, setCashRequired] = useState(true);
  const [saving, setSaving] = useState(false);

  const isAdmin =
    currentMembership?.role === "owner" || currentMembership?.role === "manager";

  useEffect(() => {
    if (currentMembership) {
      setCashRequired(currentMembership.restaurants.cash_session_required ?? true);
    }
  }, [currentMembership]);

  const handleToggleCashRequired = async (checked: boolean) => {
    if (!currentRestaurantId || !isAdmin) return;
    setSaving(true);
    const previous = cashRequired;
    setCashRequired(checked);
    try {
      const { error } = await supabase
        .from("restaurants")
        .update({ cash_session_required: checked })
        .eq("id", currentRestaurantId);
      if (error) throw error;
      await refresh();
      toast({
        title: "Configuração salva",
        description: checked
          ? "A abertura de caixa será exigida no PDV."
          : "Operadores podem usar o PDV sem abrir caixa.",
      });
    } catch (e: any) {
      setCashRequired(previous);
      toast({
        title: "Erro ao salvar",
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (!currentMembership) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <p className="text-sm text-muted-foreground">
          Apenas owner ou manager podem alterar as configurações do restaurante.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <header className="flex items-center gap-3">
        <Settings2 className="w-6 h-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Configurações do restaurante</h1>
          <p className="text-sm text-muted-foreground">
            {currentMembership.restaurants.name}
          </p>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="w-4 h-4" /> Operação de caixa
          </CardTitle>
          <CardDescription>
            Controla se o PDV exige abertura de sessão de caixa antes de operar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-start justify-between gap-6 py-2">
            <div className="space-y-1">
              <Label htmlFor="cash-required" className="text-sm font-medium">
                Exigir abertura de caixa no PDV
              </Label>
              <p className="text-xs text-muted-foreground max-w-md">
                Quando desligado, operadores podem usar o PDV sem abrir caixa.
                Vendas em dinheiro feitas sem sessão não entrarão no relatório
                de fechamento.
              </p>
            </div>
            <div className="flex items-center gap-2 pt-1">
              {saving && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
              <Switch
                id="cash-required"
                checked={cashRequired}
                onCheckedChange={handleToggleCashRequired}
                disabled={saving}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
