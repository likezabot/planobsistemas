
CREATE OR REPLACE FUNCTION public.request_account_print(_order_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_restaurant_id uuid;
    v_tenant_id uuid;
    v_print_job_id uuid;
    v_restaurant_name text;
BEGIN
    SELECT restaurant_id, tenant_id INTO v_restaurant_id, v_tenant_id FROM public.orders WHERE id = _order_id;
    IF v_restaurant_id IS NULL THEN RAISE EXCEPTION 'Pedido não encontrado.'; END IF;

    IF NOT public.check_restaurant_role(v_restaurant_id, ARRAY['cashier', 'manager', 'owner']) THEN
        RAISE EXCEPTION 'Não autorizado.';
    END IF;

    SELECT name INTO v_restaurant_name FROM public.restaurants WHERE id = v_restaurant_id;

    INSERT INTO public.print_jobs (
        restaurant_id, tenant_id, order_id, source, status, payload
    ) VALUES (
        v_restaurant_id, v_tenant_id, _order_id, 'account', 'pending', 
        jsonb_build_object(
            'fingerprint', jsonb_build_object(
                'ORDER', _order_id,
                'SOURCE', 'account',
                'TIMESTAMP', now(),
                'APP_BUILD', '1.1.1',
                'PRINT_ENGINE', 'lovable-v1'
            ),
            'requested_at', now(),
            'requested_by', auth.uid(),
            'restaurant_name', v_restaurant_name
        )
    ) RETURNING id INTO v_print_job_id;

    RETURN v_print_job_id;
END;
$$;
