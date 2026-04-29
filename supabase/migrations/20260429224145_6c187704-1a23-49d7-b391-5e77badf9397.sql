REVOKE EXECUTE ON FUNCTION public.open_table_order(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.create_counter_order(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.add_items_to_order(uuid, jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.send_order_to_kitchen(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.cancel_order_item(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.close_order(uuid, payment_method) FROM anon, public;

GRANT EXECUTE ON FUNCTION public.open_table_order(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_counter_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_items_to_order(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_order_to_kitchen(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_order_item(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_order(uuid, payment_method) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.claim_print_job(uuid, uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.complete_print_job(uuid, uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.fail_print_job(uuid, uuid, text, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_pending_print_jobs(uuid, uuid, text, timestamptz) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.claim_print_job(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_print_job(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fail_print_job(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pending_print_jobs(uuid, uuid, text, timestamptz) TO authenticated;