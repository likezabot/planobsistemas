import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  BookOpen, 
  Tag, 
  Pizza, 
  Layers, 
  PlusCircle, 
  Download, 
  ClipboardList,
  Info
} from "lucide-react";
import ProductsTab from "@/components/catalog/ProductsTab";
import CategoriesTab from "@/components/catalog/CategoriesTab";
import PizzasTab from "@/components/catalog/PizzasTab";
import VariantsTab from "@/components/catalog/VariantsTab";
import OptionsTab from "@/components/catalog/OptionsTab";
import InventoryTab from "@/components/catalog/InventoryTab";
import ImportExportTab from "@/components/catalog/ImportExportTab";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";

import { useRestaurant } from "@/lib/auth/RestaurantProvider";
import { isAdminRole } from "@/lib/catalog/money";
import { listProducts } from "@/lib/catalog/queries";

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

function TutorialStep({ num, title, desc, onClick, isLast }: { num: string, title: string, desc: string, onClick?: () => void, isLast?: boolean }) {
  return (
    <div 
      className={cn(
        "relative p-4 bg-white rounded-xl border border-border shadow-sm flex flex-col gap-1 transition-all",
        onClick && "cursor-pointer hover:border-primary/50 hover:shadow-md active:scale-95"
      )}
      onClick={onClick}
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">
          {num}
        </span>
        {!isLast && <ArrowRight className="w-4 h-4 text-muted-foreground/30" />}
        {isLast && <CheckCircle2 className="w-4 h-4 text-success" />}
      </div>
      <h4 className="font-bold text-secondary text-sm mt-2">{title}</h4>
      <p className="text-[11px] text-muted-foreground leading-tight">{desc}</p>
    </div>
  );
}

export default function Catalog() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "produtos";
  const { currentMembership, currentRestaurantId } = useRestaurant();
  const [hasProducts, setHasProducts] = useState<boolean | null>(null);
  
  const pizzaEnabled = currentMembership?.restaurants.pizza_module_enabled ?? false;
  const isAdmin = isAdminRole(currentMembership?.role);
  // Aba Pizzas visível quando o módulo está ligado, ou para owner/manager (para poder ligar)
  const showPizzaTab = pizzaEnabled || isAdmin;

  useEffect(() => {
    document.title = "Catálogo — Plano B";
  }, []);

  useEffect(() => {
    async function checkProducts() {
      if (!currentRestaurantId) return;
      const { data } = await listProducts(currentRestaurantId);
      setHasProducts(!!data && data.length > 0);
    }
    checkProducts();
  }, [currentRestaurantId]);

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value });
  };

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-secondary">Catálogo</h1>
            <InfoBalloon text="O catálogo é o coração do seu sistema. Tudo o que você cadastrar aqui aparecerá no seu cardápio digital para seus clientes pedirem." />
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            Gerencie produtos, categorias, pizzas e complementos.
          </p>
        </div>

        {hasProducts === false && (
          <div className="bg-primary/5 border border-primary/20 rounded-2xl p-6 mb-2 animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white">
                <HelpCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-secondary">Comece por aqui!</h3>
                <p className="text-sm text-muted-foreground">Seu cardápio ainda está vazio. Siga estes passos simples:</p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <TutorialStep 
                num="1" 
                title="Categorias" 
                desc="Crie categorias como 'Bebidas' ou 'Pizzas' para organizar seu menu."
                onClick={() => handleTabChange("categorias")}
              />
              <TutorialStep 
                num="2" 
                title="Adicionais" 
                desc="Cadastre complementos (ex: borda, gelo e limão) para seus produtos."
                onClick={() => handleTabChange("adicionais")}
              />
              <TutorialStep 
                num="3" 
                title="Produtos" 
                desc="Adicione seus itens vinculando-os às categorias e adicionais."
                onClick={() => handleTabChange("produtos")}
              />
              <TutorialStep 
                num="4" 
                title="Vender!" 
                desc="Abra seu cardápio público e comece a receber pedidos."
                isLast
              />
            </div>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="bg-muted/50 p-1 h-auto flex-wrap justify-start gap-1">
            <TabsTrigger value="produtos" className="data-[state=active]:bg-white data-[state=active]:shadow-sm px-4 py-2 text-xs font-bold uppercase tracking-wider">
              <BookOpen className="w-3.5 h-3.5 mr-2" />
              Produtos
            </TabsTrigger>
            <TabsTrigger value="categorias" className="data-[state=active]:bg-white data-[state=active]:shadow-sm px-4 py-2 text-xs font-bold uppercase tracking-wider">
              <Tag className="w-3.5 h-3.5 mr-2" />
              Categorias
              <InfoBalloon text="Agrupe seus produtos para facilitar a navegação (ex: Bebidas, Entradas)." />
            </TabsTrigger>
            {showPizzaTab && (
              <TabsTrigger value="pizzas" className="data-[state=active]:bg-white data-[state=active]:shadow-sm px-4 py-2 text-xs font-bold uppercase tracking-wider">
                <Pizza className="w-3.5 h-3.5 mr-2" />
                Pizzas
                {!pizzaEnabled && (
                  <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground normal-case font-medium">off</span>
                )}
                <InfoBalloon text="Configure sabores e tamanhos para o módulo profissional de pizzaria." />
              </TabsTrigger>
            )}
            <TabsTrigger value="variacoes" className="data-[state=active]:bg-white data-[state=active]:shadow-sm px-4 py-2 text-xs font-bold uppercase tracking-wider">
              <Layers className="w-3.5 h-3.5 mr-2" />
              Tamanhos
            </TabsTrigger>
            <TabsTrigger value="adicionais" className="data-[state=active]:bg-white data-[state=active]:shadow-sm px-4 py-2 text-xs font-bold uppercase tracking-wider">
              <PlusCircle className="w-3.5 h-3.5 mr-2" />
              Adicionais
            </TabsTrigger>
            <TabsTrigger value="estoque" className="data-[state=active]:bg-white data-[state=active]:shadow-sm px-4 py-2 text-xs font-bold uppercase tracking-wider">
              <ClipboardList className="w-3.5 h-3.5 mr-2" />
              Estoque
              <InfoBalloon text="Controle a disponibilidade dos seus itens em tempo real." />
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
            {showPizzaTab && (
              <TabsContent value="pizzas">
                <PizzasTab />
              </TabsContent>
            )}
            <TabsContent value="variacoes">
              <VariantsTab />
            </TabsContent>
            <TabsContent value="adicionais">
              <OptionsTab />
            </TabsContent>
            <TabsContent value="estoque">
              <InventoryTab />
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
