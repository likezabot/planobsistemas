import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import KDS from '../pages/KDS';
import { useRestaurant } from '@/lib/auth/RestaurantProvider';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { BrowserRouter } from 'react-router-dom';

// Mocks
vi.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: vi.fn(() => ({
    user: { email: 'kitchen@example.com' },
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
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    })),
    removeChannel: vi.fn(),
  },
}));

vi.mock('@/lib/orders/queries', () => ({
  getRestaurantOrders: vi.fn(),
  updateOrderStatus: vi.fn(),
}));

describe('KDS Logic & UI', () => {
  const mockRestaurantId = 'rest-123';
  const mockOrders = [
    {
      id: 'order-1',
      customer_name: 'João Silva',
      status: 'new',
      order_type: 'pickup',
      created_at: new Date().toISOString(),
      order_items: [
        { id: 'item-1', quantity: 2, product: { name: 'Burger' } }
      ]
    },
    {
      id: 'order-2',
      customer_name: 'Maria Pizza',
      status: 'preparing',
      order_type: 'delivery',
      created_at: new Date().toISOString(),
      order_items: [
        { 
          id: 'item-2', 
          quantity: 1, 
          product: { name: 'Pizza' },
          customization: {
            flavors: [{ id: 'f1', name: 'Calabresa' }, { id: 'f2', name: 'Mussarela' }],
            variation: { name: 'Grande' }
          }
        }
      ]
    },
    {
      id: 'order-3',
      customer_name: 'Finalizado',
      status: 'completed',
      order_type: 'pickup',
      created_at: new Date().toISOString(),
      order_items: []
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (useRestaurant as any).mockReturnValue({
      currentRestaurantId: mockRestaurantId,
      currentMembership: { 
        role: 'kitchen',
        restaurants: { name: 'Mock Rest', accounting_reports_enabled: false }
      },
      loading: false,
      memberships: [{ restaurant_id: mockRestaurantId, restaurants: { name: 'Mock Rest' } }]
    });

    (useQuery as any).mockReturnValue({
      data: mockOrders,
      isLoading: false,
    });

    (useMutation as any).mockReturnValue({
      mutate: vi.fn(),
    });
  });

  it('renders KDS columns correctly', () => {
    render(
      <BrowserRouter>
        <KDS />
      </BrowserRouter>
    );

    expect(screen.getByText('Novos')).toBeInTheDocument();
    expect(screen.getByText('Em Preparo')).toBeInTheDocument();
    expect(screen.getByText('Prontos')).toBeInTheDocument();
  });

  it('filters out completed orders', () => {
    render(
      <BrowserRouter>
        <KDS />
      </BrowserRouter>
    );

    expect(screen.queryByText('Finalizado')).not.toBeInTheDocument();
  });

  it('renders order cards with details', () => {
    render(
      <BrowserRouter>
        <KDS />
      </BrowserRouter>
    );

    expect(screen.getByText('João Silva')).toBeInTheDocument();
    expect(screen.getByText('2x')).toBeInTheDocument();
    expect(screen.getByText('Burger')).toBeInTheDocument();
  });

  it('renders pizza flavors and variation', () => {
    render(
      <BrowserRouter>
        <KDS />
      </BrowserRouter>
    );

    expect(screen.getByText('Maria Pizza')).toBeInTheDocument();
    expect(screen.getByText('Calabresa')).toBeInTheDocument();
    expect(screen.getByText('Mussarela')).toBeInTheDocument();
    expect(screen.getByText('Tamanho: Grande')).toBeInTheDocument();
  });

  it('calls mutation when action button is clicked', () => {
    const mutate = vi.fn();
    (useMutation as any).mockReturnValue({ mutate });

    render(
      <BrowserRouter>
        <KDS />
      </BrowserRouter>
    );

    const actionButton = screen.getAllByText('Preparar')[0];
    fireEvent.click(actionButton);

    expect(mutate).toHaveBeenCalledWith({ orderId: 'order-1', status: 'preparing' });
  });

  it('subscribes to realtime on mount', () => {
    render(
      <BrowserRouter>
        <KDS />
      </BrowserRouter>
    );

    expect(supabase.channel).toHaveBeenCalledWith(`kds-${mockRestaurantId}`);
  });
});
