import { formatIsoDateInTimeZone, addDays } from '@/lib/timezone';
import { getRoosterExportHeadersFromSheet } from '@/lib/roosterSessionStore';
import { smartRefreshRoosterAuth } from '@/lib/roosterLive/authRefresh';
import { logStructured } from '@/lib/requestTrace';

export type RoosterExportParams = {
  cityId: string; // e.g. 200
  cityLabel: string; // e.g. Alexandria (for email / logging)
  startDate: string; // YYYY-MM-DD (Cairo date)
  endDate: string; // YYYY-MM-DD (Cairo date)
};

function norm(v: any): string {
  return String(v ?? '').trim();
}

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function buildExportUrl(template: string, params: RoosterExportParams): string {
  const startAt = buildRoosterStartAtUtcIso(params.startDate); // e.g. 2026-04-27T21:00:00.000Z for Cairo midnight
  const endAt = buildRoosterEndAtUtcIso(params.endDate); // e.g. 2026-04-29T20:59:59.999Z for Cairo end-of-day

  return template
    .replaceAll('{city_id}', encodeURIComponent(params.cityId))
    .replaceAll('{city}', encodeURIComponent(params.cityLabel))
    .replaceAll('{start}', encodeURIComponent(params.startDate))
    .replaceAll('{end}', encodeURIComponent(params.endDate))
    .replaceAll('{start_at}', encodeURIComponent(startAt))
    .replaceAll('{end_at}', encodeURIComponent(endAt));
}

/**
 * Downloads the CSV bytes using a direct export URL template.
 *
 * Why: the Rooster page is behind Cloudflare Access / Okta, which is typically not reliably automatable
 * in serverless without brittle headless-browser scripting.
 *
 * How to configure:
 * - ROOSTER_EXPORT_URL_TEMPLATE: a full URL that returns CSV, using placeholders:
 *   - {city_id} {start_at} {end_at}
 * - Optional: ROOSTER_EXPORT_HEADERS_JSON: JSON object of extra headers (e.g. Cookie / Authorization).
 *
 * `headersOverride`, when passed, is used verbatim instead of resolving from
 * env/Sheet -- used by `resolveFreshRoosterExportHeaders()` below to inject a
 * just-minted `dhh_token` (see that function's doc comment for why this is
 * necessary; discovered live, 2026-07-27, via a real `401 Unauthorized` from
 * this exact endpoint). Omitting it preserves the exact pre-existing
 * behavior for any caller that doesn't pass it.
 */
