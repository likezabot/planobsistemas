-- Create coupons table
CREATE TABLE public.coupons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('percent', 'fixed')),
    value_cents INTEGER,
    percent_value NUMERIC(5,2),
    min_order_cents INTEGER NOT NULL DEFAULT 0,
    max_uses INTEGER,
    used_count INTEGER NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT true,
    valid_from TIMESTAMP WITH TIME ZONE,
    valid_until TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT coupons_code_unique UNIQUE (restaurant_id, code),
    CONSTRAINT coupons_fixed_value_check CHECK (type != 'fixed' OR value_cents IS NOT NULL),
    CONSTRAINT coupons_percent_value_check CHECK (type != 'percent' OR (percent_value IS NOT NULL AND percent_value > 0 AND percent_value <= 100))
);

-- Add coupon info to orders
ALTER TABLE public.orders 
ADD COLUMN coupon_code TEXT,
ADD COLUMN discount_cents INTEGER NOT NULL DEFAULT 0;

-- Enable RLS on coupons
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

-- Admin CRUD
CREATE POLICY "Owners and managers can CRUD coupons" 
ON public.coupons 
FOR ALL 
USING (
    EXISTS (
        SELECT 1 FROM restaurant_members
        WHERE restaurant_id = coupons.restaurant_id 
          AND user_id = auth.uid()
          AND role IN ('owner', 'manager')
    )
);

-- Member view
CREATE POLICY "Members can view coupons" 
ON public.coupons 
FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM restaurant_members
        WHERE restaurant_id = coupons.restaurant_id 
          AND user_id = auth.uid()
    )
);

-- Trigger for updated_at
CREATE TRIGGER update_coupons_updated_at
BEFORE UPDATE ON public.coupons
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- RPC to validate coupon
CREATE OR REPLACE FUNCTION public.validate_coupon(_slug TEXT, _code TEXT, _subtotal_cents INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_restaurant_id UUID;
    v_coupon RECORD;
    v_discount INTEGER := 0;
BEGIN
    SELECT id INTO v_restaurant_id FROM public.restaurants WHERE slug = _slug AND public_menu_enabled = true;
    IF v_restaurant_id IS NULL THEN
        RETURN jsonb_build_object('valid', false, 'message', 'Restaurante não encontrado.');
    END IF;

    SELECT * INTO v_coupon FROM public.coupons 
    WHERE restaurant_id = v_restaurant_id AND upper(code) = upper(_code);

    IF v_coupon.id IS NULL THEN
        RETURN jsonb_build_object('valid', false, 'message', 'Cupom inválido.');
    END IF;

    IF NOT v_coupon.active THEN
        RETURN jsonb_build_object('valid', false, 'message', 'Cupom inativo.');
    END IF;

    IF v_coupon.valid_from IS NOT NULL AND now() < v_coupon.valid_from THEN
        RETURN jsonb_build_object('valid', false, 'message', 'Cupom ainda não é válido.');
    END IF;

    IF v_coupon.valid_until IS NOT NULL AND now() > v_coupon.valid_until THEN
        RETURN jsonb_build_object('valid', false, 'message', 'Cupom expirado.');
    END IF;

    IF v_coupon.max_uses IS NOT NULL AND v_coupon.used_count >= v_coupon.max_uses THEN
        RETURN jsonb_build_object('valid', false, 'message', 'Limite de usos atingido.');
    END IF;

    IF _subtotal_cents < v_coupon.min_order_cents THEN
        RETURN jsonb_build_object('valid', false, 'message', 'Pedido mínimo não atingido.');
    END IF;

    -- Calculate discount
    IF v_coupon.type = 'fixed' THEN
        v_discount := LEAST(v_coupon.value_cents, _subtotal_cents);
    ELSE
        v_discount := ROUND(_subtotal_cents * (v_coupon.percent_value / 100))::INTEGER;
    END IF;

    RETURN jsonb_build_object(
        'valid', true, 
        'discount_cents', v_discount, 
        'coupon_id', v_coupon.id,
        'message', 'Cupom aplicado!'
    );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.validate_coupon(TEXT, TEXT, INTEGER) FROM public;
GRANT EXECUTE ON FUNCTION public.validate_coupon(TEXT, TEXT, INTEGER) TO authenticated, anon;