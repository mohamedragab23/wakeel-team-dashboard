/**
 * Fetches ALL pages of the Talabat Live 3PL rider-ops endpoint for one city.
 *
 * This is the ONLY module in the codebase that should ever call this Talabat
 * endpoint directly — the sync job is the single backend process allowed to
 * talk to Talabat, per the architecture decision. Never import this from a
 * page or from `app/api/live-riders`.
 */
import { getRoosterLiveHeaders, getRoosterLiveCityId } from '@/lib/roosterLive/tokenProvider';
import { smartRefreshRoosterAuth } from '@/lib/roosterLive/authRefresh';
import { logStructured } from '@/lib/requestTrace';

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGES_SAFETY_CAP = 50; // 50 * 100 = 5,000 riders ceiling, well above any single city
const RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 500;

function baseUrl(): string {
  const template = process.env.ROOSTER_LIVE_URL_TEMPLATE?.trim();
  if (template) return template;
  // Default matches the endpoint documented in the integration request.
  return 'https://eg.me.logisticsbackoffice.com/api/rider-live-operations/v1/external/city/{city_id}/riders';
}

function buildPageUrl(page: number, size: number): string {
  const cityId = getRoosterLiveCityId();
  const url = new URL(baseUrl().replace('{city_id}', encodeURIComponent(cityId)));
  url.searchParams.set('page', String(page));
  url.searchParams.set('size', String(size));
  return url.toString();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  url: string,
  headers: Record<string, string>
): Promise<{ res: Response; headers: Record<string, string>; healedDeep: boolean; healedFull: boolean }> {
  let lastError: unknown;
  let currentHeaders = { ...headers };
  let healedDeep = false;
  let healedFull = false;

  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json', ...currentHeaders },
        cache: 'no-store',
      });

      // Cloudflare Access often returns 200 with an HTML login page when cookies are stale.
      if (res.ok) {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('text/html')) {
          if (attempt === 1) {
            const outcome = await smartRefreshRoosterAuth(currentHeaders);
            if (outcome.headers) {
              currentHeaders = outcome.headers;
              healedDeep = healedDeep || outcome.healedViaDeepSessionRefresh;
              healedFull = healedFull || !!outcome.healedViaFullRecovery;
              continue;
            }
          }
          const body = await res.text().catch(() => '');
          throw new Error(
            'Rooster live returned HTML login page instead of JSON (HTTP 200). ' +
              'CF_Authorization / CF_AppSession cookies are missing or expired, and ALL automatic self-heal layers ' +
              'failed (dhh_token mint + silent Cloudflare Access session replay + full Okta login/Gmail-OTP recovery ' +
              'if configured). Update Google Sheet cron_config → ROOSTER_EXPORT_HEADERS_JSON ' +
              'with a fresh Cookie from the browser. ' +
              body.slice(0, 120)
          );
        }
        return { res, headers: currentHeaders, healedDeep, healedFull };
      }

      if (res.status === 401 && attempt === 1) {
        logStructured('warn', 'rooster_live_auth_expired', {
          url,
          attempt,
          message: 'Received 401, attempting automatic self-heal (Okta mint, then session replay if needed)',
        });

        const outcome = await smartRefreshRoosterAuth(currentHeaders);
        if (outcome.headers) {
          logStructured('info', 'rooster_live_retry_with_new_token', {
            message: 'Retrying request with refreshed auth',
            healedViaDeepSessionRefresh: outcome.healedViaDeepSessionRefresh,
          });
          currentHeaders = outcome.headers;
          healedDeep = healedDeep || outcome.healedViaDeepSessionRefresh;
          healedFull = healedFull || !!outcome.healedViaFullRecovery;
          continue;
        }
        logStructured('error', 'rooster_live_refresh_failed_permanent', {
          message: 'Both auto-refresh layers failed. Underlying Okta session has fully expired.',
          reason: outcome.failureReason,
        });
      }

      if (res.status === 401 || res.status === 403) {
        const body = await res.text().catch(() => '');
        throw new Error(
          `Rooster live auth rejected (${res.status}). ` +
            `Auto-refresh (all layers: dhh_token mint + silent session replay + full Okta/Gmail-OTP recovery) ` +
            `${attempt === 1 ? 'failed' : 'not attempted (already tried)'}. ` +
            `The underlying Okta session has fully expired and could not be recovered automatically. ` +
            `Update Google Sheet cron_config with new cookies from browser: ${body.slice(0, 200)}`
        );
      }

      if (res.status !== 429 && res.status < 500) {
        const body = await res.text().catch(() => '');
        throw new Error(`Rooster live request failed (${res.status}): ${body.slice(0, 300)}`);
      }

      lastError = new Error(`Rooster live transient error (${res.status})`);
    } catch (err) {
      lastError = err;
    }

    if (attempt < RETRY_ATTEMPTS) {
      const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
      logStructured('warn', 'rooster_live_fetch_retry', { attempt, delay, url });
      await sleep(delay);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Rooster live fetch failed after retries');
}

