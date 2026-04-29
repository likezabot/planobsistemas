CREATE OR REPLACE FUNCTION public.get_pending_print_jobs(
    p_restaurant_id UUID,
    p_agent_id UUID,
    p_secret_key TEXT,
    p_after_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS SETOF public.print_jobs AS $$
BEGIN
    -- Validate Agent
    IF NOT EXISTS (
        SELECT 1 FROM public.print_agents
        WHERE id = p_agent_id 
          AND secret_key = p_secret_key 
          AND restaurant_id = p_restaurant_id
          AND status = 'active'
    ) THEN
        RAISE EXCEPTION 'Invalid agent credentials';
    END IF;

    -- Return pending jobs
    RETURN QUERY
    SELECT * FROM public.print_jobs
    WHERE restaurant_id = p_restaurant_id
      AND status = 'pending'
      AND (p_after_timestamp IS NULL OR created_at > p_after_timestamp)
    ORDER BY created_at ASC
    LIMIT 10;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_pending_print_jobs(UUID, UUID, TEXT, TIMESTAMP WITH TIME ZONE) TO anon, authenticated;
