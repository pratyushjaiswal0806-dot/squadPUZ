export interface LogContext {
  roomId?: string;
  sessionId?: string;
  connectionId?: string;
  eventId?: number | string;
  clientMessageId?: string;
  [key: string]: unknown;
}

function sanitizeMeta(meta: LogContext): LogContext {
  const sanitized: LogContext = {};
  for (const [key, value] of Object.entries(meta)) {
    // Redact any token fields or buffer/byte fields if present
    if (
      key.toLowerCase().includes("token") ||
      key.toLowerCase().includes("secret") ||
      key.toLowerCase().includes("password")
    ) {
      sanitized[key] = "[REDACTED]";
    } else if (value instanceof Uint8Array || Buffer.isBuffer(value)) {
      sanitized[key] = `[Binary Data: ${value.length} bytes]`;
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

export function logInfo(message: string, context: LogContext = {}): void {
  const payload = {
    timestamp: new Date().toISOString(),
    level: "info",
    message,
    ...sanitizeMeta(context)
  };
  console.log(JSON.stringify(payload));
}

export function logWarn(message: string, context: LogContext = {}): void {
  const payload = {
    timestamp: new Date().toISOString(),
    level: "warn",
    message,
    ...sanitizeMeta(context)
  };
  console.warn(JSON.stringify(payload));
}

export function logError(message: string, error?: unknown, context: LogContext = {}): void {
  const payload = {
    timestamp: new Date().toISOString(),
    level: "error",
    message,
    error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error ?? ""),
    ...sanitizeMeta(context)
  };
  console.error(JSON.stringify(payload));
}
