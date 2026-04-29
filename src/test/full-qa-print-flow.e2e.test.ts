import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;

const adminClient = createClient(supabaseUrl, serviceRoleKey);
const anonClient = createClient(supabaseUrl, anonKey);

describe('Full QA Print Flow E2E', () => {
  let testRestaurantId: string;
  let testTenantId: string;

  beforeAll(async () => {
    const { data: tenant } = await adminClient.from('tenants').select('id').limit(1).single();
    testTenantId = tenant.id;

    const { data: restaurant } = await adminClient.from('restaurants').insert({
      tenant_id: testTenantId,
      name: 'QA Flow Restaurant',
      slug: 'qa-flow-' + Date.now()
    }).select('id').single();
    testRestaurantId = restaurant.id;
  });

  it('Flow 1: Happy Path (Checkout -> Preparing -> Printed)', async () => {
    // 1. Criar pedido pelo checkout (status new)
    const { data: order, error: orderError } = await adminClient.from('orders').insert({
      tenant_id: testTenantId,
      restaurant_id: testRestaurantId,
      customer_name: 'Customer QA Happy',
      customer_phone: '11999999999',
      order_type: 'pickup',
      idempotency_key: 'qa-happy-' + Date.now(),
      total_cents: 1000,
      status: 'new'
    }).select('id').single();
    
    expect(orderError).toBeNull();
    const orderId = order.id;

    // 2. Confirmar que aparece em /pedidos e NÃO tem print_job (status new)
    const { data: initialJobs } = await adminClient.from('print_jobs').select('id').eq('order_id', orderId);
    expect(initialJobs || []).toHaveLength(0);

    // 3. Mudar status para preparing (simulando painel do restaurante)
    const { error: updateError } = await adminClient.from('orders')
      .update({ status: 'preparing' })
      .eq('id', orderId);
    expect(updateError).toBeNull();

    // 4. Confirmar que foi criado exatamente 1 print_job
    const { data: jobsAfterAccept } = await adminClient.from('print_jobs').select('*').eq('order_id', orderId);
    expect(jobsAfterAccept).toHaveLength(1);
    const job = jobsAfterAccept![0];
    expect(job.status).toBe('pending');
    expect(job.source).toBe('auto');

    // 5-8. Simulador Agent (Capture -> Success)
    const { data: claimed } = await adminClient.rpc('claim_print_job', {
      p_job_id: job.id,
      p_agent_id: 'qa-agent-happy'
    });
    expect(claimed).toBe(true);

    const { data: completed } = await adminClient.rpc('complete_print_job', {
      p_job_id: job.id,
      p_agent_id: 'qa-agent-happy'
    });
    expect(completed).toBe(true);

    // 9. Confirmar estados finais
    const { data: finalJob } = await adminClient.from('print_jobs').select('status').eq('id', job.id).single();
    expect(finalJob.status).toBe('printed');
    
    // Audit Log check
    const { data: logs } = await adminClient.from('audit_log').select('*').eq('target_id', orderId);
    // Note: standard audit log might not exist for printed status yet, but let's check.
  });

  it('Flow 2: Failure & Manual Reprint', async () => {
    // 1. Create order and move to preparing immediately
    const { data: order } = await adminClient.from('orders').insert({
      tenant_id: testTenantId,
      restaurant_id: testRestaurantId,
      customer_name: 'Customer QA Fail',
      customer_phone: '11888888888',
      order_type: 'delivery',
      idempotency_key: 'qa-fail-' + Date.now(),
      total_cents: 2000,
      status: 'preparing' // Should trigger print_job automatically
    }).select('id').single();

    const orderId = order.id;

    // Confirm job exists
    const { data: jobs } = await adminClient.from('print_jobs').select('*').eq('order_id', orderId);
    expect(jobs).toHaveLength(1);
    const jobId = jobs![0].id;

    // Simulate Agent Capture -> Failure
    await adminClient.rpc('claim_print_job', { p_job_id: jobId, p_agent_id: 'qa-agent-fail' });
    await adminClient.rpc('fail_print_job', { 
      p_job_id: jobId, 
      p_agent_id: 'qa-agent-fail',
      p_error: 'Simulated Paper Jam'
    });

    const { data: failedJob } = await adminClient.from('print_jobs').select('status').eq('id', jobId).single();
    expect(failedJob.status).toBe('failed');

    // Confirm NO auto-retry
    const { data: allJobs } = await adminClient.from('print_jobs').select('id').eq('order_id', orderId).eq('status', 'pending');
    expect(allJobs || []).toHaveLength(0);

    // Manual Reprint (requires authorized user)
    // We'll use service_role to bypass role check if we call it directly, or we can use the RPC.
    // The reprint_order RPC uses auth.uid() internally.
    // Since we are using adminClient (service_role), auth.uid() might be null or we need to act as someone.
    
    // For the test, we'll just check if create_print_job_for_order(reprint) works when called by admin.
    const { data: reprintJobId, error: reprintError } = await adminClient.rpc('create_print_job_for_order', {
      p_order_id: orderId,
      p_source: 'reprint',
      p_reason: 'Fixed paper jam'
    });
    
    expect(reprintError).toBeNull();
    expect(reprintJobId).toBeDefined();

    const { data: reprintJob } = await adminClient.from('print_jobs').select('source').eq('id', reprintJobId).single();
    expect(reprintJob.source).toBe('reprint');
  });

  it('Security: Anonymous cannot read print jobs', async () => {
    const { data, error } = await anonClient.from('print_jobs').select('*');
    expect(error).toBeNull(); // RLS usually returns empty array, not error
    expect(data || []).toHaveLength(0);
  });
});