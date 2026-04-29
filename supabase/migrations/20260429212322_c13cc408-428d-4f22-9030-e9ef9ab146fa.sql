-- Cleanup old versions of print job functions
DROP FUNCTION IF EXISTS public.claim_print_job(uuid, text);
DROP FUNCTION IF EXISTS public.complete_print_job(uuid, text);
DROP FUNCTION IF EXISTS public.fail_print_job(uuid, text, text);

-- Tighten administrative and internal function grants
REVOKE EXECUTE ON FUNCTION public.export_catalog(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.import_catalog(uuid, jsonb, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.log_accounting_toggle() FROM anon;
REVOKE EXECUTE ON FUNCTION public.log_pizza_module_toggle() FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_stock(uuid, text, uuid, numeric, text, uuid, uuid) FROM anon;

-- Ensure internal order creation is not anon
REVOKE EXECUTE ON FUNCTION public.create_internal_order(uuid, text, text, order_type, payment_method, text, jsonb, text, text) FROM anon;

-- Confirmation of specific requested functions
GRANT EXECUTE ON FUNCTION public.create_public_order(text, text, text, order_type, payment_method, text, jsonb, text, text, uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_coupon(text, text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_delivery_zones(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_stats(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_customer_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_internal_order(uuid, text, text, order_type, payment_method, text, jsonb, text, text) TO authenticated;
