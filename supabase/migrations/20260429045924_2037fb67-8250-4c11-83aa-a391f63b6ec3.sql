-- Create Enums
DO $$ BEGIN
    CREATE TYPE public.product_type AS ENUM ('simple', 'variable', 'pizza', 'combo');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.pizza_price_rule AS ENUM ('max', 'average', 'sum');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Update products table
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS type public.product_type DEFAULT 'simple';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Create Product Variants (Sizes, Types)
CREATE TABLE IF NOT EXISTS public.product_variants (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    price_cents INTEGER NOT NULL DEFAULT 0,
    cost_cents INTEGER,
    active BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create Option Groups (Add-ons, Choices)
CREATE TABLE IF NOT EXISTS public.option_groups (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    min_options INTEGER NOT NULL DEFAULT 0,
    max_options INTEGER NOT NULL DEFAULT 1,
    is_required BOOLEAN NOT NULL DEFAULT false,
    active BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create Option Items
CREATE TABLE IF NOT EXISTS public.option_items (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    group_id UUID NOT NULL REFERENCES public.option_groups(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    price_cents INTEGER NOT NULL DEFAULT 0,
    cost_cents INTEGER,
    active BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Link Products to Option Groups
CREATE TABLE IF NOT EXISTS public.product_option_groups (
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    group_id UUID NOT NULL REFERENCES public.option_groups(id) ON DELETE CASCADE,
    sort_order INTEGER DEFAULT 0,
    PRIMARY KEY (product_id, group_id)
);

-- Pizza Config (for pizza products)
CREATE TABLE IF NOT EXISTS public.pizza_configs (
    product_id UUID NOT NULL PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
    max_flavors INTEGER NOT NULL DEFAULT 1,
    price_rule public.pizza_price_rule NOT NULL DEFAULT 'max',
    allow_edge_customization BOOLEAN NOT NULL DEFAULT true
);

-- Order Items Customization
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS customization JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS unit_price_cents INTEGER;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS subtotal_cents INTEGER;

-- Enable RLS on all new tables
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.option_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.option_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_option_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pizza_configs ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Public viewing (for catalog/menu)
CREATE POLICY "Anyone can view active variants" ON public.product_variants FOR SELECT USING (active = true);
CREATE POLICY "Anyone can view active option groups" ON public.option_groups FOR SELECT USING (active = true);
CREATE POLICY "Anyone can view active option items" ON public.option_items FOR SELECT USING (active = true);
CREATE POLICY "Anyone can view product option links" ON public.product_option_groups FOR SELECT USING (true);
CREATE POLICY "Anyone can view pizza configs" ON public.pizza_configs FOR SELECT USING (true);

-- Restaurant Management (generic policies)
CREATE POLICY "Owners can manage variants" ON public.product_variants 
FOR ALL USING (product_id IN (SELECT id FROM public.products));

CREATE POLICY "Owners can manage option groups" ON public.option_groups 
FOR ALL USING (true);

CREATE POLICY "Owners can manage option items" ON public.option_items 
FOR ALL USING (group_id IN (SELECT id FROM public.option_groups));

CREATE POLICY "Owners can manage product option links" ON public.product_option_groups 
FOR ALL USING (product_id IN (SELECT id FROM public.products));

CREATE POLICY "Owners can manage pizza configs" ON public.pizza_configs 
FOR ALL USING (product_id IN (SELECT id FROM public.products));

-- Add missing price_cents default value to products if it doesn't have one
ALTER TABLE public.products ALTER COLUMN price_cents SET DEFAULT 0;
