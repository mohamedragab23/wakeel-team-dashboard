/**
 * Auth headers for the Talabat Live 3PL endpoint.
 *
 * PRODUCTION ARCHITECTURE (zero manual intervention):
 * - Uses Cloudflare Access cookies (CF_Authorization + CF_AppSession) - 24h TTL
 * - Auto-refreshes dhh_token (2h TTL) via Okta endpoint on each sync / on 401
 * - Falls back to Google Sheet for cookie rotation (infrequent, ~daily)
 *
 * CRITICAL:
 * - Never persist dhh_token / refresh_token in the Sheet — the browser refreshes
 *   them every ~1 min on the Live page and invalidates the pasted copy.
 * - Never use Authorization: Bearer (expires every 2 hours).
 */
import { getRoosterExportHeadersFromSheet } from '@/lib/roosterSessionStore';
import { logStructured } from '@/lib/requestTrace';

function parseJsonHeaders(raw: string | undefined, sourceLabel: string): Record<string, string> | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== 'object') return null;
    return Object.fromEntries(Object.entries(parsed).map(([k, v]) => [String(k), String(v)]));
  } catch {
    throw new Error(`${sourceLabel} must be valid JSON object of headers.`);
  }
}

/** Keep only long-lived Cloudflare Access cookies from a Cookie header. */
export function extractStableRoosterCookies(cookieHeader: string): string {
  const wanted = new Set(['CF_Authorization', 'CF_AppSession']);
  const parts = cookieHeader
    .split(';')
    .map((p) => p.trim())
    .filter(Boolean);

  const kept: string[] = [];
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const name = part.slice(0, eq).trim();
    if (wanted.has(name)) {
      kept.push(`${name}=${part.slice(eq + 1)}`);
    }
  }
  return kept.join('; ');
}

/**
 * Clean headers: Remove Authorization: Bearer and short-lived cookies.
 * Keep only CF_Authorization + CF_AppSession (24h TTL).
 */
function cleanHeaders(headers: Record<string, string>): Record<string, string> {
  const cleaned = { ...headers };

  if (cleaned['Authorization']?.startsWith('Bearer ')) {
    logStructured('warn', 'rooster_live_removed_bearer_token', {
      message: 'Removed Authorization: Bearer header (expires in 2h). Using Cookie-based auth instead.',
    });
    delete cleaned['Authorization'];
  }
  if (cleaned['authorization']?.startsWith('Bearer ')) {
    delete cleaned['authorization'];
  }

  const cookieHeader = cleaned['Cookie'] || cleaned['cookie'];
  if (!cookieHeader) {
    throw new Error(
      'Cookie header missing. Need CF_Authorization + CF_AppSession for Cloudflare Access auth. ' +
        'Update Google Sheet cron_config with Cookie header only (no dhh_token / Bearer).'
    );
  }

  const stable = extractStableRoosterCookies(cookieHeader);
  if (!stable.includes('CF_Authorization=')) {
    throw new Error(
      'CF_Authorization cookie missing. Copy from browser DevTools after login to eg.me.logisticsbackoffice.com'
    );
  }
  if (!stable.includes('CF_AppSession=')) {
    throw new Error(
      'CF_AppSession cookie missing. Copy both CF_AppSession and CF_Authorization into the Sheet Cookie value.'
    );
  }

  if (stable !== cookieHeader.trim()) {
    logStructured('info', 'rooster_live_stripped_short_lived_cookies', {
      message:
        'Removed dhh_token/refresh_token/analytics from Cookie. Sync will mint a fresh dhh_token via Okta.',
    });
  }

  delete cleaned['cookie'];
  cleaned['Cookie'] = stable;
  return cleaned;
}

/**
 * Resolution order (first non-empty wins):
 * 1. ROOSTER_LIVE_HEADERS_JSON env var (live-endpoint-specific override)
 * 2. ROOSTER_EXPORT_HEADERS_JSON env var (shared with the export job)
 * 3. Google Sheet `cron_config` tab (no-redeploy rotation - RECOMMENDED)
 */
export async function getRoosterLiveHeaders(): Promise<Record<string, string>> {
  const liveOverride = parseJsonHeaders(process.env.ROOSTER_LIVE_HEADERS_JSON, 'ROOSTER_LIVE_HEADERS_JSON');
  if (liveOverride) {
    return cleanHeaders(liveOverride);
  }

  const sharedEnv = parseJsonHeaders(process.env.ROOSTER_EXPORT_HEADERS_JSON, 'ROOSTER_EXPORT_HEADERS_JSON');
  if (sharedEnv) {
    return cleanHeaders(sharedEnv);
  }

  const fromSheet = await getRoosterExportHeadersFromSheet();
  if (fromSheet) {
    return cleanHeaders(fromSheet);
  }

  throw new Error(
    'No Rooster auth headers configured. Set Cookie headers in Google Sheet cron_config tab: ' +
      '{"Cookie":"CF_AppSession=...; CF_Authorization=..."} ' +
      '(Do NOT include dhh_token or Authorization: Bearer)'
  );
}

export function getRoosterLiveCityId(): string {
  const cityId = (process.env.ROOSTER_LIVE_CITY_ID || process.env.ROOSTER_CITY_ID || '').trim();
  if (!cityId) {
    throw new Error('Missing env: ROOSTER_LIVE_CITY_ID (or ROOSTER_CITY_ID as fallback)');
  }
  return cityId;
}
