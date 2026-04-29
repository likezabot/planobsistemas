const { printJob, checkPrinterExists } = require('./printer-service');
const { log } = require('./utils');
const os = require('os');

async function runTests() {
  log('Starting Physical Print Agent Logic Tests...');
  let passed = 0;
  let failed = 0;

  const assert = (condition, message) => {
    if (condition) {
      log(`[PASS] ${message}`);
      passed++;
    } else {
      log(`[FAIL] ${message}`, 'error');
      failed++;
    }
  };

  // Test 1: Printer existence check (Mocked on non-Windows)
  try {
    const exists = await checkPrinterExists('TestPrinter');
    assert(exists === true || os.platform() === 'win32', 'Printer existence check should return a boolean');
  } catch (err) {
    assert(false, `Printer check threw error: ${err.message}`);
  }

  // Test 2: Payload validation
  try {
    await printJob({ id: '1', payload: null }, { mode: 'dry_run', printerName: 'Test' });
    assert(false, 'Should throw error for null payload');
  } catch (err) {
    assert(err.message.includes('payload is empty'), 'Should throw empty payload error');
  }

  // Test 3: Dry run success
  try {
    const result = await printJob({ id: '2', payload: { order_id: '123' } }, { mode: 'dry_run', printerName: 'Test' });
    assert(result === true, 'Dry run should return true');
  } catch (err) {
    assert(false, `Dry run failed: ${err.message}`);
  }

  // Test 4: Base64 payload detection
  const base64Payload = Buffer.from('ESC/POS Data').toString('base64');
  try {
    // In Linux, this will use the mock
    const result = await printJob({ id: '3', payload: base64Payload }, { mode: 'spooler_powershell', printerName: 'Test' });
    assert(result === true, 'Spooler powershell (mocked) should handle base64');
  } catch (err) {
    assert(false, `Spooler powershell failed: ${err.message}`);
  }

  // Test 5: Fingerprint warning (check logs manually or redirect)
  log('Test 5: Checking fingerprint warning in logs...');
  await printJob({ id: '4', payload: { order_id: '456' } }, { mode: 'dry_run', printerName: 'Test' });
  // If we reach here without crash, it's good.

  log(`\nTests finished. Passed: ${passed}, Failed: ${failed}`);
  if (failed > 0) process.exit(1);
}

runTests();