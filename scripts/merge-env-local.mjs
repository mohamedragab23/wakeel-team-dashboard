import fs from 'fs';

function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 1) continue;
    const key = line.slice(0, i).trim();
    out[key] = line.slice(i + 1);
  }
  return out;
}

const keepFromVercel = [
  'GOOGLE_SHEETS_SPREADSHEET_ID',
  'GOOGLE_SERVICE_ACCOUNT_EMAIL',
  'GOOGLE_PRIVATE_KEY',
  'GOOGLE_PROJECT_ID',
  'JWT_SECRET',
  'NEXT_PUBLIC_APP_URL',
  'ROOSTER_CITY',
  'ROOSTER_CITY_ID',
  'ROOSTER_EXPORT_URL_TEMPLATE',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_DEFAULT_CHAT_ID',
  'GOOGLE_SHEETS_SHIFTS_SPREADSHEET_ID',
  'KV_REST_API_URL',
  'KV_REST_API_TOKEN',
  'TICKETING_DATABASE_URL',
  'TICKETING_S3_ACCESS_KEY_ID',
  'TICKETING_S3_SECRET_ACCESS_KEY',
  'TICKETING_S3_BUCKET',
  'TICKETING_S3_ENDPOINT',
  'TICKETING_STORAGE_PROVIDER',
  'CRON_SECRET',
  'NEXT_PUBLIC_SENTRY_DSN',
  'SENTRY_AUTH_TOKEN',
  'SENTRY_ORG',
  'SENTRY_PROJECT',
];

const localPath = '.env.local';
const bakPath = '.env.local.bak';
if (fs.existsSync(localPath)) {
  fs.copyFileSync(localPath, bakPath);
}
const local = fs.existsSync(bakPath) ? parseEnv(fs.readFileSync(bakPath, 'utf8')) : {};
const prodPath = '.env.vercel.prod';
if (!fs.existsSync(prodPath)) {
  console.error('Missing', prodPath, '— run: npm run env:pull');
  process.exit(1);
}
const prod = parseEnv(fs.readFileSync(prodPath, 'utf8'));
const merged = {};
for (const k of keepFromVercel) {
  if (prod[k]) merged[k] = prod[k];
}
Object.assign(merged, local);
if (!merged.NEXT_PUBLIC_APP_URL) merged.NEXT_PUBLIC_APP_URL = 'http://127.0.0.1:3000';

const order = [
  'GOOGLE_SHEETS_SPREADSHEET_ID',
  'GOOGLE_SERVICE_ACCOUNT_EMAIL',
  'GOOGLE_PRIVATE_KEY',
  'GOOGLE_PROJECT_ID',
  'GOOGLE_SHEETS_SHIFTS_SPREADSHEET_ID',
  'JWT_SECRET',
  'NEXT_PUBLIC_APP_URL',
  'TABLEAU_SERVER_URL',
  'TABLEAU_SITE_CONTENT_URL',
  'TABLEAU_PAT_NAME',
  'TABLEAU_PAT_SECRET',
  'TABLEAU_VIEW_CONTENT_URL',
  'CRON_SECRET',
  'PERFORMANCE_SYNC_AUTO_APPLY_GOOD',
  'PERFORMANCE_SYNC_ZERO_RATIO_THRESHOLD',
  'ROOSTER_CITY',
  'ROOSTER_CITY_ID',
  'ROOSTER_EXPORT_URL_TEMPLATE',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_DEFAULT_CHAT_ID',
];

const lines = ['# Local dev — merged from Vercel production + Tableau (do not commit)'];
const written = new Set();
for (const k of order) {
  if (merged[k] !== undefined) {
    lines.push(`${k}=${merged[k]}`);
    written.add(k);
  }
}
for (const k of Object.keys(merged).sort()) {
  if (!written.has(k) && !k.startsWith('VERCEL')) lines.push(`${k}=${merged[k]}`);
}
fs.writeFileSync('.env.local', `${lines.join('\n')}\n`);
console.log(
  'OK',
  'google=',
  !!(merged.GOOGLE_SERVICE_ACCOUNT_EMAIL && merged.GOOGLE_PRIVATE_KEY),
  'sheet=',
  !!merged.GOOGLE_SHEETS_SPREADSHEET_ID,
  'jwt=',
  !!merged.JWT_SECRET
);
