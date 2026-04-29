import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookOpen, Tag, Pizza, Layers, PlusCircle, Download } from "lucide-react";
import ProductsTab from "@/components/catalog/ProductsTab";
import CategoriesTab from "@/components/catalog/CategoriesTab";
import PizzasTab from "@/components/catalog/PizzasTab";
import VariantsTab from "@/components/catalog/VariantsTab";
import OptionsTab from "@/components/catalog/OptionsTab";
import ImportExportTab from "@/components/catalog/ImportExportTab";

export default function Catalog() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "produtos";

  useEffect(() => {
    document.title = "Catálogo — Plano B";
  }, []);

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value });
  };

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold text-secondary">Catálogo</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Gerencie produtos, categorias, pizzas e complementos.
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="bg-muted/50 p-1 h-auto flex-wrap justify-start gap-1">
            <TabsTrigger value="produtos" className="data-[state=active]:bg-white data-[state=active]:shadow-sm px-4 py-2 text-xs font-bold uppercase tracking-wider">
              <BookOpen className="w-3.5 h-3.5 mr-2" />
              Produtos
            </TabsTrigger>
            <TabsTrigger value="categorias" className="data-[state=active]:bg-white data-[state=active]:shadow-sm px-4 py-2 text-xs font-bold uppercase tracking-wider">
              <Tag className="w-3.5 h-3.5 mr-2" />
              Categorias
            </TabsTrigger>
            <TabsTrigger value="pizzas" className="data-[state=active]:bg-white data-[state=active]:shadow-sm px-4 py-2 text-xs font-bold uppercase tracking-wider">
              <Pizza className="w-3.5 h-3.5 mr-2" />
              Pizzas
            </TabsTrigger>
            <TabsTrigger value="variacoes" className="data-[state=active]:bg-white data-[state=active]:shadow-sm px-4 py-2 text-xs font-bold uppercase tracking-wider">
              <Layers className="w-3.5 h-3.5 mr-2" />
              Tamanhos
            </TabsTrigger>
            <TabsTrigger value="adicionais" className="data-[state=active]:bg-white data-[state=active]:shadow-sm px-4 py-2 text-xs font-bold uppercase tracking-wider">
              <PlusCircle className="w-3.5 h-3.5 mr-2" />
              Adicionais
            </TabsTrigger>
            <TabsTrigger value="import" className="data-[state=active]:bg-white data-[state=active]:shadow-sm px-4 py-2 text-xs font-bold uppercase tracking-wider">
              <Download className="w-3.5 h-3.5 mr-2" />
              Importar/Exportar
            </TabsTrigger>
          </TabsList>

          <div className="mt-6">
            <TabsContent value="produtos">
              <ProductsTab />
            </TabsContent>
            <TabsContent value="categorias">
              <CategoriesTab />
            </TabsContent>
            <TabsContent value="pizzas">
              <PizzasTab />
            </TabsContent>
            <TabsContent value="variacoes">
              <VariantsTab />
            </TabsContent>
            <TabsContent value="adicionais">
              <OptionsTab />
            </TabsContent>
            <TabsContent value="import">
              <ImportExportTab />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </AppShell>
  );
}
