/**
 * One-off diagnostic: sanity-check a freshly exported browser cookie before
 * pushing it to the production Google Sheet.
 *
 * Usage:
 * 1. Export cookies for eg.me.logisticsbackoffice.com from your browser
 *    (e.g. the "Cookie-Editor" / "EditThisCookie" extension's "Export" as
 *    .xlsx) into `Cookie.xlsx` at the repo root (already gitignored — never
 *    commit real session cookies).
 * 2. Run: node scripts/rooster-cookie-check.mjs
 *
 * This talks directly to Talabat's Rooster Live 3PL API using ONLY the
 * cookie file — it does not read or write the Google Sheet. Use
 * `rooster-cookie-push-to-sheet.mjs` afterwards to actually deploy a cookie
 * that passes this check.
 */
import path from 'path';
import XLSX from 'xlsx';

const COOKIE_FILE = path.join(process.cwd(), 'Cookie.xlsx');
const APP_DOMAIN = 'eg.me.logisticsbackoffice.com';

function readAppCookieFromXlsx(file) {
  const wb = XLSX.readFile(file);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false });
  const wanted = ['CF_Authorization', 'CF_AppSession', 'dhh_token', 'refresh_token'];
  const found = {};
  for (const r of rows.slice(1)) {
    const name = String(r[0] || '').trim();
    const domain = String(r[2] || '').trim();
    if (domain !== APP_DOMAIN) continue;
    if (wanted.includes(name) && !found[name]) found[name] = String(r[1] || '').trim();
  }
  return found;
}

function decodeJwtPayload(token) {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
}

function buildCookieHeader(map, names) {
  return names.filter((n) => map[n]).map((n) => `${n}=${map[n]}`).join('; ');
}

async function mintDhhToken(cookieHeader) {
  const res = await fetch(`https://${APP_DOMAIN}/api/iam-login/auth/okta_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Cookie: cookieHeader },
    body: JSON.stringify({}),
    cache: 'no-store',
  });
  const setCookies =
    typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [res.headers.get('set-cookie')].filter(Boolean);
  return { status: res.status, ok: res.ok, setCookies };
}

async function fetchRidersPage(cookieHeader, cityId) {
  const url = `https://${APP_DOMAIN}/api/rider-live-operations/v1/external/city/${cityId}/riders?page=0&size=5`;
  const res = await fetch(url, { method: 'GET', headers: { Accept: 'application/json', Cookie: cookieHeader }, cache: 'no-store' });
  const contentType = res.headers.get('content-type') || '';
  const text = await res.text().catch(() => '');
  return { status: res.status, ok: res.ok, contentType, bodyPreview: text.slice(0, 200) };
}

async function main() {
  const map = readAppCookieFromXlsx(COOKIE_FILE);
  console.log(`Found cookies for ${APP_DOMAIN}:`, Object.keys(map));
  if (!map.CF_Authorization || !map.CF_AppSession) {
    console.error('Missing CF_Authorization or CF_AppSession — export is incomplete.');
    process.exit(1);
  }

  const cfPayload = decodeJwtPayload(map.CF_Authorization);
  if (cfPayload?.iat && cfPayload?.exp) {
    const hours = ((cfPayload.exp - cfPayload.iat) / 3600).toFixed(2);
    console.log(`CF_Authorization: iat=${new Date(cfPayload.iat * 1000).toISOString()} exp=${new Date(cfPayload.exp * 1000).toISOString()} lifetime=${hours}h`);
    console.log(`CF_Authorization identity: ${cfPayload.email || cfPayload.sub || 'unknown'} issuer=${cfPayload.iss || 'unknown'}`);
    if (Date.now() > cfPayload.exp * 1000) {
      console.error('CF_Authorization is ALREADY EXPIRED per its own exp claim — export a fresh one.');
      process.exit(1);
    }
  }

  const stableCookie = buildCookieHeader(map, ['CF_Authorization', 'CF_AppSession']);
  console.log('\n--- mint dhh_token from CF_Authorization + CF_AppSession only ---');
  const mint = await mintDhhToken(stableCookie);
  console.log('status:', mint.status, 'ok:', mint.ok, 'set-cookie count:', mint.setCookies.length);
  if (!mint.ok) {
    console.error('Mint failed — cookie is not valid / session already dead.');
    process.exit(1);
  }

  const joined = mint.setCookies.join('\n');
  const dhhMatch = joined.match(/dhh_token=([^;,\s]+)/);
  const finalCookie = dhhMatch ? `${stableCookie}; dhh_token=${dhhMatch[1]}` : stableCookie;

  console.log('\n--- fetch a page of riders ---');
  const cityId = process.env.ROOSTER_LIVE_CITY_ID || process.env.ROOSTER_CITY_ID || '200';
  const riders = await fetchRidersPage(finalCookie, cityId);
  console.log('status:', riders.status, 'ok:', riders.ok, 'content-type:', riders.contentType);
  console.log('body preview:', riders.bodyPreview);

  if (riders.ok && riders.contentType.includes('json')) {
    console.log('\n✅ Cookie is valid end-to-end. Safe to push with rooster-cookie-push-to-sheet.mjs.');
  } else {
    console.error('\n❌ Riders fetch did not return JSON — investigate before pushing to the Sheet.');
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
