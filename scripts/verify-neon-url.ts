/**
 * Read-only: validate Neon POSTGRES_URL vs ticketing client expectations.
 * Prints metadata only — never logs credentials.
 */
import { readFileSync, existsSync } from 'fs';

function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 1) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1);
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function describeUrl(u: string) {
  try {
    const x = new URL(u);
    return {
      protocol: x.protocol,
      host: x.hostname,
      port: x.port || '5432',
      database: x.pathname.replace(/^\//, ''),
      hasSslMode: u.includes('sslmode='),
      compatible: u.startsWith('postgresql://') || u.startsWith('postgres://'),
    };
  } catch (e) {
    return { compatible: false, error: e instanceof Error ? e.message : String(e) };
  }
}

const path = '.env.vercel.prod';
if (!existsSync(path)) {
  console.error('Missing .env.vercel.prod — run: npx vercel env pull .env.vercel.prod --environment=production');
  process.exit(1);
}

const vars = parseEnv(readFileSync(path, 'utf8'));
const postgresUrl = vars.POSTGRES_URL ?? '';
const desc = describeUrl(postgresUrl);

console.log(
  JSON.stringify(
    {
      hasPostgresUrl: Boolean(postgresUrl),
      hasTicketingDatabaseUrl: Boolean(vars.TICKETING_DATABASE_URL),
      neonProjectId: vars.NEON_PROJECT_ID ? 'set' : 'missing',
      postgresUrlMeta: desc,
      recommendedForTicketing: 'POSTGRES_URL (pooled Neon connection)',
      clientExpects: 'postgresql:// or postgres:// URL for postgres npm package',
    },
    null,
    2
  )
);

if (!desc.compatible) process.exit(2);
