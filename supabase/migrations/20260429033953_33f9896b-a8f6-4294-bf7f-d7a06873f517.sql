-- Revoke public execute and grant only to authenticated users
REVOKE EXECUTE ON FUNCTION public.create_print_job_for_order(UUID, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.create_print_job_for_order(UUID, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.claim_print_job(UUID, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.claim_print_job(UUID, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.complete_print_job(UUID, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.complete_print_job(UUID, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.fail_print_job(UUID, TEXT, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.fail_print_job(UUID, TEXT, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.reprint_order(UUID, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.reprint_order(UUID, TEXT) TO authenticated;
