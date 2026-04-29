import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Download, Upload, FileJson, CheckCircle2, AlertCircle } from "lucide-react";
import { sampleCatalog } from "@/lib/catalog/sampleCatalog";
import {
  downloadJson,
  exportCatalog,
  importCatalog,
  validateCatalogJson,
} from "@/lib/catalog/importExport";

interface Props {
  restaurantId: string;
  canEdit: boolean;
  onImported?: () => void;
}

export function CatalogImportExport({ restaurantId, canEdit, onImported }: Props) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [validated, setValidated] = useState(false);
  const [deactivateMissing, setDeactivateMissing] = useState(false);
  const [busy, setBusy] = useState(false);

  function handleDownloadTemplate() {
    downloadJson("catalogo-modelo.json", sampleCatalog);
    toast({ title: "Modelo baixado", description: "catalogo-modelo.json" });
  }

  async function handleExport() {
    if (!restaurantId) return;
    setBusy(true);
    try {
      const data = await exportCatalog(restaurantId);
      downloadJson(`catalogo-${new Date().toISOString().slice(0, 10)}.json`, data);
      toast({ title: "Catálogo exportado" });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro desconhecido";
      toast({ title: "Erro ao exportar", description: msg, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  function handleFilePick(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      setJsonText(String(reader.result ?? ""));
      setErrors([]);
      setValidated(false);
    };
    reader.readAsText(file);
  }

  function handleValidate(): { ok: boolean; data?: unknown } {
    setErrors([]);
    setValidated(false);
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch (e) {
      setErrors([`JSON inválido: ${(e as Error).message}`]);
      return { ok: false };
    }
    const result = validateCatalogJson(parsed);
    if (!result.ok) {
      setErrors(result.errors);
      return { ok: false };
    }
    setValidated(true);
    toast({ title: "JSON válido", description: "Pronto para importar." });
    return { ok: true, data: result.data };
  }

  async function handleImport() {
    const v = handleValidate();
    if (!v.ok || !v.data) return;
    setBusy(true);
    try {
      const r = await importCatalog(restaurantId, v.data as never, deactivateMissing);
      toast({
        title: "Importação concluída",
        description: `Categorias: ${r.categories} • Produtos: ${r.products} • Grupos: ${r.option_groups} • Itens: ${r.option_items} • Variações: ${r.variants}`,
      });
      setOpen(false);
      setJsonText("");
      setValidated(false);
      onImported?.();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro desconhecido";
      setErrors([msg]);
      toast({ title: "Falha na importação", description: msg, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={handleDownloadTemplate} className="h-9">
          <FileJson className="w-4 h-4 mr-2" /> Modelo JSON
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={busy || !restaurantId}
          className="h-9"
        >
          <Download className="w-4 h-4 mr-2" /> Exportar
        </Button>
        {canEdit && (
          <Button size="sm" onClick={() => setOpen(true)} className="h-9">
            <Upload className="w-4 h-4 mr-2" /> Importar
          </Button>
        )}
      </div>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setErrors([]); setValidated(false); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Importar catálogo via JSON</DialogTitle>
            <DialogDescription>
              Cole o JSON ou selecione um arquivo. Valide antes de importar. A importação é transacional: se algo falhar, nada é salvo.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFilePick(f);
                  e.target.value = "";
                }}
              />
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                Selecionar arquivo
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setJsonText(JSON.stringify(sampleCatalog, null, 2));
                  setErrors([]);
                  setValidated(false);
                }}
              >
                Carregar modelo
              </Button>
            </div>

            <div>
              <Label className="text-xs">JSON</Label>
              <Textarea
                value={jsonText}
                onChange={(e) => { setJsonText(e.target.value); setValidated(false); setErrors([]); }}
                rows={12}
                className="font-mono text-xs"
                placeholder='{ "version": "1", "categories": [...], "products": [...] }'
              />
            </div>

            {errors.length > 0 && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 max-h-40 overflow-auto">
                <div className="flex items-center gap-2 text-destructive font-medium text-sm mb-1">
                  <AlertCircle className="w-4 h-4" /> {errors.length} erro(s)
                </div>
                <ul className="text-xs text-destructive space-y-1 list-disc pl-5">
                  {errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}

            {validated && errors.length === 0 && (
              <div className="flex items-center gap-2 text-sm text-green-700">
                <CheckCircle2 className="w-4 h-4" /> JSON válido.
              </div>
            )}

            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={deactivateMissing}
                onCheckedChange={(v) => setDeactivateMissing(Boolean(v))}
              />
              <span>
                <span className="font-medium">Desativar itens ausentes</span>
                <span className="block text-xs text-muted-foreground">
                  Itens que existem hoje mas não estão no JSON serão marcados como inativos.
                </span>
              </span>
            </label>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button variant="outline" onClick={handleValidate} disabled={busy || !jsonText.trim()}>
              Validar
            </Button>
            <Button onClick={handleImport} disabled={busy || !jsonText.trim()}>
              {busy ? "Importando..." : "Importar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
