import { listPrivateAttachments } from '@/lib/privateObjectStore';
import { listTicketingObjects, putDailyBackupObject } from '@/lib/backup/r2Archive';

export type R2InventoryBackupResult = {
  ok: boolean;
  provider?: 'postgres' | 's3';
  legacyR2Included?: boolean;
  objectCount?: number;
  totalBytes?: number;
  r2Key?: string;
  error?: string;
};

/** Read-only inventory of ticketing prefix — uploads audit copy under backups/daily/. */
export async function runR2InventoryBackup(
  stamp: string,
  uploadToR2: boolean
): Promise<R2InventoryBackupResult> {
  try {
    const inPostgres = process.env.BACKUP_STORAGE_PROVIDER === 'postgres';
    const objects = inPostgres ? await listPrivateAttachments() : await listTicketingObjects();
    const prefix = (process.env.TICKETING_S3_PREFIX?.trim() || 'ticketing').replace(/\/$/, '');
    const bucket = process.env.TICKETING_S3_BUCKET?.trim() || '';

    const manifest = {
      provider: inPostgres ? 'postgres' : 's3',
      legacyR2Included: !inPostgres,
      exportedAt: new Date().toISOString(),
      readOnly: true,
      bucket,
      prefix,
      objectCount: objects.length,
      totalBytes: objects.reduce((s, o) => s + o.size, 0),
      objects,
    };

    let r2Key: string | undefined;
    if (uploadToR2) {
      r2Key = await putDailyBackupObject(
        stamp,
        'r2/inventory.json',
        JSON.stringify(manifest, null, 2)
      );
    }

    return {
      ok: true,
      provider: inPostgres ? 'postgres' : 's3',
      legacyR2Included: !inPostgres,
      objectCount: objects.length,
      totalBytes: manifest.totalBytes,
      r2Key,
    };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
