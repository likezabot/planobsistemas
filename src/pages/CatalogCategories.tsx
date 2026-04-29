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
import { Plus, Power, Tag, Package, Loader2, Search } from "lucide-react";
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
      <div className="flex flex-col gap-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Categorias</h1>
            <p className="text-gray-400 text-sm mt-1">Organize seus produtos no cardápio.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" className="rounded-lg border-gray-700 h-10">
              <Link to="/catalogo">
                <Package className="w-4 h-4 mr-2" />
                Produtos
              </Link>
            </Button>
            {canEdit && (
              <Button className="rounded-lg h-10 shadow-sm" onClick={() => setOpen(true)}>
                <Plus className="w-4 h-4 mr-2" /> 
                Nova Categoria
              </Button>
            )}
          </div>
        </div>

        <div className="relative max-w-md bg-gray-800 p-1 rounded-lg">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input 
            placeholder="Buscar categoria..." 
            className="w-full h-10 pl-10 pr-4 rounded-lg border border-gray-700 bg-[#F8FAFC] text-sm focus:outline-none focus:ring-2 focus:ring-primary transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {loading ? (
            [1, 2, 3].map(i => <div key={i} className="h-24 bg-muted rounded-xl animate-pulse" />)
          ) : filteredCategories.length === 0 ? (
            <div className="col-span-full text-center py-20 bg-gray-800 rounded-xl border border-dashed border-gray-700">
              <Tag className="w-12 h-12 mx-auto mb-4 opacity-10 text-white" />
              <p className="text-gray-400 text-sm font-medium">Nenhuma categoria encontrada.</p>
            </div>
          ) : (
            filteredCategories.map((c) => (
              <div key={c.id} className="bg-gray-800 rounded-xl border border-gray-700 p-4 shadow-sm flex items-center justify-between group hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center text-white shrink-0">
                    <Tag className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-white text-sm truncate">{c.name}</h3>
                    <Badge variant={c.active ? "secondary" : "outline"} className={cn(
                      "rounded-md px-1.5 py-0 uppercase text-[8px] font-bold tracking-widest border-none mt-0.5",
                      c.active ? "bg-success text-white" : "bg-muted text-gray-400"
                    )}>
                      {c.active ? "Ativa" : "Inativa"}
                    </Badge>
                  </div>
                </div>
                {canEdit && (
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    className={cn(
                      "h-8 w-8 rounded-lg transition-colors",
                      c.active ? "text-success hover:text-destructive" : "text-gray-400 hover:text-success"
                    )}
                    onClick={() => toggle(c)}
                  >
                    <Power className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md rounded-xl p-0 overflow-hidden border-none shadow-2xl">
          <DialogHeader className="p-6 bg-secondary text-white">
            <DialogTitle className="text-xl font-bold">Nova Categoria</DialogTitle>
            <DialogDescription className="text-white/60 text-sm">Organize seus produtos.</DialogDescription>
          </DialogHeader>
          <div className="p-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="c-name" className="text-xs font-bold text-white uppercase tracking-wider">Nome da Categoria</Label>
              <Input 
                id="c-name" 
                value={name} 
                onChange={(e) => setName(e.target.value)} 
                className="h-10 rounded-lg border-gray-700 bg-gray-800"
                placeholder="Ex: Bebidas"
              />
            </div>
          </div>
          <DialogFooter className="p-6 bg-[#F8FAFC] border-t border-gray-700 gap-2">
            <Button variant="ghost" className="rounded-lg font-bold" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button 
              onClick={handleCreate} 
              disabled={saving || !name.trim()}
              className="rounded-lg h-10 px-6 font-bold shadow-sm"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : "Criar Categoria"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
