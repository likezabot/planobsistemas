-- Create dining_tables table
CREATE TABLE public.dining_tables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    restaurant_id UUID NOT NULL REFERENCES restaurants(id),
    name TEXT NOT NULL,
    area TEXT,
    seats INTEGER,
    active BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT dining_tables_seats_check CHECK (seats >= 0 OR seats IS NULL)
);

-- Create unique index for restaurant_id and lower(name)
CREATE UNIQUE INDEX idx_dining_tables_restaurant_name_lower ON public.dining_tables (restaurant_id, lower(name));

-- Enable RLS
ALTER TABLE public.dining_tables ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "owner_manager_all_dining_tables" ON public.dining_tables
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM restaurant_members
        WHERE restaurant_id = dining_tables.restaurant_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'manager')
    )
);

CREATE POLICY "restaurant_members_select_dining_tables" ON public.dining_tables
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM restaurant_members
        WHERE restaurant_id = dining_tables.restaurant_id
        AND user_id = auth.uid()
    )
);

-- Add/validate columns in orders
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS service_mode TEXT DEFAULT 'counter' CHECK (service_mode IN ('table', 'counter', 'delivery')),
ADD COLUMN IF NOT EXISTS table_id UUID REFERENCES dining_tables(id),
ADD COLUMN IF NOT EXISTS opened_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'open' CHECK (payment_status IN ('open', 'pending', 'paid', 'cancelled')),
ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

-- Add/validate columns in order_items
ALTER TABLE public.order_items
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'preparing', 'ready', 'delivered', 'cancelled')),
ADD COLUMN IF NOT EXISTS sent_to_kitchen_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS cancel_reason TEXT,
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

-- Create function to update updated_at if it doesn't exist
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Update updated_at trigger for dining_tables
DROP TRIGGER IF EXISTS update_dining_tables_updated_at ON public.dining_tables;
CREATE TRIGGER update_dining_tables_updated_at
BEFORE UPDATE ON public.dining_tables
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();