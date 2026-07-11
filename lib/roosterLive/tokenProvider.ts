/**
 * Auth headers for the Talabat Live 3PL endpoint.
 *
 * PRODUCTION ARCHITECTURE (zero manual intervention):
 * - Uses Cloudflare Access cookies (CF_Authorization + CF_AppSession) - 24h TTL
 * - Auto-refreshes dhh_token (2h TTL) via Okta endpoint on 401
 * - Falls back to Google Sheet for cookie rotation (infrequent, ~daily)
 *
 * CRITICAL: Bearer tokens in Authorization header expire every 2 hours.
 * This implementation REMOVES Authorization header and relies on cookies only.
 * The client.ts layer handles automatic token refresh on 401 errors.
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

/**
 * Clean headers: Remove Authorization: Bearer (expires in 2h).
 * Keep only Cookie-based auth (CF_Authorization + CF_AppSession, 24h TTL).
 */
function cleanHeaders(headers: Record<string, string>): Record<string, string> {
  const cleaned = { ...headers };
  
  // Remove Authorization: Bearer (expires every 2 hours - NOT acceptable for production)
  if (cleaned['Authorization']?.startsWith('Bearer ')) {
    logStructured('warn', 'rooster_live_removed_bearer_token', {
      message: 'Removed Authorization: Bearer header (expires in 2h). Using Cookie-based auth instead.'
    });
    delete cleaned['Authorization'];
  }
  if (cleaned['authorization']?.startsWith('Bearer ')) {
    delete cleaned['authorization'];
  }
  
  // Validate Cookie header exists (required for auth)
  const cookieHeader = cleaned['Cookie'] || cleaned['cookie'];
  if (!cookieHeader) {
    throw new Error(
      'Cookie header missing. Need CF_Authorization + CF_AppSession for Cloudflare Access auth. ' +
      'Update Google Sheet cron_config or env var with Cookie header only (no Authorization: Bearer).'
    );
  }
  
  // Ensure CF_Authorization is present (24h session)
  if (!cookieHeader.includes('CF_Authorization=')) {
    throw new Error(
      'CF_Authorization cookie missing. This is the Cloudflare Access session cookie (24h TTL). ' +
      'Copy from browser DevTools after login to eg.me.logisticsbackoffice.com'
    );
  }
  
  return cleaned;
}

/**
 * Resolution order (first non-empty wins):
 * 1. ROOSTER_LIVE_HEADERS_JSON env var (live-endpoint-specific override)
 * 2. ROOSTER_EXPORT_HEADERS_JSON env var (shared with the export job)
 * 3. Google Sheet `cron_config` tab (no-redeploy rotation - RECOMMENDED)
 *
 * Note: Authorization: Bearer headers are automatically removed (expire in 2h).
 */
export async function getRoosterLiveHeaders(): Promise<Record<string, string>> {
  // Priority 1: Live-specific override
  const liveOverride = parseJsonHeaders(process.env.ROOSTER_LIVE_HEADERS_JSON, 'ROOSTER_LIVE_HEADERS_JSON');
  if (liveOverride) {
    return cleanHeaders(liveOverride);
  }

  // Priority 2: Shared with historical export
  const sharedEnv = parseJsonHeaders(process.env.ROOSTER_EXPORT_HEADERS_JSON, 'ROOSTER_EXPORT_HEADERS_JSON');
  if (sharedEnv) {
    return cleanHeaders(sharedEnv);
  }

  // Priority 3: Google Sheet (RECOMMENDED - no-redeploy rotation)
  const fromSheet = await getRoosterExportHeadersFromSheet();
  if (fromSheet) {
    return cleanHeaders(fromSheet);
  }

  throw new Error(
    'No Rooster auth headers configured. Set Cookie headers in Google Sheet cron_config tab: ' +
    '{"Cookie":"CF_AppSession=...; CF_Authorization=..."} ' +
    '(Do NOT include Authorization: Bearer - it expires every 2 hours)'
  );
}

export function getRoosterLiveCityId(): string {
  const cityId = (process.env.ROOSTER_LIVE_CITY_ID || process.env.ROOSTER_CITY_ID || '').trim();
  if (!cityId) {
    throw new Error('Missing env: ROOSTER_LIVE_CITY_ID (or ROOSTER_CITY_ID as fallback)');
  }
  return cityId;
}
