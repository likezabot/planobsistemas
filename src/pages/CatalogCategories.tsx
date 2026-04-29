import { useEffect, useState, useCallback } from "react";
import { AppShell } from "@/components/AppShell";
import { useRestaurant } from "@/lib/auth/RestaurantProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  listCategories, createCategory, setCategoryActive, type Category,
} from "@/lib/catalog/queries";
import { isAdminRole } from "@/lib/catalog/money";
import { Plus, Power, Tag, Package, Loader2, Edit2, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export default function CatalogCategories() {
  const { currentRestaurantId, currentMembership } = useRestaurant();
  const { toast } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

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

  const filteredCategories = categories.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <AppShell>
      <div className="flex flex-col gap-8">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-secondary">Categorias</h1>
            <p className="text-muted-foreground font-medium mt-1">Organize seus produtos em grupos para facilitar a navegação.</p>
          </div>
          <div className="flex items-center gap-3">
            <Button asChild variant="outline" className="rounded-xl border-border h-12">
              <Link to="/catalogo/products">
                <Package className="w-4 h-4 mr-2" />
                Produtos
              </Link>
            </Button>
            {canEdit && (
              <Button className="rounded-xl h-12 shadow-button" onClick={() => setOpen(true)}>
                <Plus className="w-4 h-4 mr-2" /> 
                Nova Categoria
              </Button>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Buscar categoria..." 
            className="h-12 pl-11 rounded-2xl border-border bg-card shadow-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Categories List */}
        <div className="bg-card rounded-[2.5rem] border border-border shadow-card overflow-hidden">
          {loading ? (
            <div className="p-12 space-y-4">
              {[1, 2, 3].map(i => <div key={i} className="h-16 bg-muted rounded-2xl animate-pulse" />)}
            </div>
          ) : filteredCategories.length === 0 ? (
            <div className="text-center py-32">
              <Tag className="w-16 h-16 mx-auto mb-4 opacity-10 text-secondary" />
              <p className="text-muted-foreground font-medium">Nenhuma categoria encontrada.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-muted/30 border-b border-border">
                    <th className="px-8 py-5 text-left text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Nome da Categoria</th>
                    <th className="px-6 py-5 text-center text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Status</th>
                    <th className="px-8 py-5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredCategories.map((c) => (
                    <tr key={c.id} className="hover:bg-muted/20 transition-colors group">
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                            <Tag className="w-5 h-5" />
                          </div>
                          <span className="font-bold text-secondary text-lg">{c.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-5 text-center">
                        <Badge variant={c.active ? "secondary" : "outline"} className={cn(
                          "rounded-full px-2 py-0.5 uppercase text-[9px] font-bold tracking-widest",
                          c.active ? "bg-success/10 text-success border-success/20" : "bg-muted text-muted-foreground opacity-50"
                        )}>
                          {c.active ? "Ativa" : "Inativa"}
                        </Badge>
                      </td>
                      <td className="px-8 py-5 text-right">
                        {canEdit && (
                          <div className="flex justify-end gap-2">
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className={cn(
                                "rounded-xl hover:bg-white hover:shadow-sm",
                                c.active ? "text-success hover:text-destructive" : "text-muted-foreground hover:text-success"
                              )}
                              onClick={() => toggle(c)}
                            >
                              <Power className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-[2.5rem] p-0 overflow-hidden border-none shadow-premium">
          <DialogHeader className="p-8 bg-secondary text-white">
            <DialogTitle className="text-2xl font-display font-bold">Nova Categoria</DialogTitle>
            <DialogDescription className="text-white/60">
              Crie uma nova categoria para organizar seus produtos no cardápio.
            </DialogDescription>
          </DialogHeader>
          <div className="p-8 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="c-name" className="font-bold text-secondary ml-1">Nome da Categoria</Label>
              <Input 
                id="c-name" 
                value={name} 
                onChange={(e) => setName(e.target.value)} 
                className="h-14 rounded-2xl border-border bg-card shadow-sm text-lg"
                placeholder="Ex: Bebidas Geladas"
              />
            </div>
          </div>
          <DialogFooter className="p-8 bg-muted/50 border-t border-border gap-2">
            <Button variant="ghost" className="rounded-xl font-bold" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button 
              onClick={handleCreate} 
              disabled={saving}
              className="rounded-xl h-12 px-8 font-bold shadow-premium"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Criar Categoria
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}