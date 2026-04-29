REVOKE EXECUTE ON FUNCTION public.claim_print_job(uuid, text) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.complete_print_job(uuid, text) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.fail_print_job(uuid, text, text) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.reprint_order(uuid, text) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.create_print_job_for_order(uuid, text, text) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.claim_print_job(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_print_job(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fail_print_job(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reprint_order(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_print_job_for_order(uuid, text, text) TO authenticated;