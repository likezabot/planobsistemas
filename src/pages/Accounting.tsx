import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useRestaurant } from "@/lib/auth/RestaurantProvider";
import { isAdminRole } from "@/lib/catalog/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  fetchAccountingRows,
  summarize,
  rowsToCSV,
  rowsToJSON,
  downloadFile,
  setAccountingEnabled,
  type AccountingOrderRow,
} from "@/lib/accounting/queries";
import { Calculator, Download, Loader2, FileJson, FileSpreadsheet } from "lucide-react";

const fmtBRL = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function Accounting() {
  const { currentMembership, refresh } = useRestaurant();
  const { toast } = useToast();
  const restaurantId = currentMembership?.restaurant_id ?? null;
  const enabled = currentMembership?.restaurants.accounting_reports_enabled ?? false;
  const isAdmin = isAdminRole(currentMembership?.role);
  const role = currentMembership?.role;
  const canView = isAdmin || role === "cashier";
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const [startDate, setStartDate] = useState(monthAgo);
  const [endDate, setEndDate] = useState(today);
  const [rows, setRows] = useState<AccountingOrderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    document.title = "Contador — Plano B";
  }, []);

  const summary = useMemo(() => summarize(rows), [rows]);
  const includePhone = isAdmin;

  async function handleLoad() {
    if (!restaurantId) return;
    setLoading(true);
    try {
      const r = await fetchAccountingRows({ restaurantId, startDate, endDate });
      setRows(r);
    } catch (e) {
      toast({ title: "Erro ao carregar", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle(next: boolean) {
    if (!restaurantId) return;
    setToggling(true);
    try {
      await setAccountingEnabled(restaurantId, next);
      await refresh();
      toast({ title: next ? "Módulo ativado" : "Módulo desativado" });
    } catch (e) {
      toast({ title: "Erro", description: (e as Error).message, variant: "destructive" });
    } finally {
      setToggling(false);
    }
  }

  function exportCSV() {
    const csv = rowsToCSV(rows, includePhone);
    downloadFile(`contador_${startDate}_a_${endDate}.csv`, "\uFEFF" + csv, "text/csv;charset=utf-8");
  }
  function exportJSON() {
    const j = rowsToJSON(rows, includePhone);
    downloadFile(`contador_${startDate}_a_${endDate}.json`, j, "application/json");
  }

  if (!restaurantId) {
    return (
      <AppShell>
        <div className="text-muted-foreground">Selecione um restaurante.</div>
      </AppShell>
    );
  }

  if (!canView) {
    return (
      <AppShell>
        <div className="max-w-md p-6 border border-border rounded-xl bg-white">
          <h1 className="text-xl font-bold text-secondary">Sem acesso</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Seu perfil não tem permissão para acessar relatórios contábeis.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-secondary flex items-center gap-2">
              <Calculator className="w-6 h-6 text-primary" />
              Contador
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Relatórios operacionais para conferência contábil. <strong>Não é cupom fiscal</strong>,
              não substitui o contador, não envia dados para SEFAZ e não gera documento fiscal oficial.
            </p>
          </div>
          {isAdmin && enabled && (
            <div className="flex items-center gap-2 text-xs">
              <span className="font-bold uppercase tracking-wider text-success">Ativo</span>
              <Switch checked={enabled} onCheckedChange={handleToggle} disabled={toggling} />
            </div>
          )}
        </div>

        {!enabled ? (
          <Card>
            <CardContent className="py-12 text-center space-y-4">
              <p className="text-base text-muted-foreground">
                Módulo de dados para contador desativado.
              </p>
              {isAdmin ? (
                <Button onClick={() => handleToggle(true)} disabled={toggling} className="font-bold">
                  {toggling ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Ativar módulo
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Peça a um responsável (owner/manager) para ativar.
                </p>
              )}
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm uppercase tracking-wider font-bold">Filtros</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold uppercase">De</Label>
                    <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold uppercase">Até</Label>
                    <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-9" />
                  </div>
                  <Button onClick={handleLoad} disabled={loading} className="h-9 font-bold">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Carregar
                  </Button>
                  <div className="ml-auto flex gap-2">
                    <Button variant="outline" onClick={exportCSV} disabled={!rows.length} className="h-9">
                      <FileSpreadsheet className="w-4 h-4 mr-1.5" />
                      Exportar CSV
                    </Button>
                    <Button variant="outline" onClick={exportJSON} disabled={!rows.length} className="h-9">
                      <FileJson className="w-4 h-4 mr-1.5" />
                      Exportar JSON
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat title="Total vendas" value={fmtBRL(summary.totalCents)} />
              <Stat title="Pedidos" value={String(summary.ordersCount)} />
              <Stat title="Cancelados" value={String(summary.cancelledCount)} />
              <Stat title="Itens" value={String(rows.filter(r => r.product_id).length)} />
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader><CardTitle className="text-sm uppercase tracking-wider font-bold">Por forma de pagamento</CardTitle></CardHeader>
                <CardContent>
                  <Table data={Object.entries(summary.byPayment).map(([k, v]) => ({
                    a: k, b: String(v.count), c: fmtBRL(v.totalCents),
                  }))} headers={["Forma", "Pedidos", "Total"]} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-sm uppercase tracking-wider font-bold">Por categoria</CardTitle></CardHeader>
                <CardContent>
                  <Table data={Object.values(summary.byCategory).map(c => ({ a: c.name, b: "", c: fmtBRL(c.totalCents) }))} headers={["Categoria", "", "Total"]} />
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader><CardTitle className="text-sm uppercase tracking-wider font-bold">Por produto</CardTitle></CardHeader>
              <CardContent>
                <Table
                  data={Object.values(summary.byProduct).map(p => ({
                    a: p.name, b: String(p.quantity), c: fmtBRL(p.totalCents),
                  }))}
                  headers={["Produto", "Qtd", "Total"]}
                />
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}

function Stat({ title, value }: { title: string; value: string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">{title}</p>
        <p className="text-xl font-bold text-secondary mt-1 tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

function Table({ data, headers }: { data: { a: string; b: string; c: string }[]; headers: [string, string, string] }) {
  if (!data.length) return <p className="text-xs text-muted-foreground">Sem dados.</p>;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-[10px] uppercase font-bold text-muted-foreground border-b">
          <th className="text-left py-2">{headers[0]}</th>
          <th className="text-right py-2">{headers[1]}</th>
          <th className="text-right py-2">{headers[2]}</th>
        </tr>
      </thead>
      <tbody>
        {data.map((r, i) => (
          <tr key={i} className="border-b last:border-0">
            <td className="py-2">{r.a}</td>
            <td className="py-2 text-right tabular-nums">{r.b}</td>
            <td className="py-2 text-right tabular-nums font-bold">{r.c}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
