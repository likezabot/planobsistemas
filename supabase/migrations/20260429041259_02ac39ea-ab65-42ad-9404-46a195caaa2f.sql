CREATE OR REPLACE FUNCTION public.claim_print_job(
    p_job_id uuid,
    p_agent_id text
)
RETURNS boolean AS $$
DECLARE
    v_updated boolean;
BEGIN
    UPDATE public.print_jobs
    SET 
        status = 'printing',
        agent_id = p_agent_id,
        claimed_at = now(),
        attempts = attempts + 1
    WHERE id = p_job_id
      AND status = 'pending';
      
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN COALESCE(v_updated, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.complete_print_job(
    p_job_id uuid,
    p_agent_id text
)
RETURNS boolean AS $$
DECLARE
    v_updated boolean;
BEGIN
    UPDATE public.print_jobs
    SET 
        status = 'printed',
        printed_at = now()
    WHERE id = p_job_id
      AND agent_id = p_agent_id
      AND status = 'printing';
      
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN COALESCE(v_updated, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.fail_print_job(
    p_job_id uuid,
    p_agent_id text,
    p_error text
)
RETURNS boolean AS $$
DECLARE
    v_updated boolean;
BEGIN
    UPDATE public.print_jobs
    SET 
        status = 'failed',
        last_error = p_error
    WHERE id = p_job_id
      AND agent_id = p_agent_id
      AND status = 'printing';
      
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN COALESCE(v_updated, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;