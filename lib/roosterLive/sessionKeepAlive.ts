/**
 * Self-healing Cloudflare Access session refresh for the Talabat Rooster
 * Live 3PL integration.
 *
 * WHY THIS EXISTS
 * ----------------
 * `eg.me.logisticsbackoffice.com` never visibly logs a human out because,
 * as long as the browser tab stays open, Cloudflare Access silently
 * re-authenticates through the IdP (Okta) behind the scenes — a chain of
 * redirects (App → Cloudflare Access → Okta → Cloudflare Access → App)
 * that reissues a fresh `CF_Authorization` JWT using the still-valid Okta
 * SSO session, with zero UI shown to the user. A cron job that only holds
 * a *copy* of `CF_Authorization`/`CF_AppSession` never gets that silent
 * refresh, so once the JWT's own `exp` passes (a real captured token's
 * iat/exp claims confirm a 24h "Session Duration" for this Cloudflare
 * Access app) — or the session is invalidated earlier server-side, e.g. by
 * a second login to the same account elsewhere — every sync starts failing
 * until a human
 * manually re-pastes fresh cookies.
 *
 * This module replicates that exact silent redirect chain server-side
 * using a `tough-cookie` jar (so cookies are attached per-domain exactly
 * like a real browser would, across the App ↔ Okta hop), instead of
 * spinning up a real headless browser. It only works as long as the
 * underlying Okta SSO session (captured once, separately, from DevTools)
 * is itself still alive — once THAT truly expires, this fails on purpose
 * and the existing Telegram alert still fires so a human can log in again.
 */
import { CookieJar } from 'tough-cookie';
import { logStructured } from '@/lib/requestTrace';

const MAX_REDIRECTS = 10;
const LOGIN_FORM_MARKERS = [
  /type=["']password["']/i,
  /okta-sign-in/i,
  /id=["']okta-login-container["']/i,
  /data-se=["']o-form["']/i,
];

function seedCookies(jar: CookieJar, cookieHeader: string | undefined | null, url: string): void {
  if (!cookieHeader) return;
  const pairs = cookieHeader
    .split(';')
    .map((p) => p.trim())
    .filter(Boolean);
  for (const pair of pairs) {
    try {
      jar.setCookieSync(pair, url);
    } catch {
      // Ignore malformed individual cookie pairs — best-effort seeding.
    }
  }
}

function absorbSetCookies(jar: CookieJar, res: Response, url: string): void {
  const getSetCookie = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie;
  const raw = typeof getSetCookie === 'function' ? getSetCookie.call(res.headers) : [res.headers.get('set-cookie')].filter(Boolean) as string[];
  for (const sc of raw) {
    try {
      jar.setCookieSync(sc, url);
    } catch {
      // Ignore — best-effort absorption.
    }
  }
}

function looksLikeLoginForm(html: string): boolean {
  return LOGIN_FORM_MARKERS.some((re) => re.test(html));
}

export type SessionRefreshResult =
  | { success: true; appCookieHeader: string }
  | { success: false; reason: string };

export async function silentlyRefreshRoosterSession(params: {
  /** e.g. https://eg.me.logisticsbackoffice.com — used to seed/read app cookies. */
  appOrigin: string;
  /** A real (HTML, browser-facing) page URL behind Cloudflare Access — NOT the JSON API. */
  keepAliveUrl: string;
  /** Current Cookie header for the app domain (CF_Authorization, CF_AppSession, session, ...). */
  appCookieHeader: string;
  /** Optional: Okta domain's own session cookie, captured separately from DevTools. */
  oktaCookieHeader?: string | null;
  /** Required if oktaCookieHeader is set — e.g. https://yourcompany.okta.com */
  oktaOrigin?: string | null;
}): Promise<SessionRefreshResult> {
  const jar = new CookieJar();
  seedCookies(jar, params.appCookieHeader, params.appOrigin);
  if (params.oktaCookieHeader && params.oktaOrigin) {
    seedCookies(jar, params.oktaCookieHeader, params.oktaOrigin);
  }

  let url = params.keepAliveUrl;
  let lastHtml = '';
  let resolvedWithoutRedirect = false;

  for (let hop = 0; hop < MAX_REDIRECTS; hop++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'GET',
        redirect: 'manual',
        headers: {
          Cookie: jar.getCookieStringSync(url),
          Accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
          'User-Agent': 'Mozilla/5.0 (compatible; RoosterSessionKeepAlive/1.0)',
        },
        cache: 'no-store',
      });
    } catch (err: any) {
      logStructured('error', 'rooster_session_refresh_network_error', { hop, url, error: err?.message });
      return { success: false, reason: `network_error: ${err?.message || String(err)}` };
    }

    absorbSetCookies(jar, res, url);

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) {
        return { success: false, reason: `redirect_without_location (${res.status})` };
      }
      url = new URL(location, url).toString();
      continue;
    }

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      lastHtml = await res.text().catch(() => '');
    }
    resolvedWithoutRedirect = true;
    break;
  }

  if (!resolvedWithoutRedirect) {
    return { success: false, reason: `too_many_redirects (>${MAX_REDIRECTS})` };
  }

  if (lastHtml && looksLikeLoginForm(lastHtml)) {
    logStructured('warn', 'rooster_session_refresh_hit_login_form', { finalUrl: url });
    return { success: false, reason: 'okta_login_form_required' };
  }

  const refreshedAppCookie = jar.getCookieStringSync(params.appOrigin);
  if (!refreshedAppCookie.includes('CF_Authorization=')) {
    return { success: false, reason: 'no_cf_authorization_after_refresh' };
  }

  logStructured('info', 'rooster_session_refresh_ok', { finalUrl: url });
  return { success: true, appCookieHeader: refreshedAppCookie };
}
