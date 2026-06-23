/**
 * Set TICKETING_DATABASE_URL in .env.local from POSTGRES_URL in .env.vercel.prod
 * (same Neon database — no second DB). Does not print secrets.
 */
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'fs';

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

const prod = parseEnv(readFileSync('.env.vercel.prod', 'utf8'));
const url = prod.POSTGRES_URL?.trim();
if (!url) {
  console.error('POSTGRES_URL missing in .env.vercel.prod');
  process.exit(1);
}

const localPath = '.env.local';
const line = `TICKETING_DATABASE_URL=${url}`;
if (!existsSync(localPath)) {
  writeFileSync(localPath, `# Local dev\n${line}\n`);
  console.log('created .env.local with TICKETING_DATABASE_URL');
} else {
  const local = readFileSync(localPath, 'utf8');
  if (/^\s*TICKETING_DATABASE_URL=/m.test(local)) {
    writeFileSync(localPath, local.replace(/^\s*TICKETING_DATABASE_URL=.*$/m, line));
    console.log('updated TICKETING_DATABASE_URL in .env.local');
  } else {
    appendFileSync(localPath, `\n# Ticketing (Neon — same DB as POSTGRES_URL)\n${line}\n`);
    console.log('appended TICKETING_DATABASE_URL to .env.local');
  }
}
