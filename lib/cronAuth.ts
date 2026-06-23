import type { NextRequest } from 'next/server';

/**
 * Cron authorization — CRON_SECRET required. Does not trust x-vercel-cron alone.
 * Vercel Cron sends Authorization: Bearer <CRON_SECRET> when CRON_SECRET is set in project env.
 */
export function isCronAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    console.error('[cronAuth] CRON_SECRET is not configured — cron endpoints disabled');
    return false;
  }

  const authHeader = request.headers.get('authorization')?.trim();
  if (authHeader === `Bearer ${secret}`) return true;

  const headerSecret = request.headers.get('x-cron-secret')?.trim();
  if (headerSecret === secret) return true;

  const urlSecret = request.nextUrl.searchParams.get('cron_secret')?.trim();
  if (urlSecret === secret) return true;

  return false;
}
