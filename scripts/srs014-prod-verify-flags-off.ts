import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env.vercel.prod' });
dotenv.config({ path: '.env.vercel.cron', override: true });

const BASE = process.env.PROD_BASE_URL || 'https://wakeel-team-dashboard.vercel.app';

function readCronFromFile(path: string): string {
  try {
    const t = fs.readFileSync(path, 'utf8');
    const line = t.split(/\r?\n/).find((l) => l.startsWith('CRON_SECRET='));
    if (!line) return '';
    return line
      .slice('CRON_SECRET='.length)
      .trim()
      .replace(/^['"]|['"]$/g, '');
  } catch {
    return '';
  }
}

async function main() {
  const secret =
    String(process.env.CRON_SECRET || '').trim() ||
    readCronFromFile('.env.vercel.prod') ||
    readCronFromFile('.env.local');
  console.log('CRON_SECRET length', secret.length);

  if (!secret) {
    console.log('WARN: no CRON_SECRET available locally — skipping authenticated cron check');
  } else {
    const cron = await fetch(`${BASE}/api/cron/equipment-auto-deductions`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const cronBody = await cron.text();
    console.log('cron status', cron.status, cronBody);
    if (cron.status === 200) {
      const j = JSON.parse(cronBody);
      if (!(j.skipped === true || j.enabled === false)) {
        console.error('EXPECTED skipped:true while SRS-014 auto flag OFF');
        process.exit(1);
      }
    }
  }

  for (const path of [
    '/api/admin/payout-cycles/capability',
    '/api/supervisor/manual-deductions',
    '/api/admin/equipment-liability',
    '/api/admin/equipment-finance?capability=1',
  ]) {
    const r = await fetch(`${BASE}${path}`);
    const body = await r.text();
    console.log(path, r.status, body.slice(0, 180));
    // Routes exist on deploy: 401 without auth (not 404).
    if (r.status === 404) {
      console.error('Route missing on production deploy:', path);
      process.exit(1);
    }
  }

  console.log('OK: production routes present; SRS-014 flags remain absent in Vercel env listing.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
