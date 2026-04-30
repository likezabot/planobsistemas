import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, Wallet, CreditCard, Smartphone, Landmark, AlertCircle, TrendingUp, TrendingDown, Minus } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { useRestaurant } from "@/lib/auth/RestaurantProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { centsToBRL } from "@/lib/catalog/money";
import { cn } from "@/lib/utils";
import { getCashSessionsReport, type CashSessionReportRow } from "@/lib/cash/reportQueries";

type Preset = "today" | "yesterday" | "7d" | "30d" | "custom";

function rangeFromPreset(preset: Preset, custom: { from?: Date; to?: Date }) {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  if (preset === "today") {
    const to = new Date(start);
    to.setDate(to.getDate() + 1);
    return { from: start, to };
  }
  if (preset === "yesterday") {
    const from = new Date(start);
    from.setDate(from.getDate() - 1);
    return { from, to: start };
  }
  if (preset === "7d") {
    const from = new Date(start);
    from.setDate(from.getDate() - 6);
    const to = new Date(start);
    to.setDate(to.getDate() + 1);
    return { from, to };
  }
  if (preset === "30d") {
    const from = new Date(start);
    from.setDate(from.getDate() - 29);
    const to = new Date(start);
    to.setDate(to.getDate() + 1);
    return { from, to };
  }
  // custom
  const from = custom.from ? new Date(custom.from) : start;
  from.setHours(0, 0, 0, 0);
  const to = custom.to ? new Date(custom.to) : start;
  to.setHours(0, 0, 0, 0);
  to.setDate(to.getDate() + 1); // include the "to" day fully
  return { from, to };
}

