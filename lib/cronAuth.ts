import crypto from 'crypto';
import type { NextRequest } from 'next/server';

/**
 * Cron authorization — CRON_SECRET required. Does not trust x-vercel-cron alone.
 * Vercel Cron sends Authorization: Bearer <CRON_SECRET> when CRON_SECRET is set in project env.
 * Query-string auth is not accepted (secrets must not appear in URLs or access logs).
 */
function timingSafeEqualString(left: string, right: string): boolean {
  const leftHash = crypto.createHash('sha256').update(left).digest();
  const rightHash = crypto.createHash('sha256').update(right).digest();
  return crypto.timingSafeEqual(leftHash, rightHash);
}

export function isCronAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    console.error('[cronAuth] CRON_SECRET is not configured — cron endpoints disabled');
    return false;
  }

  const authHeader = request.headers.get('authorization')?.trim() || '';
  if (timingSafeEqualString(authHeader, `Bearer ${secret}`)) return true;

  const headerSecret = request.headers.get('x-cron-secret')?.trim() || '';
  if (timingSafeEqualString(headerSecret, secret)) return true;

  return false;
}
