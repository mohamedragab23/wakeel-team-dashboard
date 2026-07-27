/**
 * Orchestrates the three layers of automatic Rooster Live auth recovery:
 *
 * 1. `mintDhhTokenViaOkta` — mints a fresh `dhh_token` (2h TTL) from the
 *    stable Cloudflare Access cookies via the same Okta endpoint the
 *    website itself calls. Cheap, fast, works as long as CF_Authorization
 *    is still valid.
 * 2. Silent session replay (`silentlyRefreshRoosterSession`) — if (1) fails
 *    (CF_Authorization itself has expired) but the underlying Okta SSO
 *    session is still alive, replays the Cloudflare Access → Okta →
 *    Cloudflare Access redirect chain silently (no credentials needed) and
 *    re-attempts (1).
 * 3. Full recovery (`recoverRoosterAuthFully`, SRS-012) — if (2) fails too
 *    (the Okta SSO session itself is dead, e.g. after ~24h of total
 *    inactivity), performs a genuine Okta username/password + email-OTP
 *    login, reading the OTP automatically from Gmail (no human), then
 *    exchanges the resulting sessionToken for fresh cookies and retries (1).
 *    Only attempted if ROOSTER_OKTA_USERNAME/PASSWORD and the GMAIL_OAUTH_*
 *    vars are configured; otherwise this layer is skipped entirely (fast
 *    fail, same behavior as before SRS-012).
 *
 * On success at any layer, the recovered long-lived cookies are persisted
 * to the Google Sheet automatically — no human, no DevTools, no laptop
 * required. Telegram is only notified if ALL THREE layers fail.
 *
 * Both the reactive path (`client.ts`, called on 401 / HTML-instead-of-JSON)
 * and the proactive path (`/api/cron/rooster-keepalive`, run every few
 * hours to catch a dead session quickly rather than prevent it — visiting
 * the app early does not renew a still-valid CF_Authorization) call
 * `smartRefreshRoosterAuth`.
 */
import { logStructured } from '@/lib/requestTrace';
import { silentlyRefreshRoosterSession } from '@/lib/roosterLive/sessionKeepAlive';
import { setRoosterExportHeadersInSheet } from '@/lib/roosterSessionStore';
import {
  extractStableRoosterCookies,
  getRoosterAppOrigin,
  getRoosterKeepAliveUrl,
  getRoosterOktaSession,
} from '@/lib/roosterLive/tokenProvider';
import { isFullAuthRecoveryConfigured, recoverRoosterAuthFully } from '@/lib/roosterLive/authRecovery/engine';

export type SmartRefreshOutcome = {
  headers: Record<string, string> | null;
  /** true when the deep (Okta-replay) path was needed — i.e. CF_Authorization itself had expired. */
  healedViaDeepSessionRefresh: boolean;
  /** true when even the deep replay failed and the full Okta-login + Gmail-OTP recovery (Layer 3) was needed. */
  healedViaFullRecovery?: boolean;
  /** Present when every layer failed — human-readable reason for alerting. */
  failureReason?: string;
};

/**
 * Mints a fresh dhh_token from stable CF cookies via Okta (same as website).
 * Returns null (never throws) if the underlying cookie has already expired.
 */
export async function mintDhhTokenViaOkta(
  currentHeaders: Record<string, string>
): Promise<Record<string, string> | null> {
  try {
    const cookie = currentHeaders['Cookie'] || currentHeaders['cookie'];
    if (!cookie) {
      logStructured('error', 'rooster_live_refresh_no_cookie', { message: 'Cannot refresh: Cookie header missing' });
      return null;
    }
    if (!cookie.includes('CF_Authorization=')) {
      logStructured('error', 'rooster_live_refresh_no_cf_auth', {
        message: 'Cannot refresh: CF_Authorization cookie missing (need to update from browser)',
      });
      return null;
    }

    logStructured('info', 'rooster_live_refresh_attempt', { message: 'Attempting to refresh dhh_token via Okta endpoint' });

    const res = await fetch('https://eg.me.logisticsbackoffice.com/api/iam-login/auth/okta_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Cookie: cookie,
      },
      body: JSON.stringify({}),
      cache: 'no-store',
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      logStructured('error', 'rooster_live_refresh_failed', {
        status: res.status,
        body: body.slice(0, 300),
        message: 'Failed to refresh token via Okta endpoint',
      });
      return null;
    }

    const setCookies =
      typeof res.headers.getSetCookie === 'function'
        ? res.headers.getSetCookie()
        : ([res.headers.get('set-cookie')].filter(Boolean) as string[]);

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

    return { ...currentHeaders, Cookie: updatedCookie };
  } catch (error: any) {
    logStructured('error', 'rooster_live_refresh_exception', {
      error: error?.message || String(error),
      stack: error?.stack?.slice(0, 500),
    });
    return null;
  }
}

