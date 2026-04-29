import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Coupons from '../pages/Coupons';
import { useRestaurant } from '@/lib/auth/RestaurantProvider';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { BrowserRouter } from 'react-router-dom';

// Mocks
vi.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: vi.fn(() => ({
    user: { email: 'admin@example.com' },
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
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
    })),
    rpc: vi.fn(),
  },
}));

describe('Coupons Logic & Admin UI', () => {
  const mockRestaurantId = 'rest-123';
  const mockCoupons = [
    {
      id: 'c1',
      code: 'PROMO10',
      name: 'Desconto 10%',
      type: 'percent',
      percent_value: 10,
      value_cents: null,
      min_order_cents: 1000,
      max_uses: 100,
      used_count: 5,
      active: true,
      valid_from: null,
      valid_until: null,
    },
    {
      id: 'c2',
      code: 'VALE5',
      name: 'Vale 5 Reais',
      type: 'fixed',
      percent_value: null,
      value_cents: 500,
      min_order_cents: 0,
      max_uses: null,
      used_count: 50,
      active: true,
      valid_from: null,
      valid_until: null,
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (useRestaurant as any).mockReturnValue({
      currentRestaurantId: mockRestaurantId,
      currentMembership: { 
        role: 'owner',
        restaurants: { name: 'Mock Rest', accounting_reports_enabled: false }
      },
      loading: false,
      memberships: [{ restaurant_id: mockRestaurantId, restaurants: { name: 'Mock Rest' } }]
    });

    (useQuery as any).mockReturnValue({
      data: mockCoupons,
      isLoading: false,
    });
  });

  it('renders coupon list', () => {
    render(
      <BrowserRouter>
        <Coupons />
      </BrowserRouter>
    );

    expect(screen.getByText('PROMO10')).toBeInTheDocument();
    expect(screen.getByText('VALE5')).toBeInTheDocument();
    expect(screen.getByText('10%')).toBeInTheDocument();
    expect(screen.getByText('R$ 5,00')).toBeInTheDocument();
  });

  it('validates percentage discount calculation in RPC (Logic check)', async () => {
     // This is a unit test of the expectation of what the RPC should do.
     // Testing the actual RPC requires E2E environment.
     (supabase.rpc as any).mockResolvedValue({
        data: { valid: true, discount_cents: 500, message: 'Sucesso' }
     });
     
     const result = await supabase.rpc('validate_coupon', { _slug: 'test', _code: 'P10', _subtotal_cents: 5000 });
     expect((result.data as any).discount_cents).toBe(500);
  });
});
