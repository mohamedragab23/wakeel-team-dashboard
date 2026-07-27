/**
 * SRS-012 Layer 3 — turns an Okta `sessionToken` into fresh app cookies.
 *
 * Confirmed live (2026-07-27): the real chain is
 *   1. Visit the app with NO CF_Authorization → Cloudflare Access's hosted
 *      "Sign in" chooser → its client-side auto-redirect URL to Okta
 *      (contains a short-lived `state`, ~5 min) — capture both the URL and
 *      whatever cookie(s) Cloudflare set during this visit (a `CF_Session`
 *      correlation cookie is set here and MUST be replayed on the final
 *      callback hop, or Cloudflare rejects the exchange).
 *   2. Append `&sessionToken=<token>` to that captured URL and follow the
 *      redirect chain (Okta → Cloudflare callback → app) with the SAME
 *      cookie jar from step 1 → fresh CF_Authorization + CF_AppSession.
 */
import { CookieJar } from 'tough-cookie';
import { logStructured } from '@/lib/requestTrace';

const MAX_REDIRECTS = 10;

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&amp;/g, '&');
}

async function absorbSetCookies(jar: CookieJar, res: Response, url: string): Promise<void> {
  const getSetCookie = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie;
  const raw = typeof getSetCookie === 'function' ? getSetCookie.call(res.headers) : ([res.headers.get('set-cookie')].filter(Boolean) as string[]);
  for (const sc of raw) {
    try {
      jar.setCookieSync(sc, url);
    } catch {
      // best-effort
    }
  }
}

export type FreshAuthorizeState = {
  authorizeUrl: string;
  jar: CookieJar;
};

/**
 * Visits the app with no valid session to capture a fresh, short-lived
 * Cloudflare Access `state` + the correlation cookie it sets along the way.
 * Must be called immediately before starting the Okta login (the state
 * expires in ~5 minutes).
 */
export async function captureFreshCloudflareAuthorizeState(appOrigin: string, appUrl: string): Promise<FreshAuthorizeState | null> {
  const jar = new CookieJar();
  try {
    const r1 = await fetch(appUrl, { method: 'GET', redirect: 'manual', headers: { Cookie: jar.getCookieStringSync(appUrl) } });
    await absorbSetCookies(jar, r1, appUrl);
    const chooserUrl = r1.headers.get('location');
    if (!chooserUrl) {
      logStructured('error', 'rooster_cf_state_capture_no_redirect', {});
      return null;
    }

    const r2 = await fetch(chooserUrl, { method: 'GET', redirect: 'manual', headers: { Cookie: jar.getCookieStringSync(chooserUrl) } });
    await absorbSetCookies(jar, r2, chooserUrl);
    const html = await r2.text();
    const match = html.match(/data-auto-redirect-url=["']([^"']+)["']/);
    if (!match) {
      logStructured('error', 'rooster_cf_state_capture_no_auto_redirect', {});
      return null;
    }

    return { authorizeUrl: decodeHtmlEntities(match[1]), jar };
  } catch (err: any) {
    logStructured('error', 'rooster_cf_state_capture_exception', { error: err?.message || String(err) });
    return null;
  }
}

export type SessionExchangeResult = { success: true; appCookieHeader: string } | { success: false; reason: string };

/**
 * Exchanges a valid Okta `sessionToken` (from `oktaAuthnClient.verifyEmailFactorOtp`)
 * for fresh app cookies, reusing the jar/state captured just before the login.
 */
export async function exchangeSessionTokenForAppCookies(
  state: FreshAuthorizeState,
  sessionToken: string,
  appOrigin: string
): Promise<SessionExchangeResult> {
  let url = `${state.authorizeUrl}&sessionToken=${encodeURIComponent(sessionToken)}`;
  const jar = state.jar;

  for (let hop = 0; hop < MAX_REDIRECTS; hop++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'GET',
        redirect: 'manual',
        headers: { Cookie: jar.getCookieStringSync(url), Accept: 'text/html,application/json;q=0.9,*/*;q=0.8' },
        cache: 'no-store',
      });
    } catch (err: any) {
      logStructured('error', 'rooster_session_exchange_network_error', { hop, error: err?.message });
      return { success: false, reason: `network_error: ${err?.message || String(err)}` };
    }

    await absorbSetCookies(jar, res, url);

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) return { success: false, reason: `redirect_without_location_${res.status}` };
      url = new URL(location, url).toString();
      continue;
    }

    // Non-redirect response — check whether we ended up with a real session.
    const appCookieHeader = jar.getCookieStringSync(appOrigin);
    if (appCookieHeader.includes('CF_Authorization=')) {
      logStructured('info', 'rooster_session_exchange_ok', {});
      return { success: true, appCookieHeader };
    }

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      const html = await res.text().catch(() => '');
      if (/type=["']password["']|okta-sign-in/i.test(html)) {
        logStructured('warn', 'rooster_session_exchange_hit_login_form', {});
        return { success: false, reason: 'unexpectedly_hit_login_form' };
      }
    }
    return { success: false, reason: 'no_cf_authorization_after_exchange' };
  }

  return { success: false, reason: `too_many_redirects_>${MAX_REDIRECTS}` };
}
