const fs = require('fs');
const path = require('path');

function log(message, level = 'info') {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  console.log(logMessage);
  
  // Also log to file
  const logFile = path.join(__dirname, 'agent.log');
  fs.appendFileSync(logFile, logMessage + '\n');
}

function calculateFingerprint(payload) {
  // Simple check for now, can be more complex
  if (!payload || typeof payload !== 'object') return null;
  
  // Ensure it has basic order info
  if (!payload.order_id || !payload.items) return null;
  
  return `fp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

module.exports = { log, calculateFingerprint };
