import { spawnSync } from 'child_process';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const VARS = [
  'TABLEAU_SERVER_URL',
  'TABLEAU_SITE_CONTENT_URL',
  'TABLEAU_PAT_NAME',
  'TABLEAU_PAT_SECRET',
  'TABLEAU_VIEW_CONTENT_URL',
  'PERFORMANCE_SYNC_AUTO_APPLY_GOOD',
  'CLOUDFLARE_ACCESS_CLIENT_ID',
  'CLOUDFLARE_ACCESS_CLIENT_SECRET',
];

const ENVS = ['production'];

function runVercel(args) {
  const r = spawnSync('npx', ['--yes', 'vercel@latest', ...args], {
    encoding: 'utf8',
    shell: true,
    cwd: process.cwd(),
  });
  return { code: r.status ?? 1, out: (r.stdout || '') + (r.stderr || '') };
}

const REQUIRED = new Set([
  'TABLEAU_SERVER_URL',
  'TABLEAU_SITE_CONTENT_URL',
  'TABLEAU_PAT_NAME',
  'TABLEAU_PAT_SECRET',
  'TABLEAU_VIEW_CONTENT_URL',
  'PERFORMANCE_SYNC_AUTO_APPLY_GOOD',
]);

for (const name of VARS) {
  const value = process.env[name]?.trim();
  if (!value) {
    if (REQUIRED.has(name)) {
      console.error(`Missing required ${name} in .env.local`);
      process.exit(1);
    }
    console.log(`Skip ${name}: not in .env.local`);
    continue;
  }
  for (const env of ENVS) {
    runVercel(['env', 'rm', name, env, '--yes']);
    const add = runVercel(['env', 'add', name, env, '--value', value, '--yes', '--force']);
    if (add.code !== 0) {
      console.error(`Failed ${name}@${env}:`, add.out.slice(0, 500));
      process.exit(1);
    }
    console.log(`OK ${name} → ${env}`);
  }
}

console.log('\nDone. Redeploy production for changes to apply.');
