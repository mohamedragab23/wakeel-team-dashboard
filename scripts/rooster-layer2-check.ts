/**
 * Verifies the Layer 2 deep session-refresh (`sessionKeepAlive.ts`) without
 * waiting for a real 24h CF_Authorization expiry: it strips CF_Authorization
 * from the currently stored cookie (simulating the exact real-world failure
 * case) and replays the redirect chain, using ROOSTER_OKTA_COOKIE /
 * ROOSTER_OKTA_ORIGIN if configured.
 *
 * Useful after changing sessionKeepAlive.ts, or to check whether a captured
 * Okta cookie (deliveryhero.okta.com) actually lets the deep recovery
 * complete silently instead of hitting a real login form.
 *
 * Usage: npx tsx scripts/rooster-layer2-check.ts
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { silentlyRefreshRoosterSession } from '@/lib/roosterLive/sessionKeepAlive';
import {
  getRoosterAppOrigin,
  getRoosterKeepAliveUrl,
  getRoosterLiveHeaders,
  getRoosterOktaSession,
} from '@/lib/roosterLive/tokenProvider';

function decodeJwtExp(cookieHeader: string) {
  const m = cookieHeader.match(/CF_Authorization=([^;]+)/);
  if (!m) return null;
  const parts = m[1].split('.');
  if (parts.length < 2) return null;
  let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const payload = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  return { iat: payload.iat, exp: payload.exp };
}

async function main() {
  const headers = await getRoosterLiveHeaders();
  const cookie = headers['Cookie'] || headers['cookie'] || '';

  // Simulate an expired/missing CF_Authorization — the exact real-world case
  // Layer 2 exists for — while keeping CF_AppSession intact.
  const withoutCfAuth = cookie.replace(/CF_Authorization=[^;]+;?\s*/, '').trim();

  const { cookieHeader: oktaCookieHeader, origin: oktaOrigin } = await getRoosterOktaSession();
  console.log('Okta cookie configured:', !!oktaCookieHeader, oktaOrigin ? `(origin: ${oktaOrigin})` : '(no origin set)');

  const appOrigin = getRoosterAppOrigin();
  const keepAliveUrl = getRoosterKeepAliveUrl();

  console.log('\n--- Calling silentlyRefreshRoosterSession WITHOUT CF_Authorization ---');
  const result = await silentlyRefreshRoosterSession({
    appOrigin,
    keepAliveUrl,
    appCookieHeader: withoutCfAuth,
    oktaCookieHeader,
    oktaOrigin,
  });

  console.log('\nresult.success:', result.success);
  if (result.success) {
    const after = decodeJwtExp(result.appCookieHeader);
    console.log('🎉 Silently recovered a fresh CF_Authorization via the Okta chain!');
    console.log('New exp:', after ? new Date(after.exp * 1000).toISOString() : 'not found');
  } else {
    console.log('reason:', (result as any).reason);
    if ((result as any).reason === 'okta_login_form_required') {
      console.log('\n→ Hit a real Okta login page. Needs ROOSTER_OKTA_COOKIE (deliveryhero.okta.com\'s');
      console.log('  own session cookie, typically "sid") to go further — see docs/ROOSTER_LIVE.md Step 1b.');
    }
  }
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
