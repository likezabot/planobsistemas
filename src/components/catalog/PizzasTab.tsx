import { useEffect, useState, useCallback, useMemo } from "react";
import { AppShell } from "@/components/AppShell";
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
import { Separator } from "@/components/ui/separator";
import { Plus, Pizza, Power, Trash2, Edit2, Save } from "lucide-react";
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

type Pizza = {
  id: string;
  name: string;
  active: boolean;
  type: string | null;
};

export default function PizzasTab() {
  const { currentRestaurantId, currentMembership, refresh: refreshMembership } = useRestaurant();
  const canEdit = isAdminRole(currentMembership?.role);
  const pizzaEnabled = currentMembership?.restaurants.pizza_module_enabled ?? false;
  const [toggling, setToggling] = useState(false);
  const { toast } = useToast();

  if (!currentRestaurantId) return <div className="text-sm text-muted-foreground p-8">Selecione um restaurante.</div>;

  async function handleTogglePizzaModule(next: boolean) {
    if (!currentRestaurantId) return;
    setToggling(true);
    const { error } = await supabase
      .from("restaurants")
      .update({ pizza_module_enabled: next })
      .eq("id", currentRestaurantId);
    setToggling(false);
    if (error) {
      toast({ title: "Falhou", description: error.message, variant: "destructive" });
      return;
    }
    await refreshMembership();
    toast({ title: next ? "Módulo Pizza ativado" : "Módulo Pizza desativado" });
  }

  return (
    <div className="flex flex-col gap-6">
      {canEdit && (
        <div className="rounded-lg border border-border bg-card p-4 flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-bold text-secondary flex items-center gap-2">
              <Pizza className="w-4 h-4" /> Módulo Pizza
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Quando ligado, a aba Pizza aparece no PDV/cardápio público com tamanhos, sabores e bordas.
              Quando desligado, produtos do tipo pizza ficam ocultos do público.
            </p>
          </div>
          <Switch checked={pizzaEnabled} onCheckedChange={handleTogglePizzaModule} disabled={toggling} />
        </div>
      )}

      {!pizzaEnabled ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          O módulo Pizza está desativado neste restaurante. {canEdit ? "Ative acima para liberar o fluxo profissional de pizza." : "Peça ao responsável para ativar."}
        </div>
      ) : (
        <Tabs defaultValue="pizzas" className="w-full">
          <TabsList className="bg-muted/50 p-1">
            <TabsTrigger value="pizzas" className="text-xs uppercase font-bold tracking-wider px-6">Configurar Pizzas</TabsTrigger>
            <TabsTrigger value="flavors" className="text-xs uppercase font-bold tracking-wider px-6">Sabores Globais</TabsTrigger>
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
      )}
    </div>
  );
}


