-- Status constraint
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_status') THEN
    CREATE TYPE public.order_status AS ENUM ('new', 'accepted', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'completed', 'cancelled');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_type') THEN
    CREATE TYPE public.order_type AS ENUM ('pickup', 'delivery');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_method') THEN
    CREATE TYPE public.payment_method AS ENUM ('money', 'card', 'pix', 'online');
  END IF;
END $$;

-- 1) Create orders table
CREATE TABLE public.orders (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id),
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id),
    
    -- Customer Info
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    order_type public.order_type NOT NULL,
    address TEXT, -- Required if delivery
    payment_method public.payment_method NOT NULL DEFAULT 'money',
    notes TEXT,
    
    -- Financials (Calculated server-side)
    subtotal_cents INTEGER NOT NULL DEFAULT 0,
    delivery_fee_cents INTEGER NOT NULL DEFAULT 0,
    total_cents INTEGER NOT NULL DEFAULT 0,
    
    -- Control
    status public.order_status NOT NULL DEFAULT 'new',
    idempotency_key TEXT NOT NULL,
    
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    
    -- Constraints
    CONSTRAINT orders_subtotal_positive CHECK (subtotal_cents >= 0),
    CONSTRAINT orders_total_positive CHECK (total_cents >= 0),
    CONSTRAINT orders_delivery_fee_positive CHECK (delivery_fee_cents >= 0),
    -- Unique idempotency key per restaurant
    CONSTRAINT orders_idempotency_unique UNIQUE (restaurant_id, idempotency_key)
);

-- 2) Create order_items table
CREATE TABLE public.order_items (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id),
    
    quantity INTEGER NOT NULL,
    unit_price_cents INTEGER NOT NULL,
    total_price_cents INTEGER NOT NULL,
    note TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    
    -- Constraints
    CONSTRAINT order_items_quantity_positive CHECK (quantity > 0)
);

-- Enable RLS
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- 3) RLS Policies
-- Owners and Managers can see all orders in their restaurant
CREATE POLICY "Members can view orders"
ON public.orders FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.restaurant_members
    WHERE restaurant_id = orders.restaurant_id
      AND user_id = auth.uid()
  )
);

-- Internal members can update status
CREATE POLICY "Managers can update orders"
ON public.orders FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.restaurant_members
    WHERE restaurant_id = orders.restaurant_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'manager')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.restaurant_members
    WHERE restaurant_id = orders.restaurant_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'manager')
  )
);

-- Order items policies
CREATE POLICY "Members can view order items"
ON public.order_items FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    JOIN public.restaurant_members rm ON rm.restaurant_id = o.restaurant_id
    WHERE o.id = order_items.order_id
      AND rm.user_id = auth.uid()
  )
);

-- Anonymous users CANNOT insert directly. 
-- They must use the create_public_order RPC.

