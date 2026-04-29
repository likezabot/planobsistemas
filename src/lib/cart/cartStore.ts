import { create } from 'zustand'; // I'll add zustand to be more efficient
import { persist } from 'zustand/middleware';

export interface CartItem {
  product_id: string;
  name: string;
  price_cents: number;
  quantity: number;
  note?: string;
  customization?: {
    description: string;
    details: any;
  };
}

interface CartState {
  items: CartItem[];
  restaurantSlug: string | null;
  addItem: (slug: string, item: CartItem) => void;
  removeItem: (product_id: string) => void;
  updateQuantity: (product_id: string, quantity: number) => void;
  clearCart: () => void;
  getTotal: () => number;
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      restaurantSlug: null,

      addItem: (slug, item) => {
        const { items, restaurantSlug } = get();
        
        // If restaurant changes, clear cart
        if (restaurantSlug && restaurantSlug !== slug) {
          set({ items: [item], restaurantSlug: slug });
          return;
        }

        const existingItem = items.find((i) => i.product_id === item.product_id);
        if (existingItem) {
          set({
            items: items.map((i) =>
              i.product_id === item.product_id
                ? { ...i, quantity: i.quantity + item.quantity }
                : i
            ),
            restaurantSlug: slug,
          });
        } else {
          set({ items: [...items, item], restaurantSlug: slug });
        }
      },

      removeItem: (product_id) => {
        set({ items: get().items.filter((i) => i.product_id !== product_id) });
      },

      updateQuantity: (product_id, quantity) => {
        if (quantity <= 0) {
          get().removeItem(product_id);
          return;
        }
        set({
          items: get().items.map((i) =>
            i.product_id === product_id ? { ...i, quantity } : i
          ),
        });
      },

      clearCart: () => set({ items: [], restaurantSlug: null }),

      getTotal: () => {
        return get().items.reduce((total, item) => total + item.price_cents * item.quantity, 0);
      },
    }),
    {
      name: 'restaurant-cart',
    }
  )
);
