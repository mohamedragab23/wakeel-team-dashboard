/** Neon read-replica feature flags — default OFF. Google Sheets remains SoT. */

export const MIRROR_SHEET_NAMES = [
  'المناديب',
  'المشرفين',
  'البيانات اليومية',
  'إعدادات_الرواتب',
] as const;

export type MirrorSheetName = (typeof MIRROR_SHEET_NAMES)[number];

export function isMirrorSheetName(name: string): name is MirrorSheetName {
  return (MIRROR_SHEET_NAMES as readonly string[]).includes(name);
}

/** When true, getSheetData may read from Neon mirror (if synced). Default: false. */
export function isMirrorReadEnabled(): boolean {
  return process.env.NEON_READ_REPLICA_ENABLED === 'true';
}

/** When true, sync worker/cron may push Sheets → Neon. Default: false. */
export function isMirrorSyncEnabled(): boolean {
  return process.env.MIRROR_SYNC_ENABLED === 'true';
}

export function isMirrorDbConfigured(): boolean {
  return Boolean(
    process.env.MIRROR_DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim()
  );
}

export function getMirrorDatabaseUrl(): string | undefined {
  return process.env.MIRROR_DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim() || undefined;
}
