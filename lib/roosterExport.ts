import { formatIsoDateInTimeZone, addDays } from '@/lib/timezone';

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
 */
export async function exportRoosterCsv(params: RoosterExportParams): Promise<{ filename: string; bytes: ArrayBuffer }> {
  const template = requireEnv('ROOSTER_EXPORT_URL_TEMPLATE');
  const url = buildExportUrl(template, params);

  let extraHeaders: Record<string, string> = {};
  const rawHeaders = process.env.ROOSTER_EXPORT_HEADERS_JSON?.trim();
  if (rawHeaders) {
    try {
      const parsed = JSON.parse(rawHeaders);
      if (parsed && typeof parsed === 'object') {
        extraHeaders = Object.fromEntries(
          Object.entries(parsed).map(([k, v]) => [String(k), String(v)])
        );
      }
    } catch {
      throw new Error('ROOSTER_EXPORT_HEADERS_JSON must be valid JSON object.');
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

