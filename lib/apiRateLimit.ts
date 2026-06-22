import { checkRateLimit } from '@/lib/rateLimit';

/**
 * Lightweight API rate limit (per serverless instance).
 * Does not affect Google Sheets reads/writes — request gating only.
 */
export function checkApiRateLimit(
  scope: string,
  actorKey: string,
  maxAttempts = 30,
  windowMs = 60_000
): { allowed: boolean; retryAfterSec: number } {
  const key = `api:${scope}:${actorKey}`;
  return checkRateLimit(key, maxAttempts, windowMs);
}

export function rateLimitResponse(retryAfterSec: number) {
  return {
    success: false as const,
    error: `طلبات كثيرة. حاول بعد ${retryAfterSec} ثانية`,
    retryAfterSec,
  };
}
