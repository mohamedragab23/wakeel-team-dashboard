/**
 * Optional Sentry integration — NOT required for production.
 *
 * To enable:
 * 1. npm install @sentry/nextjs
 * 2. npx @sentry/wizard@latest -i nextjs
 * 3. Set SENTRY_DSN in Vercel environment variables
 *
 * This stub documents the integration point without adding a hard dependency.
 */

export const SENTRY_ENABLED = Boolean(process.env.SENTRY_DSN?.trim());

export function captureOptionalError(error: unknown, context?: Record<string, string>): void {
  if (!SENTRY_ENABLED) return;
  // When @sentry/nextjs is installed, replace with Sentry.captureException(error, { extra: context })
  console.error('[sentry:disabled]', context, error);
}
