
-- Revoke from everyone first
REVOKE ALL ON FUNCTION public.get_active_orders_summary(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_account_print(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_active_orders_summary(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.request_account_print(uuid) FROM anon;

-- Grant to authenticated
GRANT EXECUTE ON FUNCTION public.get_active_orders_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_account_print(uuid) TO authenticated;

-- Do the same for F1 functions to be safe
REVOKE ALL ON FUNCTION public.open_table_order(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_counter_order(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.add_items_to_order(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.send_order_to_kitchen(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_order_item(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.close_order(uuid, public.payment_method) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.open_table_order(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_counter_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_items_to_order(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_order_to_kitchen(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_order_item(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_order(uuid, public.payment_method) TO authenticated;
