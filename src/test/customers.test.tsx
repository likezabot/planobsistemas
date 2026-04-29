import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Customers from '../pages/Customers';
import { useRestaurant } from '@/lib/auth/RestaurantProvider';
import { useQuery } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';

// Mocks
vi.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: vi.fn(() => ({
    user: { email: 'owner@example.com' },
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

describe('Customers CRM Logic & UI', () => {
  const mockRestaurantId = 'rest-123';
  const mockCustomers = [
    {
      phone: '11999999999',
      name: 'João CRM',
      order_count: 5,
      total_spent_cents: 15000,
      avg_ticket_cents: 3000,
      last_visit: '2026-04-25T10:00:00Z',
      favorite_product: 'Pizza Calabresa',
      history: [
        { id: 'o1', created_at: '2026-04-25T10:00:00Z', total_cents: 3000, status: 'completed', items: ['Pizza Calabresa (1x)'] }
      ]
    },
    {
      phone: '21888888888',
      name: 'Maria CRM',
      order_count: 2,
      total_spent_cents: 8000,
      avg_ticket_cents: 4000,
      last_visit: '2026-04-20T12:00:00Z',
      favorite_product: 'Burger',
      history: []
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (useRestaurant as any).mockReturnValue({
      currentRestaurantId: mockRestaurantId,
      currentMembership: { 
        role: 'owner',
        restaurants: { name: 'Mock CRM Rest', accounting_reports_enabled: false }
      },
      loading: false,
      memberships: [{ restaurant_id: mockRestaurantId, restaurants: { name: 'Mock CRM Rest' } }]
    });

    (useQuery as any).mockReturnValue({
      data: mockCustomers,
      isLoading: false,
    });
  });

  it('renders customer list correctly', () => {
    render(
      <BrowserRouter>
        <Customers />
      </BrowserRouter>
    );

    expect(screen.getByText('João CRM')).toBeInTheDocument();
    expect(screen.getByText('11999999999')).toBeInTheDocument();
    expect(screen.getByText('R$ 150,00')).toBeInTheDocument();
    expect(screen.getByText('Pizza Calabresa')).toBeInTheDocument();
  });

  it('opens detail modal on click', async () => {
    render(
      <BrowserRouter>
        <Customers />
      </BrowserRouter>
    );

    const detailButtons = screen.getAllByText('Ver Detalhes');
    fireEvent.click(detailButtons[0]);

    expect(screen.getByText('Histórico de Pedidos')).toBeInTheDocument();
    expect(screen.getByText('Pizza Calabresa (1x)')).toBeInTheDocument();
  });

  it('contains correct WhatsApp link', () => {
    render(
      <BrowserRouter>
        <Customers />
      </BrowserRouter>
    );

    const detailButtons = screen.getAllByText('Ver Detalhes');
    fireEvent.click(detailButtons[0]);

    const whatsappLink = screen.getByRole('link', { name: /WhatsApp/i });
    expect(whatsappLink).toHaveAttribute('href', 'https://wa.me/5511999999999');
  });

  it('filters customers by search term', () => {
    render(
      <BrowserRouter>
        <Customers />
      </BrowserRouter>
    );

    const searchInput = screen.getByPlaceholderText(/Buscar por nome ou telefone/i);
    fireEvent.change(searchInput, { target: { value: 'Maria' } });

    expect(screen.queryByText('João CRM')).not.toBeInTheDocument();
    expect(screen.getByText('Maria CRM')).toBeInTheDocument();
  });
});
