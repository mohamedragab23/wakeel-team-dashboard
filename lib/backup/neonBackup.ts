import { closeTicketingDb, getTicketingSql, isTicketingDbConfigured } from '@/lib/ticketing/db/client';
import { putDailyBackupObject } from '@/lib/backup/r2Archive';

const TABLES = [
  'tickets',
  'ticket_comments',
  'ticket_attachments',
  'ticket_notifications',
  'ticket_audit_logs',
] as const;

export type NeonBackupResult = {
  ok: boolean;
  tables?: Record<string, { exists: boolean; rowCount: number }>;
  r2Key?: string;
  error?: string;
};

export async function runNeonBackup(stamp: string, uploadToR2: boolean): Promise<NeonBackupResult> {
  if (!process.env.TICKETING_DATABASE_URL?.trim() && process.env.POSTGRES_URL?.trim()) {
    process.env.TICKETING_DATABASE_URL = process.env.POSTGRES_URL.trim();
  }

  if (!isTicketingDbConfigured()) {
    return { ok: false, error: 'TICKETING_DATABASE_URL not configured' };
  }

  try {
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
      note: 'Row counts only — no row data exported (ticketing PII).',
    };

    let r2Key: string | undefined;
    if (uploadToR2) {
      r2Key = await putDailyBackupObject(stamp, 'neon/manifest.json', JSON.stringify(manifest, null, 2));
    }

    await closeTicketingDb();
    return { ok: true, tables: inventory, r2Key };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
