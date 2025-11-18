// Simple logger for Cloud Functions environment
// Cloud Functions only support console logging

const logLevel = process.env.LOG_LEVEL || 'info';

// Circular reference replacer for JSON.stringify
const getCircularReplacer = () => {
  const seen = new WeakSet();
  return (key, value) => {
    // Handle circular references
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular]';
      }
      seen.add(value);
    }
    // Don't include request/response objects that have circular refs
    if (key === 'request' || key === 'res' || key === 'req' || key === 'socket' || key === 'client') {
      return undefined;
    }
    return value;
  };
};

// Simple logger that mimics winston interface
const logger = {
  log: (level, message, meta = {}) => {
    const timestamp = new Date().toISOString();
    const logEntry = {
      level,
      message,
      timestamp,
      service: 'samvad-gcp-backend',
      ...meta
    };
    try {
      console.log(JSON.stringify(logEntry, getCircularReplacer()));
    } catch (error) {
      // Fallback if JSON.stringify still fails
      console.log(JSON.stringify({
        level,
        message,
        timestamp,
        service: 'samvad-gcp-backend',
        error: 'Failed to serialize log entry'
      }));
    }
  },
  
  error: (message, meta = {}) => {
    logger.log('error', message, meta);
  },
  
  warn: (message, meta = {}) => {
    logger.log('warn', message, meta);
  },
  
  info: (message, meta = {}) => {
    logger.log('info', message, meta);
  },
  
  debug: (message, meta = {}) => {
    logger.log('debug', message, meta);
  }
};

// Helper functions for structured logging
const logWithContext = (level, message, context = {}) => {
  logger.log(level, message, {
    ...context,
    timestamp: new Date().toISOString(),
  });
};

const logError = (error, context = {}) => {
  logger.error(error.message, {
    ...context,
    stack: error.stack,
    name: error.name,
  });
};

const logInfo = (message, context = {}) => {
  logWithContext('info', message, context);
};

const logWarn = (message, context = {}) => {
  logWithContext('warn', message, context);
};

const logDebug = (message, context = {}) => {
  logWithContext('debug', message, context);
};

module.exports = {
  logger,
  logError,
  logInfo,
  logWarn,
  logDebug,
  logWithContext,
};