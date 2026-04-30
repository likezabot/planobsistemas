import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface PalmCartItem {
  id: string; // local unique id for draft
  product_id: string;
  variation_id?: string | null;
  name: string;
  quantity: number;
  unit_price_cents: number;
  notes?: string;
  flavors?: string[]; // for pizzas
  additions?: {
    id: string;
    name: string;
    price_cents: number;
    quantity: number;
  }[];
}

interface PalmCartStore {
  activeOrderId: string | null;
  itemsByOrder: Record<string, PalmCartItem[]>;
  setActiveOrder: (orderId: string | null) => void;
  addItem: (orderId: string, item: Omit<PalmCartItem, 'id'>) => void;
  removeItem: (orderId: string, itemId: string) => void;
  updateItemQuantity: (orderId: string, itemId: string, quantity: number) => void;
  clearOrderCart: (orderId: string) => void;
  getItems: (orderId: string | null) => PalmCartItem[];
}

export const usePalmCartStore = create<PalmCartStore>()(
  persist(
    (set, get) => ({
      activeOrderId: null,
      itemsByOrder: {},
      setActiveOrder: (orderId) => set({ activeOrderId: orderId }),
      addItem: (orderId, item) => {
        const id = Math.random().toString(36).substring(7);
        set((state) => {
          const currentItems = state.itemsByOrder[orderId] || [];
          return {
            itemsByOrder: {
              ...state.itemsByOrder,
              [orderId]: [...currentItems, { ...item, id }],
            },
          };
        });
      },
      removeItem: (orderId, itemId) => {
        set((state) => ({
          itemsByOrder: {
            ...state.itemsByOrder,
            [orderId]: (state.itemsByOrder[orderId] || []).filter((i) => i.id !== itemId),
          },
        }));
      },
      updateItemQuantity: (orderId, itemId, quantity) => {
        set((state) => ({
          itemsByOrder: {
            ...state.itemsByOrder,
            [orderId]: (state.itemsByOrder[orderId] || []).map((i) =>
              i.id === itemId ? { ...i, quantity } : i
            ),
          },
        }));
      },
      clearOrderCart: (orderId) => {
        set((state) => {
          const newItemsByOrder = { ...state.itemsByOrder };
          delete newItemsByOrder[orderId];
          return { itemsByOrder: newItemsByOrder };
        });
      },
      getItems: (orderId) => {
        if (!orderId) return [];
        return get().itemsByOrder[orderId] || [];
      },
    }),
    {
      name: 'palm-cart-storage',
    }
  )
);
