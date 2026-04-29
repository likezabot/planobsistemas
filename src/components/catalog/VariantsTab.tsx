import { useState, useEffect, useCallback, useMemo } from "react";
import { useRestaurant } from "@/lib/auth/RestaurantProvider";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { 
  listProducts, 
  type Product 
} from "@/lib/catalog/queries";
import { 
  listVariants, 
  createVariant, 
  updateVariant, 
  deleteVariant,
  type ProductVariant 
} from "@/lib/catalog/pizzaQueries";
import { centsToBRL, parseBRLToCents, isAdminRole } from "@/lib/catalog/money";
import { findDuplicatePizzas } from "@/lib/catalog/suspectDetection";
import {
  Plus,
  Power,
  Trash2,
  Edit2,
  Layers,
  Search,
  Loader2,
  AlertCircle,
  AlertTriangle,
  Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
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
import { cn } from "@/lib/utils";

export default function VariantsTab() {
  const { currentRestaurantId, currentMembership } = useRestaurant();
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [loadingVariants, setLoadingVariants] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ProductVariant | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");
  const [trackStock, setTrackStock] = useState(false);
  const [stockQuantity, setStockQuantity] = useState("0");
  const [lowStockAlert, setLowStockAlert] = useState("");
  const [allowOutOfStockSale, setAllowOutOfStockSale] = useState(false);
  const [diameterCm, setDiameterCm] = useState("");
  const [slices, setSlices] = useState("");
  const [saving, setSaving] = useState(false);

  const inventoryEnabled = currentMembership?.restaurants.inventory_enabled;
  const inventoryMode = currentMembership?.restaurants.inventory_mode;
  const showInventoryFields = inventoryEnabled && inventoryMode === 'advanced';

  // Mostra campos de pizza só quando o produto selecionado é do tipo pizza
  const selectedProduct = products.find((p) => p.id === selectedProductId);
  const isPizzaProduct = selectedProduct?.type === "pizza";

  const canEdit = isAdminRole(currentMembership?.role);

  // Dropdown de produtos: variable | pizza | combo, dedup defensivo por id, ordenado por nome.
  const variantProducts = useMemo(() => {
    const seen = new Set<string>();
    const list: Product[] = [];
    for (const p of products) {
      if (p.type !== "variable" && p.type !== "pizza" && p.type !== "combo") continue;
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      list.push(p);
    }
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [products]);

  // Pizzas duplicadas (mesmo nome ignorando caixa, mesmo restaurant_id, type='pizza')
  const duplicatePizzaGroups = useMemo(
    () => findDuplicatePizzas(products.map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      created_at: (p as unknown as { created_at: string }).created_at ?? "",
    }))),
    [products],
  );
  const [dedupingDup, setDedupingDup] = useState(false);

  async function handleDedupePizzas() {
    if (dedupingDup) return;
    const idsToInactivate = duplicatePizzaGroups.flatMap((g) => g.ids.slice(1));
    if (idsToInactivate.length === 0) return;
    if (!confirm(
      `Inativar ${idsToInactivate.length} duplicata(s), mantendo a mais antiga de cada nome?\n\nNenhum produto será excluído.`
    )) return;
    setDedupingDup(true);
    try {
      const { error } = await supabase
        .from("products")
        .update({ active: false })
        .in("id", idsToInactivate);
      if (error) throw error;
      toast({ title: `${idsToInactivate.length} duplicata(s) inativada(s)` });
      await loadProducts();
    } catch (e) {
      toast({ title: "Falhou", description: (e as Error).message, variant: "destructive" });
    } finally {
      setDedupingDup(false);
    }
  }

  const loadProducts = useCallback(async () => {
    if (!currentRestaurantId) return;
    setLoadingProducts(true);
    const { data, error } = await listProducts(currentRestaurantId);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    setProducts(data ?? []);
    setLoadingProducts(false);
  }, [currentRestaurantId, toast]);

  const loadVariants = useCallback(async (productId: string) => {
    setLoadingVariants(true);
    const { data, error } = await listVariants(productId);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    setVariants(data ?? []);
    setLoadingVariants(false);
  }, [toast]);

  useEffect(() => { loadProducts(); }, [loadProducts]);
  useEffect(() => {
    if (selectedProductId) loadVariants(selectedProductId);
    else setVariants([]);
  }, [selectedProductId, loadVariants]);

  async function handleSave() {
    if (!selectedProductId) return;
    if (!name.trim() || !code.trim()) {
      toast({ title: "Nome e código são obrigatórios", variant: "destructive" });
      return;
    }
    
    // Check for duplicate code in current variants
    const isDuplicateCode = variants.some(v => v.code === code.trim() && v.id !== editing?.id);
    if (isDuplicateCode) {
      toast({ title: "Código duplicado", description: "Este código já existe para este produto.", variant: "destructive" });
      return;
    }

    try {
      const priceCents = parseBRLToCents(price);
      const costCents = parseBRLToCents(cost);
      setSaving(true);
      
      const payload: Record<string, unknown> = {
        name: name.trim(),
        code: code.trim(),
        price_cents: priceCents,
        cost_cents: costCents,
        product_id: selectedProductId,
        track_stock: trackStock,
        stock_quantity: Number(stockQuantity.replace(',', '.')) || 0,
        low_stock_alert: lowStockAlert ? Number(lowStockAlert.replace(',', '.')) : null,
        allow_out_of_stock_sale: allowOutOfStockSale,
      };
      if (isPizzaProduct) {
        payload.diameter_cm = diameterCm ? Number(diameterCm.replace(',', '.')) : null;
        payload.slices = slices ? parseInt(slices, 10) : null;
      }

      const res = editing
        ? await updateVariant(editing.id, payload as any)
        : await createVariant(payload as any);

      if (res.error) throw res.error;

      toast({ title: editing ? "Tamanho atualizado" : "Tamanho criado" });
      setOpen(false);
      loadVariants(selectedProductId);
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir este tamanho?")) return;
    const { error } = await deleteVariant(id);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else if (selectedProductId) loadVariants(selectedProductId);
  }

  return (
    <div className="space-y-6">
      {duplicatePizzaGroups.length > 0 && (
        <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4 shadow-sm space-y-2">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-bold text-amber-900">
                Existem pizzas duplicadas com o mesmo nome
              </h3>
              <ul className="text-xs text-amber-800/80 mt-1 list-disc pl-4 space-y-0.5">
                {duplicatePizzaGroups.map((g) => (
                  <li key={g.nameKey}>
                    <strong>{g.nameKey}</strong> — {g.ids.length} ocorrências
                  </li>
                ))}
              </ul>
            </div>
            {canEdit && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={handleDedupePizzas}
                disabled={dedupingDup}
              >
                {dedupingDup && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
                Inativar duplicatas (manter a mais antiga)
              </Button>
            )}
          </div>
        </div>
      )}
      <div className="bg-white p-4 rounded-xl border border-border shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex-1">
            <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 block">Selecione o Produto</Label>
            <Select value={selectedProductId ?? undefined} onValueChange={setSelectedProductId}>
              <SelectTrigger className="h-10">
                <SelectValue placeholder="Escolha um produto (Variável ou Pizza)" />
              </SelectTrigger>
              <SelectContent>
                {variantProducts.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name} ({p.type})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selectedProductId && canEdit && (
            <Button className="font-bold h-10 px-6 mt-5 md:mt-0" onClick={() => { setEditing(null); setName(""); setCode(""); setPrice(""); setCost(""); setOpen(true); }}>
              <Plus className="w-4 h-4 mr-2" />
              Novo Tamanho
            </Button>
          )}
        </div>
      </div>

      {!selectedProductId ? (
        <div className="text-center py-20 bg-muted/20 rounded-xl border border-dashed border-border">
          <Layers className="w-12 h-12 mx-auto mb-4 opacity-10 text-secondary" />
          <p className="text-muted-foreground text-sm">Selecione um produto para gerenciar seus tamanhos e variações.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-border overflow-hidden shadow-sm">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[100px] text-[10px] font-bold uppercase tracking-wider text-muted-foreground py-3">Código</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground py-3">Tamanho / Variação</TableHead>
                <TableHead className="w-[120px] text-[10px] font-bold uppercase tracking-wider text-muted-foreground py-3">Preço (R$)</TableHead>
                <TableHead className="w-[120px] text-[10px] font-bold uppercase tracking-wider text-muted-foreground py-3">Custo (R$)</TableHead>
                <TableHead className="w-[100px] text-[10px] font-bold uppercase tracking-wider text-muted-foreground py-3 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingVariants ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}><TableCell colSpan={5} className="h-12 animate-pulse bg-muted/10" /></TableRow>
                ))
              ) : variants.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-muted-foreground text-sm">
                    Nenhum tamanho cadastrado para este produto.
                  </TableCell>
                </TableRow>
              ) : (
                variants.map(v => (
                  <TableRow key={v.id} className="hover:bg-muted/20">
                    <TableCell className="py-3 font-mono text-[11px] font-bold">{v.code}</TableCell>
                    <TableCell className="py-3 font-bold text-secondary text-sm">{v.name}</TableCell>
                    <TableCell className="py-3 font-bold tabular-nums">{centsToBRL(v.price_cents)}</TableCell>
                    <TableCell className="py-3 text-muted-foreground text-xs tabular-nums">{centsToBRL(v.cost_cents || 0)}</TableCell>
                    <TableCell className="py-3 text-right">
                      {canEdit && (
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                            setEditing(v);
                            setName(v.name);
                            setCode(v.code || "");
                            setPrice((v.price_cents / 100).toFixed(2).replace('.', ','));
                            setCost((v.cost_cents || 0 / 100).toFixed(2).replace('.', ','));
                            setTrackStock(v.track_stock ?? false);
                            setStockQuantity(v.stock_quantity?.toString() || "0");
                            setLowStockAlert(v.low_stock_alert?.toString() || "");
                            setAllowOutOfStockSale(v.allow_out_of_stock_sale ?? false);
                            setOpen(true);
                          }}>
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(v.id)}>
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
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md rounded-xl p-0 overflow-hidden">
          <DialogHeader className="p-6 bg-secondary text-white">
            <DialogTitle className="text-xl font-bold">{editing ? "Editar Tamanho" : "Novo Tamanho"}</DialogTitle>
            <DialogDescription className="text-white/60">Configure o nome, código e preço da variação.</DialogDescription>
          </DialogHeader>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Código (EAN/REF)</Label>
                <Input value={code} onChange={e => setCode(e.target.value)} placeholder="P, M, G, 300ML..." className="h-10 font-bold" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Nome Exibição</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Pequena, Grande..." className="h-10" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Preço Venda (R$)</Label>
                <Input value={price} onChange={e => setPrice(e.target.value)} placeholder="0,00" className="h-10 font-bold text-success" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Custo (R$)</Label>
                <Input value={cost} onChange={e => setCost(e.target.value)} placeholder="0,00" className="h-10" />
              </div>
            </div>

            {showInventoryFields && (
              <>
                <Separator className="my-2" />
                <div className="space-y-4 pt-2">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-bold">Controlar estoque</Label>
                      <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight">Ativar para esta variação</p>
                    </div>
                    <Switch 
                      checked={trackStock} 
                      onCheckedChange={setTrackStock} 
                      disabled={!canEdit}
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
                          disabled={!canEdit} 
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
                          disabled={!canEdit} 
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
                          disabled={!canEdit}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {editing && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-100 rounded-lg text-amber-800 text-[10px]">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <p>Alterar o código pode afetar integrações e relatórios antigos baseados nesse identificador.</p>
              </div>
            )}
          </div>
          <DialogFooter className="p-6 bg-muted/30 border-t gap-2">
            <Button variant="ghost" className="rounded-lg font-bold" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} className="rounded-lg h-10 px-8 font-bold shadow-sm">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : (editing ? "Atualizar" : "Criar")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
