import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { rpcWithRetry, queryWithRetry } from './helpers/retry';

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;

const adminClient = createClient(supabaseUrl, serviceRoleKey);
const anonClient = createClient(supabaseUrl, anonKey);

describe('Full QA Print Flow E2E', () => {
  let testRestaurantId: string;
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
          name: 'QA Flow Restaurant',
          slug: 'qa-flow-' + Date.now(),
        })
        .select('id')
        .single()
    );
    testRestaurantId = restaurant.id;
  });

  it('Flow 1: Happy Path (Checkout -> Preparing -> Printed)', async () => {
    const { data: order, error: orderError } = await queryWithRetry(() =>
      adminClient
        .from('orders')
        .insert({
          tenant_id: testTenantId,
          restaurant_id: testRestaurantId,
          customer_name: 'Customer QA Happy',
          customer_phone: '11999999999',
          order_type: 'pickup',
          idempotency_key: 'qa-happy-' + Date.now(),
          total_cents: 1000,
          status: 'new',
        })
        .select('id')
        .single()
    );

    expect(orderError).toBeNull();
    const orderId = order.id;

    const { data: initialJobs } = await queryWithRetry(() =>
      adminClient.from('print_jobs').select('id').eq('order_id', orderId)
    );
    expect(initialJobs || []).toHaveLength(0);

    const { error: updateError } = await queryWithRetry(() =>
      adminClient.from('orders').update({ status: 'preparing' }).eq('id', orderId)
    );
    expect(updateError).toBeNull();

    const { data: jobsAfterAccept } = await queryWithRetry(() =>
      adminClient.from('print_jobs').select('*').eq('order_id', orderId)
    );
    expect(jobsAfterAccept).toHaveLength(1);
    const job = jobsAfterAccept![0];
    expect(job.status).toBe('pending');
    expect(job.source).toBe('auto');

    const { data: claimed } = await rpcWithRetry(adminClient, 'claim_print_job', {
      p_job_id: job.id,
      p_agent_id: 'qa-agent-happy',
    });
    expect(claimed).toBe(true);

    const { data: completed } = await rpcWithRetry(adminClient, 'complete_print_job', {
      p_job_id: job.id,
      p_agent_id: 'qa-agent-happy',
    });
    expect(completed).toBe(true);

    const { data: finalJob } = await queryWithRetry(() =>
      adminClient.from('print_jobs').select('status').eq('id', job.id).single()
    );
    expect(finalJob.status).toBe('printed');

    await queryWithRetry(() => adminClient.from('audit_log').select('*').eq('target_id', orderId));
  });

  it('Flow 2: Failure & Manual Reprint', async () => {
    const { data: order } = await queryWithRetry(() =>
      adminClient
        .from('orders')
        .insert({
          tenant_id: testTenantId,
          restaurant_id: testRestaurantId,
          customer_name: 'Customer QA Fail',
          customer_phone: '11888888888',
          order_type: 'delivery',
          idempotency_key: 'qa-fail-' + Date.now(),
          total_cents: 2000,
          status: 'preparing',
        })
        .select('id')
        .single()
    );

    const orderId = order.id;

    const { data: jobs } = await queryWithRetry(() =>
      adminClient.from('print_jobs').select('*').eq('order_id', orderId)
    );
    expect(jobs).toHaveLength(1);
    const jobId = jobs![0].id;

    await rpcWithRetry(adminClient, 'claim_print_job', { p_job_id: jobId, p_agent_id: 'qa-agent-fail' });
    await rpcWithRetry(adminClient, 'fail_print_job', {
      p_job_id: jobId,
      p_agent_id: 'qa-agent-fail',
      p_error: 'Simulated Paper Jam',
    });

    const { data: failedJob } = await queryWithRetry(() =>
      adminClient.from('print_jobs').select('status').eq('id', jobId).single()
    );
    expect(failedJob.status).toBe('failed');

    const { data: allJobs } = await queryWithRetry(() =>
      adminClient.from('print_jobs').select('id').eq('order_id', orderId).eq('status', 'pending')
    );
    expect(allJobs || []).toHaveLength(0);

    const { data: reprintJobId, error: reprintError } = await rpcWithRetry(
      adminClient,
      'create_print_job_for_order',
      {
        p_order_id: orderId,
        p_source: 'reprint',
        p_reason: 'Fixed paper jam',
      }
    );

    expect(reprintError).toBeNull();
    expect(reprintJobId).toBeDefined();

    const { data: reprintJob } = await queryWithRetry(() =>
      adminClient.from('print_jobs').select('source').eq('id', reprintJobId).single()
    );
    expect(reprintJob.source).toBe('reprint');
  });

  it('Security: Anonymous cannot read print jobs', async () => {
    const { data, error } = await queryWithRetry(() => anonClient.from('print_jobs').select('*'));
    expect(error).toBeNull();
    expect(data || []).toHaveLength(0);
  });
});
