-- Drop old versions of the function
DROP FUNCTION IF EXISTS public.create_public_order(text, text, text, order_type, payment_method, text, jsonb, text, text);
DROP FUNCTION IF EXISTS public.create_public_order(text, text, text, order_type, payment_method, text, jsonb, text, text, uuid);

-- Ensure the latest one has the correct permissions
GRANT EXECUTE ON FUNCTION public.create_public_order(text, text, text, order_type, payment_method, text, jsonb, text, text, uuid, text) TO authenticated, anon;