/** Extracts the array of rider rows regardless of which wrapper shape the API uses. */
function extractRows(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>;
    for (const key of ['content', 'data', 'items', 'riders', 'results']) {
      if (Array.isArray(obj[key])) return obj[key] as unknown[];
    }
  }
  return [];
}

/** True when the payload's own pagination metadata says this was the last page. */
function isLastPageByMetadata(payload: unknown): boolean | null {
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>;
    if (typeof obj.last === 'boolean') return obj.last;
    if (typeof obj.totalPages === 'number' && typeof obj.number === 'number') {
      return obj.number >= obj.totalPages - 1;
    }
  }
  return null;
}

export async function fetchAllRoosterLiveRiders(options?: {
  pageSize?: number;
}): Promise<{ rawRiders: unknown[]; pagesFetched: number; healedAuthDeep: boolean; healedAuthFull: boolean }> {
  const size = options?.pageSize ?? DEFAULT_PAGE_SIZE;
  let headers = await getRoosterLiveHeaders();
  let healedAuthDeep = false;
  let healedAuthFull = false;

  // Mint a fresh dhh_token every sync from stable CF cookies (falling back to
  // a silent Cloudflare Access session replay if CF_Authorization itself has
  // expired or been invalidated). Prevents failure when the browser Live page
  // rotates dhh_token every ~1 min, and self-heals the 24h CF_Authorization
  // session (or an earlier server-side invalidation) without a human.
  const proactive = await smartRefreshRoosterAuth(headers);
  if (proactive.headers) {
    headers = proactive.headers;
    healedAuthDeep = proactive.healedViaDeepSessionRefresh;
    healedAuthFull = !!proactive.healedViaFullRecovery;
  } else {
    logStructured('warn', 'rooster_live_proactive_refresh_failed', {
      message: 'Could not refresh auth before sync; will still try with current cookies and retry on 401.',
      reason: proactive.failureReason,
    });
  }

  const rawRiders: unknown[] = [];
  let page = 0;

  while (page < MAX_PAGES_SAFETY_CAP) {
    const url = buildPageUrl(page, size);
    const { res, headers: nextHeaders, healedDeep, healedFull } = await fetchWithRetry(url, headers);
    headers = nextHeaders;
    healedAuthDeep = healedAuthDeep || healedDeep;
    healedAuthFull = healedAuthFull || healedFull;
    const rawText = await res.text();
    const trimmed = rawText.trim();
    if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html') || trimmed.startsWith('<HTML')) {
      throw new Error(
        'Rooster live returned HTML instead of JSON — auth cookies expired and ALL automatic self-heal layers ' +
          '(dhh_token mint + silent Cloudflare Access session replay + full Okta login/Gmail-OTP recovery) also failed. ' +
          'Update cron_config → ROOSTER_EXPORT_HEADERS_JSON with a fresh full Cookie header from the browser.'
      );
    }
    let payload: unknown;
    try {
      payload = JSON.parse(rawText);
    } catch {
      throw new Error(
        `Rooster live response is not valid JSON (starts with: ${trimmed.slice(0, 80)}). ` +
          'Usually means Cloudflare Access blocked the request — refresh CF cookies in Google Sheet.'
      );
    }
    const rows = extractRows(payload);
    rawRiders.push(...rows);

    const lastByMeta = isLastPageByMetadata(payload);
    const lastByRowCount = rows.length < size;
    page += 1;

    if (rows.length === 0 || lastByMeta === true || (lastByMeta === null && lastByRowCount)) {
      break;
    }
  }

  if (page >= MAX_PAGES_SAFETY_CAP) {
    logStructured('warn', 'rooster_live_page_cap_hit', { pagesFetched: page, riderCount: rawRiders.length });
  }

  return { rawRiders, pagesFetched: page, healedAuthDeep, healedAuthFull };
}
