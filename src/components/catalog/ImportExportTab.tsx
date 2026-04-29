import { useRestaurant } from "@/lib/auth/RestaurantProvider";
import { isAdminRole } from "@/lib/catalog/money";
import { CatalogImportExport } from "@/components/catalog/CatalogImportExport";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Download, Upload, FileJson } from "lucide-react";

const TEMPLATES = [
  { file: "modelo-generico.json", title: "Genérico", desc: "Estrutura mínima para qualquer restaurante." },
  { file: "modelo-espetinho.json", title: "Espetinho / Churrascaria", desc: "Produtos simples + adicionais. NÃO usa módulo Pizza." },
  { file: "modelo-pizzaria.json", title: "Pizzaria", desc: "Tamanhos, sabores e bordas. Requer módulo Pizza ativado." },
  { file: "modelo-lanchonete.json", title: "Lanchonete", desc: "Lanches com tamanhos + adicionais + combos." },
];

export default function ImportExportTab() {
  const { currentRestaurantId, currentMembership } = useRestaurant();
  const canEdit = isAdminRole(currentMembership?.role);

  return (
    <div className="max-w-3xl mx-auto py-8 space-y-6">
      <Card className="border-border shadow-md">
        <CardHeader className="bg-muted/30">
          <CardTitle className="flex items-center gap-2">
            <Download className="w-5 h-5 text-primary" />
            Importar / Exportar Catálogo
          </CardTitle>
          <CardDescription>
            Faça backup do seu cardápio completo ou importe de um arquivo JSON compatível.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-10 flex flex-col items-center justify-center gap-6">
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            <Upload className="w-10 h-10" />
          </div>

          <div className="flex flex-col gap-3 w-full max-w-sm">
            <CatalogImportExport
              restaurantId={currentRestaurantId ?? ""}
              canEdit={canEdit}
              onImported={() => window.location.reload()}
            />
          </div>

          <p className="text-[11px] text-muted-foreground text-center px-6">
            Atenção: A importação sobrescreve dados existentes se houver conflito de IDs.
            Certifique-se de ter um backup antes de prosseguir.
          </p>
        </CardContent>
      </Card>

      <Card className="border-border shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileJson className="w-4 h-4 text-primary" />
            Modelos prontos (download)
          </CardTitle>
          <CardDescription>
            Baixe um modelo, edite no seu editor preferido e importe. Nada é importado automaticamente.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {TEMPLATES.map((t) => (
            <a
              key={t.file}
              href={`/templates/${t.file}`}
              download
              className="flex items-start gap-3 p-3 rounded-lg border border-border hover:border-primary hover:bg-muted/30 transition-colors"
              data-testid={`template-${t.file}`}
            >
              <Download className="w-4 h-4 mt-0.5 text-primary shrink-0" />
              <div className="min-w-0">
                <p className="font-bold text-sm text-secondary">{t.title}</p>
                <p className="text-[11px] text-muted-foreground">{t.desc}</p>
                <p className="text-[10px] text-muted-foreground/70 font-mono mt-0.5">{t.file}</p>
              </div>
            </a>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
