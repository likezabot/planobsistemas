import { useRestaurant } from "@/lib/auth/RestaurantProvider";
import { isAdminRole } from "@/lib/catalog/money";
import { CatalogImportExport } from "@/components/catalog/CatalogImportExport";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Download, Upload } from "lucide-react";

export default function ImportExportTab() {
  const { currentRestaurantId, currentMembership } = useRestaurant();
  const canEdit = isAdminRole(currentMembership?.role);

  return (
    <div className="max-w-2xl mx-auto py-8">
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
    </div>
  );
}
