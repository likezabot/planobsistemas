const { exec } = require('child_process');
const { log } = require('./utils');
const fs = require('fs');
const path = require('path');
const os = require('os');

async function checkPrinterExists(printerName) {
  if (os.platform() !== 'win32') {
    log(`[MOCK] Platform is ${os.platform()}, skipping real printer check for: ${printerName}`);
    return true; 
  }

  return new Promise((resolve) => {
    // PowerShell command to check if printer exists
    const command = `powershell.exe -Command "Get-Printer -Name '${printerName}' -ErrorAction SilentlyContinue"`;
    
    exec(command, { timeout: 5000 }, (error, stdout) => {
      if (error || !stdout || stdout.trim() === '') {
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

async function printJob(job, config) {
  const { mode, printerName } = config;
  const payload = job.payload;

  log(`Processing job ${job.id} for printer: ${printerName} (Mode: ${mode})`);

  if (!payload) {
    throw new Error('Invalid payload: payload is empty');
  }

  // Fingerprint check
  if (payload.fingerprint) {
    log(`Job ${job.id} has fingerprint: ${payload.fingerprint}`);
  } else if (typeof payload === 'object') {
    log(`Warning: Job ${job.id} is missing a fingerprint!`, 'warn');
  }

  // Handle both legacy JSON payload and new ESC/POS base64 payload
  const isBase64 = typeof payload === 'string' && /^[A-Za-z0-9+/=]+$/.test(payload);
  
  if (mode === 'dry_run') {
    return printDryRun(job);
  } else if (mode === 'spooler_powershell') {
    if (!isBase64) {
      log('Warning: Payload is not base64 ESC/POS. Attempting to format as text.', 'warn');
    }
    return printPowerShell(job, printerName, isBase64);
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

async function printPowerShell(job, printerName, isBase64) {
  const payload = job.payload;
  
  log(`[POWERSHELL] Sending job ${job.id} to ${printerName}...`);
  
  if (os.platform() !== 'win32') {
    log(`[MOCK] Non-Windows platform. Simulating PowerShell success for job ${job.id}`);
    await new Promise(resolve => setTimeout(resolve, 500));
    return true;
  }

  return new Promise((resolve, reject) => {
    let psCommand;
    const tempFile = path.join(os.tmpdir(), `print_job_${job.id}.bin`);

    try {
      const winTempFile = tempFile.replace(/\//g, '\\');
      if (isBase64) {
        // Raw ESC/POS bytes
        const buffer = Buffer.from(payload, 'base64');
        fs.writeFileSync(tempFile, buffer);
        
        // Use PowerShell to send raw bytes to the spooler via UNC path
        // Important: Printer must be shared locally for this to work
        psCommand = `powershell.exe -Command "$data = [System.IO.File]::ReadAllBytes('${winTempFile}'); [System.IO.File]::WriteAllBytes('\\\\\\\\localhost\\\\${printerName}', $data)"`;
      } else {
        // Text/JSON fallback
        const text = typeof payload === 'object' ? JSON.stringify(payload, null, 2) : String(payload);
        fs.writeFileSync(tempFile, text);
        psCommand = `powershell.exe -Command "Get-Content '${winTempFile}' | Out-Printer -Name '${printerName}'"`;
      }

      const startTime = Date.now();
      exec(psCommand, { timeout: 15000 }, (error, stdout, stderr) => {
        const duration = Date.now() - startTime;
        
        // Clean up temp file
        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);

        if (error) {
          log(`PowerShell Error: ${error.message}`, 'error');
          log(`Stderr: ${stderr}`, 'error');
          reject(new Error(`PowerShell failed: ${error.message}`));
        } else {
          log(`[POWERSHELL] Success. Sent ${isBase64 ? 'raw bytes' : 'text'} to ${printerName} in ${duration}ms`);
          if (stdout) log(`Stdout: ${stdout}`);
          resolve(true);
        }
      });
    } catch (err) {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
      reject(err);
    }
  });
}

module.exports = { printJob, checkPrinterExists };
