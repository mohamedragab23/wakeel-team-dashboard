/**
 * Pushes the app-domain cookie from `Cookie.xlsx` (repo root, gitignored)
 * into the production Google Sheet `cron_config` tab, under
 * `ROOSTER_EXPORT_HEADERS_JSON` — the same key `lib/roosterSessionStore.ts`
 * reads from and writes back to automatically during self-healing.
 *
 * Run `rooster-cookie-check.mjs` first to confirm the cookie actually works
 * before deploying it here.
 *
 * Requires local `.env.local` with GOOGLE_SERVICE_ACCOUNT_EMAIL,
 * GOOGLE_PRIVATE_KEY, GOOGLE_SHEETS_SPREADSHEET_ID (same as the app uses).
 *
 * Usage: node scripts/rooster-cookie-push-to-sheet.mjs
 */
import dotenv from 'dotenv';
import path from 'path';
import { google } from 'googleapis';
import XLSX from 'xlsx';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const APP_DOMAIN = 'eg.me.logisticsbackoffice.com';
const SHEET_NAME = process.env.ROOSTER_SESSION_SHEET_NAME || 'cron_config';
const SHEET_KEY = 'ROOSTER_EXPORT_HEADERS_JSON';
const COOKIE_FILE = path.join(process.cwd(), 'Cookie.xlsx');
const COOKIE_ORDER = ['CF_AppSession', 'CF_Authorization', 'refresh_token', 'dhh_token'];

function readAppCookieFromXlsx(file) {
  const wb = XLSX.readFile(file);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false });
  const found = {};
  for (const r of rows.slice(1)) {
    const name = String(r[0] || '').trim();
    const domain = String(r[2] || '').trim();
    if (domain !== APP_DOMAIN) continue;
    if (COOKIE_ORDER.includes(name) && !found[name]) found[name] = String(r[1] || '').trim();
  }
  return found;
}

async function main() {
  const map = readAppCookieFromXlsx(COOKIE_FILE);
  if (!map.CF_Authorization || !map.CF_AppSession) {
    console.error('Missing CF_Authorization or CF_AppSession in Cookie.xlsx — aborting.');
    process.exit(1);
  }
  const cookieHeader = COOKIE_ORDER.filter((n) => map[n]).map((n) => `${n}=${map[n]}`).join('; ');
  const valueJson = JSON.stringify({ Cookie: cookieHeader });
  console.log('Cookies to push:', COOKIE_ORDER.filter((n) => map[n]));

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (!email || !key) {
    console.error('Missing GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY in .env.local.');
    process.exit(1);
  }
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  if (!spreadsheetId) {
    console.error('Missing GOOGLE_SHEETS_SPREADSHEET_ID in .env.local.');
    process.exit(1);
  }

  const auth = new google.auth.GoogleAuth({ credentials: { client_email: email, private_key: key }, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
  const client = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: client });

  const existing = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${SHEET_NAME}!A:B` });
  const rows = existing.data.values || [];
  const rowIdx = rows.findIndex((r) => String(r[0] || '').trim() === SHEET_KEY);

  if (rowIdx >= 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${SHEET_NAME}!B${rowIdx + 1}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[valueJson]] },
    });
    console.log(`Updated ${SHEET_NAME}!B${rowIdx + 1}.`);
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${SHEET_NAME}!A1`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [[SHEET_KEY, valueJson]] },
    });
    console.log(`Appended a new ${SHEET_KEY} row to ${SHEET_NAME}.`);
  }

  console.log('\n✅ Done. Next sync (reactive or the /api/cron/rooster-keepalive proactive job) will pick this up.');
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
