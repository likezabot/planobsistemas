import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useRestaurant } from "@/lib/auth/RestaurantProvider";
import { supabase } from "@/integrations/supabase/client";
import { setProductActive } from "@/lib/catalog/queries";
import { createPizzaFlavor } from "@/lib/catalog/pizzaQueries";
import { isAdminRole } from "@/lib/catalog/money";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2, AlertTriangle, Pizza, Trash2, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface SuspectProduct {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  active: boolean;
  type: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  product: SuspectProduct | null;
  onChanged: () => void;
  onForceEdit: () => void; // libera abertura do sheet genérico
}

type Mode = "menu" | "migrate" | "delete";

/**
 * Diálogo dedicado para itens suspeitos de serem sabores cadastrados como produto.
 * Substitui o sheet genérico para esses casos.
 *
 * Ações:
 *  - Migrar para sabor de pizza (cria pizza_flavors; opcionalmente inativa o produto original)
 *  - Excluir produto (bloqueado se houver order_items)
 *  - Editar mesmo assim (delega para o sheet padrão)
 */
export default function SuspectFlavorDialog({ open, onOpenChange, product, onChanged, onForceEdit }: Props) {
  const { toast } = useToast();
  const { currentRestaurantId, currentMembership } = useRestaurant();
  const navigate = useNavigate();
  const canEdit = isAdminRole(currentMembership?.role);
  const [mode, setMode] = useState<Mode>("menu");
  const [working, setWorking] = useState(false);
  const [inactivateOriginal, setInactivateOriginal] = useState(true);

  function reset() {
    setMode("menu");
    setWorking(false);
    setInactivateOriginal(true);
  }

  function handleClose() {
    if (working) return;
    reset();
    onOpenChange(false);
  }

  async function handleMigrate() {
    if (!product || !currentRestaurantId || !currentMembership) return;
    setWorking(true);
    try {
      const res = await createPizzaFlavor({
        restaurant_id: currentRestaurantId,
        tenant_id: currentMembership.tenant_id,
        name: product.name,
        description: product.description,
        image_url: product.image_url,
        category: "Tradicional",
        active: true,
      });
      if (res.error) throw res.error;

      if (inactivateOriginal && product.active) {
        const off = await setProductActive(product.id, false);
        if (off.error) {
          toast({
            title: "Sabor criado, mas não inativou produto",
            description: off.error.message,
            variant: "destructive",
          });
          onChanged();
          handleClose();
          return;
        }
      }

      toast({
        title: "Migrado para sabor de pizza",
        description: inactivateOriginal
          ? `"${product.name}" agora está em Pizzas › Sabores. Produto original foi inativado.`
          : `"${product.name}" agora está em Pizzas › Sabores. Produto original mantido ativo.`,
      });
      onChanged();
      handleClose();
    } catch (e) {
      toast({ title: "Falha ao migrar", description: (e as Error).message, variant: "destructive" });
    } finally {
      setWorking(false);
    }
  }

  async function handleDelete() {
    if (!product) return;
    setWorking(true);
    try {
      // Bloqueia se existir order_items vinculados
      const { count, error } = await supabase
        .from("order_items")
        .select("id", { count: "exact", head: true })
        .eq("product_id", product.id);
      if (error) throw error;
      if ((count ?? 0) > 0) {
        toast({
          title: "Não é possível excluir",
          description: `Este produto já foi usado em ${count} pedido(s). Inative-o em vez de excluir.`,
          variant: "destructive",
        });
        // oferece inativar
        if (product.active) {
          const off = await setProductActive(product.id, false);
          if (!off.error) {
            toast({ title: "Produto inativado" });
            onChanged();
          }
        }
        handleClose();
        return;
      }

      const del = await supabase.from("products").delete().eq("id", product.id);
      if (del.error) throw del.error;
      toast({ title: "Produto excluído" });
      onChanged();
      handleClose();
    } catch (e) {
      toast({ title: "Falha ao excluir", description: (e as Error).message, variant: "destructive" });
    } finally {
      setWorking(false);
    }
  }

  if (!product) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : handleClose())}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Item possivelmente no lugar errado
          </DialogTitle>
          <DialogDescription className="pt-2">
            <strong>{product.name}</strong> parece ser um sabor de pizza cadastrado como produto.
            Sabores devem ser gerenciados em <strong>Pizzas › Sabores Globais</strong>.
          </DialogDescription>
        </DialogHeader>

        {mode === "menu" && (
          <div className="space-y-2 py-2">
            <Button
              className="w-full justify-start"
              onClick={() => setMode("migrate")}
              disabled={!canEdit}
            >
              <Pizza className="w-4 h-4 mr-2" />
              Migrar para sabor de pizza
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => navigate("/catalogo?tab=pizzas")}
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Ir para Pizzas › Sabores
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start text-destructive hover:text-destructive"
              onClick={() => setMode("delete")}
              disabled={!canEdit}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Excluir produto
            </Button>
            {canEdit && (
              <Button
                variant="ghost"
                className="w-full justify-start text-muted-foreground text-xs"
                onClick={() => {
                  reset();
                  onOpenChange(false);
                  onForceEdit();
                }}
              >
                Editar mesmo assim (avançado)
              </Button>
            )}
            {!canEdit && (
              <p className="text-xs text-muted-foreground text-center pt-2">
                Apenas owner/manager podem migrar ou excluir.
              </p>
            )}
          </div>
        )}

        {mode === "migrate" && (
          <div className="space-y-4 py-2">
            <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
              <div><span className="text-muted-foreground">Nome:</span> <strong>{product.name}</strong></div>
              {product.description && (
                <div className="text-xs text-muted-foreground">{product.description}</div>
              )}
              <div className="text-xs text-muted-foreground">Categoria padrão: Tradicional</div>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label className="text-sm font-bold">Inativar produto original</Label>
                <p className="text-xs text-muted-foreground">Recomendado para evitar duplicação no cardápio.</p>
              </div>
              <Switch checked={inactivateOriginal} onCheckedChange={setInactivateOriginal} />
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button variant="ghost" onClick={() => setMode("menu")} disabled={working}>
                Voltar
              </Button>
              <Button onClick={handleMigrate} disabled={working}>
                {working && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Confirmar migração
              </Button>
            </DialogFooter>
          </div>
        )}

        {mode === "delete" && (
          <div className="space-y-3 py-2">
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              Esta ação remove permanentemente o produto <strong>{product.name}</strong>.
              Se houver pedidos vinculados, a exclusão será bloqueada e o produto será inativado.
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button variant="ghost" onClick={() => setMode("menu")} disabled={working}>
                Voltar
              </Button>
              <Button variant="destructive" onClick={handleDelete} disabled={working}>
                {working && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Excluir definitivamente
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