// =====================================================================
// ABA: Sabores (CRUD global do restaurante)
// =====================================================================
function FlavorsTabContent({
  restaurantId,
  tenantId,
  canEdit,
}: {
  restaurantId: string;
  tenantId: string;
  canEdit: boolean;
}) {
  const { toast } = useToast();
  const [flavors, setFlavors] = useState<PizzaFlavor[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PizzaFlavor | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await listPizzaFlavors(restaurantId);
    if (error) {
      toast({ title: "Erro ao listar sabores", description: error.message, variant: "destructive" });
    }
    setFlavors(data ?? []);
    setLoading(false);
  }, [restaurantId, toast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleToggle(f: PizzaFlavor) {
    const { error } = await setPizzaFlavorActive(f.id, !f.active);
    if (error) toast({ title: "Falhou", description: error.message, variant: "destructive" });
    else refresh();
  }
  async function handleDelete(f: PizzaFlavor) {
    if (!confirm(`Excluir sabor "${f.name}"? Esta ação remove vínculos e preços.`)) return;
    const { error } = await deletePizzaFlavor(f.id);
    if (error) toast({ title: "Falhou", description: error.message, variant: "destructive" });
    else refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          Sabores reutilizáveis para vincular a uma ou mais pizzas.
        </p>
        {canEdit && (
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
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
            {loading ? (
              <tr>
                <td colSpan={4} className="p-4 text-center text-muted-foreground">
                  Carregando…
                </td>
              </tr>
            ) : flavors.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-6 text-center text-muted-foreground">
                  Nenhum sabor cadastrado.
                </td>
              </tr>
            ) : (
              flavors.map((f) => (
                <tr key={f.id} className="border-t">
                  <td className="p-3 font-medium">
                    {f.name}
                    {f.description && (
                      <div className="text-xs text-muted-foreground">{f.description}</div>
                    )}
                  </td>
                  <td className="p-3 text-xs">{f.category ?? "—"}</td>
                  <td className="p-3">
                    <Badge variant={f.active ? "default" : "outline"}>
                      {f.active ? "Ativo" : "Inativo"}
                    </Badge>
                  </td>
                  <td className="p-3 text-right">
                    {canEdit && (
                      <div className="inline-flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => {
                            setEditing(f);
                            setDialogOpen(true);
                          }}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleToggle(f)}
                        >
                          <Power className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => handleDelete(f)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <FlavorDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        flavor={editing}
        restaurantId={restaurantId}
        tenantId={tenantId}
        onSaved={refresh}
      />
    </div>
  );
}

function FlavorDialog({
  open,
  onOpenChange,
  flavor,
  restaurantId,
  tenantId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  flavor: PizzaFlavor | null;
  restaurantId: string;
  tenantId: string;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [saving, setSaving] = useState(false);
  const { currentMembership } = useRestaurant();
  const [trackStock, setTrackStock] = useState(false);
  const [stockQuantity, setStockQuantity] = useState("0");
  const [lowStockAlert, setLowStockAlert] = useState("");
  const [allowOutOfStockSale, setAllowOutOfStockSale] = useState(false);

  const inventoryEnabled = currentMembership?.restaurants.inventory_enabled;
  const inventoryMode = currentMembership?.restaurants.inventory_mode;
  const showInventoryFields = inventoryEnabled && inventoryMode === 'advanced';

  useEffect(() => {
    if (flavor) {
      setName(flavor.name);
      setDescription(flavor.description ?? "");
      setCategory(flavor.category ?? "");
      setTrackStock(flavor.track_stock ?? false);
      setStockQuantity(flavor.stock_quantity?.toString() || "0");
      setLowStockAlert(flavor.low_stock_alert?.toString() || "");
      setAllowOutOfStockSale(flavor.allow_out_of_stock_sale ?? false);
    } else {
      setName("");
      setDescription("");
      setCategory("");
      setTrackStock(false); setStockQuantity("0"); setLowStockAlert(""); setAllowOutOfStockSale(false);
    }
  }, [flavor, open]);

  async function handleSave() {
    if (!name.trim()) {
      toast({ title: "Nome obrigatório", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      category: category.trim() || null,
      track_stock: trackStock,
      stock_quantity: Number(stockQuantity.replace(',', '.')) || 0,
      low_stock_alert: lowStockAlert ? Number(lowStockAlert.replace(',', '.')) : null,
      allow_out_of_stock_sale: allowOutOfStockSale,
    };
    const res = flavor
      ? await updatePizzaFlavor(flavor.id, payload)
      : await createPizzaFlavor({ ...payload, restaurant_id: restaurantId, tenant_id: tenantId });
    setSaving(false);
    if (res.error) {
      toast({ title: "Erro", description: res.error.message, variant: "destructive" });
      return;
    }
    toast({ title: flavor ? "Sabor atualizado" : "Sabor criado" });
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{flavor ? "Editar sabor" : "Novo sabor"}</DialogTitle>
          <DialogDescription>
            Sabores ficam disponíveis para vincular em qualquer pizza.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Categoria (opcional)</Label>
            <Input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Ex: Tradicional, Especial, Doce…"
            />
          </div>
          <div>
            <Label>Descrição</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          {showInventoryFields && (
            <>
              <Separator className="my-2" />
              <div className="space-y-4 pt-2">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-bold">Controlar estoque</Label>
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight">Ativar para este sabor</p>
                  </div>
                  <Switch 
                    checked={trackStock} 
                    onCheckedChange={setTrackStock} 
                  />
                </div>

                {trackStock && (
                  <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-1 duration-200">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Qtd Atual</Label>
                      <Input 
                        type="number"
                        value={stockQuantity} 
                        onChange={e => setStockQuantity(e.target.value)} 
                        className="h-9 font-bold tabular-nums" 
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Alerta Baixo</Label>
                      <Input 
                        type="number"
                        value={lowStockAlert} 
                        onChange={e => setLowStockAlert(e.target.value)} 
                        className="h-9 font-bold tabular-nums" 
                        placeholder="Ex: 5"
                      />
                    </div>
                    <div className="col-span-2 flex items-center justify-between p-2 rounded-lg bg-muted/30 border border-border/50">
                      <div className="space-y-0.5">
                        <Label className="text-[10px] font-bold uppercase tracking-wider">Vender sem estoque</Label>
                        <p className="text-[9px] text-muted-foreground">Permitir venda se zerado</p>
                      </div>
                      <Switch 
                        checked={allowOutOfStockSale} 
                        onCheckedChange={setAllowOutOfStockSale} 
                      />
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// ABA: Pizzas (lista de produtos type=pizza + editor)
// =====================================================================
function PizzasTabContent({ restaurantId, canEdit }: { restaurantId: string; canEdit: boolean }) {
  const { toast } = useToast();
  const [pizzas, setPizzas] = useState<Pizza[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data, error } = await listPizzas(restaurantId);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    setPizzas((data ?? []) as Pizza[]);
    setLoading(false);
  }, [restaurantId, toast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-1 bg-white rounded-xl border border-border overflow-hidden">
        <div className="p-3 border-b text-xs font-bold uppercase text-muted-foreground">
          Pizzas cadastradas
        </div>
        {loading ? (
          <div className="p-4 text-center text-sm text-muted-foreground">Carregando…</div>
        ) : pizzas.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">
            Crie um produto do tipo <strong>pizza</strong> em /catalogo para configurá-lo aqui.
          </div>
        ) : (
          <ul>
            {pizzas.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => setSelectedId(p.id)}
                  className={`w-full text-left p-3 text-sm border-b hover:bg-muted/40 ${
                    selectedId === p.id ? "bg-muted/60 font-bold" : ""
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span>{p.name}</span>
                    {!p.active && (
                      <Badge variant="outline" className="text-[10px]">
                        inativa
                      </Badge>
                    )}
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
          <div className="bg-white border rounded-xl p-8 text-center text-muted-foreground text-sm">
            Selecione uma pizza à esquerda para configurar.
          </div>
        )}
      </div>
    </div>
  );
}

// =====================================================================
// Editor de uma pizza específica
// =====================================================================
function PizzaEditor({
  productId,
  restaurantId,
  canEdit,
}: {
  productId: string;
  restaurantId: string;
  canEdit: boolean;
}) {
  const { toast } = useToast();
  const [config, setConfig] = useState<PizzaConfig | null>(null);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [allFlavors, setAllFlavors] = useState<PizzaFlavor[]>([]);
  const [linkedIds, setLinkedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [cfgRes, varRes, flRes, linkRes] = await Promise.all([
      getPizzaConfig(productId),
      listVariants(productId),
      listPizzaFlavors(restaurantId),
      listPizzaFlavorLinks(productId),
    ]);
    if (cfgRes.error) toast({ title: "Erro config", description: cfgRes.error.message, variant: "destructive" });
    if (varRes.error) toast({ title: "Erro tamanhos", description: varRes.error.message, variant: "destructive" });
    if (flRes.error) toast({ title: "Erro sabores", description: flRes.error.message, variant: "destructive" });
    if (linkRes.error) toast({ title: "Erro vínculos", description: linkRes.error.message, variant: "destructive" });

    setConfig(
      cfgRes.data ?? {
        product_id: productId,
        max_flavors: 1,
        price_rule: "max",
        allow_edge_customization: true,
      } as PizzaConfig,
    );
    setVariants((varRes.data ?? []) as ProductVariant[]);
    setAllFlavors((flRes.data ?? []) as PizzaFlavor[]);
    setLinkedIds(((linkRes.data ?? []) as any[]).map((r) => r.flavor_id));
    setLoading(false);
  }, [productId, restaurantId, toast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (loading || !config) return <div className="p-4 text-sm">Carregando…</div>;

  return (
    <div className="space-y-4">
      <ConfigSection
        config={config}
        canEdit={canEdit}
        onSaved={refresh}
        productId={productId}
      />
      <VariantsSection
        productId={productId}
        variants={variants}
        canEdit={canEdit}
        onChange={refresh}
      />
      <FlavorLinksSection
        productId={productId}
        allFlavors={allFlavors}
        linkedIds={linkedIds}
        variants={variants}
        canEdit={canEdit}
        onChange={refresh}
      />
      <OptionOverridesSection
        productId={productId}
        restaurantId={restaurantId}
        variants={variants}
        canEdit={canEdit}
      />
    </div>
  );
}

// ----- Config -----
function ConfigSection({
  config,
  canEdit,
  onSaved,
  productId,
}: {
  config: PizzaConfig;
  canEdit: boolean;
  onSaved: () => void;
  productId: string;
}) {
  const { toast } = useToast();
  const [maxFlavors, setMaxFlavors] = useState<number>(config.max_flavors);
  const [priceRule, setPriceRule] = useState<string>(config.price_rule);
  const [allowEdge, setAllowEdge] = useState<boolean>(config.allow_edge_customization);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMaxFlavors(config.max_flavors);
    setPriceRule(config.price_rule);
    setAllowEdge(config.allow_edge_customization);
  }, [config]);

  async function save() {
    setSaving(true);
    try {
      const { error } = await upsertPizzaConfig({
        product_id: productId,
        max_flavors: maxFlavors,
        price_rule: priceRule as any,
        allow_edge_customization: allowEdge,
      });
      if (error) throw error;
      toast({ title: "Configuração salva" });
      onSaved();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white border rounded-xl p-4">
      <h3 className="font-bold mb-3">Configuração</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <Label>Máx. sabores (1 a 4)</Label>
          <Input
            type="number"
            min={1}
            max={4}
            value={maxFlavors}
            onChange={(e) => setMaxFlavors(Math.max(1, Math.min(4, Number(e.target.value) || 1)))}
            disabled={!canEdit}
          />
        </div>
        <div>
          <Label>Regra de preço</Label>
          <Select value={priceRule} onValueChange={setPriceRule} disabled={!canEdit}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="max">Maior preço entre os sabores</SelectItem>
              <SelectItem value="average">Média dos sabores</SelectItem>
              <SelectItem value="sum">Soma dos sabores</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-3 pt-6">
          <Switch checked={allowEdge} onCheckedChange={setAllowEdge} disabled={!canEdit} />
          <Label>Permitir borda/adicionais</Label>
        </div>
      </div>
      {canEdit && (
        <div className="mt-4">
          <Button size="sm" onClick={save} disabled={saving}>
            <Save className="w-4 h-4 mr-2" /> Salvar configuração
          </Button>
        </div>
      )}
    </div>
  );
}

// ----- Tamanhos (variants) -----
function VariantsSection({
  productId,
  variants,
  canEdit,
  onChange,
}: {
  productId: string;
  variants: ProductVariant[];
  canEdit: boolean;
  onChange: () => void;
}) {
  const { toast } = useToast();
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("");

  async function add() {
    if (!newName.trim()) return;
    let cents = 0;
    try {
      cents = parseBRLToCents(newPrice || "0");
    } catch (e: any) {
      toast({ title: e.message, variant: "destructive" });
      return;
    }
    const { error } = await createVariant({
      product_id: productId,
      name: newName.trim(),
      price_cents: cents,
    });
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else {
      setNewName("");
      setNewPrice("");
      onChange();
    }
  }

  return (
    <div className="bg-white border rounded-xl p-4">
      <h3 className="font-bold mb-3">Tamanhos</h3>
      <table className="w-full text-sm mb-3">
        <thead className="text-xs uppercase text-muted-foreground">
          <tr>
            <th className="text-left p-2">Nome</th>
            <th className="text-right p-2">Preço base</th>
            <th className="text-right p-2">Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {variants.length === 0 ? (
            <tr>
              <td colSpan={4} className="p-3 text-muted-foreground text-center">
                Nenhum tamanho.
              </td>
            </tr>
          ) : (
            variants.map((v) => (
              <VariantRow key={v.id} variant={v} canEdit={canEdit} onChange={onChange} />
            ))
          )}
        </tbody>
      </table>
      {canEdit && (
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <Label>Nome</Label>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ex: Média" />
          </div>
          <div className="w-32">
            <Label>Preço base</Label>
            <Input
              value={newPrice}
              onChange={(e) => setNewPrice(e.target.value)}
              placeholder="0,00"
            />
          </div>
          <Button onClick={add}>
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

function VariantRow({
  variant,
  canEdit,
  onChange,
}: {
  variant: ProductVariant;
  canEdit: boolean;
  onChange: () => void;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(variant.name);
  const [price, setPrice] = useState((variant.price_cents / 100).toFixed(2).replace(".", ","));

  async function save() {
    let cents = 0;
    try {
      cents = parseBRLToCents(price);
    } catch (e: any) {
      toast({ title: e.message, variant: "destructive" });
      return;
    }
    const { error } = await updateVariant(variant.id, { name: name.trim(), price_cents: cents });
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else {
      setEditing(false);
      onChange();
    }
  }
  async function toggleActive() {
    const { error } = await updateVariant(variant.id, { active: !variant.active });
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else onChange();
  }
  async function remove() {
    if (!confirm(`Remover tamanho ${variant.name}?`)) return;
    const { error } = await deleteVariant(variant.id);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else onChange();
  }

  return (
    <tr className="border-t">
      <td className="p-2">
        {editing ? <Input value={name} onChange={(e) => setName(e.target.value)} /> : variant.name}
      </td>
      <td className="p-2 text-right">
        {editing ? (
          <Input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="text-right"
          />
        ) : (
          centsToBRL(variant.price_cents)
        )}
      </td>
      <td className="p-2 text-right">
        <Badge variant={variant.active ? "default" : "outline"}>
          {variant.active ? "Ativo" : "Inativo"}
        </Badge>
      </td>
      <td className="p-2 text-right">
        {canEdit && (
          <div className="inline-flex gap-1">
            {editing ? (
              <Button size="sm" onClick={save}>
                Salvar
              </Button>
            ) : (
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditing(true)}>
                <Edit2 className="w-4 h-4" />
              </Button>
            )}
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={toggleActive}>
              <Power className="w-4 h-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-destructive"
              onClick={remove}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        )}
      </td>
    </tr>
  );
}

// ----- Vínculo + preço por tamanho -----
function FlavorLinksSection({
  productId,
  allFlavors,
  linkedIds,
  variants,
  canEdit,
  onChange,
}: {
  productId: string;
  allFlavors: PizzaFlavor[];
  linkedIds: string[];
  variants: ProductVariant[];
  canEdit: boolean;
  onChange: () => void;
}) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<string[]>(linkedIds);
  const [savingLinks, setSavingLinks] = useState(false);
  const [prices, setPrices] = useState<Record<string, Record<string, string>>>({});
  const [pricesLoaded, setPricesLoaded] = useState(false);

  useEffect(() => {
    setSelected(linkedIds);
  }, [linkedIds.join(",")]);

  // carrega preços por sabor x variant
  useEffect(() => {
    let cancel = false;
    (async () => {
      if (linkedIds.length === 0 || variants.length === 0) {
        setPrices({});
        setPricesLoaded(true);
        return;
      }
      const { data, error } = await supabase
        .from("pizza_flavor_prices")
        .select("flavor_id, variant_id, price_cents")
        .in("flavor_id", linkedIds)
        .in(
          "variant_id",
          variants.map((v) => v.id),
        );
      if (cancel) return;
      if (error) {
        toast({ title: "Erro preços", description: error.message, variant: "destructive" });
      }
      const map: Record<string, Record<string, string>> = {};
      for (const row of data ?? []) {
        map[row.flavor_id] = map[row.flavor_id] ?? {};
        map[row.flavor_id][row.variant_id] = (row.price_cents / 100).toFixed(2).replace(".", ",");
      }
      setPrices(map);
      setPricesLoaded(true);
    })();
    return () => {
      cancel = true;
    };
  }, [linkedIds.join(","), variants.map((v) => v.id).join(","), toast]);

  function toggle(flavorId: string) {
    setSelected((prev) =>
      prev.includes(flavorId) ? prev.filter((x) => x !== flavorId) : [...prev, flavorId],
    );
  }

  async function saveLinks() {
    setSavingLinks(true);
    const { error } = await setPizzaFlavorLinks(productId, selected);
    setSavingLinks(false);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else {
      toast({ title: "Vínculos salvos" });
      onChange();
    }
  }

  async function savePrice(flavorId: string, variantId: string) {
    const raw = prices[flavorId]?.[variantId] ?? "0";
    let cents = 0;
    try {
      cents = parseBRLToCents(raw);
    } catch (e: any) {
      toast({ title: e.message, variant: "destructive" });
      return;
    }
    const { error } = await upsertFlavorPrice({
      flavor_id: flavorId,
      variant_id: variantId,
      price_cents: cents,
    });
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else toast({ title: "Preço salvo" });
  }

  const linked = allFlavors.filter((f) => linkedIds.includes(f.id));

  return (
    <div className="bg-white border rounded-xl p-4 space-y-4">
      <div>
        <h3 className="font-bold mb-2">Sabores disponíveis nesta pizza</h3>
        <div className="flex flex-wrap gap-2 mb-3">
          {allFlavors.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Cadastre sabores na aba "Sabores" primeiro.
            </p>
          ) : (
            allFlavors.map((f) => {
              const checked = selected.includes(f.id);
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => canEdit && toggle(f.id)}
                  className={`px-3 py-1 text-xs rounded-full border ${
                    checked
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted/40 border-border"
                  }`}
                >
                  {f.name}
                </button>
              );
            })
          )}
        </div>
        {canEdit && (
          <Button size="sm" onClick={saveLinks} disabled={savingLinks}>
            <Save className="w-4 h-4 mr-2" /> Salvar vínculos
          </Button>
        )}
      </div>

      {linked.length > 0 && variants.length > 0 && (
        <div>
          <h4 className="font-bold mb-2 text-sm">Preço do sabor por tamanho</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left p-2">Sabor</th>
                  {variants.map((v) => (
                    <th key={v.id} className="text-right p-2">
                      {v.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {linked.map((f) => (
                  <tr key={f.id} className="border-t">
                    <td className="p-2 font-medium">{f.name}</td>
                    {variants.map((v) => (
                      <td key={v.id} className="p-2">
                        <div className="flex items-center gap-1">
                          <Input
                            className="h-8 text-right"
                            value={prices[f.id]?.[v.id] ?? "0,00"}
                            onChange={(e) =>
                              setPrices((prev) => ({
                                ...prev,
                                [f.id]: { ...(prev[f.id] ?? {}), [v.id]: e.target.value },
                              }))
                            }
                            disabled={!canEdit}
                          />
                          {canEdit && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              onClick={() => savePrice(f.id, v.id)}
                            >
                              <Save className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!pricesLoaded && (
            <p className="text-xs text-muted-foreground mt-2">Carregando preços…</p>
          )}
        </div>
      )}
    </div>
  );
}

// ----- Overrides de option_items por tamanho (ex: borda) -----
function OptionOverridesSection({
  productId,
  restaurantId,
  variants,
  canEdit,
}: {
  productId: string;
  restaurantId: string;
  variants: ProductVariant[];
  canEdit: boolean;
}) {
  const { toast } = useToast();
  const [optionItems, setOptionItems] = useState<
    Array<{ id: string; name: string; price_cents: number; group_name: string }>
  >([]);
  const [overrides, setOverrides] = useState<Record<string, Record<string, string>>>({});
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    // 1) Grupos de adicionais ligados a esta pizza (apenas estes podem ter override no contexto da pizza)
    const { data: pog } = await supabase
      .from("product_option_groups")
      .select("group_id")
      .eq("product_id", productId);
    const groupIds = (pog ?? []).map((r: any) => r.group_id);
    if (groupIds.length === 0) {
      setOptionItems([]);
      setOverrides({});
      setLoading(false);
      return;
    }
    const { data: items, error } = await supabase
      .from("option_items")
      .select("id, name, price_cents, option_groups!inner(name, restaurant_id)")
      .in("group_id", groupIds);
    if (error) {
      toast({ title: "Erro adicionais", description: error.message, variant: "destructive" });
    }
    const flat = (items ?? []).map((i: any) => ({
      id: i.id,
      name: i.name,
      price_cents: i.price_cents,
      group_name: i.option_groups.name,
    }));
    setOptionItems(flat);

    if (flat.length > 0 && variants.length > 0) {
      const { data: ovs } = await supabase
        .from("option_item_price_overrides")
        .select("option_item_id, variant_id, price_cents")
        .in(
          "option_item_id",
          flat.map((i) => i.id),
        )
        .in(
          "variant_id",
          variants.map((v) => v.id),
        );
      const map: Record<string, Record<string, string>> = {};
      for (const row of ovs ?? []) {
        map[row.option_item_id] = map[row.option_item_id] ?? {};
        map[row.option_item_id][row.variant_id] = (row.price_cents / 100)
          .toFixed(2)
          .replace(".", ",");
      }
      setOverrides(map);
    } else {
      setOverrides({});
    }
    setLoading(false);
  }, [productId, variants.map((v) => v.id).join(","), toast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function saveOverride(itemId: string, variantId: string) {
    const raw = overrides[itemId]?.[variantId] ?? "";
    if (!raw.trim()) {
      // vazio = remover override
      const { data } = await supabase
        .from("option_item_price_overrides")
        .select("id")
        .eq("option_item_id", itemId)
        .eq("variant_id", variantId)
        .maybeSingle();
      if (data) {
        const { error } = await deleteOptionItemOverride(data.id);
        if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
        else toast({ title: "Override removido" });
      }
      return;
    }
    let cents = 0;
    try {
      cents = parseBRLToCents(raw);
    } catch (e: any) {
      toast({ title: e.message, variant: "destructive" });
      return;
    }
    const { error } = await upsertOptionItemOverride({
      option_item_id: itemId,
      variant_id: variantId,
      price_cents: cents,
    });
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else toast({ title: "Override salvo" });
  }

  if (loading) return <div className="bg-white border rounded-xl p-4">Carregando adicionais…</div>;

  if (optionItems.length === 0) {
    return (
      <div className="bg-white border rounded-xl p-4">
        <h3 className="font-bold mb-2">Borda / Adicionais por tamanho</h3>
        <p className="text-sm text-muted-foreground">
          Vincule grupos de adicionais (ex: "Borda") a esta pizza para configurar preços por tamanho.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border rounded-xl p-4">
      <h3 className="font-bold mb-2">Borda / Adicionais por tamanho</h3>
      <p className="text-xs text-muted-foreground mb-3">
        Deixe vazio para usar o preço base do adicional. Preencha para sobrescrever em um tamanho específico.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left p-2">Adicional</th>
              <th className="text-right p-2">Preço base</th>
              {variants.map((v) => (
                <th key={v.id} className="text-right p-2">
                  {v.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {optionItems.map((item) => (
              <tr key={item.id} className="border-t">
                <td className="p-2">
                  <div className="font-medium">{item.name}</div>
                  <div className="text-[10px] uppercase text-muted-foreground">
                    {item.group_name}
                  </div>
                </td>
                <td className="p-2 text-right tabular-nums">{centsToBRL(item.price_cents)}</td>
                {variants.map((v) => (
                  <td key={v.id} className="p-2">
                    <div className="flex items-center gap-1">
                      <Input
                        className="h-8 text-right"
                        placeholder="—"
                        value={overrides[item.id]?.[v.id] ?? ""}
                        onChange={(e) =>
                          setOverrides((prev) => ({
                            ...prev,
                            [item.id]: { ...(prev[item.id] ?? {}), [v.id]: e.target.value },
                          }))
                        }
                        disabled={!canEdit}
                      />
                      {canEdit && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => saveOverride(item.id, v.id)}
                        >
                          <Save className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
