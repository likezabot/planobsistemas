import { useEffect, useState, useCallback } from "react";
import { AppShell } from "@/components/AppShell";
import { useRestaurant } from "@/lib/auth/RestaurantProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  DialogDescription
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  listProducts,
  listCategories,
  createProduct,
  updateProduct,
  setProductActive,
  type Product,
  type Category,
} from "@/lib/catalog/queries";
import { centsToBRL, parseBRLToCents, isAdminRole } from "@/lib/catalog/money";
import { 
  Plus, 
  Power, 
  Search, 
  Filter, 
  MoreVertical, 
  Edit2, 
  Image as ImageIcon,
  Tag,
  DollarSign,
  TrendingDown,
  ChevronRight,
  Package,
  Loader2
} from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export default function CatalogProducts() {
  const { currentRestaurantId, currentMembership } = useRestaurant();
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  const canEdit = isAdminRole(currentMembership?.role);

  useEffect(() => {
    document.title = "Produtos — Catálogo";
  }, []);

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

  async function handleToggleActive(p: Product) {
    if (!canEdit) return;
    const { error } = await setProductActive(p.id, !p.active);
    if (error) {
      toast({ title: "Falhou", description: error.message, variant: "destructive" });
    } else {
      toast({ title: p.active ? "Produto desativado" : "Produto ativado" });
      refresh();
    }
  }

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === "all" || p.category_id === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <AppShell>
      <div className="flex flex-col gap-8">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-secondary">Catálogo de Produtos</h1>
            <p className="text-muted-foreground font-medium mt-1">Gerencie seu cardápio, preços e disponibilidade.</p>
          </div>
          <div className="flex items-center gap-3">
            <Button asChild variant="outline" className="rounded-xl border-border h-12">
              <Link to="/catalogo/categorias">
                <Tag className="w-4 h-4 mr-2" />
                Categorias
              </Link>
            </Button>
            {canEdit && (
              <Button className="rounded-xl h-12 shadow-button" onClick={() => { setEditing(null); setOpen(true); }}>
                <Plus className="w-4 h-4 mr-2" /> 
                Novo Produto
              </Button>
            )}
          </div>
        </div>

        {!canEdit && (
          <div className="bg-muted/50 border border-border p-4 rounded-2xl flex items-center gap-3 text-sm text-muted-foreground">
            <Package className="w-5 h-5 opacity-40" />
            <p>Seu perfil tem acesso somente leitura. Para alterações, contate um administrador.</p>
          </div>
        )}

        {/* Search and Filters */}
        <div className="flex flex-col md:flex-row gap-4 items-center">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Buscar por nome do produto..." 
              className="h-12 pl-11 rounded-2xl border-border bg-card shadow-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3 w-full md:w-auto">
            <Filter className="w-4 h-4 text-muted-foreground hidden md:block" />
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="h-12 w-full md:w-48 rounded-2xl border-border bg-card shadow-sm">
                <SelectValue placeholder="Todas categorias" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas categorias</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Product List/Table */}
        <div className="bg-card rounded-[2.5rem] border border-border shadow-card overflow-hidden">
          {loading ? (
            <div className="p-12 space-y-4">
              {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-16 bg-muted rounded-2xl animate-pulse" />)}
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center py-32">
              <Package className="w-16 h-16 mx-auto mb-4 opacity-10 text-secondary" />
              <p className="text-muted-foreground font-medium">Nenhum produto encontrado.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-muted/30 border-b border-border">
                    <th className="px-8 py-5 text-left text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Produto</th>
                    <th className="px-6 py-5 text-left text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Categoria</th>
                    <th className="px-6 py-5 text-right text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Preço</th>
                    <th className="px-6 py-5 text-right text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Custo</th>
                    <th className="px-6 py-5 text-center text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Status</th>
                    <th className="px-8 py-5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredProducts.map((p) => {
                    const cat = categories.find((c) => c.id === p.category_id);
                    return (
                      <tr key={p.id} className="hover:bg-muted/20 transition-colors group">
                        <td className="px-8 py-5">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center overflow-hidden border border-border/50">
                              {p.image_url ? (
                                <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                              ) : (
                                <ImageIcon className="w-5 h-5 text-muted-foreground opacity-30" />
                              )}
                            </div>
                            <div>
                              <p className="font-bold text-secondary">{p.name}</p>
                              {p.type && <Badge variant="outline" className="text-[9px] h-4 mt-1 font-bold uppercase tracking-tighter">{p.type}</Badge>}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          {cat ? (
                            <Badge className="bg-secondary/10 text-secondary border-none font-bold text-[10px] rounded-lg">
                              {cat.name}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs italic">Sem categoria</span>
                          )}
                        </td>
                        <td className="px-6 py-5 text-right">
                          <span className="font-bold text-secondary tabular-nums">{centsToBRL(p.price_cents)}</span>
                        </td>
                        <td className="px-6 py-5 text-right">
                          <span className="text-xs font-medium text-muted-foreground tabular-nums">{centsToBRL(p.cost_cents)}</span>
                        </td>
                        <td className="px-6 py-5 text-center">
                          <Badge variant={p.active ? "secondary" : "outline"} className={cn(
                            "rounded-full px-2 py-0.5 uppercase text-[9px] font-bold tracking-widest",
                            p.active ? "bg-success/10 text-success border-success/20" : "bg-muted text-muted-foreground opacity-50"
                          )}>
                            {p.active ? "Ativo" : "Inativo"}
                          </Badge>
                        </td>
                        <td className="px-8 py-5 text-right">
                          {canEdit && (
                            <div className="flex justify-end gap-2">
                              <Button 
                                size="icon" 
                                variant="ghost" 
                                className="rounded-xl hover:bg-white hover:shadow-sm"
                                onClick={() => { setEditing(p); setOpen(true); }}
                              >
                                <Edit2 className="h-4 w-4 text-secondary" />
                              </Button>
                              <Button 
                                size="icon" 
                                variant="ghost" 
                                className={cn(
                                  "rounded-xl hover:bg-white hover:shadow-sm",
                                  p.active ? "text-success hover:text-destructive" : "text-muted-foreground hover:text-success"
                                )}
                                onClick={() => handleToggleActive(p)}
                              >
                                <Power className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <ProductDialog
        open={open}
        onOpenChange={setOpen}
        product={editing}
        categories={categories}
        onSaved={refresh}
      />
    </AppShell>
  );
}

function ProductDialog({
  open,
  onOpenChange,
  product,
  categories,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  product: Product | null;
  categories: Category[];
  onSaved: () => void;
}) {
  const { currentRestaurantId, currentMembership } = useRestaurant();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [type, setType] = useState<string>("simple");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (product) {
      setName(product.name);
      setDescription(product.description ?? "");
      setPrice((product.price_cents / 100).toFixed(2).replace(".", ","));
      setCost((product.cost_cents / 100).toFixed(2).replace(".", ","));
      setCategoryId(product.category_id);
      setType(product.type || "simple");
    } else {
      setName(""); setDescription(""); setPrice(""); setCost(""); setCategoryId(null); setType("simple");
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
      description: description.trim() || null,
      price_cents: priceCents,
      cost_cents: costCents,
      category_id: categoryId,
      type: type as any,
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl rounded-[2.5rem] p-0 overflow-hidden border-none shadow-premium">
        <DialogHeader className="p-8 bg-secondary text-white">
          <DialogTitle className="text-2xl font-display font-bold">
            {product ? "Editar Produto" : "Novo Produto"}
          </DialogTitle>
          <DialogDescription className="text-white/60">
            {product ? `Editando ${product.name}` : "Preencha as informações para adicionar um novo item ao cardápio."}
          </DialogDescription>
        </DialogHeader>

        <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="p-name" className="font-bold text-secondary">Nome do Produto</Label>
              <Input 
                id="p-name" 
                value={name} 
                onChange={(e) => setName(e.target.value)} 
                className="h-12 rounded-xl border-border focus:ring-primary"
                placeholder="Ex: Hambúrguer de Costela"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-desc" className="font-bold text-secondary">Descrição / Ingredientes</Label>
              <Textarea 
                id="p-desc" 
                value={description} 
                onChange={(e) => setDescription(e.target.value)} 
                rows={4} 
                className="rounded-xl border-border focus:ring-primary"
                placeholder="Detalhes que ajudam o cliente a escolher..."
              />
            </div>
          </div>

          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="p-price" className="font-bold text-secondary">Preço Venda (R$)</Label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input 
                    id="p-price" 
                    inputMode="decimal" 
                    value={price} 
                    onChange={(e) => setPrice(e.target.value)} 
                    placeholder="0,00" 
                    className="h-12 pl-10 rounded-xl border-border focus:ring-primary font-bold"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="p-cost" className="font-bold text-secondary">Custo Médio (R$)</Label>
                <div className="relative">
                  <TrendingDown className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input 
                    id="p-cost" 
                    inputMode="decimal" 
                    value={cost} 
                    onChange={(e) => setCost(e.target.value)} 
                    placeholder="0,00" 
                    className="h-12 pl-10 rounded-xl border-border focus:ring-primary text-muted-foreground"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="font-bold text-secondary">Categoria</Label>
              <Select value={categoryId ?? "__none"} onValueChange={(v) => setCategoryId(v === "__none" ? null : v)}>
                <SelectTrigger className="h-12 rounded-xl border-border"><SelectValue placeholder="Sem categoria" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Sem categoria</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="font-bold text-secondary">Tipo de Produto</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="h-12 rounded-xl border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="simple">Simples</SelectItem>
                  <SelectItem value="variation">Com Variações</SelectItem>
                  <SelectItem value="combo">Combo</SelectItem>
                  <SelectItem value="pizza">Pizza</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter className="p-8 bg-muted/50 gap-2 border-t border-border">
          <Button variant="ghost" className="rounded-xl font-bold" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button 
            onClick={handleSave} 
            disabled={saving}
            className="rounded-xl h-12 px-8 font-bold shadow-premium"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            {product ? "Salvar Alterações" : "Criar Produto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}