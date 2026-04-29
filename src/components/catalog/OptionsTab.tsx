import { useState, useEffect, useCallback } from "react";
import { useRestaurant } from "@/lib/auth/RestaurantProvider";
import { useToast } from "@/hooks/use-toast";
import { 
  listOptionGroups, 
  createOptionGroup, 
  updateOptionGroup, 
  deleteOptionGroup,
  listOptionItems,
  createOptionItem,
  updateOptionItem,
  deleteOptionItem,
  type OptionGroup,
  type OptionItem
} from "@/lib/catalog/optionsQueries";
import { centsToBRL, parseBRLToCents, isAdminRole } from "@/lib/catalog/money";
import { 
  Plus, 
  Power, 
  Trash2, 
  Edit2, 
  PlusCircle, 
  Search, 
  Loader2,
  ChevronRight,
  Settings2,
  ListFilter
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export default function OptionsTab() {
  const { currentRestaurantId, currentMembership } = useRestaurant();
  const { toast } = useToast();
  const [groups, setGroups] = useState<OptionGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [items, setItems] = useState<OptionItem[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);
  
  // Group Dialog
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<OptionGroup | null>(null);
  
  // Item Dialog
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<OptionItem | null>(null);

  const canEdit = isAdminRole(currentMembership?.role);

  const loadGroups = useCallback(async () => {
    if (!currentRestaurantId) return;
    setLoadingGroups(true);
    const { data, error } = await listOptionGroups(currentRestaurantId);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    setGroups(data ?? []);
    setLoadingGroups(false);
  }, [currentRestaurantId, toast]);

  const loadItems = useCallback(async (groupId: string) => {
    setLoadingItems(true);
    const { data, error } = await listOptionItems(groupId);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    setItems(data ?? []);
    setLoadingItems(false);
  }, [toast]);

  useEffect(() => { loadGroups(); }, [loadGroups]);
  useEffect(() => {
    if (selectedGroupId) loadItems(selectedGroupId);
    else setItems([]);
  }, [selectedGroupId, loadItems]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Coluna Grupos */}
      <div className="lg:col-span-1 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Settings2 className="w-4 h-4" /> Grupos de Adicionais
          </h3>
          {canEdit && (
            <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full bg-primary/10 text-primary hover:bg-primary hover:text-white" onClick={() => { setEditingGroup(null); setGroupDialogOpen(true); }}>
              <Plus className="w-4 h-4" />
            </Button>
          )}
        </div>
        
        <div className="bg-white rounded-xl border border-border overflow-hidden shadow-sm">
          {loadingGroups ? (
            <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto opacity-20" /></div>
          ) : groups.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground">Nenhum grupo cadastrado.</div>
          ) : (
            <div className="divide-y">
              {groups.map(g => (
                <div 
                  key={g.id} 
                  className={cn(
                    "p-3 cursor-pointer transition-colors group relative",
                    selectedGroupId === g.id ? "bg-primary/5 border-l-4 border-l-primary" : "hover:bg-muted/30"
                  )}
                  onClick={() => setSelectedGroupId(g.id)}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-bold text-secondary text-sm">{g.name}</span>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {canEdit && (
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); setEditingGroup(g); setGroupDialogOpen(true); }}>
                          <Edit2 className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={g.active ? "secondary" : "outline"} className="text-[9px] px-1 py-0 h-4">
                      {g.active ? "Ativo" : "Inativo"}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">Min {g.min_options} / Max {g.max_options}</span>
                    {g.is_required && <Badge variant="destructive" className="text-[9px] px-1 py-0 h-4">Obrigatório</Badge>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Coluna Itens */}
      <div className="lg:col-span-2 space-y-4">
        {!selectedGroupId ? (
          <div className="h-full flex flex-col items-center justify-center py-20 bg-muted/10 rounded-xl border border-dashed border-border text-muted-foreground">
            <PlusCircle className="w-12 h-12 mb-4 opacity-10" />
            <p className="text-sm">Selecione um grupo para gerenciar os itens e adicionais.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <ListFilter className="w-4 h-4" /> Itens de {groups.find(g => g.id === selectedGroupId)?.name}
              </h3>
              {canEdit && (
                <Button size="sm" className="h-8 font-bold" onClick={() => { setEditingItem(null); setItemDialogOpen(true); }}>
                  <Plus className="w-4 h-4 mr-2" /> Novo Item
                </Button>
              )}
            </div>

            <div className="bg-white rounded-xl border border-border overflow-hidden shadow-sm">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead className="w-[100px] text-[10px] font-bold uppercase tracking-wider py-3">Cód</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-wider py-3">Nome</TableHead>
                    <TableHead className="w-[120px] text-[10px] font-bold uppercase tracking-wider py-3">Preço (R$)</TableHead>
                    <TableHead className="w-[100px] text-[10px] font-bold uppercase tracking-wider py-3 text-center">Status</TableHead>
                    <TableHead className="w-[80px] text-[10px] font-bold uppercase tracking-wider py-3 text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingItems ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <TableRow key={i}><TableCell colSpan={5} className="h-12 animate-pulse bg-muted/10" /></TableRow>
                    ))
                  ) : items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-32 text-center text-muted-foreground text-sm">
                        Nenhum item cadastrado neste grupo.
                      </TableCell>
                    </TableRow>
                  ) : (
                    items.map(item => (
                      <TableRow key={item.id} className="hover:bg-muted/20">
                        <TableCell className="py-3 font-mono text-[11px] font-bold text-muted-foreground">{item.code || "—"}</TableCell>
                        <TableCell className="py-3 font-bold text-secondary text-sm">{item.name}</TableCell>
                        <TableCell className="py-3 font-bold tabular-nums">{centsToBRL(item.price_cents)}</TableCell>
                        <TableCell className="py-3 text-center">
                          <Button variant="ghost" size="icon" className={cn("h-7 w-7 rounded-full", item.active ? "text-success" : "text-muted-foreground")} disabled={!canEdit}>
                            <Power className="w-3.5 h-3.5" />
                          </Button>
                        </TableCell>
                        <TableCell className="py-3 text-right">
                          {canEdit && (
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingItem(item); setItemDialogOpen(true); }}>
                                <Edit2 className="w-3.5 h-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDeleteItem(item.id)}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>

      <GroupDialog 
        open={groupDialogOpen} 
        onOpenChange={setGroupDialogOpen} 
        group={editingGroup} 
        onSaved={loadGroups} 
        restaurantId={currentRestaurantId ?? ""}
      />

      <ItemDialog 
        open={itemDialogOpen} 
        onOpenChange={setItemDialogOpen} 
        item={editingItem} 
        groupId={selectedGroupId ?? ""} 
        onSaved={() => selectedGroupId && loadItems(selectedGroupId)} 
      />
    </div>
  );

  async function handleDeleteItem(id: string) {
    if (!confirm("Excluir este item?")) return;
    const { error } = await deleteOptionItem(id);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else if (selectedGroupId) loadItems(selectedGroupId);
  }
}

function GroupDialog({ open, onOpenChange, group, onSaved, restaurantId }: any) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [min, setMin] = useState(0);
  const [max, setMax] = useState(1);
  const [required, setRequired] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (group) {
      setName(group.name); setCode(group.code || ""); setMin(group.min_options); setMax(group.max_options); setRequired(group.is_required);
    } else {
      setName(""); setCode(""); setMin(0); setMax(1); setRequired(false);
    }
  }, [group, open]);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    const payload = {
      name: name.trim(), code: code.trim() || null, min_options: min, max_options: max, is_required: required, restaurant_id: restaurantId
    };
    const res = group ? await updateOptionGroup(group.id, payload) : await createOptionGroup(payload as any);
    setSaving(false);
    if (res.error) toast({ title: "Erro", description: res.error.message, variant: "destructive" });
    else { toast({ title: "Salvo" }); onOpenChange(false); onSaved(); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{group ? "Editar Grupo" : "Novo Grupo"}</DialogTitle>
          <DialogDescription>Configure as regras de escolha para este grupo.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase font-bold">Código</Label>
              <Input value={code} onChange={e => setCode(e.target.value)} placeholder="BORDA, MOLHO..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase font-bold">Nome</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Escolha a Borda" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase font-bold">Min Seleção</Label>
              <Input type="number" value={min} onChange={e => setMin(Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase font-bold">Max Seleção</Label>
              <Input type="number" value={max} onChange={e => setMax(Number(e.target.value))} />
            </div>
          </div>
          <div className="flex items-center justify-between p-3 bg-muted/20 rounded-lg">
            <div className="space-y-0.5">
              <Label className="text-sm font-bold">Obrigatório</Label>
              <p className="text-[10px] text-muted-foreground text-balance">O cliente deve escolher ao menos o mínimo.</p>
            </div>
            <Switch checked={required} onCheckedChange={setRequired} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ItemDialog({ open, onOpenChange, item, groupId, onSaved }: any) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (item) {
      setName(item.name); setCode(item.code || ""); setPrice((item.price_cents / 100).toFixed(2).replace('.', ',')); setCost((item.cost_cents || 0 / 100).toFixed(2).replace('.', ','));
    } else {
      setName(""); setCode(""); setPrice(""); setCost("");
    }
  }, [item, open]);

  async function handleSave() {
    if (!name.trim()) return;
    try {
      const priceCents = parseBRLToCents(price);
      const costCents = parseBRLToCents(cost);
      setSaving(true);
      const payload = { name: name.trim(), code: code.trim() || null, price_cents: priceCents, cost_cents: costCents, group_id: groupId };
      const res = item ? await updateOptionItem(item.id, payload) : await createOptionItem(payload as any);
      setSaving(false);
      if (res.error) throw res.error;
      toast({ title: "Salvo" }); onOpenChange(false); onSaved();
    } catch (e: any) {
      setSaving(false);
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{item ? "Editar Item" : "Novo Item"}</DialogTitle>
          <DialogDescription>Adicione opções ao grupo de escolhas.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase font-bold">Código</Label>
              <Input value={code} onChange={e => setCode(e.target.value)} placeholder="ADIC-01" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase font-bold">Nome</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Catupiry" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase font-bold">Preço (R$)</Label>
              <Input value={price} onChange={e => setPrice(e.target.value)} placeholder="0,00" className="text-success font-bold" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase font-bold">Custo (R$)</Label>
              <Input value={cost} onChange={e => setCost(e.target.value)} placeholder="0,00" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
