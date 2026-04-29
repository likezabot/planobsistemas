-- Tighten security on new RPCs
REVOKE EXECUTE ON FUNCTION public.open_table_order(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.open_table_order(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.create_counter_order(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.create_counter_order(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.add_items_to_order(uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.add_items_to_order(uuid, jsonb) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.send_order_to_kitchen(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.send_order_to_kitchen(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.cancel_order_item(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.cancel_order_item(uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.close_order(uuid, payment_method) FROM public;
GRANT EXECUTE ON FUNCTION public.close_order(uuid, payment_method) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.check_restaurant_role(uuid, text[]) FROM public;
GRANT EXECUTE ON FUNCTION public.check_restaurant_role(uuid, text[]) TO authenticated;