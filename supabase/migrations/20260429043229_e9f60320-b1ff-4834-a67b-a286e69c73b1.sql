-- Create print_agents table
CREATE TABLE public.print_agents (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    secret_key TEXT NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    last_seen_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(restaurant_id, name)
);

-- Enable RLS
ALTER TABLE public.print_agents ENABLE ROW LEVEL SECURITY;

-- Policies for print_agents (only managers/owners can manage agents)
CREATE POLICY "Managers can manage print agents"
ON public.print_agents
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.restaurant_members
        WHERE restaurant_id = public.print_agents.restaurant_id
          AND user_id = auth.uid()
          AND role IN ('owner', 'manager')
    )
);

-- Update claim_print_job to be more secure
CREATE OR REPLACE FUNCTION public.claim_print_job(
    p_job_id UUID,
    p_agent_id UUID,
    p_secret_key TEXT
)
RETURNS boolean AS $$
DECLARE
    v_updated boolean;
    v_agent_restaurant_id UUID;
    v_job_restaurant_id UUID;
BEGIN
    -- 1. Validate Agent and Key
    SELECT restaurant_id INTO v_agent_restaurant_id
    FROM public.print_agents
    WHERE id = p_agent_id AND secret_key = p_secret_key AND status = 'active';
    
    IF v_agent_restaurant_id IS NULL THEN
        RAISE EXCEPTION 'Invalid agent or secret key';
    END IF;

    -- 2. Validate Job belongs to the same restaurant
    SELECT restaurant_id INTO v_job_restaurant_id
    FROM public.print_jobs
    WHERE id = p_job_id;

    IF v_agent_restaurant_id <> v_job_restaurant_id THEN
        RAISE EXCEPTION 'Agent cannot claim job from another restaurant';
    END IF;

    -- 3. Perform Claim
    UPDATE public.print_jobs
    SET 
        status = 'printing',
        agent_id = p_agent_id::text,
        claimed_at = now(),
        attempts = attempts + 1
    WHERE id = p_job_id
      AND status = 'pending';
      
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    
    -- 4. Update agent heartbeat
    IF v_updated THEN
        UPDATE public.print_agents SET last_seen_at = now() WHERE id = p_agent_id;
    END IF;

    RETURN COALESCE(v_updated, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Update complete_print_job
CREATE OR REPLACE FUNCTION public.complete_print_job(
    p_job_id UUID,
    p_agent_id UUID,
    p_secret_key TEXT
)
RETURNS boolean AS $$
DECLARE
    v_updated boolean;
BEGIN
    -- Validate Agent and Key
    IF NOT EXISTS (
        SELECT 1 FROM public.print_agents
        WHERE id = p_agent_id AND secret_key = p_secret_key AND status = 'active'
    ) THEN
        RAISE EXCEPTION 'Invalid agent or secret key';
    END IF;

    UPDATE public.print_jobs
    SET 
        status = 'printed',
        printed_at = now()
    WHERE id = p_job_id
      AND agent_id = p_agent_id::text
      AND status = 'printing';
      
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    
    IF v_updated THEN
        UPDATE public.print_agents SET last_seen_at = now() WHERE id = p_agent_id;
    END IF;

    RETURN COALESCE(v_updated, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Update fail_print_job
CREATE OR REPLACE FUNCTION public.fail_print_job(
    p_job_id UUID,
    p_agent_id UUID,
    p_secret_key TEXT,
    p_error TEXT
)
RETURNS boolean AS $$
DECLARE
    v_updated boolean;
BEGIN
    -- Validate Agent and Key
    IF NOT EXISTS (
        SELECT 1 FROM public.print_agents
        WHERE id = p_agent_id AND secret_key = p_secret_key AND status = 'active'
    ) THEN
        RAISE EXCEPTION 'Invalid agent or secret key';
    END IF;

    UPDATE public.print_jobs
    SET 
        status = 'failed',
        last_error = p_error
    WHERE id = p_job_id
      AND agent_id = p_agent_id::text
      AND status = 'printing';
      
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    
    IF v_updated THEN
        UPDATE public.print_agents SET last_seen_at = now() WHERE id = p_agent_id;
    END IF;

    RETURN COALESCE(v_updated, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Grant execute to anon and authenticated (as requested, the security is inside the RPC)
GRANT EXECUTE ON FUNCTION public.claim_print_job(UUID, UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_print_job(UUID, UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_print_job(UUID, UUID, TEXT, TEXT) TO anon, authenticated;
