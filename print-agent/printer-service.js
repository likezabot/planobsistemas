const { exec } = require('child_process');
const { log } = require('./utils');

async function printJob(job, config) {
  const { mode, printerName } = config;
  const payload = job.payload;

  log(`Processing job ${job.id} for printer: ${printerName} (Mode: ${mode})`);

  const orderId = payload?.order?.id || payload?.order_id;
  if (!payload || !orderId) {
    throw new Error('Invalid payload: missing order id');
  }

  if (payload.force_fail) {
    throw new Error('Simulated print failure');
  }

  if (mode === 'dry_run') {
    return printDryRun(job);
  } else if (mode === 'spooler_powershell') {
    return printPowerShell(job, printerName);
  } else {
    throw new Error(`Unsupported printing mode: ${mode}`);
  }
}

async function printDryRun(job) {
  log(`[DRY RUN] Simulating print for Order #${job.order_id}`);
  await new Promise(resolve => setTimeout(resolve, 1000));
  log(`[DRY RUN] Print job ${job.id} completed simulation`);
  return true;
}

async function printPowerShell(job, printerName) {
  const orderId = job.payload?.order?.id || job.order_id;
  const items = job.payload?.items || [];
  
  log(`[POWERSHELL] Preparing print for Order #${orderId} to ${printerName}`);
  
  // Create a temporary file with the payload content
  const ticketContent = `
    ORDER: #${orderId}
    DATE: ${new Date().toLocaleString()}
    ---------------------------
    ${items.map(i => `${i.quantity}x ${i.product_name || i.name}`).join('\n')}
    ---------------------------
  `;

  // For now, we just log that we would run powershell
  // A real command would be: `Out-Printer -Name "${printerName}"`
  log(`[POWERSHELL] Sending content to ${printerName}...`);
  
  // Simulation of the command execution
  // In production: exec(`powershell -Command "..."`)
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  return true;
}

module.exports = { printJob };
