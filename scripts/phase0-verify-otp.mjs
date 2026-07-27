/**
 * SRS-012 Phase 0 (continued) — completes the login using the OTP code you
 * read from Gmail manually (one-time validation only), then follows the
 * real redirect chain back into the app and pushes the fresh cookie to the
 * production Google Sheet, exactly like the automated engine will.
 *
 * Usage: node scripts/phase0-verify-otp.mjs <6-digit-code>
 */
import dotenv from 'dotenv';
import fs from 'fs';
import { CookieJar } from 'tough-cookie';
import { google } from 'googleapis';

dotenv.config({ path: '.env.local' });

const APP_ORIGIN = 'https://eg.me.logisticsbackoffice.com';
const STATE_FILE = '.tmp-okta-state.json';

function decodeJwtExp(cookieHeader) {
  const m = cookieHeader.match(/CF_Authorization=([^;]+)/);
  if (!m) return null;
  const parts = m[1].split('.');
  if (parts.length < 2) return null;
  let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
}

async function pushToSheet(cookieHeader) {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const auth = new google.auth.GoogleAuth({ credentials: { client_email: email, private_key: key }, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
  const client = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: client });
  const valueJson = JSON.stringify({ Cookie: cookieHeader });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: 'cron_config!B2',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[valueJson]] },
  });
}

async function main() {
  const passCode = process.argv[2];
  if (!passCode || !/^\d{6}$/.test(passCode)) {
    console.error('Usage: node scripts/phase0-verify-otp.mjs <6-digit-code>');
    process.exit(1);
  }
  if (!fs.existsSync(STATE_FILE)) {
    console.error(`Missing ${STATE_FILE} — run scripts/phase0-trigger-otp.mjs first.`);
    process.exit(1);
  }
  const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));

  console.log('Step 1: submitting OTP to Okta verify endpoint...');
  const verifyRes = await fetch(state.verifyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ stateToken: state.oktaStateToken, passCode }),
  });
  const verifyBody = await verifyRes.json();
  console.log('response status field:', verifyBody.status);

  if (verifyBody.status !== 'SUCCESS' || !verifyBody.sessionToken) {
    console.error('\n❌ OTP verification failed:', JSON.stringify(verifyBody).slice(0, 500));
    process.exit(1);
  }
  console.log('✅ Okta login SUCCESS. sessionToken obtained (length', verifyBody.sessionToken.length, ')');

  console.log('\nStep 2: exchanging sessionToken via the captured Cloudflare Access authorize URL...');
  const finalAuthorizeUrl = `${state.cfAuthorizeUrl}&sessionToken=${encodeURIComponent(verifyBody.sessionToken)}`;

  // Rehydrate the SAME cookie jar used to capture the fresh `state` — the
  // correlation cookie set during that visit is likely required for
  // Cloudflare to accept this callback.
  const jar = state.cookieJar ? await CookieJar.deserialize(state.cookieJar) : new CookieJar();
  console.log('Rehydrated cookies:', (await jar.getCookies(APP_ORIGIN)).map((c) => c.key).join(', ') || '(none)');
  let url = finalAuthorizeUrl;
  let success = false;
  let finalCookieHeader = '';

  for (let hop = 0; hop < 10; hop++) {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      headers: { Cookie: jar.getCookieStringSync(url), Accept: 'text/html,application/json;q=0.9,*/*;q=0.8' },
    });
    const getSetCookie = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [res.headers.get('set-cookie')].filter(Boolean);
    console.log(`  hop ${hop}: ${res.status} ${url.split('?')[0]} (set-cookie: ${getSetCookie.map((c) => c.split('=')[0]).join(', ') || 'none'})`);
    for (const sc of getSetCookie) {
      try { jar.setCookieSync(sc, url); } catch {}
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) { console.error('  redirect with no location, stopping'); break; }
      url = new URL(loc, url).toString();
      continue;
    }
    // Landed on a non-redirect response — check what we got.
    finalCookieHeader = jar.getCookieStringSync(APP_ORIGIN);
    if (finalCookieHeader.includes('CF_Authorization=')) {
      success = true;
    } else {
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('html')) {
        const text = await res.text();
        console.log('  final page had no CF_Authorization. Preview:', text.replace(/\s+/g, ' ').slice(0, 300));
      }
    }
    break;
  }

  if (!success) {
    console.error('\n❌ Did not end up with a fresh CF_Authorization cookie. See hops above.');
    process.exit(1);
  }

  const payload = decodeJwtExp(finalCookieHeader);
  console.log('\n🎉 SUCCESS — fresh CF_Authorization obtained via full Okta login (no manual cookie paste)!');
  console.log('  identity:', payload?.email);
  console.log('  new exp:', payload ? new Date(payload.exp * 1000).toISOString() : 'unknown');

  console.log('\nStep 3: verifying it actually works against the real riders API...');
  const cityId = process.env.ROOSTER_LIVE_CITY_ID || process.env.ROOSTER_CITY_ID || '200';
  const ridersRes = await fetch(`${APP_ORIGIN}/api/rider-live-operations/v1/external/city/${cityId}/riders?page=0&size=3`, {
    headers: { Accept: 'application/json', Cookie: finalCookieHeader },
  });
  console.log('  riders API status:', ridersRes.status);

  console.log('\nStep 4: pushing the fresh cookie to the production Google Sheet (cron_config)...');
  await pushToSheet(finalCookieHeader);
  console.log('✅ Sheet updated.');

  fs.unlinkSync(STATE_FILE);
  console.log('\n(temp state file cleaned up)');
}

main().catch((e) => {
  console.error('FATAL', e.message);
  process.exit(1);
});
