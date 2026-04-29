import { create } from 'zustand'; // I'll add zustand to be more efficient
import { persist } from 'zustand/middleware';

export interface CartItem {
  // Identificador único da linha do carrinho (não confundir com product_id).
  // Permite múltiplas customizações do mesmo produto coexistirem (ex: 2 pizzas diferentes).
  line_id: string;
  product_id: string;
  name: string;
  price_cents: number;
  quantity: number;
  note?: string;
  // Campos enviados ao backend para recálculo
  variation_id?: string | null;
  selected_options?: string[]; // option_item ids
  pizza_flavors?: string[]; // pizza_flavor ids
  customization?: {
    description: string;
    details: any;
  };
}

// (interface antiga removida — useCart agora usa CartStateInternal abaixo)

function makeLineId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

interface AddItemArg extends Omit<CartItem, "line_id"> {
  line_id?: string;
}

interface CartStateInternal {
  items: CartItem[];
  restaurantSlug: string | null;
  addItem: (slug: string, item: AddItemArg) => void;
  removeItem: (line_id: string) => void;
  updateQuantity: (line_id: string, quantity: number) => void;
  clearCart: () => void;
  getTotal: () => number;
}

export const useCart = create<CartStateInternal>()(
  persist(
    (set, get) => ({
      items: [],
      restaurantSlug: null,

      addItem: (slug, raw) => {
        const { items, restaurantSlug } = get();
        const item: CartItem = {
          ...raw,
          line_id: raw.line_id ?? makeLineId(),
        };

        if (restaurantSlug && restaurantSlug !== slug) {
          set({ items: [item], restaurantSlug: slug });
          return;
        }

        // Mesclar somente quando é exatamente o mesmo produto sem customização
        // (sem variant, sem opções, sem sabores). Caso contrário cria nova linha.
        const isPlain =
          !item.variation_id &&
          (!item.selected_options || item.selected_options.length === 0) &&
          (!item.pizza_flavors || item.pizza_flavors.length === 0);

        if (isPlain) {
          const existing = items.find(
            (i) =>
              i.product_id === item.product_id &&
              !i.variation_id &&
              (!i.selected_options || i.selected_options.length === 0) &&
              (!i.pizza_flavors || i.pizza_flavors.length === 0),
          );
          if (existing) {
            set({
              items: items.map((i) =>
                i.line_id === existing.line_id
                  ? { ...i, quantity: i.quantity + item.quantity }
                  : i,
              ),
              restaurantSlug: slug,
            });
            return;
          }
        }

        set({ items: [...items, item], restaurantSlug: slug });
      },

      removeItem: (line_id) => {
        set({ items: get().items.filter((i) => i.line_id !== line_id) });
      },

      updateQuantity: (line_id, quantity) => {
        if (quantity <= 0) {
          get().removeItem(line_id);
          return;
        }
        set({
          items: get().items.map((i) =>
            i.line_id === line_id ? { ...i, quantity } : i,
          ),
        });
      },

      clearCart: () => set({ items: [], restaurantSlug: null }),

      getTotal: () => {
        return get().items.reduce(
          (total, item) => total + item.price_cents * item.quantity,
          0,
        );
      },
    }),
    {
      name: "restaurant-cart",
      version: 2,
      // Migra carrinhos antigos (sem line_id)
      migrate: (persisted: any) => {
        if (!persisted) return persisted;
        if (Array.isArray(persisted.items)) {
          persisted.items = persisted.items.map((it: any) => ({
            ...it,
            line_id: it.line_id ?? makeLineId(),
          }));
        }
        return persisted;
      },
    },
  ),
);
