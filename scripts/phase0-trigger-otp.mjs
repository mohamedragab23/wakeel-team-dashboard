/**
 * SRS-012 Phase 0 (continued) — triggers a REAL Okta email-OTP send, once,
 * for manual end-to-end validation. Also captures the fresh, short-lived
 * (~5 min) Cloudflare Access `state` needed to complete the redirect back
 * into the app once we have a sessionToken. Saves everything to a
 * gitignored temp file so scripts/phase0-verify-otp.mjs can finish the
 * flow once you paste the OTP code.
 *
 * Usage: node scripts/phase0-trigger-otp.mjs
 */
import dotenv from 'dotenv';
import fs from 'fs';
import { CookieJar } from 'tough-cookie';
dotenv.config({ path: '.env.local' });

const APP_ORIGIN = 'https://eg.me.logisticsbackoffice.com';
const APP_URL = `${APP_ORIGIN}/dashboard/rooster/live-3pl`;
const OKTA_ORIGIN = 'https://deliveryhero.okta.com';
const STATE_FILE = '.tmp-okta-state.json';

function decodeHtmlEntities(s) {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&amp;/g, '&');
}

async function main() {
  const username = process.env.ROOSTER_OKTA_USERNAME;
  const password = process.env.ROOSTER_OKTA_PASSWORD;
  if (!username || !password) {
    console.error('Missing ROOSTER_OKTA_USERNAME / ROOSTER_OKTA_PASSWORD in .env.local.');
    process.exit(1);
  }

  console.log('Step 1: getting a FRESH Cloudflare Access `state` (no CF_Authorization cookie)...');
  // Use a real cookie jar for this whole step — Cloudflare may set a
  // short-lived correlation cookie during this visit that the final
  // callback hop later needs to see again to accept the `state`.
  const jar = new CookieJar();
  const r1 = await fetch(APP_URL, { redirect: 'manual', headers: { Cookie: jar.getCookieStringSync(APP_URL) } });
  for (const sc of (typeof r1.headers.getSetCookie === 'function' ? r1.headers.getSetCookie() : [r1.headers.get('set-cookie')].filter(Boolean))) {
    try { jar.setCookieSync(sc, APP_URL); } catch {}
  }
  const chooserUrl = r1.headers.get('location');
  if (!chooserUrl) throw new Error('Expected a redirect to the Cloudflare Access chooser.');
  const r2 = await fetch(chooserUrl, { redirect: 'manual', headers: { Cookie: jar.getCookieStringSync(chooserUrl) } });
  for (const sc of (typeof r2.headers.getSetCookie === 'function' ? r2.headers.getSetCookie() : [r2.headers.get('set-cookie')].filter(Boolean))) {
    try { jar.setCookieSync(sc, chooserUrl); } catch {}
  }
  console.log('Cookies captured during Step 1:', (await jar.getCookies(chooserUrl)).map((c) => c.key).join(', ') || '(none)');
  const html = await r2.text();
  const m = html.match(/data-auto-redirect-url="([^"]+)"/);
  if (!m) throw new Error('Could not find data-auto-redirect-url on the chooser page.');
  const oktaAuthorizeUrl = decodeHtmlEntities(m[1]);
  console.log('Captured fresh Okta authorize URL (client_id/state/etc):');
  console.log(oktaAuthorizeUrl.split('&state=')[0] + '&state=<...>');

  console.log('\nStep 2: POST /api/v1/authn (username + password)...');
  const authnRes = await fetch(`${OKTA_ORIGIN}/api/v1/authn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ username, password, options: { multiOptionalFactorEnroll: false, warnBeforePasswordExpired: false } }),
  });
  const authnBody = await authnRes.json();
  if (authnBody.status !== 'MFA_REQUIRED') {
    console.error('Unexpected status:', authnBody.status, JSON.stringify(authnBody).slice(0, 300));
    process.exit(1);
  }
  const stateToken = authnBody.stateToken;
  const emailFactor = authnBody._embedded.factors.find((f) => f.factorType === 'email');
  if (!emailFactor) throw new Error('No email factor found.');
  console.log('stateToken obtained (expires:', authnBody.expiresAt, ')');

  console.log('\nStep 3: POST .../factors/' + emailFactor.id + '/verify (NO passCode — triggers the send)...');
  const triggerRes = await fetch(emailFactor._links.verify.href, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ stateToken }),
  });
  const triggerBody = await triggerRes.json();
  console.log('response status field:', triggerBody.status);

  if (triggerBody.status !== 'MFA_CHALLENGE') {
    console.error('\n⚠️  Did not reach MFA_CHALLENGE — stopping, do not expect an email.');
    console.error(JSON.stringify(triggerBody).slice(0, 500));
    process.exit(1);
  }

  fs.writeFileSync(
    STATE_FILE,
    JSON.stringify(
      {
        oktaStateToken: triggerBody.stateToken || stateToken,
        verifyUrl: emailFactor._links.verify.href,
        oktaTransactionExpiresAt: triggerBody.expiresAt,
        cfAuthorizeUrl: oktaAuthorizeUrl,
        cookieJar: jar.serializeSync(),
        capturedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );
  console.log('\n✅ OTP email should be arriving now. Check Gmail, then IMMEDIATELY run:');
  console.log('   node scripts/phase0-verify-otp.mjs <the-6-digit-code>');
  console.log(`(both the Okta transaction and the Cloudflare state are short-lived — ~5 min — move quickly)`);
}

main().catch((e) => {
  console.error('FATAL', e.message);
  process.exit(1);
});
