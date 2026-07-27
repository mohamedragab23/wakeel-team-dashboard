/**
 * Auth headers for the Talabat Live 3PL endpoint.
 *
 * PRODUCTION ARCHITECTURE (zero manual intervention, best-effort):
 * 1. Cloudflare Access Service Token (CF-Access-Client-Id/Secret) — permanent,
 *    no expiration, if IT/Talabat can issue one for this endpoint. Use this
 *    if available; nothing below is needed when it's set.
 * 2. Cookie-based auth (CF_Authorization + CF_AppSession + any other
 *    long-lived session cookie the app itself sets), with automatic
 *    self-healing:
 *    - dhh_token (2h TTL) is re-minted every sync via the Okta token
 *      endpoint, using the stable cookies.
 *    - CF_Authorization itself is a 24h JWT (confirmed by decoding a real
 *      captured token's iat/exp claims — Cloudflare Access's configured
 *      Session Duration for this app). If the sync still fails sooner than
 *      24h in practice, the JWT's own expiry is *not* the cause — suspect a
 *      session collision (someone else logging into the same bot account
 *      invalidates the copied cookie server-side) or a Cloudflare Access
 *      re-validation rule (e.g. IP/geo/device posture) unrelated to `exp`.
 *      Either way, `sessionKeepAlive.ts` replicates the same
 *      silent Cloudflare Access → Okta → Cloudflare Access redirect chain a
 *      browser tab performs invisibly, and — on success — writes the fresh
 *      cookie back into the Google Sheet automatically. See
 *      `lib/roosterLive/authRefresh.ts` for the orchestration and
 *      `docs/ROOSTER_LIVE.md` for the operational runbook.
 *
 * CRITICAL:
 * - Never persist dhh_token / refresh_token in the Sheet — the browser refreshes
 *   them every ~1 min on the Live page and invalidates the pasted copy.
 * - Never use Authorization: Bearer (expires every 2 hours).
 */
import { getRoosterExportHeadersFromSheet, getRoosterOktaCookieFromSheet } from '@/lib/roosterSessionStore';
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

/** Cookie names that rotate on every request/are third-party analytics noise —
 *  everything else is kept, specifically so we don't discard whatever
 *  longer-lived app/Okta session cookie is actually enabling the browser's
 *  "never logs me out" behavior (e.g. a plain `session` cookie observed in
 *  earlier captures, in addition to CF_Authorization/CF_AppSession). */
const ALWAYS_DROP_COOKIE_NAMES = new Set(['dhh_token', 'refresh_token']);
const DROP_COOKIE_NAME_PATTERNS = [/^_ga/i, /^_gid/i, /^_gcl/i, /^_fbp/i, /^amplitude/i, /^mixpanel/i, /^intercom-/i];

function extraDropNamesFromEnv(): Set<string> {
  const raw = process.env.ROOSTER_DROP_COOKIE_NAMES?.trim();
  if (!raw) return new Set();
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

/** Keep every long-lived cookie from a Cookie header (drops only the
 *  known-rotating dhh_token/refresh_token and obvious analytics noise). */
export function extractStableRoosterCookies(cookieHeader: string): string {
  const dropExtra = extraDropNamesFromEnv();
  const parts = cookieHeader
    .split(';')
    .map((p) => p.trim())
    .filter(Boolean);

  const kept: string[] = [];
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const name = part.slice(0, eq).trim();
    if (ALWAYS_DROP_COOKIE_NAMES.has(name)) continue;
    if (dropExtra.has(name)) continue;
    if (DROP_COOKIE_NAME_PATTERNS.some((re) => re.test(name))) continue;
    kept.push(`${name}=${part.slice(eq + 1)}`);
  }
  return kept.join('; ');
}

/**
 * Clean headers: Remove Authorization: Bearer and rotating/analytics cookies.
 * Keep CF_Authorization + CF_AppSession + any other stable session cookie.
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
      message: 'Removed dhh_token/refresh_token/analytics from Cookie. Sync will mint a fresh dhh_token via Okta.',
    });
  }

  delete cleaned['cookie'];
  cleaned['Cookie'] = stable;
  return cleaned;
}

/** Cloudflare Access Service Token — permanent, no expiration, if issued by IT/Talabat
 *  for this specific endpoint. See docs/ROOSTER_LIVE.md → "Authentication Architecture". */
export function getRoosterServiceTokenHeaders(): Record<string, string> | null {
  const clientId = (process.env.CF_ACCESS_ROOSTER_CLIENT_ID || process.env.CLOUDFLARE_ACCESS_ROOSTER_CLIENT_ID)?.trim();
  const clientSecret = (
    process.env.CF_ACCESS_ROOSTER_CLIENT_SECRET || process.env.CLOUDFLARE_ACCESS_ROOSTER_CLIENT_SECRET
  )?.trim();
  if (!clientId || !clientSecret) return null;
  return {
    'CF-Access-Client-Id': clientId,
    'CF-Access-Client-Secret': clientSecret,
  };
}

/**
 * Resolution order (first non-empty wins):
 * 0. Cloudflare Access Service Token (permanent — recommended if available)
 * 1. ROOSTER_LIVE_HEADERS_JSON env var (live-endpoint-specific override)
 * 2. ROOSTER_EXPORT_HEADERS_JSON env var (shared with the export job)
 * 3. Google Sheet `cron_config` tab (no-redeploy rotation, self-healing — see authRefresh.ts)
 */
export async function getRoosterLiveHeaders(): Promise<Record<string, string>> {
  const serviceToken = getRoosterServiceTokenHeaders();
  if (serviceToken) {
    return serviceToken;
  }

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

/** Base origin (scheme + host) the Rooster/Live 3PL app is served from. */
export function getRoosterAppOrigin(): string {
  const explicit = process.env.ROOSTER_APP_ORIGIN?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  try {
    const template = process.env.ROOSTER_LIVE_URL_TEMPLATE?.trim();
    const url = new URL(
      template || 'https://eg.me.logisticsbackoffice.com/api/rider-live-operations/v1/external/city/{city_id}/riders'
    );
    return `${url.protocol}//${url.host}`;
  } catch {
    return 'https://eg.me.logisticsbackoffice.com';
  }
}

/** A real, browser-facing HTML page behind Cloudflare Access — used to trigger
 *  the same silent CF Access → Okta → CF Access refresh a browser tab does.
 *  Do NOT point this at the JSON API — API routes may 401 directly instead of
 *  performing the interactive redirect dance. */
export function getRoosterKeepAliveUrl(): string {
  const explicit = process.env.ROOSTER_KEEPALIVE_URL?.trim();
  if (explicit) return explicit;
  return `${getRoosterAppOrigin()}/dashboard/rooster/live-3pl`;
}

/** Optional Okta (or other IdP) session — captured once from DevTools against
 *  the IdP's own domain (never sent to eg.me.logisticsbackoffice.com, so it's
 *  invisible in that request's Cookie header). Needed only for the deep
 *  self-heal path once CF_Authorization itself has expired. */
export async function getRoosterOktaSession(): Promise<{ cookieHeader: string | null; origin: string | null }> {
  const origin = process.env.ROOSTER_OKTA_ORIGIN?.trim() || null;
  const envCookie = process.env.ROOSTER_OKTA_COOKIE?.trim() || null;
  if (envCookie) return { cookieHeader: envCookie, origin };
  const fromSheet = await getRoosterOktaCookieFromSheet();
  return { cookieHeader: fromSheet, origin };
}
