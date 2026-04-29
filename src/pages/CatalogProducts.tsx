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
  Edit2, 
  Image as ImageIcon,
  Tag,
  DollarSign,
  TrendingDown,
  Package,
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
      <div className="flex flex-col gap-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Catálogo de Produtos</h1>
            <p className="text-gray-400 text-sm mt-1">Gerencie seu cardápio, preços e disponibilidade.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" className="rounded-lg border-gray-700 h-10">
              <Link to="/catalogo/categorias">
                <Tag className="w-4 h-4 mr-2" />
                Categorias
              </Link>
            </Button>
            {canEdit && (
              <Button className="rounded-lg h-10 shadow-sm" onClick={() => { setEditing(null); setOpen(true); }}>
                <Plus className="w-4 h-4 mr-2" /> 
                Novo Produto
              </Button>
            )}
          </div>
        </div>

        {/* Search and Filters */}
        <div className="flex flex-col md:flex-row gap-4 items-center bg-gray-800 p-4 rounded-xl border border-gray-700 shadow-sm">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input 
              placeholder="Buscar produtos..." 
              className="w-full h-10 pl-10 pr-4 rounded-lg border border-gray-700 bg-[#F8FAFC] text-sm focus:outline-none focus:ring-2 focus:ring-primary transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3 w-full md:w-auto">
            <Filter className="w-4 h-4 text-gray-400 hidden md:block" />
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="h-10 w-full md:w-48 rounded-lg border-gray-700 bg-[#F8FAFC] text-sm">
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

        {/* Product Grid */}
        <div className="min-h-[400px]">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="h-48 bg-muted rounded-xl animate-pulse" />)}
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center py-20 bg-gray-800 rounded-xl border border-dashed border-gray-700">
              <Package className="w-12 h-12 mx-auto mb-4 opacity-10 text-white" />
              <p className="text-gray-400 text-sm">Nenhum produto encontrado.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredProducts.map((p) => {
                const cat = categories.find((c) => c.id === p.category_id);
                return (
                  <div key={p.id} className="bg-gray-800 rounded-xl border border-gray-700 shadow-sm hover:shadow-md transition-shadow group flex flex-col overflow-hidden">
                    <div className="aspect-video w-full bg-muted relative overflow-hidden shrink-0">
                      {p.image_url ? (
                        <img src={p.image_url} alt={p.name} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ImageIcon className="w-8 h-8 text-gray-400 opacity-20" />
                        </div>
                      )}
                      <div className="absolute top-2 right-2">
                        <Badge variant={p.active ? "secondary" : "outline"} className={cn(
                          "rounded-full px-2 py-0.5 uppercase text-[9px] font-bold tracking-widest border-none shadow-sm",
                          p.active ? "bg-success text-white" : "bg-muted text-gray-400"
                        )}>
                          {p.active ? "Ativo" : "Inativo"}
                        </Badge>
                      </div>
                    </div>
                    
                    <div className="p-4 flex-1 flex flex-col">
                      <div className="flex justify-between items-start gap-2 mb-2">
                        <div className="min-w-0">
                          <h3 className="font-bold text-white text-sm leading-tight group-hover:text-primary transition-colors truncate">{p.name}</h3>
                          {cat && (
                            <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">{cat.name}</span>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-bold text-white text-sm tabular-nums">{centsToBRL(p.price_cents)}</p>
                          <p className="text-[9px] text-gray-400 tabular-nums">Custo: {centsToBRL(p.cost_cents)}</p>
                        </div>
                      </div>

                      {p.description && (
                        <p className="text-xs text-gray-400 line-clamp-2 mb-4 leading-relaxed">{p.description}</p>
                      )}

                      <div className="mt-auto pt-3 border-t border-gray-700 flex justify-between items-center">
                        <div className="flex gap-1">
                          {p.type && p.type !== 'simple' && (
                            <Badge variant="outline" className="text-[9px] h-4 font-bold uppercase tracking-tighter bg-muted border-none">
                              {p.type}
                            </Badge>
                          )}
                        </div>
                        
                        <div className="flex gap-1">
                          {canEdit && (
                            <>
                              <Button 
                                size="icon" 
                                variant="ghost" 
                                className="h-8 w-8 rounded-lg hover:bg-muted"
                                onClick={() => { setEditing(p); setOpen(true); }}
                              >
                                <Edit2 className="h-3.5 w-3.5 text-white" />
                              </Button>
                              <Button 
                                size="icon" 
                                variant="ghost" 
                                className={cn(
                                  "h-8 w-8 rounded-lg hover:bg-muted transition-colors",
                                  p.active ? "text-success hover:text-destructive" : "text-gray-400 hover:text-success"
                                )}
                                onClick={() => handleToggleActive(p)}
                              >
                                <Power className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
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
      <DialogContent className="max-w-xl rounded-2xl p-0 overflow-hidden border-none shadow-xl">
        <DialogHeader className="p-6 bg-secondary text-white">
          <DialogTitle className="text-xl font-bold">
            {product ? "Editar Produto" : "Novo Produto"}
          </DialogTitle>
          <DialogDescription className="text-white/60 text-sm">
            {product ? `Editando ${product.name}` : "Preencha as informações do novo item."}
          </DialogDescription>
        </DialogHeader>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="p-name" className="text-xs font-bold text-white uppercase tracking-wider">Nome do Produto</Label>
                <Input 
                  id="p-name" 
                  value={name} 
                  onChange={(e) => setName(e.target.value)} 
                  className="h-10 rounded-lg border-gray-700 focus:ring-primary"
                  placeholder="Ex: Hambúrguer de Costela"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-desc" className="text-xs font-bold text-white uppercase tracking-wider">Descrição / Ingredientes</Label>
                <Textarea 
                  id="p-desc" 
                  value={description} 
                  onChange={(e) => setDescription(e.target.value)} 
                  rows={3} 
                  className="rounded-lg border-gray-700 focus:ring-primary text-sm"
                  placeholder="Detalhes que ajudam o cliente..."
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="p-price" className="text-xs font-bold text-white uppercase tracking-wider">Preço (R$)</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <Input 
                      id="p-price" 
                      inputMode="decimal" 
                      value={price} 
                      onChange={(e) => setPrice(e.target.value)} 
                      placeholder="0,00" 
                      className="h-10 pl-9 rounded-lg border-gray-700 focus:ring-primary font-bold text-sm"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="p-cost" className="text-xs font-bold text-white uppercase tracking-wider">Custo (R$)</Label>
                  <div className="relative">
                    <TrendingDown className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <Input 
                      id="p-cost" 
                      inputMode="decimal" 
                      value={cost} 
                      onChange={(e) => setCost(e.target.value)} 
                      placeholder="0,00" 
                      className="h-10 pl-9 rounded-lg border-gray-700 focus:ring-primary text-xs"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-white uppercase tracking-wider">Categoria</Label>
                <Select value={categoryId ?? "__none"} onValueChange={(v) => setCategoryId(v === "__none" ? null : v)}>
                  <SelectTrigger className="h-10 rounded-lg border-gray-700 text-sm bg-[#F8FAFC]">
                    <SelectValue placeholder="Selecione categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none" className="text-sm italic">Sem categoria</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id} className="text-sm">{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-white uppercase tracking-wider">Tipo de Produto</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger className="h-10 rounded-lg border-gray-700 text-sm bg-[#F8FAFC]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="simple" className="text-sm">Simples (Item único)</SelectItem>
                    <SelectItem value="variant" className="text-sm">Com Variações (Tamanho, Sabor...)</SelectItem>
                    <SelectItem value="combo" className="text-sm">Combo / Oferta</SelectItem>
                    <SelectItem value="pizza" className="text-sm">Pizza (Múltiplos Sabores)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="p-6 bg-[#F8FAFC] border-t border-gray-700 gap-2">
          <Button variant="ghost" className="rounded-lg font-bold" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button 
            className="rounded-lg h-10 font-bold px-8 shadow-sm min-w-[120px]"
            disabled={saving}
            onClick={handleSave}
          >
            {saving ? "Salvando..." : "Salvar Alterações"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
