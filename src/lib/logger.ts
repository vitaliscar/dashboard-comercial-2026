import pino from 'pino';

/**
 * Centralized Structured Logger using Pino
 * Outputs JSON format with timestamp, level, message, userId, route, statusCode, duration
 */
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    env: process.env.NODE_ENV || 'development',
    service: 'dashboard-comercial-2026',
  },
  formatters: {
    level: (label) => ({ level: label }),
  },
});

export interface LogContext {
  userId?: string;
  route?: string;
  statusCode?: number;
  duration?: number; // in ms
  error?: string | Error;
  [key: string]: unknown;
}

/**
 * Log standard incoming HTTP request info or server action completion
 */
export function logRequest(message: string, context: LogContext = {}) {
  const { duration, statusCode, error, ...rest } = context;
  
  if (error || (statusCode && statusCode >= 500)) {
    logger.error({
      message,
      statusCode: statusCode || 500,
      duration,
      error: error instanceof Error ? error.stack : error,
      ...rest,
    });
  } else if (duration && duration > 5000) {
    logger.warn({
      message: `[SLOW REQUEST >5s] ${message}`,
      statusCode: statusCode || 200,
      duration,
      ...rest,
    });
  } else {
    logger.info({
      message,
      statusCode: statusCode || 200,
      duration,
      ...rest,
    });
  }
}

/**
 * Log Auth Failure events specifically for security monitoring
 */
export function logAuthFailure(emailOrUser: string, reason: string, context: LogContext = {}) {
  logger.warn({
    message: `[AUTH FAILURE] Failed attempt for user: ${emailOrUser}. Reason: ${reason}`,
    statusCode: 401,
    user: emailOrUser,
    ...context,
  });
}

/**
 * Log Database Errors
 */
export function logDbError(operation: string, error: unknown, context: LogContext = {}) {
  logger.error({
    message: `[DB ERROR] Failed operation: ${operation}`,
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    statusCode: 500,
    ...context,
  });
}
