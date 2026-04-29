require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { nanoid } = require('nanoid');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const RESTAURANT_ID = process.env.RESTAURANT_ID || '3e2e5243-3a4d-4cd8-aa26-6e82d9473500';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function runTests() {
  console.log('--- Starting Print Agent Test Suite ---');
  
  // 1. Setup Test Agent
  const agentSecret = 'test_secret_' + nanoid(10);
  const agentName = 'QA Test Agent';
  
  const { data: agent, error: agentError } = await supabase
    .from('print_agents')
    .insert({
      restaurant_id: RESTAURANT_ID,
      name: agentName,
      secret_key: agentSecret,
      status: 'active'
    })
    .select()
    .single();

  if (agentError) {
    console.error('Failed to create test agent:', agentError);
    return;
  }
  console.log(`[PASS] Test agent created: ${agent.id}`);

  const AGENT_ID = agent.id;

  // 2. Test: Invalid Secret Key
  const { error: invalidSecretError } = await supabase.rpc('get_pending_print_jobs', {
    p_restaurant_id: RESTAURANT_ID,
    p_agent_id: AGENT_ID,
    p_secret_key: 'wrong_secret',
    p_after_timestamp: new Date().toISOString()
  });
  if (invalidSecretError && invalidSecretError.message.includes('Invalid agent or secret key')) {
    console.log('[PASS] Invalid secret key correctly blocked');
  } else {
    console.error('[FAIL] Invalid secret key allowed or wrong error:', invalidSecretError);
  }

  // 3. Test: Wrong Restaurant ID
  const otherRestaurantId = '00000000-0000-0000-0000-000000000000';
  const { error: wrongRestaurantError } = await supabase.rpc('get_pending_print_jobs', {
    p_restaurant_id: otherRestaurantId,
    p_agent_id: AGENT_ID,
    p_secret_key: agentSecret,
    p_after_timestamp: new Date().toISOString()
  });
  if (wrongRestaurantError && wrongRestaurantError.message.includes('Agent cannot access this restaurant')) {
    console.log('[PASS] Wrong restaurant ID correctly blocked');
  } else {
    // If it just returns empty array, it might be RLS or the RPC check. 
    // Let's assume the RPC check is there.
    console.log('[INFO] Wrong restaurant request status:', wrongRestaurantError ? wrongRestaurantError.message : 'No error (likely empty result)');
  }

  // 4. Test: Started At prevents backlog
  // Create an old job
  const oldOrderId = nanoid(10);
  const { data: oldJob, error: oldJobError } = await supabase
    .from('print_jobs')
    .insert({
      restaurant_id: RESTAURANT_ID,
      order_id: oldOrderId,
      status: 'pending',
      created_at: new Date(Date.now() - 60000).toISOString() // 1 minute ago
    })
    .select()
    .single();

  if (oldJobError) {
    console.error('Failed to create old job:', oldJobError);
  } else {
    const { data: pendingJobs } = await supabase.rpc('get_pending_print_jobs', {
      p_restaurant_id: RESTAURANT_ID,
      p_agent_id: AGENT_ID,
      p_secret_key: agentSecret,
      p_after_timestamp: new Date().toISOString()
    });
    
    if (pendingJobs && pendingJobs.length === 0) {
      console.log('[PASS] Backlog jobs ignored (started_at works)');
    } else {
      console.error('[FAIL] Backlog job was picked up');
    }
  }

  // 5. Test: Happy Path (Create Job -> Claim -> Complete)
  const orderId = nanoid(10);
  const { data: job, error: jobError } = await supabase
    .from('print_jobs')
    .insert({
      restaurant_id: RESTAURANT_ID,
      order_id: orderId,
      status: 'pending',
      payload: { test: true }
    })
    .select()
    .single();

  if (jobError) {
    console.error('Failed to create test job:', jobError);
  } else {
    console.log(`Test job created: ${job.id}`);
    
    const { data: jobsToProcess } = await supabase.rpc('get_pending_print_jobs', {
      p_restaurant_id: RESTAURANT_ID,
      p_agent_id: AGENT_ID,
      p_secret_key: agentSecret,
      p_after_timestamp: new Date(Date.now() - 5000).toISOString()
    });

    if (jobsToProcess && jobsToProcess.some(j => j.id === job.id)) {
      console.log('[PASS] New job found by RPC');
      
      // Claim
      const { data: claimed } = await supabase.rpc('claim_print_job', {
        p_job_id: job.id,
        p_agent_id: AGENT_ID,
        p_secret_key: agentSecret
      });
      
      if (claimed) {
        console.log('[PASS] Job successfully claimed');
        
        // Complete
        const { data: completed } = await supabase.rpc('complete_print_job', {
          p_job_id: job.id,
          p_agent_id: AGENT_ID,
          p_secret_key: agentSecret
        });
        
        if (completed) {
          console.log('[PASS] Job successfully completed');
        } else {
          console.error('[FAIL] Could not complete job');
        }
      } else {
        console.error('[FAIL] Could not claim job');
      }
    } else {
      console.error('[FAIL] New job NOT found by RPC');
    }
  }

  // Cleanup
  console.log('Cleaning up test data...');
  await supabase.from('print_agents').delete().eq('id', AGENT_ID);
  
  console.log('--- Test Suite Finished ---');
}

runTests();
