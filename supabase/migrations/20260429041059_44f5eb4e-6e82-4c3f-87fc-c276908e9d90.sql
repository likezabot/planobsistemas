REVOKE EXECUTE ON FUNCTION public.create_print_job_for_order(uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.create_print_job_for_order(uuid, text, text) TO authenticated;