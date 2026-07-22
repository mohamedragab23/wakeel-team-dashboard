/**
 * Fetches ALL pages of the Talabat Live 3PL rider-ops endpoint for one city.
 *
 * This is the ONLY module in the codebase that should ever call this Talabat
 * endpoint directly — the sync job is the single backend process allowed to
 * talk to Talabat, per the architecture decision. Never import this from a
 * page or from `app/api/live-riders`.
 */
import { getRoosterLiveHeaders, getRoosterLiveCityId } from '@/lib/roosterLive/tokenProvider';
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

/**
 * Auto-refresh dhh_token using Okta endpoint (same as website uses).
 * 
 * Architecture: CF_Authorization (24h) → POST /api/iam-login/auth/okta_token → new dhh_token (2h)
 * 
 * This eliminates manual intervention - when dhh_token expires (2h), automatically refresh it
 * using the long-lived CF_Authorization cookie (24h).
 */
async function attemptTokenRefresh(currentHeaders: Record<string, string>): Promise<Record<string, string> | null> {
  try {
    const cookie = currentHeaders['Cookie'] || currentHeaders['cookie'];
    if (!cookie) {
      logStructured('error', 'rooster_live_refresh_no_cookie', { 
        message: 'Cannot refresh: Cookie header missing'
      });
      return null;
    }

    // Verify CF_Authorization exists (required for refresh)
    if (!cookie.includes('CF_Authorization=')) {
      logStructured('error', 'rooster_live_refresh_no_cf_auth', { 
        message: 'Cannot refresh: CF_Authorization cookie missing (need to update from browser)'
      });
      return null;
    }

    logStructured('info', 'rooster_live_refresh_attempt', { 
      message: 'Attempting to refresh dhh_token via Okta endpoint'
    });

    // Call Okta token endpoint (same as website uses after login)
    const res = await fetch('https://eg.me.logisticsbackoffice.com/api/iam-login/auth/okta_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Cookie': cookie, // CF_Authorization + CF_AppSession
      },
      body: JSON.stringify({}), // Empty body (session is in cookie)
      cache: 'no-store',
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      logStructured('error', 'rooster_live_refresh_failed', { 
        status: res.status,
        body: body.slice(0, 300),
        message: 'Failed to refresh token via Okta endpoint'
      });
      return null;
    }

    // Node/undici: get('set-cookie') often returns only the first cookie.
    const setCookies =
      typeof res.headers.getSetCookie === 'function'
        ? res.headers.getSetCookie()
        : [res.headers.get('set-cookie')].filter(Boolean) as string[];

    if (!setCookies.length) {
      logStructured('error', 'rooster_live_refresh_no_set_cookie', {
        message: 'Okta endpoint succeeded but no Set-Cookie header returned',
      });
      return null;
    }

    const joined = setCookies.join('\n');
    const dhhMatch = joined.match(/dhh_token=([^;,\s]+)/);
    const refreshMatch = joined.match(/refresh_token=([^;,\s]+)/);

    const newDhhToken = dhhMatch ? dhhMatch[1] : null;
    const newRefreshToken = refreshMatch ? refreshMatch[1] : null;

    if (!newDhhToken) {
      logStructured('error', 'rooster_live_refresh_no_dhh_token', {
        message: 'Okta endpoint succeeded but dhh_token not found in Set-Cookie',
        setCookieCount: setCookies.length,
      });
      return null;
    }

    logStructured('info', 'rooster_live_token_refreshed', {
      message: 'Successfully refreshed dhh_token via Okta endpoint',
      newDhhTokenLength: newDhhToken.length,
      hasRefreshToken: !!newRefreshToken,
    });

    // Start from stable CF cookies only, then attach freshly minted tokens.
    let updatedCookie = cookie
      .replace(/dhh_token=[^;]+(;\s*)?/g, '')
      .replace(/refresh_token=[^;]+(;\s*)?/g, '')
      .replace(/;+/g, ';')
      .replace(/^;\s*/, '')
      .replace(/;\s*$/, '');

    updatedCookie = `${updatedCookie}; dhh_token=${newDhhToken}`;
    if (newRefreshToken) {
      updatedCookie = `${updatedCookie}; refresh_token=${newRefreshToken}`;
    }
    updatedCookie = updatedCookie.replace(/;+/g, ';').replace(/^;\s*/, '').replace(/;\s*$/, '');

    return {
      ...currentHeaders,
      Cookie: updatedCookie,
    };

  } catch (error: any) {
    logStructured('error', 'rooster_live_refresh_exception', { 
      error: error?.message || String(error),
      stack: error?.stack?.slice(0, 500)
    });
    return null;
  }
}