export default function CashReport() {
  const { currentRestaurantId } = useRestaurant();
  const [preset, setPreset] = useState<Preset>("today");
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();

  const range = useMemo(
    () => rangeFromPreset(preset, { from: customFrom, to: customTo }),
    [preset, customFrom, customTo],
  );

  const { data, isLoading, error } = useQuery({
    queryKey: ["cash-report", currentRestaurantId, range.from.toISOString(), range.to.toISOString()],
    queryFn: () => getCashSessionsReport(currentRestaurantId!, range.from.toISOString(), range.to.toISOString()),
    enabled: !!currentRestaurantId,
  });

  const totals = useMemo(() => {
    const rows = data ?? [];
    return rows.reduce(
      (acc, r) => {
        acc.money += r.sales_money_cents;
        acc.card += r.sales_card_cents;
        acc.pix += r.sales_pix_cents;
        acc.other += r.sales_other_cents;
        acc.sales += r.sales_total_cents;
        acc.opening += r.opening_amount_cents;
        acc.supplies += r.supplies_cents;
        acc.bleeds += r.bleeds_cents;
        if (r.status === "closed" && r.difference_cents !== null) {
          acc.difference += r.difference_cents;
          acc.closedCount += 1;
        }
        if (r.status === "open") acc.openCount += 1;
        return acc;
      },
      {
        money: 0, card: 0, pix: 0, other: 0, sales: 0,
        opening: 0, supplies: 0, bleeds: 0,
        difference: 0, closedCount: 0, openCount: 0,
      },
    );
  }, [data]);

  return (
    <AppShell>
      <div className="flex flex-col gap-6 animate-in fade-in duration-500 pb-10">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-secondary tracking-tight">Relatório de Caixa</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Fechamentos de caixa por período, com totais por forma de pagamento.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
              <SelectTrigger className="w-[180px] bg-white border-border h-10 font-bold">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white">
                <SelectItem value="today">Hoje</SelectItem>
                <SelectItem value="yesterday">Ontem</SelectItem>
                <SelectItem value="7d">Últimos 7 dias</SelectItem>
                <SelectItem value="30d">Últimos 30 dias</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>

            {preset === "custom" && (
              <>
                <DatePopover label="De" value={customFrom} onChange={setCustomFrom} />
                <DatePopover label="Até" value={customTo} onChange={setCustomTo} />
              </>
            )}
          </div>
        </div>

        {/* Totals cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <TotalCard
            label="Dinheiro"
            value={centsToBRL(totals.money)}
            icon={<Wallet className="w-5 h-5" />}
            color="bg-success"
          />
          <TotalCard
            label="Cartão"
            value={centsToBRL(totals.card)}
            icon={<CreditCard className="w-5 h-5" />}
            color="bg-primary"
          />
          <TotalCard
            label="PIX"
            value={centsToBRL(totals.pix)}
            icon={<Smartphone className="w-5 h-5" />}
            color="bg-secondary"
          />
          <TotalCard
            label="Total Vendas"
            value={centsToBRL(totals.sales)}
            icon={<Landmark className="w-5 h-5" />}
            color="bg-warning"
          />
        </div>

        {/* Cash flow summary */}
        <Card className="rounded-xl border-border bg-white shadow-sm">
          <CardHeader className="p-5 border-b border-border">
            <CardTitle className="text-base font-bold text-secondary">Resumo financeiro do período</CardTitle>
          </CardHeader>
          <CardContent className="p-5 grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
            <SummaryItem label="Trocos iniciais" value={centsToBRL(totals.opening)} />
            <SummaryItem label="Suprimentos" value={centsToBRL(totals.supplies)} positive />
            <SummaryItem label="Sangrias" value={centsToBRL(totals.bleeds)} negative />
            <SummaryItem label="Caixas fechados" value={String(totals.closedCount)} />
            <SummaryItem
              label="Diferença acumulada"
              value={centsToBRL(totals.difference)}
              positive={totals.difference > 0}
              negative={totals.difference < 0}
            />
          </CardContent>
        </Card>

        {/* Table */}
        <Card className="rounded-xl border-border bg-white shadow-sm overflow-hidden">
          <CardHeader className="p-5 border-b border-border flex-row items-center justify-between">
            <CardTitle className="text-base font-bold text-secondary">Sessões de caixa</CardTitle>
            <Badge variant="outline" className="font-mono text-xs">
              {data?.length ?? 0} sessões
            </Badge>
          </CardHeader>
          <CardContent className="p-0">
            {error ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                <AlertCircle className="w-10 h-10 text-destructive" />
                <p className="text-sm text-muted-foreground">
                  Erro ao carregar relatório. Verifique sua permissão (owner/manager).
                </p>
              </div>
            ) : isLoading ? (
              <div className="p-5 space-y-3">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : (data?.length ?? 0) === 0 ? (
              <div className="py-16 text-center text-muted-foreground text-sm">
                Nenhuma sessão de caixa no período selecionado.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Operador</TableHead>
                      <TableHead>Aberto</TableHead>
                      <TableHead>Fechado</TableHead>
                      <TableHead className="text-right">Troco inic.</TableHead>
                      <TableHead className="text-right">Dinheiro</TableHead>
                      <TableHead className="text-right">Cartão</TableHead>
                      <TableHead className="text-right">PIX</TableHead>
                      <TableHead className="text-right">Esperado</TableHead>
                      <TableHead className="text-right">Contado</TableHead>
                      <TableHead className="text-right">Diferença</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data!.map((r) => (
                      <SessionRow key={r.session_id} row={r} />
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function SessionRow({ row }: { row: CashSessionReportRow }) {
  const diff = row.difference_cents ?? 0;
  const diffIcon =
    row.status !== "closed" ? <Minus className="w-3.5 h-3.5" /> :
    diff > 0 ? <TrendingUp className="w-3.5 h-3.5" /> :
    diff < 0 ? <TrendingDown className="w-3.5 h-3.5" /> :
    <Minus className="w-3.5 h-3.5" />;

  const diffClass =
    row.status !== "closed" ? "text-muted-foreground" :
    diff > 0 ? "text-success" :
    diff < 0 ? "text-destructive" :
    "text-muted-foreground";

  return (
    <TableRow>
      <TableCell className="font-medium">{row.user_name}</TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {format(new Date(row.opened_at), "dd/MM HH:mm", { locale: ptBR })}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {row.closed_at ? format(new Date(row.closed_at), "dd/MM HH:mm", { locale: ptBR }) : "—"}
      </TableCell>
      <TableCell className="text-right font-mono text-xs">{centsToBRL(row.opening_amount_cents)}</TableCell>
      <TableCell className="text-right font-mono text-xs">{centsToBRL(row.sales_money_cents)}</TableCell>
      <TableCell className="text-right font-mono text-xs">{centsToBRL(row.sales_card_cents)}</TableCell>
      <TableCell className="text-right font-mono text-xs">{centsToBRL(row.sales_pix_cents)}</TableCell>
      <TableCell className="text-right font-mono text-xs font-bold">{centsToBRL(row.expected_amount_cents)}</TableCell>
      <TableCell className="text-right font-mono text-xs">
        {row.counted_amount_cents !== null ? centsToBRL(row.counted_amount_cents) : "—"}
      </TableCell>
      <TableCell className={cn("text-right font-mono text-xs font-bold", diffClass)}>
        <span className="inline-flex items-center gap-1 justify-end">
          {diffIcon}
          {row.status === "closed" ? centsToBRL(diff) : "—"}
        </span>
      </TableCell>
      <TableCell>
        {row.status === "open" ? (
          <Badge className="bg-warning text-warning-foreground hover:bg-warning">Aberto</Badge>
        ) : (
          <Badge variant="outline">Fechado</Badge>
        )}
      </TableCell>
    </TableRow>
  );
}

function TotalCard({ label, value, icon, color }: { label: string; value: string; icon: React.ReactNode; color: string }) {
  return (
    <Card className="rounded-xl border-border bg-white shadow-sm overflow-hidden">
      <CardContent className="p-5 flex items-center gap-4">
        <div className={cn("w-11 h-11 rounded-lg flex items-center justify-center text-white", color)}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground font-medium">{label}</p>
          <p className="text-lg font-bold text-secondary truncate">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryItem({ label, value, positive, negative }: { label: string; value: string; positive?: boolean; negative?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn(
        "font-bold text-base font-mono",
        positive && "text-success",
        negative && "text-destructive",
        !positive && !negative && "text-secondary",
      )}>{value}</span>
    </div>
  );
}

function DatePopover({ label, value, onChange }: { label: string; value?: Date; onChange: (d?: Date) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn("h-10 justify-start text-left font-normal w-[150px]", !value && "text-muted-foreground")}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {value ? format(value, "dd/MM/yyyy") : <span>{label}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 bg-white" align="start">
        <Calendar
          mode="single"
          selected={value}
          onSelect={onChange}
          initialFocus
          className={cn("p-3 pointer-events-auto")}
        />
      </PopoverContent>
    </Popover>
  );
}
