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
import { Plus, Power } from "lucide-react";
import { Link } from "react-router-dom";

export default function CatalogProducts() {
  const { currentRestaurantId, currentMembership } = useRestaurant();
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [open, setOpen] = useState(false);

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

  return (
    <AppShell>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-mono-tag">catálogo</p>
          <h1 className="text-2xl font-semibold tracking-tight">Produtos</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/catalogo/categorias">Categorias</Link>
          </Button>
          {canEdit && (
            <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" /> Novo produto
            </Button>
          )}
        </div>
      </div>

      {!canEdit && (
        <div className="surface-panel mb-4 p-3 text-sm text-muted-foreground">
          Seu papel ({currentMembership?.role}) tem acesso somente leitura ao catálogo.
        </div>
      )}

      <div className="surface-panel overflow-hidden">
        {loading ? (
          <p className="p-4 text-sm text-muted-foreground">Carregando...</p>
        ) : products.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Nenhum produto cadastrado.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-mono-tag">
              <tr className="border-b border-border">
                <th className="px-4 py-2 text-left font-normal">Nome</th>
                <th className="px-4 py-2 text-left font-normal">Categoria</th>
                <th className="px-4 py-2 text-right font-normal">Preço</th>
                <th className="px-4 py-2 text-right font-normal">Custo</th>
                <th className="px-4 py-2 text-left font-normal">Status</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const cat = categories.find((c) => c.id === p.category_id);
                return (
                  <tr key={p.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 font-medium">{p.name}</td>
                    <td className="px-4 py-2 text-muted-foreground">{cat?.name ?? "—"}</td>
                    <td className="px-4 py-2 text-right font-mono">{centsToBRL(p.price_cents)}</td>
                    <td className="px-4 py-2 text-right font-mono text-muted-foreground">
                      {centsToBRL(p.cost_cents)}
                    </td>
                    <td className="px-4 py-2">
                      <span className={p.active ? "text-mono-tag text-foreground" : "text-mono-tag text-muted-foreground"}>
                        {p.active ? "ativo" : "inativo"}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      {canEdit && (
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="ghost" onClick={() => { setEditing(p); setOpen(true); }}>
                            Editar
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleToggleActive(p)}>
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
        )}
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
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (product) {
      setName(product.name);
      setDescription(product.description ?? "");
      setPrice((product.price_cents / 100).toFixed(2).replace(".", ","));
      setCost((product.cost_cents / 100).toFixed(2).replace(".", ","));
      setCategoryId(product.category_id);
    } else {
      setName(""); setDescription(""); setPrice(""); setCost(""); setCategoryId(null);
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{product ? "Editar produto" : "Novo produto"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="p-name">Nome</Label>
            <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="p-desc">Descrição</Label>
            <Textarea id="p-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="p-price">Preço (R$)</Label>
              <Input id="p-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0,00" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="p-cost">Custo (R$)</Label>
              <Input id="p-cost" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0,00" />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Categoria</Label>
            <Select value={categoryId ?? "__none"} onValueChange={(v) => setCategoryId(v === "__none" ? null : v)}>
              <SelectTrigger><SelectValue placeholder="Sem categoria" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Sem categoria</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
