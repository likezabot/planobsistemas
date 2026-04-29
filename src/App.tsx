import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth/AuthProvider";
import { RestaurantProvider } from "@/lib/auth/RestaurantProvider";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index.tsx";
import AuthPage from "./pages/Auth.tsx";
import CatalogProducts from "./pages/CatalogProducts.tsx";
import CatalogCategories from "./pages/CatalogCategories.tsx";
import PublicMenu from "./pages/PublicMenu.tsx";
import PublicCheckout from "./pages/PublicCheckout.tsx";
import Orders from "./pages/Orders.tsx";
import PrintControl from "./pages/PrintControl.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <RestaurantProvider>
            <Routes>
              <Route path="/auth" element={<AuthPage />} />
              {/* Cardápio público — sem ProtectedRoute, somente leitura via RPC segura */}
              <Route path="/menu/:restaurantSlug" element={<PublicMenu />} />
              <Route path="/menu/:restaurantSlug/checkout" element={<PublicCheckout />} />
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <Index />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <Index />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/catalogo"
                element={
                  <ProtectedRoute>
                    <CatalogProducts />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/catalogo/categorias"
                element={
                  <ProtectedRoute>
                    <CatalogCategories />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/pedidos"
                element={
                  <ProtectedRoute>
                    <Orders />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/impressao"
                element={
                  <ProtectedRoute>
                    <PrintControl />
                  </ProtectedRoute>
                }
              />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </RestaurantProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
