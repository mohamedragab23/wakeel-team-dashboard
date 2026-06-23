/**
 * Read-only Neon ticketing schema + row-count inventory export.
 * No INSERT/UPDATE/DELETE — export metadata and counts only.
 */
import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';
import { closeTicketingDb, getTicketingSql, isTicketingDbConfigured } from '../lib/ticketing/db/client';

config({ path: path.resolve('.env.local') });
config({ path: path.resolve('.env.vercel.prod') });

const TABLES = [
  'tickets',
  'ticket_comments',
  'ticket_attachments',
  'ticket_notifications',
  'ticket_audit_logs',
] as const;

async function main() {
  if (!process.env.TICKETING_DATABASE_URL?.trim() && process.env.POSTGRES_URL?.trim()) {
    process.env.TICKETING_DATABASE_URL = process.env.POSTGRES_URL.trim();
  }

  if (!isTicketingDbConfigured()) {
    console.log(JSON.stringify({ success: false, error: 'TICKETING_DATABASE_URL not configured', readOnly: true }));
    process.exit(1);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.resolve(process.cwd(), 'exports', `neon-backup-${stamp}`);
  fs.mkdirSync(outDir, { recursive: true });

  const sql = getTicketingSql();
  const inventory: Record<string, { exists: boolean; rowCount: number }> = {};

  for (const table of TABLES) {
    const reg = await sql`SELECT to_regclass(${`public.${table}`})::text AS reg`;
    const exists = Boolean(reg[0]?.reg);
    let rowCount = 0;
    if (exists) {
      const res = await sql.unsafe(`SELECT COUNT(*)::int AS c FROM ${table}`);
      rowCount = Number((res[0] as { c?: number })?.c ?? 0);
    }
    inventory[table] = { exists, rowCount };
  }

  const manifest = {
    exportedAt: new Date().toISOString(),
    readOnly: true,
    noDataMigration: true,
    tables: inventory,
    note: 'Row counts only — no row data exported (ticketing PII). Schema in lib/ticketing/db/schema.sql',
  };

  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  console.log(JSON.stringify({ success: true, outDir, manifest }, null, 2));
  await closeTicketingDb();
}

main().catch((e) => {
  console.error('[backup-neon] failed:', e);
  process.exit(1);
});
