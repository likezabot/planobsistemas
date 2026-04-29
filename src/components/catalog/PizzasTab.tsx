import { useEffect, useState, useCallback } from "react";
import { useRestaurant } from "@/lib/auth/RestaurantProvider";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Plus, Power, Trash2, Edit2, Save } from "lucide-react";
import { centsToBRL, parseBRLToCents, isAdminRole } from "@/lib/catalog/money";
import { supabase } from "@/integrations/supabase/client";
import {
  listPizzaFlavors,
  createPizzaFlavor,
  updatePizzaFlavor,
  setPizzaFlavorActive,
  deletePizzaFlavor,
  listPizzas,
  getPizzaConfig,
  upsertPizzaConfig,
  listVariants,
  createVariant,
  updateVariant,
  deleteVariant,
  listPizzaFlavorLinks,
  setPizzaFlavorLinks,
  upsertFlavorPrice,
  upsertOptionItemOverride,
  deleteOptionItemOverride,
  type PizzaFlavor,
  type ProductVariant,
  type PizzaConfig,
} from "@/lib/catalog/pizzaQueries";

export default function PizzasTab() {
  const { currentRestaurantId, currentMembership } = useRestaurant();
  const canEdit = isAdminRole(currentMembership?.role);

  if (!currentRestaurantId) return <div className="text-sm text-muted-foreground">Selecione um restaurante.</div>;

  return (
    <div className="flex flex-col gap-6">
      <Tabs defaultValue="pizzas" className="w-full">
        <TabsList className="bg-muted/50">
          <TabsTrigger value="pizzas" className="text-xs uppercase font-bold tracking-wider">Configurar Pizzas</TabsTrigger>
          <TabsTrigger value="flavors" className="text-xs uppercase font-bold tracking-wider">Sabores Globais</TabsTrigger>
        </TabsList>
        <TabsContent value="pizzas" className="pt-4">
          <PizzasTabContent restaurantId={currentRestaurantId} canEdit={canEdit} />
        </TabsContent>
        <TabsContent value="flavors" className="pt-4">
          <FlavorsTabContent
            restaurantId={currentRestaurantId}
            tenantId={currentMembership?.tenant_id ?? ""}
            canEdit={canEdit}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PizzasTabContent({ restaurantId, canEdit }: { restaurantId: string; canEdit: boolean }) {
  const { toast } = useToast();
  const [pizzas, setPizzas] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await listPizzas(restaurantId);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    setPizzas((data ?? []) as any[]);
    setLoading(false);
  }, [restaurantId, toast]);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-1 bg-white rounded-xl border border-border overflow-hidden">
        <div className="p-3 border-b text-xs font-bold uppercase text-muted-foreground">Pizzas cadastradas</div>
        {loading ? (
          <div className="p-4 text-center text-sm text-muted-foreground">Carregando…</div>
        ) : pizzas.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">Crie um produto do tipo <strong>pizza</strong> em /catalogo para configurá-lo aqui.</div>
        ) : (
          <ul>
            {pizzas.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => setSelectedId(p.id)}
                  className={`w-full text-left p-3 text-sm border-b hover:bg-muted/40 ${selectedId === p.id ? "bg-muted/60 font-bold" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <span>{p.name}</span>
                    {!p.active && <Badge variant="outline" className="text-[10px]">inativa</Badge>}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="lg:col-span-2">
        {selectedId ? (
          <PizzaEditor productId={selectedId} restaurantId={restaurantId} canEdit={canEdit} />
        ) : (
          <div className="bg-white border rounded-xl p-8 text-center text-muted-foreground text-sm">Selecione uma pizza à esquerda para configurar.</div>
        )}
      </div>
    </div>
  );
}

function FlavorsTabContent({ restaurantId, tenantId, canEdit }: { restaurantId: string; tenantId: string; canEdit: boolean }) {
  const { toast } = useToast();
  const [flavors, setFlavors] = useState<PizzaFlavor[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PizzaFlavor | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await listPizzaFlavors(restaurantId);
    if (error) toast({ title: "Erro ao listar sabores", description: error.message, variant: "destructive" });
    setFlavors(data ?? []);
    setLoading(false);
  }, [restaurantId, toast]);

  useEffect(() => { refresh(); }, [refresh]);

  async function handleToggle(f: PizzaFlavor) {
    const { error } = await setPizzaFlavorActive(f.id, !f.active);
    if (error) toast({ title: "Falhou", description: error.message, variant: "destructive" });
    else refresh();
  }
  async function handleDelete(f: PizzaFlavor) {
    if (!confirm(`Excluir sabor "${f.name}"?`)) return;
    const { error } = await deletePizzaFlavor(f.id);
    if (error) toast({ title: "Falhou", description: error.message, variant: "destructive" });
    else refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">Sabores reutilizáveis para vincular a uma ou mais pizzas.</p>
        {canEdit && (
          <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Plus className="w-4 h-4 mr-2" /> Novo Sabor
          </Button>
        )}
      </div>
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left p-3">Nome</th>
              <th className="text-left p-3">Categoria</th>
              <th className="text-left p-3">Status</th>
              <th className="text-right p-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={4} className="p-4 text-center">Carregando…</td></tr> : flavors.map((f) => (
              <tr key={f.id} className="border-t">
                <td className="p-3 font-medium">{f.name}</td>
                <td className="p-3 text-xs">{f.category ?? "—"}</td>
                <td className="p-3"><Badge variant={f.active ? "default" : "outline"}>{f.active ? "Ativo" : "Inativo"}</Badge></td>
                <td className="p-3 text-right">
                  {canEdit && (
                    <div className="inline-flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditing(f); setDialogOpen(true); }}><Edit2 className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleToggle(f)}><Power className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(f)}><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <FlavorDialog open={dialogOpen} onOpenChange={setDialogOpen} flavor={editing} restaurantId={restaurantId} tenantId={tenantId} onSaved={refresh} />
    </div>
  );
}

function FlavorDialog({ open, onOpenChange, flavor, restaurantId, tenantId, onSaved }: any) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (flavor) { setName(flavor.name); setDescription(flavor.description ?? ""); setCategory(flavor.category ?? ""); }
    else { setName(""); setDescription(""); setCategory(""); }
  }, [flavor, open]);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    const payload = { name: name.trim(), description: description.trim() || null, category: category.trim() || null };
    const res = flavor ? await updatePizzaFlavor(flavor.id, payload) : await createPizzaFlavor({ ...payload, restaurant_id: restaurantId, tenant_id: tenantId });
    setSaving(false);
    if (res.error) toast({ title: "Erro", description: res.error.message, variant: "destructive" });
    else { onOpenChange(false); onSaved(); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{flavor ? "Editar sabor" : "Novo sabor"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Label>Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} />
          <Label>Categoria</Label><Input value={category} onChange={(e) => setCategory(e.target.value)} />
          <Label>Descrição</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <DialogFooter><Button onClick={handleSave} disabled={saving}>Salvar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PizzaEditor({ productId, restaurantId, canEdit }: { productId: string; restaurantId: string; canEdit: boolean }) {
  const { toast } = useToast();
  const [config, setConfig] = useState<PizzaConfig | null>(null);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [allFlavors, setAllFlavors] = useState<PizzaFlavor[]>([]);
  const [linkedIds, setLinkedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [cfgRes, varRes, flRes, linkRes] = await Promise.all([
      getPizzaConfig(productId), listVariants(productId), listPizzaFlavors(restaurantId), listPizzaFlavorLinks(productId)
    ]);
    setConfig(cfgRes.data ?? { product_id: productId, max_flavors: 1, price_rule: "max", allow_edge_customization: true } as PizzaConfig);
    setVariants((varRes.data ?? []) as ProductVariant[]);
    setAllFlavors((flRes.data ?? []) as PizzaFlavor[]);
    setLinkedIds(((linkRes.data ?? []) as any[]).map((r) => r.flavor_id));
    setLoading(false);
  }, [productId, restaurantId]);

  useEffect(() => { refresh(); }, [refresh]);

  if (loading || !config) return <div>Carregando…</div>;

  return (
    <div className="space-y-4">
      <ConfigSection config={config} canEdit={canEdit} onSaved={refresh} productId={productId} />
      <VariantsSection productId={productId} variants={variants} canEdit={canEdit} onChange={refresh} />
      <FlavorLinksSection productId={productId} allFlavors={allFlavors} linkedIds={linkedIds} variants={variants} canEdit={canEdit} onChange={refresh} />
    </div>
  );
}

function ConfigSection({ config, canEdit, onSaved, productId }: any) {
  const { toast } = useToast();
  const [maxFlavors, setMaxFlavors] = useState(config.max_flavors);
  const [priceRule, setPriceRule] = useState(config.price_rule);
  const [allowEdge, setAllowEdge] = useState(config.allow_edge_customization);

  async function save() {
    const { error } = await upsertPizzaConfig({ product_id: productId, max_flavors, price_rule, allow_edge_customization: allowEdge });
    if (error) toast({ title: "Erro", variant: "destructive" });
    else { toast({ title: "Salvo" }); onSaved(); }
  }

  return (
    <div className="bg-white border rounded-xl p-4">
      <h3 className="font-bold mb-3">Configuração</h3>
      <div className="grid grid-cols-3 gap-4">
        <div><Label>Máx. sabores</Label><Input type="number" value={maxFlavors} onChange={(e) => setMaxFlavors(Number(e.target.value))} disabled={!canEdit} /></div>
        <div><Label>Regra preço</Label><Select value={priceRule} onValueChange={setPriceRule} disabled={!canEdit}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="max">Maior</SelectItem><SelectItem value="average">Média</SelectItem><SelectItem value="sum">Soma</SelectItem></SelectContent></Select></Select></div>
        <div className="flex items-center gap-2 pt-6"><Switch checked={allowEdge} onCheckedChange={setAllowEdge} disabled={!canEdit} /><Label>Bordas</Label></div>
      </div>
      {canEdit && <Button size="sm" className="mt-4" onClick={save}><Save className="w-4 h-4 mr-2" /> Salvar</Button>}
    </div>
  );
}

function VariantsSection({ productId, variants, canEdit, onChange }: any) {
  const { toast } = useToast();
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("");

  async function add() {
    if (!newName.trim()) return;
    const { error } = await createVariant({ product_id: productId, name: newName.trim(), price_cents: parseBRLToCents(newPrice || "0") });
    if (error) toast({ title: "Erro", variant: "destructive" });
    else { setNewName(""); setNewPrice(""); onChange(); }
  }

  return (
    <div className="bg-white border rounded-xl p-4">
      <h3 className="font-bold mb-3">Tamanhos</h3>
      <table className="w-full text-sm">
        {variants.map((v: any) => (
          <tr key={v.id} className="border-t">
            <td className="p-2">{v.name}</td>
            <td className="p-2 text-right">{centsToBRL(v.price_cents)}</td>
            <td className="p-2 text-right">{canEdit && <Button variant="ghost" size="icon" onClick={() => { deleteVariant(v.id); onChange(); }}><Trash2 className="w-4 h-4" /></Button>}</td>
          </tr>
        ))}
      </table>
      {canEdit && (
        <div className="flex gap-2 mt-2">
          <Input placeholder="Nome" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <Input placeholder="Preço" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} />
          <Button onClick={add}><Plus className="w-4 h-4" /></Button>
        </div>
      )}
    </div>
  );
}

function FlavorLinksSection({ productId, allFlavors, linkedIds, variants, canEdit, onChange }: any) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<string[]>(linkedIds);

  async function saveLinks() {
    const { error } = await setPizzaFlavorLinks(productId, selected);
    if (error) toast({ title: "Erro", variant: "destructive" });
    else { toast({ title: "Salvo" }); onChange(); }
  }

  return (
    <div className="bg-white border rounded-xl p-4">
      <h3 className="font-bold mb-2">Sabores vinculados</h3>
      <div className="flex flex-wrap gap-2 mb-3">
        {allFlavors.map((f: any) => (
          <button key={f.id} onClick={() => canEdit && setSelected(prev => prev.includes(f.id) ? prev.filter(x => x !== f.id) : [...prev, f.id])} className={`px-3 py-1 text-xs rounded-full border ${selected.includes(f.id) ? "bg-primary text-white" : "bg-muted"}`}>{f.name}</button>
        ))}
      </div>
      {canEdit && <Button size="sm" onClick={saveLinks}><Save className="w-4 h-4 mr-2" /> Salvar vínculos</Button>}
    </div>
  );
}