async function fetchWithRetry(
  url: string,
  headers: Record<string, string>
): Promise<{ res: Response; headers: Record<string, string> }> {
  let lastError: unknown;
  let currentHeaders = { ...headers };

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
            const refreshed = await attemptTokenRefresh(currentHeaders);
            if (refreshed) {
              currentHeaders = refreshed;
              continue;
            }
          }
          const body = await res.text().catch(() => '');
          throw new Error(
            'Rooster live returned HTML login page instead of JSON (HTTP 200). ' +
              'CF_Authorization / CF_AppSession cookies are missing or expired. ' +
              'Update Google Sheet cron_config → ROOSTER_EXPORT_HEADERS_JSON with a fresh Cookie from the browser. ' +
              body.slice(0, 120)
          );
        }
        return { res, headers: currentHeaders };
      }

      if (res.status === 401 && attempt === 1) {
        logStructured('warn', 'rooster_live_auth_expired', {
          url,
          attempt,
          message: 'Received 401, attempting automatic token refresh via Okta endpoint',
        });

        const refreshed = await attemptTokenRefresh(currentHeaders);
        if (refreshed) {
          logStructured('info', 'rooster_live_retry_with_new_token', {
            message: 'Retrying request with refreshed dhh_token',
          });
          currentHeaders = refreshed;
          continue;
        }
        logStructured('error', 'rooster_live_refresh_failed_permanent', {
          message:
            'Auto-refresh failed. CF_Authorization may have expired (24h TTL). Update Google Sheet with new cookies from browser.',
        });
      }

      if (res.status === 401 || res.status === 403) {
        const body = await res.text().catch(() => '');
        throw new Error(
          `Rooster live auth rejected (${res.status}). ` +
            `Auto-refresh ${attempt === 1 ? 'failed' : 'not attempted (already tried)'}. ` +
            `CF_Authorization cookie may have expired (24h TTL). ` +
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
}): Promise<{ rawRiders: unknown[]; pagesFetched: number }> {
  const size = options?.pageSize ?? DEFAULT_PAGE_SIZE;
  let headers = await getRoosterLiveHeaders();

  // Mint a fresh dhh_token every sync from stable CF cookies.
  // Prevents failure when the browser Live page rotates dhh_token every ~1 min.
  const refreshed = await attemptTokenRefresh(headers);
  if (refreshed) {
    headers = refreshed;
  } else {
    logStructured('warn', 'rooster_live_proactive_refresh_failed', {
      message:
        'Could not mint dhh_token before sync; will still try with CF cookies and refresh on 401.',
    });
  }

  const rawRiders: unknown[] = [];
  let page = 0;

  while (page < MAX_PAGES_SAFETY_CAP) {
    const url = buildPageUrl(page, size);
    const { res, headers: nextHeaders } = await fetchWithRetry(url, headers);
    headers = nextHeaders;
    const rawText = await res.text();
    const trimmed = rawText.trim();
    if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html') || trimmed.startsWith('<HTML')) {
      throw new Error(
        'Rooster live returned HTML instead of JSON — auth cookies expired or invalid. ' +
          'Update cron_config → ROOSTER_EXPORT_HEADERS_JSON with Cookie containing CF_Authorization + CF_AppSession only (no dhh_token).'
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

  return { rawRiders, pagesFetched: page };
}
