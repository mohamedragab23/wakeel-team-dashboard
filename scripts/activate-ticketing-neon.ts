/**
 * Apply ticketing schema + verify tables (read-only counts). No seed data.
 */
import { readFileSync, existsSync } from 'fs';
import { config } from 'dotenv';
import path from 'path';
import { closeTicketingDb, getTicketingSql, runTicketingMigrations } from '../lib/ticketing/db/client';

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
  if (!process.env.TICKETING_DATABASE_URL?.trim()) {
    const fromVercel = process.env.POSTGRES_URL?.trim();
    if (!fromVercel) {
      console.error('Set TICKETING_DATABASE_URL or POSTGRES_URL');
      process.exit(1);
    }
    process.env.TICKETING_DATABASE_URL = fromVercel;
  }

  console.log('[activate-ticketing] Applying schema (idempotent CREATE IF NOT EXISTS)…');
  await runTicketingMigrations();
  console.log('[activate-ticketing] Schema applied.');

  const sql = getTicketingSql();
  const tableStatus: Record<string, { exists: boolean; rowCount: number }> = {};

  for (const table of TABLES) {
    const reg = await sql`
      SELECT to_regclass(${`public.${table}`})::text AS reg
    `;
    const exists = Boolean(reg[0]?.reg);
    let rowCount = 0;
    if (exists) {
      const countRes = await sql.unsafe(`SELECT COUNT(*)::int AS c FROM ${table}`);
      const row = countRes[0] as unknown as { c?: number };
      rowCount = Number(row?.c ?? 0);
    }
    tableStatus[table] = { exists, rowCount };
  }

  console.log(
    JSON.stringify(
      {
        migratedAt: new Date().toISOString(),
        database: 'same as POSTGRES_URL (no second database)',
        tables: tableStatus,
        productionDataInserted: false,
      },
      null,
      2
    )
  );

  await closeTicketingDb();
}

main().catch((e) => {
  console.error('[activate-ticketing] failed:', e);
  process.exit(1);
});
