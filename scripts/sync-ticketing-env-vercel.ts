/**
 * Add TICKETING_DATABASE_URL to Vercel production = POSTGRES_URL (same database).
 * Requires Vercel CLI login. Does not print connection string.
 */
import { readFileSync } from 'fs';
import { spawnSync } from 'child_process';

function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 1) continue;
    let val = line.slice(i + 1);
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[line.slice(0, i).trim()] = val;
  }
  return out;
}

const url = parseEnv(readFileSync('.env.vercel.prod', 'utf8')).POSTGRES_URL?.trim();
if (!url) {
  console.error('POSTGRES_URL missing');
  process.exit(1);
}

// Remove existing if present (idempotent re-add)
spawnSync('npx', ['--yes', 'vercel@latest', 'env', 'rm', 'TICKETING_DATABASE_URL', 'production', '--yes'], {
  stdio: 'inherit',
  shell: true,
});

const add = spawnSync(
  'npx',
  ['--yes', 'vercel@latest', 'env', 'add', 'TICKETING_DATABASE_URL', 'production'],
  { input: url, encoding: 'utf8', shell: true }
);

if (add.status !== 0) {
  console.error('vercel env add failed', add.stderr || add.stdout);
  process.exit(add.status ?? 1);
}

console.log('TICKETING_DATABASE_URL added to Vercel production (value = POSTGRES_URL, not logged)');