export async function exportRoosterCsv(
  params: RoosterExportParams,
  headersOverride?: Record<string, string>
): Promise<{ filename: string; bytes: ArrayBuffer }> {
  const template = requireEnv('ROOSTER_EXPORT_URL_TEMPLATE');
  const url = buildExportUrl(template, params);

  let extraHeaders: Record<string, string> = {};
  if (headersOverride) {
    extraHeaders = headersOverride;
  } else {
    const rawHeaders = process.env.ROOSTER_EXPORT_HEADERS_JSON?.trim();
    if (rawHeaders) {
      try {
        const parsed = JSON.parse(rawHeaders);
        if (parsed && typeof parsed === 'object') {
          extraHeaders = Object.fromEntries(Object.entries(parsed).map(([k, v]) => [String(k), String(v)]));
        }
      } catch {
        throw new Error('ROOSTER_EXPORT_HEADERS_JSON must be valid JSON object.');
      }
    } else {
      // No redeploy needed: pull headers from Google Sheet config if available.
      const fromSheet = await getRoosterExportHeadersFromSheet();
      if (fromSheet) extraHeaders = fromSheet;
    }
  }

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'text/csv,application/csv,text/plain,*/*',
      ...extraHeaders,
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Rooster export failed: ${res.status} ${t}`.trim());
  }

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('csv') && !contentType.toLowerCase().includes('text')) {
    // Still allow (some servers respond octet-stream)
    console.warn('[roosterExport] Unexpected content-type:', contentType);
  }

  const bytes = await res.arrayBuffer();
  const filename = `rooster_${params.cityLabel || params.cityId || 'city'}_${params.startDate}_to_${params.endDate}.csv`;
  return { filename, bytes };
}

/**
 * Resolves the exact static headers `exportRoosterCsv()` used to resolve
 * internally (env override first, else the `cron_config` Sheet) -- extracted
 * so `resolveFreshRoosterExportHeaders()` below can feed them through the
 * dhh_token mint step before the real request.
 */
async function resolveStaticExportHeaders(): Promise<Record<string, string> | null> {
  const rawHeaders = process.env.ROOSTER_EXPORT_HEADERS_JSON?.trim();
  if (rawHeaders) {
    try {
      const parsed = JSON.parse(rawHeaders);
      if (parsed && typeof parsed === 'object') {
        return Object.fromEntries(Object.entries(parsed).map(([k, v]) => [String(k), String(v)]));
      }
      return null;
    } catch {
      throw new Error('ROOSTER_EXPORT_HEADERS_JSON must be valid JSON object.');
    }
  }
  return getRoosterExportHeadersFromSheet();
}

/**
 * The `/api/rooster/v3/shifts/export` endpoint (like `/api/rooster/v3/employees`,
 * confirmed live 2026-07-27 during SRS-013 Phase 2 validation) rejects the
 * *stable* Cloudflare Access cookie alone with `401 Unauthorized` -- it also
 * needs a freshly-minted `dhh_token` (2h TTL), exactly like the Live-3PL
 * dashboard. `ROOSTER_EXPORT_HEADERS_JSON` (env or Sheet) intentionally
 * stores the stable cookie *without* `dhh_token` (it would go stale in
 * storage anyway -- see `roosterSessionStore.ts`), so a mint step must run
 * on every call, not just for the Live-3PL sync.
 *
 * This reuses the exact same `smartRefreshRoosterAuth()` three-layer
 * self-healing orchestration already proven in production for Live-3PL:
 * cheap dhh_token mint -> silent session replay -> full Okta+Gmail-OTP
 * recovery (SRS-012). On success, the (stable-only) recovered cookie is
 * persisted back to the Sheet automatically by `smartRefreshRoosterAuth`
 * itself -- no additional plumbing needed here.
 *
 * Callers: `RoosterClient.exportShiftsCsv()` (Phase 1) and the hourly
 * `/api/cron/rooster-sync` job (pre-existing; this fixes the same live
 * `401` there too, discovered via the exact same root cause).
 */
export async function resolveFreshRoosterExportHeaders(): Promise<{
  headers: Record<string, string> | null;
  failureReason?: string;
}> {
  const stable = await resolveStaticExportHeaders();
  const stableCookie = stable?.Cookie || stable?.cookie;
  if (!stableCookie) {
    return { headers: null, failureReason: 'no_stable_export_headers_configured' };
  }

  const outcome = await smartRefreshRoosterAuth({ Cookie: stableCookie });
  if (!outcome.headers) {
    logStructured('error', 'rooster_export_auth_refresh_failed', { failureReason: outcome.failureReason });
    return { headers: null, failureReason: outcome.failureReason || 'smart_refresh_failed' };
  }

  return { headers: outcome.headers };
}

export function buildDefaultExportRangeNowCairo(): { startDate: string; endDate: string } {
  const now = new Date();
  const startDate = formatIsoDateInTimeZone(now, 'Africa/Cairo');
  const endDate = formatIsoDateInTimeZone(addDays(now, 1), 'Africa/Cairo');
  return { startDate, endDate };
}

function parseIsoDateOnly(isoDate: string): { y: number; m: number; d: number } {
  const s = norm(isoDate);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) throw new Error(`Invalid date (expected YYYY-MM-DD): ${isoDate}`);
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  // Returns offset (ms) such that: dateInTz = date + offset
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(date);
  const byType = new Map(parts.map((p) => [p.type, p.value]));
  const y = Number(byType.get('year'));
  const mo = Number(byType.get('month'));
  const da = Number(byType.get('day'));
  const hh = Number(byType.get('hour'));
  const mm = Number(byType.get('minute'));
  const ss = Number(byType.get('second'));
  const asUtc = Date.UTC(y, mo - 1, da, hh, mm, ss);
  return asUtc - date.getTime();
}

function zonedTimeToUtc(dateParts: { y: number; m: number; d: number; hh: number; mm: number; ss: number; ms: number }, timeZone: string): Date {
  const utcGuess = new Date(Date.UTC(dateParts.y, dateParts.m - 1, dateParts.d, dateParts.hh, dateParts.mm, dateParts.ss, dateParts.ms));
  const offset = getTimeZoneOffsetMs(utcGuess, timeZone);
  return new Date(utcGuess.getTime() - offset);
}

function buildRoosterStartAtUtcIso(startDateCairo: string): string {
  const { y, m, d } = parseIsoDateOnly(startDateCairo);
  const utc = zonedTimeToUtc({ y, m, d, hh: 0, mm: 0, ss: 0, ms: 0 }, 'Africa/Cairo');
  return utc.toISOString().replace('.000Z', '.000Z');
}

function buildRoosterEndAtUtcIso(endDateCairo: string): string {
  const { y, m, d } = parseIsoDateOnly(endDateCairo);
  const utc = zonedTimeToUtc({ y, m, d, hh: 23, mm: 59, ss: 59, ms: 999 }, 'Africa/Cairo');
  // Keep millisecond precision like the browser request
  const iso = utc.toISOString();
  if (iso.endsWith('Z') && !iso.includes('.')) return iso.replace('Z', '.999Z');
  return iso;
}

