import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; // For setup
const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;

const adminClient = createClient(supabaseUrl, serviceRoleKey);
const anonClient = createClient(supabaseUrl, anonKey);

describe('Print Jobs Security & Logic E2E', () => {
  let testRestaurantId: string;
  let testOrderId: string;
  let testTenantId: string;

  beforeAll(async () => {
    // Setup a test restaurant and order
    const { data: tenant } = await adminClient.from('tenants').select('id').limit(1).single();
    testTenantId = tenant.id;

    const { data: restaurant } = await adminClient.from('restaurants').insert({
      tenant_id: testTenantId,
      name: 'Test Print Restaurant',
      slug: 'test-print-' + Date.now()
    }).select('id').single();
    testRestaurantId = restaurant.id;

    const { data: order } = await adminClient.from('orders').insert({
      tenant_id: testTenantId,
      restaurant_id: testRestaurantId,
      customer_name: 'Print Tester',
      customer_phone: '11999999999',
      order_type: 'pickup',
      idempotency_key: 'test-print-' + Date.now(),
      total_cents: 1000,
      status: 'new'
    }).select('id').single();
    testOrderId = order.id;
  });

  it('anonymous users cannot read print_jobs directly', async () => {
    const { data, error } = await anonClient.from('print_jobs').select('*');
    expect(error).toBeNull();
    expect(data || []).toHaveLength(0);
  });

  it('anonymous users cannot claim print jobs', async () => {
    const { error } = await anonClient.rpc('claim_print_job', {
      p_job_id: '00000000-0000-0000-0000-000000000000',
      p_agent_id: 'test-agent'
    });
    expect(error).not.toBeNull();
  });

  it('creating two automatic jobs for same order/payload fails (Unique Index)', async () => {
    // 1. Create first job
    const { data: jobId1, error: error1 } = await adminClient.rpc('create_print_job_for_order', {
      p_order_id: testOrderId,
      p_source: 'auto'
    });
    expect(error1).toBeNull();
    expect(jobId1).toBeDefined();

    // 2. Try to create second automatic job with same payload (default payload)
    const { error: error2 } = await adminClient.rpc('create_print_job_for_order', {
      p_order_id: testOrderId,
      p_source: 'auto'
    });
    
    // In PostgreSQL, unique index violation on rpc might return a 23505 error
    expect(error2).not.toBeNull();
  });

  it('reprint creates a NEW job even if one exists', async () => {
    const { data: jobId, error } = await adminClient.rpc('create_print_job_for_order', {
      p_order_id: testOrderId,
      p_source: 'reprint',
      p_reason: 'Paper jam'
    });
    expect(error).toBeNull();
    expect(jobId).toBeDefined();

    const { data: job } = await adminClient.from('print_jobs').select('source').eq('id', jobId).single();
    expect(job.source).toBe('reprint');
  });

  it('state machine: pending -> printing -> printed', async () => {
    // 1. Create job
    const { data: jobId } = await adminClient.rpc('create_print_job_for_order', {
      p_order_id: testOrderId,
      p_source: 'manual'
    });

    // 2. Claim (pending -> printing)
    const { data: claimed } = await adminClient.rpc('claim_print_job', {
      p_job_id: jobId,
      p_agent_id: 'agent-1'
    });
    expect(claimed).toBe(true);

    let { data: job } = await adminClient.from('print_jobs').select('status, agent_id').eq('id', jobId).single();
    expect(job.status).toBe('printing');
    expect(job.agent_id).toBe('agent-1');

    // 3. Complete (printing -> printed)
    const { data: completed } = await adminClient.rpc('complete_print_job', {
      p_job_id: jobId,
      p_agent_id: 'agent-1'
    });
    expect(completed).toBe(true);

    ({ data: job } = await adminClient.from('print_jobs').select('status').eq('id', jobId).single());
    expect(job.status).toBe('printed');
  });

  it('cannot complete with WRONG agent_id', async () => {
    const { data: jobId } = await adminClient.rpc('create_print_job_for_order', {
      p_order_id: testOrderId,
      p_source: 'manual'
    });

    await adminClient.rpc('claim_print_job', { p_job_id: jobId, p_agent_id: 'agent-correct' });

    const { data: completed } = await adminClient.rpc('complete_print_job', {
      p_job_id: jobId,
      p_agent_id: 'agent-wrong'
    });
    expect(completed).toBe(false);

    const { data: job } = await adminClient.from('print_jobs').select('status').eq('id', jobId).single();
    expect(job.status).toBe('printing'); // Remained in printing
  });

  it('failed jobs do not transition to printed directly', async () => {
    const { data: jobId } = await adminClient.rpc('create_print_job_for_order', {
      p_order_id: testOrderId,
      p_source: 'manual'
    });

    await adminClient.rpc('claim_print_job', { p_job_id: jobId, p_agent_id: 'agent-1' });
    await adminClient.rpc('fail_print_job', { p_job_id: jobId, p_agent_id: 'agent-1', p_error: 'Test error' });

    // Try to complete it
    const { data: completed } = await adminClient.rpc('complete_print_job', {
      p_job_id: jobId,
      p_agent_id: 'agent-1'
    });
    expect(completed).toBe(false);
  });
});
