type LogLevel = "debug" | "info" | "warn" | "error";
type LogContext = { provider?: string; jobId?: string; code?: string; [key: string]: unknown };

const SECRET_PATTERN = /(token|secret|password|authorization|api[_-]?key|cookie)/i;

function sanitize(context: LogContext): LogContext {
  return Object.fromEntries(Object.entries(context).map(([key, value]) => [key, SECRET_PATTERN.test(key) ? "[redacted]" : value])) as LogContext;
}

function write(level: LogLevel, event: string, context: LogContext = {}): void {
  if (level === "debug" && process.env.NODE_ENV !== "development") return;
  const payload = { level, event, at: new Date().toISOString(), ...sanitize(context) };
  if (level === "error") console.error(JSON.stringify(payload));
  else if (level === "warn") console.warn(JSON.stringify(payload));
  else console.info(JSON.stringify(payload));
}

export const logger = {
  debug: (event: string, context?: LogContext) => write("debug", event, context),
  info: (event: string, context?: LogContext) => write("info", event, context),
  warn: (event: string, context?: LogContext) => write("warn", event, context),
  error: (event: string, context?: LogContext) => write("error", event, context),
};