/**
 * Full self-heal: try the cheap dhh_token mint first; if CF_Authorization
 * itself is dead, replay the silent Cloudflare Access session refresh, then
 * retry the mint, then persist the recovered cookie back to the Sheet so
 * every future cold start (and the historical `rooster-sync` export job,
 * which shares the same Sheet key) benefits too — zero human involvement.
 */
export async function smartRefreshRoosterAuth(
  currentHeaders: Record<string, string>
): Promise<SmartRefreshOutcome> {
  const cheapRefresh = await mintDhhTokenViaOkta(currentHeaders);
  if (cheapRefresh) {
    return { headers: cheapRefresh, healedViaDeepSessionRefresh: false };
  }

  const cookie = currentHeaders['Cookie'] || currentHeaders['cookie'];
  if (!cookie) {
    return { headers: null, healedViaDeepSessionRefresh: false, failureReason: 'no_cookie_configured' };
  }

  logStructured('warn', 'rooster_live_deep_refresh_attempt', {
    message: 'dhh_token mint failed — CF_Authorization likely expired. Attempting silent session replay.',
  });

  const { cookieHeader: oktaCookieHeader, origin: oktaOrigin } = await getRoosterOktaSession();

  const sessionResult = await silentlyRefreshRoosterSession({
    appOrigin: getRoosterAppOrigin(),
    keepAliveUrl: getRoosterKeepAliveUrl(),
    appCookieHeader: cookie,
    oktaCookieHeader,
    oktaOrigin,
  });

  if (!sessionResult.success) {
    logStructured('error', 'rooster_live_deep_refresh_failed', { reason: sessionResult.reason });

    // Layer 2 failed — the underlying Okta SSO session itself is dead
    // (not just CF_Authorization's own JWT). Fall back to Layer 3: a full
    // Okta username/password + email-OTP login, with the OTP read
    // automatically from Gmail. Skipped entirely (fast fail) unless both
    // ROOSTER_OKTA_USERNAME/PASSWORD and the Gmail OAuth vars are set.
    if (!isFullAuthRecoveryConfigured()) {
      return {
        headers: null,
        healedViaDeepSessionRefresh: false,
        failureReason: sessionResult.reason,
      };
    }

    const fullRecovery = await recoverRoosterAuthFully();
    if (!fullRecovery.success) {
      logStructured('error', 'rooster_live_full_recovery_failed', { reason: fullRecovery.reason });
      return {
        headers: null,
        healedViaDeepSessionRefresh: false,
        healedViaFullRecovery: false,
        failureReason: `layer2:${sessionResult.reason};layer3:${fullRecovery.reason}`,
      };
    }

    const stableFullyRecoveredCookie = extractStableRoosterCookies(fullRecovery.appCookieHeader);
    const retryHeadersAfterFull: Record<string, string> = { ...currentHeaders, Cookie: stableFullyRecoveredCookie };
    delete (retryHeadersAfterFull as any).cookie;

    const mintedAfterFullRecovery = await mintDhhTokenViaOkta(retryHeadersAfterFull);
    if (!mintedAfterFullRecovery) {
      logStructured('error', 'rooster_live_full_recovery_mint_failed', {
        message: 'Full recovery succeeded but dhh_token mint still failed afterwards — unexpected.',
      });
      return {
        headers: null,
        healedViaDeepSessionRefresh: false,
        healedViaFullRecovery: false,
        failureReason: 'mint_failed_after_full_recovery',
      };
    }

    void setRoosterExportHeadersInSheet(stableFullyRecoveredCookie).catch(() => {});

    logStructured('info', 'rooster_live_full_recovery_ok', {
      message: 'Recovered from a fully-dead Okta SSO session automatically via login + Gmail OTP — zero human involvement.',
    });

    return { headers: mintedAfterFullRecovery, healedViaDeepSessionRefresh: false, healedViaFullRecovery: true };
  }

  const stableRefreshedCookie = extractStableRoosterCookies(sessionResult.appCookieHeader);
  const retryHeaders: Record<string, string> = { ...currentHeaders, Cookie: stableRefreshedCookie };
  delete (retryHeaders as any).cookie;

  const mintedAfterDeepRefresh = await mintDhhTokenViaOkta(retryHeaders);
  if (!mintedAfterDeepRefresh) {
    logStructured('error', 'rooster_live_deep_refresh_mint_failed', {
      message: 'Session replay succeeded but dhh_token mint still failed afterwards — unexpected.',
    });
    return { headers: null, healedViaDeepSessionRefresh: false, failureReason: 'mint_failed_after_session_refresh' };
  }

  // Persist the freshly recovered long-lived cookies (not the just-minted
  // dhh_token, which the browser rotates every ~1 min anyway) so the next
  // cold start / the hourly historical export job also pick it up.
  void setRoosterExportHeadersInSheet(stableRefreshedCookie).catch(() => {});

  logStructured('info', 'rooster_live_deep_refresh_ok', {
    message: 'Recovered from expired CF_Authorization automatically via silent session replay.',
  });

  return { headers: mintedAfterDeepRefresh, healedViaDeepSessionRefresh: true };
}
