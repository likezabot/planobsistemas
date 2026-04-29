import { useState, useEffect, useCallback, useMemo } from "react";
import { useRestaurant } from "@/lib/auth/RestaurantProvider";
import { useToast } from "@/hooks/use-toast";
import { 
  listProducts, 
  listCategories, 
  updateProduct, 
  createProduct,
  setProductActive,
  type Product,
  type Category
} from "@/lib/catalog/queries";
import { centsToBRL, parseBRLToCents, isAdminRole } from "@/lib/catalog/money";
import { 
  Search, 
  Plus, 
  Power, 
  Edit2, 
  Package, 
  Loader2,
  Check,
  ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export default function ProductsTab() {
  const { currentRestaurantId, currentMembership } = useRestaurant();
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  
  // Inline editing state
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [tempPrice, setTempPrice] = useState("");

  // Drawer state
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const canEdit = isAdminRole(currentMembership?.role);

  const refresh = useCallback(async () => {
    if (!currentRestaurantId) return;
    setLoading(true);
    const [p, c] = await Promise.all([
      listProducts(currentRestaurantId),
      listCategories(currentRestaurantId),
    ]);
    if (p.error) toast({ title: "Erro ao listar produtos", description: p.error.message, variant: "destructive" });
    if (c.error) toast({ title: "Erro ao listar categorias", description: c.error.message, variant: "destructive" });
    setProducts(p.data ?? []);
    setCategories(c.data ?? []);
    setLoading(false);
  }, [currentRestaurantId, toast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const term = searchTerm.toLowerCase();
      const matchesSearch = p.name.toLowerCase().includes(term) || (p.code && p.code.toLowerCase().includes(term));
      const matchesCategory = selectedCategory === "all" || p.category_id === selectedCategory;
      const matchesType = selectedType === "all" || p.type === selectedType;
      const matchesStatus = statusFilter === "all" || (statusFilter === "active" ? p.active : !p.active);
      return matchesSearch && matchesCategory && matchesType && matchesStatus;
    });
  }, [products, searchTerm, selectedCategory, selectedType, statusFilter]);

  async function handleToggleActive(p: Product) {
    if (!canEdit) return;
    const { error } = await setProductActive(p.id, !p.active);
    if (error) {
      toast({ title: "Falhou", description: error.message, variant: "destructive" });
    } else {
      setProducts(prev => prev.map(item => item.id === p.id ? { ...item, active: !item.active } : item));
    }
  }

  async function handleSavePrice(p: Product) {
    try {
      const cents = parseBRLToCents(tempPrice);
      const { error } = await updateProduct(p.id, { price_cents: cents });
      if (error) throw error;
      setProducts(prev => prev.map(item => item.id === p.id ? { ...item, price_cents: cents } : item));
      setEditingPriceId(null);
    } catch (e) {
      toast({ title: "Valor inválidado", description: (e as Error).message, variant: "destructive" });
    }
  }

  return (
    <div className="space-y-4">
      {/* Filters Bar */}
      <div className="flex flex-col md:flex-row gap-3 bg-white p-3 rounded-xl border border-border shadow-sm items-end md:items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Nome ou Código..." 
            className="pl-9 h-9 text-xs"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="h-9 w-[140px] text-xs">
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas Categorias</SelectItem>
              {categories.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedType} onValueChange={setSelectedType}>
            <SelectTrigger className="h-9 w-[120px] text-xs">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Tipos</SelectItem>
              <SelectItem value="simple">Simples</SelectItem>
              <SelectItem value="variable">Variável</SelectItem>
              <SelectItem value="pizza">Pizza</SelectItem>
              <SelectItem value="combo">Combo</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-[100px] text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="active">Ativos</SelectItem>
              <SelectItem value="inactive">Inativos</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {canEdit && (
          <Button size="sm" className="h-9 px-4 font-bold" onClick={() => { setSelectedProduct(null); setSheetOpen(true); }}>
            <Plus className="w-4 h-4 mr-1.5" />
            Novo
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-border overflow-hidden shadow-sm">
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[80px] text-[10px] font-bold uppercase tracking-wider text-muted-foreground py-3">Cód</TableHead>
              <TableHead className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground py-3">Produto</TableHead>
              <TableHead className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground py-3">Categoria</TableHead>
              <TableHead className="w-[120px] text-[10px] font-bold uppercase tracking-wider text-muted-foreground py-3">Preço</TableHead>
              <TableHead className="w-[80px] text-[10px] font-bold uppercase tracking-wider text-muted-foreground py-3 text-center">Status</TableHead>
              <TableHead className="w-[100px] text-[10px] font-bold uppercase tracking-wider text-muted-foreground py-3 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={6} className="h-12 animate-pulse bg-muted/20" />
                </TableRow>
              ))
            ) : filteredProducts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground text-sm">
                  Nenhum produto encontrado.
                </TableCell>
              </TableRow>
            ) : (
              filteredProducts.map(p => {
                const cat = categories.find(c => c.id === p.category_id);
                const isEditingPrice = editingPriceId === p.id;
                
                return (
                  <TableRow key={p.id} className="group hover:bg-muted/20">
                    <TableCell className="py-2 text-[11px] font-mono text-muted-foreground">
                      {p.code || "—"}
                    </TableCell>
                    <TableCell className="py-2">
                      <div className="flex flex-col">
                        <span className="font-bold text-secondary text-sm leading-none">{p.name}</span>
                        {p.type && p.type !== 'simple' && (
                          <span className="text-[9px] uppercase font-bold text-primary mt-1">{p.type}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-2 text-xs text-muted-foreground">
                      {cat?.name || "—"}
                    </TableCell>
                    <TableCell className="py-2">
                      {isEditingPrice ? (
                        <div className="flex items-center gap-1">
                          <Input 
                            autoFocus
                            className="h-7 w-20 text-[11px] px-1.5"
                            value={tempPrice}
                            onChange={e => setTempPrice(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleSavePrice(p);
                              if (e.key === 'Escape') setEditingPriceId(null);
                            }}
                          />
                          <Button size="icon" variant="ghost" className="h-6 w-6 text-success" onClick={() => handleSavePrice(p)}>
                            <Check className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <div 
                          className={cn(
                            "text-sm font-bold tabular-nums cursor-pointer hover:text-primary transition-colors flex items-center gap-1",
                            !canEdit && "cursor-default hover:text-inherit"
                          )}
                          onClick={() => {
                            if (canEdit) {
                              setEditingPriceId(p.id);
                              setTempPrice((p.price_cents / 100).toFixed(2).replace('.', ','));
                            }
                          }}
                        >
                          {centsToBRL(p.price_cents)}
                          {canEdit && <Edit2 className="w-3 h-3 opacity-0 group-hover:opacity-40" />}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="py-2 text-center">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className={cn(
                          "h-7 w-7 rounded-full",
                          p.active ? "text-success hover:bg-success/10" : "text-muted-foreground hover:bg-muted"
                        )}
                        onClick={() => handleToggleActive(p)}
                        disabled={!canEdit}
                      >
                        <Power className="w-3.5 h-3.5" />
                      </Button>
                    </TableCell>
                    <TableCell className="py-2 text-right">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 rounded-lg"
                        onClick={() => {
                          setSelectedProduct(p);
                          setSheetOpen(true);
                        }}
                      >
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <ProductSheet 
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        product={selectedProduct}
        categories={categories}
        onSaved={refresh}
        canEdit={canEdit}
      />
    </div>
  );
}

function ProductSheet({
  open,
  onOpenChange,
  product,
  categories,
  onSaved,
  canEdit
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  product: Product | null;
  categories: Category[];
  onSaved: () => void;
  canEdit: boolean;
}) {
  const { currentRestaurantId, currentMembership } = useRestaurant();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [type, setType] = useState<string>("simple");
  const [trackStock, setTrackStock] = useState(false);
  const [stockQuantity, setStockQuantity] = useState("0");
  const [lowStockAlert, setLowStockAlert] = useState("");
  const [allowOutOfStockSale, setAllowOutOfStockSale] = useState(false);
  const [ncm, setNcm] = useState("");
  const [cest, setCest] = useState("");
  const [cfop, setCfop] = useState("");
  const [cst, setCst] = useState("");
  const [csosn, setCsosn] = useState("");
  const [origin, setOrigin] = useState("");
  const [fiscalUnit, setFiscalUnit] = useState("");
  const [fiscalNotes, setFiscalNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const inventoryEnabled = currentMembership?.restaurants.inventory_enabled;
  const accountingEnabled = currentMembership?.restaurants.accounting_reports_enabled;

  useEffect(() => {
    if (product) {
      setName(product.name);
      setCode(product.code || "");
      setDescription(product.description ?? "");
      setPrice((product.price_cents / 100).toFixed(2).replace(".", ","));
      setCost((product.cost_cents / 100).toFixed(2).replace(".", ","));
      setCategoryId(product.category_id);
      setType(product.type || "simple");
      setTrackStock(product.track_stock ?? false);
      setStockQuantity(product.stock_quantity?.toString() || "0");
      setLowStockAlert(product.low_stock_alert?.toString() || "");
      setAllowOutOfStockSale(product.allow_out_of_stock_sale ?? false);
    } else {
      setName(""); setCode(""); setDescription(""); setPrice(""); setCost(""); setCategoryId(null); setType("simple");
      setTrackStock(false); setStockQuantity("0"); setLowStockAlert(""); setAllowOutOfStockSale(false);
    }
  }, [product, open]);

  async function handleSave() {
    if (!currentRestaurantId || !currentMembership) return;
    if (!name.trim()) {
      toast({ title: "Nome obrigatório", variant: "destructive" });
      return;
    }
    let priceCents: number, costCents: number;
    try {
      priceCents = parseBRLToCents(price);
      costCents = parseBRLToCents(cost);
    } catch (e) {
      toast({ title: "Valor inválido", description: (e as Error).message, variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      name: name.trim(),
      code: code.trim() || null,
      description: description.trim() || null,
      price_cents: priceCents,
      cost_cents: costCents,
      category_id: categoryId,
      type: type as any,
      track_stock: trackStock,
      stock_quantity: Number(stockQuantity.replace(',', '.')) || 0,
      low_stock_alert: lowStockAlert ? Number(lowStockAlert.replace(',', '.')) : null,
      allow_out_of_stock_sale: allowOutOfStockSale,
    };
    
    const res = product
      ? await updateProduct(product.id, payload)
      : await createProduct({
          ...payload,
          tenant_id: currentMembership.tenant_id,
          restaurant_id: currentRestaurantId,
        });
        
    setSaving(false);
    if (res.error) {
      toast({ title: "Erro", description: res.error.message, variant: "destructive" });
      return;
    }
    toast({ title: product ? "Produto atualizado" : "Produto criado" });
    onOpenChange(false);
    onSaved();
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg w-full overflow-y-auto">
        <SheetHeader className="mb-6">
          <SheetTitle className="text-xl font-bold flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            {product ? "Editar Produto" : "Novo Produto"}
          </SheetTitle>
          <SheetDescription>
            {product ? `Editando ${product.name}` : "Preencha as informações do novo item."}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 pb-20">
          <div className="space-y-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="code" className="text-right text-xs font-bold uppercase tracking-wider text-muted-foreground">Cód</Label>
              <Input id="code" value={code} onChange={e => setCode(e.target.value)} className="col-span-3 h-10" placeholder="Ex: BURG-01" disabled={!canEdit} />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right text-xs font-bold uppercase tracking-wider text-muted-foreground">Nome</Label>
              <Input id="name" value={name} onChange={e => setName(e.target.value)} className="col-span-3 h-10 font-bold" disabled={!canEdit} />
            </div>
            <div className="grid grid-cols-4 items-start gap-4">
              <Label htmlFor="desc" className="text-right text-xs font-bold uppercase tracking-wider text-muted-foreground pt-3">Descrição</Label>
              <Textarea id="desc" value={description} onChange={e => setDescription(e.target.value)} className="col-span-3 min-h-[100px]" disabled={!canEdit} />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right text-xs font-bold uppercase tracking-wider text-muted-foreground">Categoria</Label>
              <div className="col-span-3">
                <Select value={categoryId ?? "__none"} onValueChange={v => setCategoryId(v === "__none" ? null : v)} disabled={!canEdit}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Sem categoria</SelectItem>
                    {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right text-xs font-bold uppercase tracking-wider text-muted-foreground">Tipo</Label>
              <div className="col-span-3">
                <Select value={type} onValueChange={setType} disabled={!canEdit}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="simple">Simples (Preço único)</SelectItem>
                    <SelectItem value="variable">Variável (Tamanhos)</SelectItem>
                    <SelectItem value="pizza">Pizza (Sabores/Bordas)</SelectItem>
                    <SelectItem value="combo">Combo (Escolhas)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block text-center">Preço Venda (R$)</Label>
                <Input value={price} onChange={e => setPrice(e.target.value)} className="h-12 text-center text-lg font-bold text-success" placeholder="0,00" disabled={!canEdit} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block text-center">Custo (R$)</Label>
                <Input value={cost} onChange={e => setCost(e.target.value)} className="h-12 text-center text-lg font-bold text-muted-foreground" placeholder="0,00" disabled={!canEdit} />
              </div>
            </div>

            {inventoryEnabled && (
              <>
                <Separator className="my-2" />
                <div className="space-y-4 pt-2">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-bold">Controlar estoque</Label>
                      <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight">Ativar rastreio para este produto</p>
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
                        <Label htmlFor="stock" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Qtd Atual</Label>
                        <Input 
                          id="stock" 
                          type="number"
                          value={stockQuantity} 
                          onChange={e => setStockQuantity(e.target.value)} 
                          className="h-9 font-bold tabular-nums" 
                          disabled={!canEdit} 
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="alert" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Alerta Baixo</Label>
                        <Input 
                          id="alert" 
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
                          <p className="text-[9px] text-muted-foreground">Permitir venda mesmo se zerado</p>
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
          </div>
        </div>

        <SheetFooter className="absolute bottom-0 left-0 right-0 p-6 bg-white border-t border-border">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Cancelar</Button>
          {canEdit && (
            <Button className="flex-1 font-bold" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : "Salvar Alterações"}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
