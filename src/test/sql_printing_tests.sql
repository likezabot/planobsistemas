
-- TEST SUITE FOR PRINTING CONTRACT
DO $$
DECLARE
    v_tenant_id UUID;
    v_restaurant_id UUID;
    v_restaurant_b_id UUID;
    v_user UUID := '6093fce1-c27a-490b-b9a0-9c87a3d77166'; -- Valid user ID found
    v_order_id UUID;
    v_job_id UUID;
    v_job_id_2 UUID;
    v_res BOOLEAN;
BEGIN
    -- 1. Setup
    INSERT INTO tenants (name, slug) VALUES ('Test Tenant', 'test-tenant-' || gen_random_uuid()) RETURNING id INTO v_tenant_id;
    INSERT INTO restaurants (tenant_id, name, slug) VALUES (v_tenant_id, 'Rest A', 'rest-a-' || gen_random_uuid()) RETURNING id INTO v_restaurant_id;
    INSERT INTO restaurants (tenant_id, name, slug) VALUES (v_tenant_id, 'Rest B', 'rest-b-' || gen_random_uuid()) RETURNING id INTO v_restaurant_b_id;
    
    -- Ensure user is a member of Rest A as manager
    -- If already member, just update role. If not, insert.
    INSERT INTO restaurant_members (tenant_id, restaurant_id, user_id, role)
    VALUES (v_tenant_id, v_restaurant_id, v_user, 'manager')
    ON CONFLICT (restaurant_id, user_id, role) DO UPDATE SET role = 'manager';

    -- Create an order
    INSERT INTO orders (tenant_id, restaurant_id, customer_name, customer_phone, order_type, idempotency_key, total_cents)
    VALUES (v_tenant_id, v_restaurant_id, 'Test Client', '123', 'pickup', 'idemp-' || gen_random_uuid(), 1000)
    RETURNING id INTO v_order_id;
    
    -- Add one item
    INSERT INTO order_items (order_id, product_id, quantity, unit_price_cents, total_price_cents)
    SELECT v_order_id, id, 1, price_cents, price_cents FROM products WHERE restaurant_id = v_restaurant_id LIMIT 1;
    -- If no products exist, we might need to create one, but we'll assume there is one for now or just skip item requirement if possible.
    -- Let's create one just in case.
    IF NOT EXISTS (SELECT 1 FROM products WHERE restaurant_id = v_restaurant_id) THEN
        INSERT INTO products (tenant_id, restaurant_id, name, price_cents, cost_cents, active, sort_order)
        VALUES (v_tenant_id, v_restaurant_id, 'Test Product', 1000, 500, true, 0);
        
        INSERT INTO order_items (order_id, product_id, quantity, unit_price_cents, total_price_cents)
        SELECT v_order_id, id, 1, 1000, 1000 FROM products WHERE restaurant_id = v_restaurant_id LIMIT 1;
    END IF;

    -- 2. Test Duplicity (Auto)
    -- Set auth context
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user::text)::text, true);
    
    v_job_id := create_print_job_for_order(v_order_id, 'auto');
    v_job_id_2 := create_print_job_for_order(v_order_id, 'auto');
    
    IF v_job_id != v_job_id_2 THEN
        RAISE EXCEPTION 'Test Failed: Duplicity check failed, expected same Job ID but got % and %', v_job_id, v_job_id_2;
    END IF;
    
    -- 3. Test Permissions (Waiter Reprint)
    UPDATE restaurant_members SET role = 'waiter' WHERE user_id = v_user;
    BEGIN
        PERFORM reprint_order(v_order_id, 'Because I want');
        RAISE EXCEPTION 'Test Failed: Waiter should not be able to reprint';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM NOT LIKE '%Not authorized%' THEN
            RAISE EXCEPTION 'Test Failed: Unexpected error for waiter reprint: %', SQLERRM;
        END IF;
    END;

    -- 4. Test Reprint (Manager)
    UPDATE restaurant_members SET role = 'manager' WHERE user_id = v_user;
    v_job_id_2 := reprint_order(v_order_id, 'Paper jammed');
    
    IF v_job_id = v_job_id_2 THEN
        RAISE EXCEPTION 'Test Failed: Reprint should create a NEW job ID, but got same %', v_job_id;
    END IF;
    
    -- Verify audit log
    IF NOT EXISTS (SELECT 1 FROM audit_log WHERE action = 'order_reprint' AND entity_id = v_order_id) THEN
        RAISE EXCEPTION 'Test Failed: Audit log not created for reprint';
    END IF;

    -- 5. Test Agent Mismatch
    v_res := claim_print_job(v_job_id_2, 'agent-1');
    IF NOT v_res THEN RAISE EXCEPTION 'Test Failed: Manager should be able to claim job'; END IF;
    
    v_res := complete_print_job(v_job_id_2, 'agent-2'); -- Wrong agent
    IF v_res THEN RAISE EXCEPTION 'Test Failed: Should NOT complete job with wrong agent_id'; END IF;

    -- 6. Test Cross-Restaurant
    -- Change membership to Rest B
    UPDATE restaurant_members SET restaurant_id = v_restaurant_b_id, role = 'owner' WHERE user_id = v_user;
    v_res := claim_print_job(v_job_id, 'agent-other');
    IF v_res THEN RAISE EXCEPTION 'Test Failed: Member of Rest B should NOT claim job of Rest A'; END IF;

    -- 7. Test Cancelled Order Auto-Print
    UPDATE orders SET status = 'cancelled' WHERE id = v_order_id;
    -- Back to Rest A
    UPDATE restaurant_members SET restaurant_id = v_restaurant_id, role = 'manager' WHERE user_id = v_user;
    
    v_job_id := create_print_job_for_order(v_order_id, 'auto');
    IF v_job_id IS NOT NULL THEN
        RAISE EXCEPTION 'Test Failed: Cancelled order should NOT generate auto print job';
    END IF;

    RAISE NOTICE 'ALL PRINTING CONTRACT TESTS PASSED';
END $$;
