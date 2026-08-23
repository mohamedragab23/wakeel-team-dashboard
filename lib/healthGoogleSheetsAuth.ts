import type { NextRequest } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { isCronAuthorized } from '@/lib/cronAuth';

/** Cron secret or admin JWT — same contract in all environments (no non-prod bypass). */
export function isGoogleSheetsHealthAuthorized(request: NextRequest): boolean {
  if (isCronAuthorized(request)) return true;

  const token = extractBearerToken(request);
  if (!token) return false;
  const decoded = verifyToken(token);
  return !!(decoded && decoded.role === 'admin');
}
