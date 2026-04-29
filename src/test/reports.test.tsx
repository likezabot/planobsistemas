import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import Reports from '../pages/Reports';
import { useRestaurant } from '@/lib/auth/RestaurantProvider';
import { useQuery } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';

// Mocks
vi.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: vi.fn(() => ({
    user: { email: 'manager@example.com' },
    signOut: vi.fn(),
  })),
}));

vi.mock('@/lib/auth/RestaurantProvider', () => ({
  useRestaurant: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  useQueryClient: vi.fn(() => ({
    invalidateQueries: vi.fn(),
  })),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}));

// Mock Recharts to avoid DOM issues in vitest
vi.mock('recharts', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  };
});

describe('Reports Logic & UI', () => {
  const mockRestaurantId = 'rest-123';
  const mockStats = {
    daily_sales: [
      { day: '2026-04-20', sales_cents: 10000, order_count: 5 },
      { day: '2026-04-21', sales_cents: 15000, order_count: 7 },
    ],
    avg_ticket: 2000,
    best_dow: 1, // Segunda
    peak_hour: 19,
    top_products: [
      { name: 'Burger', qty: 10 },
      { name: 'Coke', qty: 15 },
    ],
    channel_stats: [
      { name: 'pickup', value: 10 },
      { name: 'delivery', value: 5 },
    ],
    pizza_enabled: true,
    pizza_ratio: [
      { name: 'Pizza', total_cents: 8000, order_count: 4 },
      { name: 'Outros', total_cents: 17000, order_count: 8 },
    ],
    pizza_flavors: [
      { name: 'Calabresa', value: 5 },
      { name: 'Mussarela', value: 3 },
    ],
    pizza_sizes: [
      { name: 'Grande', value: 6 },
    ]
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (useRestaurant as any).mockReturnValue({
      currentRestaurantId: mockRestaurantId,
      currentMembership: { 
        role: 'manager',
        restaurants: { name: 'Mock Rest', accounting_reports_enabled: false }
      },
      loading: false,
      memberships: [{ restaurant_id: mockRestaurantId, restaurants: { name: 'Mock Rest' } }]
    });

    (useQuery as any).mockReturnValue({
      data: mockStats,
      isLoading: false,
    });
  });

  it('renders report charts and metrics', () => {
    render(
      <BrowserRouter>
        <Reports />
      </BrowserRouter>
    );

    expect(screen.getByText('Ticket Médio')).toBeInTheDocument();
    expect(screen.getByText('R$ 20,00')).toBeInTheDocument();
    expect(screen.getByText('Segunda')).toBeInTheDocument();
    expect(screen.getByText('19:00')).toBeInTheDocument();
    expect(screen.getByText('Vendas por Dia (R$)')).toBeInTheDocument();
    expect(screen.getByText('Top 10 Produtos Mais Vendidos (Qtd)')).toBeInTheDocument();
  });

  it('shows pizza section when enabled', () => {
    render(
      <BrowserRouter>
        <Reports />
      </BrowserRouter>
    );

    expect(screen.getByRole('heading', { name: /Seção de Pizzas/i })).toBeInTheDocument();
    expect(screen.getByText('Top 5 Sabores de Pizza')).toBeInTheDocument();
    expect(screen.getByText('Top 3 Tamanhos')).toBeInTheDocument();
  });

  it('hides pizza section when disabled', () => {
    (useQuery as any).mockReturnValue({
      data: { ...mockStats, pizza_enabled: false },
      isLoading: false,
    });

    render(
      <BrowserRouter>
        <Reports />
      </BrowserRouter>
    );

    expect(screen.queryByText(/Seção de Pizzas/i)).not.toBeInTheDocument();
  });

  it('shows empty state when no sales', () => {
    (useQuery as any).mockReturnValue({
      data: { ...mockStats, daily_sales: [] },
      isLoading: false,
    });

    render(
      <BrowserRouter>
        <Reports />
      </BrowserRouter>
    );

    expect(screen.getByText('Sem dados no período')).toBeInTheDocument();
  });
});