-- 4) Secure RPC for Checkout
CREATE OR REPLACE FUNCTION public.create_public_order(
    _restaurant_slug TEXT,
    _customer_name TEXT,
    _customer_phone TEXT,
    _order_type TEXT,
    _payment_method TEXT,
    _idempotency_key TEXT,
    _items JSONB, -- Array of {product_id: uuid, quantity: int, note?: string}
    _address TEXT DEFAULT NULL,
    _notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_restaurant_id UUID;
    v_tenant_id UUID;
    v_order_id UUID;
    v_subtotal_cents INTEGER := 0;
    v_total_cents INTEGER := 0;
    v_item JSONB;
    v_product_id UUID;
    v_quantity INTEGER;
    v_price_cents INTEGER;
    v_product_active BOOLEAN;
    v_category_active BOOLEAN;
    v_existing_order_id UUID;
    v_phone_normalized TEXT;
BEGIN
    -- 1) Lookup restaurant
    SELECT id, tenant_id INTO v_restaurant_id, v_tenant_id
    FROM public.restaurants
    WHERE slug = _restaurant_slug AND public_menu_enabled = true;

    IF v_restaurant_id IS NULL THEN
        RAISE EXCEPTION 'Restaurante não encontrado ou cardápio desativado.';
    END IF;

    -- 2) Check idempotency
    SELECT id INTO v_existing_order_id
    FROM public.orders
    WHERE restaurant_id = v_restaurant_id AND idempotency_key = _idempotency_key;

    IF v_existing_order_id IS NOT NULL THEN
        RETURN jsonb_build_object('order_id', v_existing_order_id, 'idempotent', true);
    END IF;

    -- 3) Validation
    IF _customer_name IS NULL OR length(trim(_customer_name)) < 2 THEN
        RAISE EXCEPTION 'Nome inválido.';
    END IF;

    IF _customer_phone IS NULL OR length(trim(_customer_phone)) < 8 THEN
        RAISE EXCEPTION 'Telefone inválido.';
    END IF;

    IF _order_type = 'delivery' AND (_address IS NULL OR length(trim(_address)) < 5) THEN
        RAISE EXCEPTION 'Endereço obrigatório para entrega.';
    END IF;

    IF jsonb_array_length(_items) = 0 THEN
        RAISE EXCEPTION 'O pedido deve conter pelo menos um item.';
    END IF;

    -- Normalize phone (simple version: remove non-digits)
    v_phone_normalized := regexp_replace(_customer_phone, '[^\d]', '', 'g');

    -- 4) Create Order Header (temp values)
    INSERT INTO public.orders (
        tenant_id, restaurant_id, customer_name, customer_phone, 
        order_type, address, payment_method, notes, idempotency_key, status
    ) VALUES (
        v_tenant_id, v_restaurant_id, _customer_name, v_phone_normalized,
        _order_type::public.order_type, _address, _payment_method::public.payment_method, _notes, _idempotency_key, 'new'
    ) RETURNING id INTO v_order_id;

    -- 5) Process Items and Calculate Total
    FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
        v_product_id := (v_item->>'product_id')::UUID;
        v_quantity := (v_item->>'quantity')::INTEGER;

        IF v_quantity <= 0 THEN
            RAISE EXCEPTION 'Quantidade inválida para o produto.';
        END IF;

        -- Fetch product and check status (Security: server-side price)
        SELECT 
            p.price_cents, p.active, 
            COALESCE(c.active, true) 
        INTO v_price_cents, v_product_active, v_category_active
        FROM public.products p
        LEFT JOIN public.product_categories c ON c.id = p.category_id
        WHERE p.id = v_product_id AND p.restaurant_id = v_restaurant_id;

        IF v_product_active IS NOT TRUE THEN
            RAISE EXCEPTION 'Produto indisponível.';
        END IF;

        IF v_category_active IS NOT TRUE THEN
            RAISE EXCEPTION 'Categoria do produto indisponível.';
        END IF;

        -- Insert item
        INSERT INTO public.order_items (
            order_id, product_id, quantity, unit_price_cents, total_price_cents, note
        ) VALUES (
            v_order_id, v_product_id, v_quantity, v_price_cents, v_price_cents * v_quantity, (v_item->>'note')
        );

        v_subtotal_cents := v_subtotal_cents + (v_price_cents * v_quantity);
    END LOOP;

    -- 6) Update Order with final totals
    -- (For now delivery_fee is 0, will implement complex logic later)
    v_total_cents := v_subtotal_cents; 

    UPDATE public.orders
    SET subtotal_cents = v_subtotal_cents,
        total_cents = v_total_cents
    WHERE id = v_order_id;

    RETURN jsonb_build_object('order_id', v_order_id, 'idempotent', false);
END;
$$;

-- Revoke and Grant
REVOKE ALL ON FUNCTION public.create_public_order(text, text, text, text, text, text, jsonb, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_public_order(text, text, text, text, text, text, jsonb, text, text) TO anon, authenticated;

-- Add updated_at trigger for orders
CREATE TRIGGER trg_orders_updated_at
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();
