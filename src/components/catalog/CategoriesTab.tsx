import { useState, useEffect, useCallback } from "react";
import { useRestaurant } from "@/lib/auth/RestaurantProvider";
import { useToast } from "@/hooks/use-toast";
import { 
  listCategories, 
  createCategory, 
  setCategoryActive, 
  type Category 
} from "@/lib/catalog/queries";
import { isAdminRole } from "@/lib/catalog/money";
import { 
  Plus, 
  Power, 
  Tag, 
  Search, 
  Loader2,
  MoreVertical,
  ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

export default function CategoriesTab() {
  const { currentRestaurantId, currentMembership } = useRestaurant();
  const { toast } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const canEdit = isAdminRole(currentMembership?.role);

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
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-3 bg-white p-3 rounded-xl border border-border shadow-sm items-end md:items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Buscar categoria..." 
            className="pl-9 h-9 text-xs"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        {canEdit && (
          <Button size="sm" className="h-9 px-4 font-bold" onClick={() => setOpen(true)}>
            <Plus className="w-4 h-4 mr-1.5" />
            Nova
          </Button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-border overflow-hidden shadow-sm">
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground py-3">Nome</TableHead>
              <TableHead className="w-[100px] text-[10px] font-bold uppercase tracking-wider text-muted-foreground py-3 text-center">Status</TableHead>
              <TableHead className="w-[100px] text-[10px] font-bold uppercase tracking-wider text-muted-foreground py-3 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={3} className="h-12 animate-pulse bg-muted/20" />
                </TableRow>
              ))
            ) : filteredCategories.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="h-32 text-center text-muted-foreground text-sm">
                  Nenhuma categoria encontrada.
                </TableCell>
              </TableRow>
            ) : (
              filteredCategories.map(c => (
                <TableRow key={c.id} className="group hover:bg-muted/20">
                  <TableCell className="py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                        <Tag className="w-3.5 h-3.5" />
                      </div>
                      <span className="font-bold text-secondary text-sm">{c.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="py-2 text-center">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className={cn(
                        "h-7 w-7 rounded-full",
                        c.active ? "text-success hover:bg-success/10" : "text-muted-foreground hover:bg-muted"
                      )}
                      onClick={() => toggle(c)}
                      disabled={!canEdit}
                    >
                      <Power className="w-3.5 h-3.5" />
                    </Button>
                  </TableCell>
                  <TableCell className="py-2 text-right">
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" disabled={!canEdit}>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md rounded-xl p-0 overflow-hidden border-none shadow-2xl">
          <DialogHeader className="p-6 bg-secondary text-white">
            <DialogTitle className="text-xl font-bold">Nova Categoria</DialogTitle>
            <DialogDescription className="text-white/60 text-sm">Organize seus produtos.</DialogDescription>
          </DialogHeader>
          <div className="p-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="c-name" className="text-xs font-bold text-secondary uppercase tracking-wider">Nome da Categoria</Label>
              <Input 
                id="c-name" 
                value={name} 
                onChange={(e) => setName(e.target.value)} 
                className="h-10 rounded-lg border-border bg-white"
                placeholder="Ex: Bebidas"
              />
            </div>
          </div>
          <DialogFooter className="p-6 bg-[#F8FAFC] border-t border-border gap-2">
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
    </div>
  );
}
