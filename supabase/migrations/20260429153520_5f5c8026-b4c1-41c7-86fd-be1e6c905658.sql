-- Update restaurants table
ALTER TABLE public.restaurants 
ADD COLUMN inventory_enabled BOOLEAN DEFAULT false,
ADD COLUMN inventory_mode TEXT DEFAULT 'simple' CHECK (inventory_mode IN ('simple', 'advanced'));

-- Add stock columns to products
ALTER TABLE public.products 
ADD COLUMN track_stock BOOLEAN DEFAULT false,
ADD COLUMN stock_quantity NUMERIC DEFAULT 0,
ADD COLUMN low_stock_alert NUMERIC,
ADD COLUMN allow_out_of_stock_sale BOOLEAN DEFAULT false;

-- Add stock columns to product_variants
ALTER TABLE public.product_variants 
ADD COLUMN track_stock BOOLEAN DEFAULT false,
ADD COLUMN stock_quantity NUMERIC DEFAULT 0,
ADD COLUMN low_stock_alert NUMERIC,
ADD COLUMN allow_out_of_stock_sale BOOLEAN DEFAULT false;

-- Add stock columns to option_items
ALTER TABLE public.option_items 
ADD COLUMN track_stock BOOLEAN DEFAULT false,
ADD COLUMN stock_quantity NUMERIC DEFAULT 0,
ADD COLUMN low_stock_alert NUMERIC,
ADD COLUMN allow_out_of_stock_sale BOOLEAN DEFAULT false;

-- Add stock columns to pizza_flavors
ALTER TABLE public.pizza_flavors 
ADD COLUMN track_stock BOOLEAN DEFAULT false,
ADD COLUMN stock_quantity NUMERIC DEFAULT 0,
ADD COLUMN low_stock_alert NUMERIC,
ADD COLUMN allow_out_of_stock_sale BOOLEAN DEFAULT false;

-- Create inventory_logs table
CREATE TABLE public.inventory_logs (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    item_type TEXT NOT NULL CHECK (item_type IN ('product', 'variant', 'option_item', 'pizza_flavor')),
    item_id UUID NOT NULL,
    old_quantity NUMERIC NOT NULL,
    new_quantity NUMERIC NOT NULL,
    change_amount NUMERIC NOT NULL,
    reason TEXT NOT NULL, -- 'manual', 'sale', 'cancel', 'import'
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.inventory_logs ENABLE ROW LEVEL SECURITY;

-- Create policies for inventory_logs
CREATE POLICY "Users can view their restaurant's inventory logs" 
ON public.inventory_logs 
FOR SELECT 
USING (
    restaurant_id IN (
        SELECT restaurant_id FROM public.restaurant_members WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Managers and owners can insert inventory logs" 
ON public.inventory_logs 
FOR INSERT 
WITH CHECK (
    restaurant_id IN (
        SELECT restaurant_id FROM public.restaurant_members 
        WHERE user_id = auth.uid() AND role IN ('owner', 'manager')
    )
);

-- Function to handle stock updates and logging
CREATE OR REPLACE FUNCTION public.update_stock(
    p_restaurant_id UUID,
    p_item_type TEXT,
    p_item_id UUID,
    p_new_quantity NUMERIC,
    p_reason TEXT,
    p_order_id UUID DEFAULT NULL,
    p_created_by UUID DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
    v_old_quantity NUMERIC;
    v_tenant_id UUID;
BEGIN
    -- Get tenant_id and old quantity
    CASE p_item_type
        WHEN 'product' THEN
            SELECT stock_quantity, tenant_id INTO v_old_quantity, v_tenant_id FROM public.products WHERE id = p_item_id AND restaurant_id = p_restaurant_id;
            IF NOT FOUND THEN RETURN; END IF;
            UPDATE public.products SET stock_quantity = p_new_quantity WHERE id = p_item_id;
        WHEN 'variant' THEN
            SELECT pv.stock_quantity, p.tenant_id INTO v_old_quantity, v_tenant_id FROM public.product_variants pv JOIN public.products p ON pv.product_id = p.id WHERE pv.id = p_item_id AND p.restaurant_id = p_restaurant_id;
            IF NOT FOUND THEN RETURN; END IF;
            UPDATE public.product_variants SET stock_quantity = p_new_quantity WHERE id = p_item_id;
        WHEN 'option_item' THEN
            SELECT oi.stock_quantity, p.tenant_id 
            FROM public.option_items oi 
            JOIN public.option_groups og ON oi.group_id = og.id 
            JOIN public.products p ON og.product_id = p.id 
            WHERE oi.id = p_item_id AND p.restaurant_id = p_restaurant_id
            INTO v_old_quantity, v_tenant_id;
            IF NOT FOUND THEN RETURN; END IF;
            UPDATE public.option_items SET stock_quantity = p_new_quantity WHERE id = p_item_id;
        WHEN 'pizza_flavor' THEN
            SELECT stock_quantity, tenant_id INTO v_old_quantity, v_tenant_id FROM public.pizza_flavors WHERE id = p_item_id AND restaurant_id = p_restaurant_id;
            IF NOT FOUND THEN RETURN; END IF;
            UPDATE public.pizza_flavors SET stock_quantity = p_new_quantity WHERE id = p_item_id;
    END CASE;

    -- Log the change
    INSERT INTO public.inventory_logs (
        restaurant_id, tenant_id, item_type, item_id, old_quantity, new_quantity, change_amount, reason, order_id, created_by
    ) VALUES (
        p_restaurant_id, v_tenant_id, p_item_type, p_item_id, v_old_quantity, p_new_quantity, p_new_quantity - v_old_quantity, p_reason, p_order_id, p_created_by
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
