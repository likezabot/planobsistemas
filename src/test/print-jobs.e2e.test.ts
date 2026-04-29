import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { rpcWithRetry, queryWithRetry } from './helpers/retry';

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const anonKey =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  '';

const hasServiceRole = Boolean(supabaseUrl && serviceRoleKey);
// Skip the whole suite when SERVICE_ROLE_KEY is not configured (local dev / CI without secret).
// This avoids confusing failures like "restaurant.id null" caused by a broken admin client.
const describeIfAdmin = hasServiceRole ? describe : describe.skip;

const adminClient = hasServiceRole ? createClient(supabaseUrl, serviceRoleKey) : (null as any);
const anonClient = createClient(supabaseUrl, anonKey);

describeIfAdmin('Print Jobs Security & Logic E2E', () => {
  let testRestaurantId: string;
  let testOrderId: string;
  let testTenantId: string;

  beforeAll(async () => {
    const { data: tenant } = await queryWithRetry(() =>
      adminClient.from('tenants').select('id').limit(1).single()
    );
    testTenantId = tenant.id;

    const { data: restaurant } = await queryWithRetry(() =>
      adminClient
        .from('restaurants')
        .insert({
          tenant_id: testTenantId,
          name: 'Test Print Restaurant',
          slug: 'test-print-' + Date.now(),
        })
        .select('id')
        .single()
    );
    testRestaurantId = restaurant.id;

    const { data: order, error: orderError } = await queryWithRetry(() =>
      adminClient
        .from('orders')
        .insert({
          tenant_id: testTenantId,
          restaurant_id: testRestaurantId,
          customer_name: 'Print Tester',
          customer_phone: '11999999999',
          order_type: 'pickup',
          idempotency_key: 'test-print-' + Date.now(),
          total_cents: 1000,
          status: 'new',
        })
        .select('id')
        .single()
    );

    if (orderError) {
      console.error('Order Insert Error:', orderError);
      throw orderError;
    }
    testOrderId = order.id;
  });

  it('anonymous users cannot read print_jobs directly', async () => {
    const { data, error } = await queryWithRetry(() => anonClient.from('print_jobs').select('*'));
    expect(error).toBeNull();
    expect(data || []).toHaveLength(0);
  });

  it('anonymous users cannot claim print jobs', async () => {
    const { error } = await rpcWithRetry(anonClient, 'claim_print_job', {
      p_job_id: '00000000-0000-0000-0000-000000000000',
      p_agent_id: 'test-agent',
    });
    expect(error).not.toBeNull();
  });

  it('creating two automatic jobs for same order/payload fails (Unique Index)', async () => {
    const { data: jobId1, error: error1 } = await rpcWithRetry(adminClient, 'create_print_job_for_order', {
      p_order_id: testOrderId,
      p_source: 'auto',
    });
    expect(error1).toBeNull();
    expect(jobId1).toBeDefined();

    const { data: jobId2, error: error2 } = await rpcWithRetry(adminClient, 'create_print_job_for_order', {
      p_order_id: testOrderId,
      p_source: 'auto',
    });

    expect(error2).toBeNull();
    expect(jobId2).toBe(jobId1);
  });

  it('reprint creates a NEW job even if one exists', async () => {
    const { data: jobId, error } = await rpcWithRetry(adminClient, 'create_print_job_for_order', {
      p_order_id: testOrderId,
      p_source: 'reprint',
      p_reason: 'Paper jam',
    });
    expect(error).toBeNull();
    expect(jobId).toBeDefined();

    const { data: job } = await queryWithRetry(() =>
      adminClient.from('print_jobs').select('source').eq('id', jobId).single()
    );
    expect(job.source).toBe('reprint');
  });

  it('state machine: pending -> printing -> printed', async () => {
    const { data: jobId } = await rpcWithRetry(adminClient, 'create_print_job_for_order', {
      p_order_id: testOrderId,
      p_source: 'manual',
    });

    const { data: claimed } = await rpcWithRetry(adminClient, 'claim_print_job', {
      p_job_id: jobId,
      p_agent_id: 'agent-1',
    });
    expect(claimed).toBe(true);

    const { data: job1 } = await queryWithRetry(() =>
      adminClient.from('print_jobs').select('status, agent_id').eq('id', jobId).single()
    );
    expect(job1.status).toBe('printing');
    expect(job1.agent_id).toBe('agent-1');

    const { data: completed } = await rpcWithRetry(adminClient, 'complete_print_job', {
      p_job_id: jobId,
      p_agent_id: 'agent-1',
    });
    expect(completed).toBe(true);

    const { data: job2 } = await queryWithRetry(() =>
      adminClient.from('print_jobs').select('status').eq('id', jobId).single()
    );
    expect(job2.status).toBe('printed');
  });

  it('cannot complete with WRONG agent_id', async () => {
    const { data: jobId } = await rpcWithRetry(adminClient, 'create_print_job_for_order', {
      p_order_id: testOrderId,
      p_source: 'manual',
    });

    await rpcWithRetry(adminClient, 'claim_print_job', { p_job_id: jobId, p_agent_id: 'agent-correct' });

    const { data: completed } = await rpcWithRetry(adminClient, 'complete_print_job', {
      p_job_id: jobId,
      p_agent_id: 'agent-wrong',
    });
    expect(completed).toBe(false);

    const { data: job } = await queryWithRetry(() =>
      adminClient.from('print_jobs').select('status').eq('id', jobId).single()
    );
    expect(job.status).toBe('printing');
  });

  it('failed jobs do not transition to printed directly', async () => {
    const { data: jobId } = await rpcWithRetry(adminClient, 'create_print_job_for_order', {
      p_order_id: testOrderId,
      p_source: 'manual',
    });

    await rpcWithRetry(adminClient, 'claim_print_job', { p_job_id: jobId, p_agent_id: 'agent-1' });
    await rpcWithRetry(adminClient, 'fail_print_job', {
      p_job_id: jobId,
      p_agent_id: 'agent-1',
      p_error: 'Test error',
    });

    const { data: completed } = await rpcWithRetry(adminClient, 'complete_print_job', {
      p_job_id: jobId,
      p_agent_id: 'agent-1',
    });
    expect(completed).toBe(false);
  });
});
