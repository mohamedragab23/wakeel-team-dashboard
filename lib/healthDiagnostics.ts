import { getMainSpreadsheetId, getSheetsClientFor } from '@/lib/googleSheetsAuth';
import { isRedisCacheConfigured } from '@/lib/redisCache.optional';
import { isTicketingDbConfigured } from '@/lib/ticketing/db/client';
import { isJwtSecretConfigured } from '@/lib/jwtConfig';

function isSentryConfigured(): boolean {
  return Boolean(
    process.env.SENTRY_DSN?.trim() || process.env.NEXT_PUBLIC_SENTRY_DSN?.trim()
  );
}

export type HealthDiagnosticReport = {
  ok: boolean;
  checkedAt: string;
  env: {
    googleSheetsSpreadsheetId: boolean;
    jwtSecret: boolean;
    cronSecret: boolean;
    redisConfigured: boolean;
    neonConfigured: boolean;
    sentryConfigured: boolean;
  };
  googleSheets: { ok: boolean; error?: string; tabProbe?: string };
  redis: { ok: boolean; skipped?: boolean; error?: string };
  neon: { ok: boolean; skipped?: boolean; error?: string };
};

function envPresent(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

async function probeGoogleSheets(): Promise<HealthDiagnosticReport['googleSheets']> {
  try {
    const spreadsheetId = getMainSpreadsheetId();
    const sheets = await getSheetsClientFor('main');
    await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'المشرفين!A1:A1',
      majorDimension: 'ROWS',
    });
    return { ok: true, tabProbe: 'المشرفين!A1:A1' };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

async function probeRedis(): Promise<HealthDiagnosticReport['redis']> {
  if (!isRedisCacheConfigured()) {
    return { ok: true, skipped: true };
  }
  try {
    const { getRedisRestUrl, getRedisRestToken } = await import('@/lib/redisCache.optional');
    const url = getRedisRestUrl()!.replace(/\/$/, '');
    const token = getRedisRestToken()!;
    const res = await fetch(`${url}/ping`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }
    const body = (await res.json()) as { result?: string };
    return { ok: body.result === 'PONG' };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function probeNeon(): Promise<HealthDiagnosticReport['neon']> {
  if (!isTicketingDbConfigured()) {
    return { ok: true, skipped: true };
  }
  try {
    const { getTicketingSql } = await import('@/lib/ticketing/db/client');
    const sql = getTicketingSql();
    await sql`SELECT 1 AS ok`;
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Read-only dependency probes — no automatic recovery or sheet writes. */
export async function runHealthDiagnostics(): Promise<HealthDiagnosticReport> {
  const env = {
    googleSheetsSpreadsheetId: envPresent('GOOGLE_SHEETS_SPREADSHEET_ID'),
    jwtSecret: isJwtSecretConfigured(),
    cronSecret: envPresent('CRON_SECRET'),
    redisConfigured: isRedisCacheConfigured(),
    neonConfigured: isTicketingDbConfigured(),
    sentryConfigured: isSentryConfigured(),
  };

  const [googleSheets, redis, neon] = await Promise.all([
    probeGoogleSheets(),
    probeRedis(),
    probeNeon(),
  ]);

  const ok =
    env.googleSheetsSpreadsheetId &&
    env.jwtSecret &&
    googleSheets.ok &&
    (redis.skipped || redis.ok) &&
    (neon.skipped || neon.ok);

  return {
    ok,
    checkedAt: new Date().toISOString(),
    env,
    googleSheets,
    redis,
    neon,
  };
}
