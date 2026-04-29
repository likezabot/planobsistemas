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
  DialogDescription,
  DialogTrigger
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { 
  Plus, 
  MapPin, 
  Trash2, 
  Edit2, 
  Loader2,
  AlertCircle
} from "lucide-react";
import { centsToBRL, parseBRLToCents } from "@/lib/catalog/money";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface DeliveryZone {
  id: string;
  name: string;
  description: string | null;
  fee_cents: number;
  active: boolean;
  sort_order: number;
}

export default function DeliverySettings() {
  const { currentRestaurantId } = useRestaurant();
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingZone, setEditingZone] = useState<Partial<DeliveryZone> | null>(null);

  const { data: zones, isLoading } = useQuery({
    queryKey: ["delivery-zones", currentRestaurantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_zones")
        .select("*")
        .eq("restaurant_id", currentRestaurantId!)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

      if (error) throw error;
      return data as DeliveryZone[];
    },
    enabled: !!currentRestaurantId,
  });

  const saveMutation = useMutation({
    mutationFn: async (zone: Partial<DeliveryZone>) => {
      const payload = {
        name: zone.name!,
        description: zone.description,
        fee_cents: zone.fee_cents || 0,
        active: zone.active ?? true,
        sort_order: zone.sort_order || 0
      };

      if (zone.id) {
        const { error } = await supabase
          .from("delivery_zones")
          .update(payload)
          .eq("id", zone.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("delivery_zones")
          .insert({
            ...payload,
            restaurant_id: currentRestaurantId!
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["delivery-zones"] });
      toast.success("Zona de entrega salva!");
      setIsModalOpen(false);
      setEditingZone(null);
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao salvar zona");
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("delivery_zones")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["delivery-zones"] });
      toast.success("Zona excluída!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao excluir zona");
    }
  });

  const handleEdit = (zone: DeliveryZone) => {
    setEditingZone(zone);
    setIsModalOpen(true);
  };

  const handleCreate = () => {
    setEditingZone({
      name: "",
      description: "",
      fee_cents: 0,
      active: true,
      sort_order: 0
    });
    setIsModalOpen(true);
  };

  return (
    <AppShell>
      <div className="flex flex-col gap-8 animate-in fade-in duration-500">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-secondary tracking-tight">Gestão de Entregas</h1>
            <p className="text-muted-foreground text-sm mt-1">Configure taxas de entrega por bairro ou região.</p>
          </div>
          <Button onClick={handleCreate} className="rounded-lg font-bold gap-2">
            <Plus className="w-4 h-4" />
            Nova Zona
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : !zones || zones.length === 0 ? (
          <div className="bg-white border-2 border-dashed border-border p-20 text-center rounded-2xl opacity-40">
            <MapPin className="w-12 h-12 mx-auto mb-4" />
            <p className="font-bold text-lg">Nenhuma zona configurada</p>
            <p className="text-sm">Crie zonas para cobrar taxas automáticas no checkout.</p>
          </div>
        ) : (
          <div className="bg-white border border-border rounded-xl overflow-hidden shadow-sm">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="font-bold text-secondary">Nome</TableHead>
                  <TableHead className="font-bold text-secondary">Taxa</TableHead>
                  <TableHead className="font-bold text-secondary">Status</TableHead>
                  <TableHead className="font-bold text-secondary text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {zones.map((zone) => (
                  <TableRow key={zone.id} className="group hover:bg-muted/30 transition-colors">
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-bold text-secondary">{zone.name}</span>
                        {zone.description && <span className="text-xs text-muted-foreground line-clamp-1">{zone.description}</span>}
                      </div>
                    </TableCell>
                    <TableCell className="font-bold text-primary">{centsToBRL(zone.fee_cents)}</TableCell>
                    <TableCell>
                      <span className={cn(
                        "text-[10px] font-black uppercase px-2 py-0.5 rounded-full border",
                        zone.active ? "bg-success/10 text-success border-success/20" : "bg-muted text-muted-foreground border-border"
                      )}>
                        {zone.active ? "Ativa" : "Inativa"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(zone)} className="h-8 w-8 rounded-lg hover:bg-secondary hover:text-white">
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(zone.id)} className="h-8 w-8 rounded-lg hover:bg-destructive hover:text-white">
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
              <MapPin className="w-5 h-5 text-primary" />
              {editingZone?.id ? "Editar Zona" : "Nova Zona de Entrega"}
            </DialogTitle>
            <DialogDescription className="text-white/60">
              Defina o nome e o valor da taxa para esta região.
            </DialogDescription>
          </DialogHeader>

          <div className="p-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-xs font-black uppercase tracking-widest text-muted-foreground">Nome da Zona</Label>
              <Input 
                id="name" 
                placeholder="Ex: Centro, Bairro Nobre, Região Leste"
                value={editingZone?.name || ""}
                onChange={(e) => setEditingZone(prev => ({ ...prev!, name: e.target.value }))}
                className="rounded-lg h-11"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description" className="text-xs font-black uppercase tracking-widest text-muted-foreground">Descrição (Opcional)</Label>
              <Textarea 
                id="description" 
                placeholder="Ex: Atendemos em 30-50 minutos nesta região"
                value={editingZone?.description || ""}
                onChange={(e) => setEditingZone(prev => ({ ...prev!, description: e.target.value }))}
                className="rounded-lg min-h-[80px]"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="fee" className="text-xs font-black uppercase tracking-widest text-muted-foreground">Taxa de Entrega (R$)</Label>
                <Input 
                  id="fee" 
                  type="number"
                  step="0.01"
                  placeholder="0,00"
                  value={editingZone ? (editingZone.fee_cents || 0) / 100 : ""}
                  onChange={(e) => setEditingZone(prev => ({ ...prev!, fee_cents: brlToCents(e.target.value) }))}
                  className="rounded-lg h-11"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sort" className="text-xs font-black uppercase tracking-widest text-muted-foreground">Ordem</Label>
                <Input 
                  id="sort" 
                  type="number"
                  placeholder="0"
                  value={editingZone?.sort_order ?? ""}
                  onChange={(e) => setEditingZone(prev => ({ ...prev!, sort_order: parseInt(e.target.value) || 0 }))}
                  className="rounded-lg h-11"
                />
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-muted/30 rounded-xl border border-border">
              <div className="flex flex-col">
                <Label htmlFor="active" className="text-sm font-bold text-secondary">Zona Ativa</Label>
                <span className="text-[10px] text-muted-foreground">Desative para pausar entregas nesta região</span>
              </div>
              <Switch 
                id="active"
                checked={editingZone?.active ?? true}
                onCheckedChange={(checked) => setEditingZone(prev => ({ ...prev!, active: checked }))}
              />
            </div>
          </div>

          <DialogFooter className="p-6 bg-muted/10 border-t border-border gap-2">
            <Button variant="ghost" onClick={() => setIsModalOpen(false)} className="rounded-lg font-bold">Cancelar</Button>
            <Button 
              className="rounded-lg h-11 font-bold bg-primary text-white min-w-[120px]"
              disabled={!editingZone?.name || saveMutation.isPending}
              onClick={() => saveMutation.mutate(editingZone!)}
            >
              {saveMutation.isPending ? <Loader2 className="animate-spin w-4 h-4" /> : "Salvar Alterações"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
