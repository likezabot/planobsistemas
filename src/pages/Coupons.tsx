import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useRestaurant } from "@/lib/auth/RestaurantProvider";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  DialogDescription
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { 
  Plus, 
  Ticket, 
  Trash2, 
  Edit2, 
  Loader2,
  Calendar
} from "lucide-react";
import { centsToBRL, parseBRLToCents } from "@/lib/catalog/money";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Info } from "lucide-react";

function InfoBalloon({ text }: { text: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="inline-flex items-center justify-center ml-1 cursor-help text-primary hover:text-primary/80 transition-colors">
            <Info className="w-3.5 h-3.5" />
          </div>
        </TooltipTrigger>
        <TooltipContent className="bg-secondary text-white border-none p-3 max-w-xs shadow-xl">
          <p className="text-xs leading-relaxed font-medium">{text}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
import { format } from "date-fns";

interface Coupon {
  id: string;
  code: string;
  name: string;
  type: 'percent' | 'fixed';
  value_cents: number | null;
  percent_value: number | null;
  min_order_cents: number;
  max_uses: number | null;
  used_count: number;
  active: boolean;
  valid_from: string | null;
  valid_until: string | null;
}

export default function Coupons() {
  const { currentRestaurantId } = useRestaurant();
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Partial<Coupon> | null>(null);

  const { data: coupons, isLoading } = useQuery({
    queryKey: ["coupons", currentRestaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coupons")
        .select("*")
        .eq("restaurant_id", currentRestaurantId!)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Coupon[];
    },
    enabled: !!currentRestaurantId,
  });

  const saveMutation = useMutation({
    mutationFn: async (coupon: Partial<Coupon>) => {
      const payload = {
        code: coupon.code?.toUpperCase(),
        name: coupon.name!,
        type: coupon.type!,
        value_cents: coupon.type === 'fixed' ? coupon.value_cents : null,
        percent_value: coupon.type === 'percent' ? coupon.percent_value : null,
        min_order_cents: coupon.min_order_cents || 0,
        max_uses: coupon.max_uses,
        active: coupon.active ?? true,
        valid_from: coupon.valid_from || null,
        valid_until: coupon.valid_until || null,
      };

      if (coupon.id) {
        const { error } = await supabase
          .from("coupons")
          .update(payload)
          .eq("id", coupon.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("coupons")
          .insert({
            ...payload,
            restaurant_id: currentRestaurantId!
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coupons"] });
      toast.success("Cupom salvo!");
      setIsModalOpen(false);
      setEditingCoupon(null);
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao salvar cupom");
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("coupons")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coupons"] });
      toast.success("Cupom excluído!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao excluir cupom");
    }
  });

  const handleEdit = (coupon: Coupon) => {
    setEditingCoupon(coupon);
    setIsModalOpen(true);
  };

  const handleCreate = () => {
    setEditingCoupon({
      code: "",
      name: "",
      type: "percent",
      percent_value: 0,
      value_cents: 0,
      min_order_cents: 0,
      active: true
    });
    setIsModalOpen(true);
  };

  return (
    <AppShell>
      <div className="flex flex-col gap-8 animate-in fade-in duration-500">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-secondary tracking-tight">Cupons de Desconto</h1>
              <InfoBalloon text="Os cupons permitem criar descontos em reais ou porcentagem para fidelizar clientes. Você pode definir regras de uso como valor mínimo do pedido ou data de expiração." />
            </div>
            <p className="text-muted-foreground text-sm mt-1">Gerencie campanhas promocionais e fidelize clientes.</p>
          </div>
          <Button onClick={handleCreate} className="rounded-lg font-bold gap-2">
            <Plus className="w-4 h-4" />
            Novo Cupom
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : !coupons || coupons.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center bg-white rounded-xl border border-border">
            <Ticket className="w-12 h-12 text-muted-foreground/30 mb-4" />
            <p className="text-base font-bold text-secondary"> Nenhum cupom ainda </p>
            <p className="text-sm text-muted-foreground mt-1 mb-6"> Crie cupons para oferecer descontos no seu cardápio e fidelizar clientes. </p>
            <Button size="sm" onClick={handleCreate}>
              <Plus className="w-4 h-4 mr-1.5" />
              Criar Primeiro Cupom
            </Button>
          </div>
        ) : (
          <div className="bg-white border border-border rounded-xl overflow-hidden shadow-sm">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="font-bold text-secondary">Código / Nome</TableHead>
                  <TableHead className="font-bold text-secondary">Valor</TableHead>
                  <TableHead className="font-bold text-secondary">Usos</TableHead>
                  <TableHead className="font-bold text-secondary">Status</TableHead>
                  <TableHead className="font-bold text-secondary text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {coupons.map((coupon) => (
                  <TableRow key={coupon.id} className="group hover:bg-muted/30 transition-colors">
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-black text-primary uppercase tracking-wider">{coupon.code}</span>
                        <span className="text-xs text-muted-foreground">{coupon.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-bold text-secondary">
                        {coupon.type === 'percent' ? `${coupon.percent_value}%` : centsToBRL(coupon.value_cents || 0)}
                      </span>
                      {coupon.min_order_cents > 0 && (
                        <p className="text-[10px] text-muted-foreground">Mín: {centsToBRL(coupon.min_order_cents)}</p>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm font-bold">{coupon.used_count}{coupon.max_uses ? ` / ${coupon.max_uses}` : ""}</span>
                        <div className="w-20 h-1 bg-muted rounded-full overflow-hidden mt-1">
                          <div 
                            className="h-full bg-secondary" 
                            style={{ width: `${coupon.max_uses ? Math.min((coupon.used_count / coupon.max_uses) * 100, 100) : 0}%` }} 
                          />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={cn(
                        "text-[10px] font-black uppercase px-2 py-0.5 rounded-full border",
                        coupon.active ? "bg-success/10 text-success border-success/20" : "bg-muted text-muted-foreground border-border"
                      )}>
                        {coupon.active ? "Ativo" : "Inativo"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(coupon)} className="h-8 w-8 rounded-lg hover:bg-secondary hover:text-white">
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(coupon.id)} className="h-8 w-8 rounded-lg hover:bg-destructive hover:text-white">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-md rounded-2xl border-none shadow-2xl overflow-hidden p-0">
          <DialogHeader className="p-6 bg-secondary text-white shrink-0">
            <DialogTitle className="text-xl font-bold uppercase tracking-tight flex items-center gap-2">
              <Ticket className="w-5 h-5 text-primary" />
              {editingCoupon?.id ? "Editar Cupom" : "Novo Cupom"}
            </DialogTitle>
            <DialogDescription className="text-white/60">
              Configure as regras do seu cupom de desconto.
            </DialogDescription>
          </DialogHeader>

          <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground">Código</Label>
                <Input 
                  placeholder="EX: PROMO20"
                  value={editingCoupon?.code || ""}
                  onChange={(e) => setEditingCoupon(prev => ({ ...prev!, code: e.target.value.toUpperCase() }))}
                  className="rounded-lg h-11 font-black"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground">Tipo</Label>
                <Select 
                  value={editingCoupon?.type} 
                  onValueChange={(val: any) => setEditingCoupon(prev => ({ ...prev!, type: val }))}
                >
                  <SelectTrigger className="h-11 rounded-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">Porcentagem (%)</SelectItem>
                    <SelectItem value="fixed">Valor Fixo (R$)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground">Nome Interno</Label>
              <Input 
                placeholder="Ex: Campanha de Inverno"
                value={editingCoupon?.name || ""}
                onChange={(e) => setEditingCoupon(prev => ({ ...prev!, name: e.target.value }))}
                className="rounded-lg h-11"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                  {editingCoupon?.type === 'percent' ? "Porcentagem (%)" : "Valor do Desconto (R$)"}
                </Label>
                <Input 
                  type="number"
                  placeholder="0"
                  value={editingCoupon?.type === 'percent' ? (editingCoupon.percent_value || 0) : (editingCoupon?.value_cents || 0) / 100}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (editingCoupon?.type === 'percent') {
                      setEditingCoupon(prev => ({ ...prev!, percent_value: parseFloat(val) || 0 }));
                    } else {
                      setEditingCoupon(prev => ({ ...prev!, value_cents: parseBRLToCents(val) }));
                    }
                  }}
                  className="rounded-lg h-11 font-bold"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground">Pedido Mínimo (R$)</Label>
                <Input 
                  type="number"
                  placeholder="0,00"
                  value={(editingCoupon?.min_order_cents || 0) / 100}
                  onChange={(e) => setEditingCoupon(prev => ({ ...prev!, min_order_cents: parseBRLToCents(e.target.value) }))}
                  className="rounded-lg h-11"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground">Limite de Usos</Label>
                <Input 
                  type="number"
                  placeholder="Ilimitado"
                  value={editingCoupon?.max_uses || ""}
                  onChange={(e) => setEditingCoupon(prev => ({ ...prev!, max_uses: parseInt(e.target.value) || null }))}
                  className="rounded-lg h-11"
                />
              </div>
              <div className="space-y-1.5 flex flex-col justify-end">
                <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border h-11">
                  <Label className="text-xs font-bold text-secondary">Ativo</Label>
                  <Switch 
                    checked={editingCoupon?.active ?? true}
                    onCheckedChange={(checked) => setEditingCoupon(prev => ({ ...prev!, active: checked }))}
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
               <div className="space-y-1.5">
                <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> Válido Até
                </Label>
                <Input 
                  type="datetime-local"
                  value={editingCoupon?.valid_until ? editingCoupon.valid_until.slice(0, 16) : ""}
                  onChange={(e) => setEditingCoupon(prev => ({ ...prev!, valid_until: e.target.value ? new Date(e.target.value).toISOString() : null }))}
                  className="rounded-lg h-11"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="p-6 bg-muted/10 border-t border-border gap-2">
            <Button variant="ghost" onClick={() => setIsModalOpen(false)} className="rounded-lg font-bold">Cancelar</Button>
            <Button 
              className="rounded-lg h-11 font-bold bg-primary text-white min-w-[120px]"
              disabled={!editingCoupon?.code || !editingCoupon?.name || saveMutation.isPending}
              onClick={() => saveMutation.mutate(editingCoupon!)}
            >
              {saveMutation.isPending ? <Loader2 className="animate-spin w-4 h-4" /> : "Salvar Alterações"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
