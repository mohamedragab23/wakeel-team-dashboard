import { headers } from 'next/headers';

export const REQUEST_ID_HEADER = 'x-request-id';

export function generateRequestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Read trace ID from Next.js request headers (set by middleware). */
export function getRequestTraceId(): string | undefined {
  try {
    return headers().get(REQUEST_ID_HEADER)?.trim() || undefined;
  } catch {
    return undefined;
  }
}

export type StructuredLogLevel = 'info' | 'warn' | 'error';

/** Structured server log — diagnostics only, no business logic changes. */
export function logStructured(
  level: StructuredLogLevel,
  message: string,
  meta: Record<string, unknown> = {}
): void {
  const payload = {
    ts: new Date().toISOString(),
    level,
    message,
    traceId: getRequestTraceId(),
    ...meta,
  };
  const line = JSON.stringify(payload);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.info(line);
}
