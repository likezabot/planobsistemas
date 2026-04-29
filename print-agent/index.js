require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { log } = require('./utils');
const { printJob, checkPrinterExists } = require('./printer-service');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const RESTAURANT_ID = process.env.RESTAURANT_ID;
const AGENT_ID = process.env.AGENT_ID;
const AGENT_SECRET = process.env.AGENT_SECRET;
const PRINTER_NAME = process.env.PRINTER_NAME || 'Default';
const POLLING_INTERVAL = parseInt(process.env.POLLING_INTERVAL || '5000');
const MODE = process.env.MODE || 'dry_run';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !RESTAURANT_ID || !AGENT_ID || !AGENT_SECRET) {
  log('Missing required environment variables. Check .env file.', 'error');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const startedAt = new Date().toISOString();
let isProcessing = false;
let printerReady = false;

log(`Agent ${AGENT_ID} started at ${startedAt} for Restaurant ${RESTAURANT_ID}`);
log(`Mode: ${MODE}, Printer: ${PRINTER_NAME}, Polling: ${POLLING_INTERVAL}ms`);

async function initialize() {
  if (MODE === 'spooler_powershell') {
    log(`Checking if printer "${PRINTER_NAME}" is available...`);
    const exists = await checkPrinterExists(PRINTER_NAME);
    if (!exists) {
      log(`CRITICAL: Printer "${PRINTER_NAME}" not found in Windows spooler. Agent will not start polling.`, 'error');
      process.exit(1);
    }
    log(`Printer "${PRINTER_NAME}" validated.`);
  }
  printerReady = true;
  
  // Start polling
  setInterval(poll, POLLING_INTERVAL);
}

async function poll() {
  if (isProcessing || !printerReady) return;
  isProcessing = true;

  try {
    // 1. Fetch pending jobs
    const { data: jobs, error } = await supabase.rpc('get_pending_print_jobs', {
      p_restaurant_id: RESTAURANT_ID,
      p_agent_id: AGENT_ID,
      p_secret_key: AGENT_SECRET,
      p_after_timestamp: startedAt
    });

    if (error) throw error;

    if (jobs && jobs.length > 0) {
      const job = jobs[0];
      log(`Found pending job: ${job.id} for Order #${job.order_id}`);

      // 2. Claim the job
      const { data: claimed, error: claimError } = await supabase
        .rpc('claim_print_job', {
          p_job_id: job.id,
          p_agent_id: AGENT_ID,
          p_secret_key: AGENT_SECRET
        });

      if (claimError) {
        log(`Failed to claim job ${job.id}: ${claimError.message}`, 'error');
      } else if (claimed) {
        log(`Successfully claimed job ${job.id}. Starting print...`);

        try {
          // 3. Print
          const payloadSize = job.payload ? (typeof job.payload === 'string' ? job.payload.length : JSON.stringify(job.payload).length) : 0;
          log(`Job ${job.id} payload size: ${payloadSize} bytes`);
          
          await printJob(job, { mode: MODE, printerName: PRINTER_NAME });

          // 4. Complete
          const { error: completeError } = await supabase
            .rpc('complete_print_job', {
              p_job_id: job.id,
              p_agent_id: AGENT_ID,
              p_secret_key: AGENT_SECRET
            });

          if (completeError) {
            log(`Failed to complete job ${job.id}: ${completeError.message}`, 'error');
          } else {
            log(`Job ${job.id} marked as printed successfully`);
          }
        } catch (printError) {
          log(`Error printing job ${job.id}: ${printError.message}`, 'error');
          
          // 5. Fail
          await supabase.rpc('fail_print_job', {
            p_job_id: job.id,
            p_agent_id: AGENT_ID,
            p_secret_key: AGENT_SECRET,
            p_error: printError.message
          });
        }
      } else {
        log(`Job ${job.id} already claimed by another agent or status changed.`);
      }
    }
  } catch (err) {
    log(`Polling error: ${err.message}`, 'error');
  } finally {
    isProcessing = false;
  }
}

initialize();

// Handle graceful shutdown
process.on('SIGINT', () => {
  log('Shutting down agent...');
  process.exit(0);
});
