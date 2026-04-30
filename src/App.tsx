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
import Catalog from "./pages/Catalog.tsx";
import PublicMenu from "./pages/PublicMenu.tsx";
import PublicCheckout from "./pages/PublicCheckout.tsx";
import Orders from "./pages/Orders.tsx";
import PrintControl from "./pages/PrintControl.tsx";
import Accounting from "./pages/Accounting.tsx";
import KDS from "./pages/KDS.tsx";
import Reports from "./pages/Reports.tsx";
import CashReport from "./pages/CashReport.tsx";
import Customers from "./pages/Customers.tsx";
import DeliverySettings from "./pages/DeliverySettings.tsx";
import RestaurantSettings from "./pages/RestaurantSettings.tsx";
import Coupons from "./pages/Coupons.tsx";
import Palm from "./pages/Palm.tsx";
import PDV from "./pages/PDV.tsx";
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
                    <Catalog />
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
                path="/kds"
                element={
                  <ProtectedRoute allowedRoles={['owner', 'manager', 'kitchen']}>
                    <KDS />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/relatorios"
                element={
                  <ProtectedRoute allowedRoles={['owner', 'manager']}>
                    <Reports />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/relatorios/caixa"
                element={
                  <ProtectedRoute allowedRoles={['owner', 'manager']}>
                    <CashReport />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/clientes"
                element={
                  <ProtectedRoute allowedRoles={['owner', 'manager']}>
                    <Customers />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/cupons"
                element={
                  <ProtectedRoute allowedRoles={['owner', 'manager']}>
                    <Coupons />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/configuracoes/entrega"
                element={
                  <ProtectedRoute allowedRoles={['owner', 'manager']}>
                    <DeliverySettings />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/configuracoes/restaurante"
                element={
                  <ProtectedRoute allowedRoles={['owner', 'manager']}>
                    <RestaurantSettings />
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
              <Route
                path="/contador"
                element={
                  <ProtectedRoute>
                    <Accounting />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/pdv/*"
                element={
                  <ProtectedRoute allowedRoles={['owner', 'manager', 'cashier']}>
                    <PDV />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/palm/*"
                element={
                  <ProtectedRoute allowedRoles={['owner', 'manager', 'waiter', 'cashier']}>
                    <Palm />
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
