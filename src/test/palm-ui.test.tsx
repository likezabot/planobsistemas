import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PalmTableMap } from "@/components/orders/palm/PalmTableMap";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import * as queries from "@/lib/orders/queries";
import * as restaurantProvider from "@/lib/auth/RestaurantProvider";

vi.mock("@/lib/orders/queries");
vi.mock("@/lib/auth/RestaurantProvider");
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>{children}</BrowserRouter>
  </QueryClientProvider>
);

describe("PalmTableMap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (restaurantProvider.useRestaurant as any).mockReturnValue({
      currentRestaurantId: "res-1",
    });
  });

  it("renders tables correctly", async () => {
    (queries.listDiningTables as any).mockResolvedValue([
      { id: "t1", name: "Mesa 1", active: true },
      { id: "t2", name: "Mesa 2", active: true },
    ]);
    (queries.getOpenTableOrders as any).mockResolvedValue([
      { id: "o1", table_id: "t1", status: "open" },
    ]);

    render(<PalmTableMap />, { wrapper });

    expect(await screen.findByText("Mesa 1")).toBeDefined();
    expect(await screen.findByText("Mesa 2")).toBeDefined();
    expect(screen.getByText("Ocupada")).toBeDefined();
    expect(screen.getByText("Disponível")).toBeDefined();
  });

  it("calls openTableOrder when clicking on available table", async () => {
    (queries.listDiningTables as any).mockResolvedValue([
      { id: "t2", name: "Mesa 2", active: true },
    ]);
    (queries.getOpenTableOrders as any).mockResolvedValue([]);
    (queries.openTableOrder as any).mockResolvedValue("order-new");

    render(<PalmTableMap />, { wrapper });

    const table2 = await screen.findByText("Mesa 2");
    fireEvent.click(table2);

    await waitFor(() => {
      expect(queries.openTableOrder).toHaveBeenCalledWith("res-1", "t2");
    });
  });
});
