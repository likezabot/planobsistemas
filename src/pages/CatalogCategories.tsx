import { useEffect, useState, useCallback } from "react";
import { AppShell } from "@/components/AppShell";
import { useRestaurant } from "@/lib/auth/RestaurantProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  listCategories, createCategory, setCategoryActive, type Category,
} from "@/lib/catalog/queries";
import { isAdminRole } from "@/lib/catalog/money";
import { Plus, Power } from "lucide-react";
import { Link } from "react-router-dom";

export default function CatalogCategories() {
  const { currentRestaurantId, currentMembership } = useRestaurant();
  const { toast } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const canEdit = isAdminRole(currentMembership?.role);

  useEffect(() => { document.title = "Categorias — Catálogo"; }, []);

  const refresh = useCallback(async () => {
    if (!currentRestaurantId) return;
    setLoading(true);
    const { data, error } = await listCategories(currentRestaurantId);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    setCategories(data ?? []);
    setLoading(false);
  }, [currentRestaurantId, toast]);

  useEffect(() => { refresh(); }, [refresh]);

  async function handleCreate() {
    if (!currentRestaurantId || !currentMembership) return;
    if (!name.trim()) return;
    setSaving(true);
    const { error } = await createCategory({
      tenant_id: currentMembership.tenant_id,
      restaurant_id: currentRestaurantId,
      name: name.trim(),
    });
    setSaving(false);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Categoria criada" });
    setName(""); setOpen(false); refresh();
  }

  async function toggle(c: Category) {
    if (!canEdit) return;
    const { error } = await setCategoryActive(c.id, !c.active);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else refresh();
  }

  return (
    <AppShell>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-mono-tag">catálogo</p>
          <h1 className="text-2xl font-semibold tracking-tight">Categorias</h1>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm"><Link to="/catalogo">Produtos</Link></Button>
          {canEdit && (
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Nova
            </Button>
          )}
        </div>
      </div>

      <div className="surface-panel overflow-hidden">
        {loading ? (
          <p className="p-4 text-sm text-muted-foreground">Carregando...</p>
        ) : categories.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Nenhuma categoria.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-mono-tag">
              <tr className="border-b border-border">
                <th className="px-4 py-2 text-left font-normal">Nome</th>
                <th className="px-4 py-2 text-left font-normal">Status</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 font-medium">{c.name}</td>
                  <td className="px-4 py-2">
                    <span className="text-mono-tag">{c.active ? "ativa" : "inativa"}</span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    {canEdit && (
                      <Button size="sm" variant="ghost" onClick={() => toggle(c)}>
                        <Power className="h-4 w-4" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova categoria</DialogTitle></DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="c-name">Nome</Label>
            <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={saving}>{saving ? "Salvando..." : "Criar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
