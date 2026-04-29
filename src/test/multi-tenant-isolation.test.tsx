import { describe, it, expect } from "vitest";

/**
 * Testes de abuso multi-tenant — fundação.
 *
 * Estes testes validam o CONTRATO de isolamento que a aplicação confia.
 * Eles NÃO substituem testes E2E contra o banco real (que rodam em CI
 * separada, usando dois usuários reais e service_role para setup).
 *
 * Critério: nenhuma tela pode ler/escrever dados sem escopo de restaurante.
 *           O hook useRequiredRestaurantId() deve LANÇAR se não houver escopo.
 */

import { renderHook } from "@testing-library/react";
import {
  RestaurantProvider,
  useRequiredRestaurantId,
} from "@/lib/auth/RestaurantProvider";
import { AuthProvider } from "@/lib/auth/AuthProvider";

// Mock do client supabase para não bater em rede neste teste unitário.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      getSession: async () => ({ data: { session: null } }),
      signOut: async () => {},
    },
    from: () => ({
      select: () => ({
        eq: async () => ({ data: [], error: null }),
      }),
    }),
  },
}));

import { vi } from "vitest";

describe("Isolamento multi-tenant — fundação", () => {
  it("useRequiredRestaurantId lança se nenhum restaurante está selecionado", () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>
        <RestaurantProvider>{children}</RestaurantProvider>
      </AuthProvider>
    );

    expect(() => {
      renderHook(() => useRequiredRestaurantId(), { wrapper });
    }).toThrow(/escopo obrigatório/i);
  });

  /**
   * TODO (CI com banco real):
   *  - usuário do tenant A NÃO consegue SELECT em restaurants do tenant B
   *  - usuário do tenant A NÃO consegue INSERT em restaurant_members do tenant B
   *  - waiter do restaurante X NÃO consegue UPDATE em produtos (próximo módulo)
   *  - cashier NÃO acessa audit_log de outro restaurante
   *  - tentativa de escrita em audit_log via API anon retorna 401/403
   */
  it.todo("RLS bloqueia leitura cross-tenant em restaurants");
  it.todo("RLS bloqueia escrita cross-tenant em restaurant_members");
  it.todo("Apenas owner/manager/support leem audit_log do próprio restaurante");
});
