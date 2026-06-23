import { putDailyBackupObject } from '@/lib/backup/r2Archive';
import { runNeonBackup } from '@/lib/backup/neonBackup';
import { runR2InventoryBackup } from '@/lib/backup/r2InventoryBackup';
import { runSheetsBackup } from '@/lib/backup/sheetsBackup';

export type DailyBackupSummary = {
  startedAt: string;
  finishedAt: string;
  stamp: string;
  readOnly: true;
  uploadToR2: boolean;
  sheets: Awaited<ReturnType<typeof runSheetsBackup>>;
  neon: Awaited<ReturnType<typeof runNeonBackup>>;
  r2: Awaited<ReturnType<typeof runR2InventoryBackup>>;
  allOk: boolean;
  archivePrefix?: string;
};

export async function runDailyBackups(options?: { uploadToR2?: boolean }): Promise<DailyBackupSummary> {
  const startedAt = new Date().toISOString();
  const stamp = startedAt.replace(/[:.]/g, '-');
  const uploadToR2 = options?.uploadToR2 ?? Boolean(process.env.BACKUP_UPLOAD_TO_R2 !== 'false');

  const sheets = await runSheetsBackup(stamp, uploadToR2);
  const neon = await runNeonBackup(stamp, uploadToR2);
  const r2 = await runR2InventoryBackup(stamp, uploadToR2);

  const finishedAt = new Date().toISOString();
  const allOk = sheets.ok && neon.ok && r2.ok;

  const summary: DailyBackupSummary = {
    startedAt,
    finishedAt,
    stamp,
    readOnly: true,
    uploadToR2,
    sheets,
    neon,
    r2,
    allOk,
    archivePrefix: uploadToR2 ? `backups/daily/${stamp}/` : undefined,
  };

  if (uploadToR2 && allOk) {
    await putDailyBackupObject(stamp, 'summary.json', JSON.stringify(summary, null, 2));
  }

  return summary;
}
