import { getMainSpreadsheetId, getSheetsClientFor } from '@/lib/googleSheetsAuth';
import { putDailyBackupObject } from '@/lib/backup/r2Archive';

export type SheetsBackupResult = {
  ok: boolean;
  tabCount: number;
  spreadsheetId: string;
  r2Prefix?: string;
  error?: string;
};

export async function runSheetsBackup(stamp: string, uploadToR2: boolean): Promise<SheetsBackupResult> {
  try {
    const spreadsheetId = getMainSpreadsheetId();
    const sheets = await getSheetsClientFor('main');
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const tabTitles =
      meta.data.sheets
        ?.map((s: { properties?: { title?: string | null } }) => s.properties?.title)
        .filter((t: string | null | undefined): t is string => Boolean(t)) ?? [];

    if (tabTitles.length === 0) {
      return { ok: false, tabCount: 0, spreadsheetId, error: 'No tabs found' };
    }

    const tabs: Array<{ title: string; rowCount: number; columnCount: number; file: string }> = [];

    for (const title of tabTitles) {
      const safeFile = `${title.replace(/[\\/:*?"<>|]/g, '_')}.json`;
      const range = `'${title.replace(/'/g, "''")}'!A:ZZ`;
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
        majorDimension: 'ROWS',
        valueRenderOption: 'FORMATTED_VALUE',
      });
      const values = (response.data.values ?? []) as string[][];
      const payload = {
        sheetTitle: title,
        exportedAt: new Date().toISOString(),
        rowCount: values.length,
        values,
      };
      const json = JSON.stringify(payload);

      if (uploadToR2) {
        await putDailyBackupObject(stamp, `sheets/${safeFile}`, json);
      }

      const colCount = values.reduce((max, row) => Math.max(max, row.length), 0);
      tabs.push({ title, rowCount: values.length, columnCount: colCount, file: safeFile });
    }

    const manifest = {
      spreadsheetId,
      exportedAt: new Date().toISOString(),
      readOnly: true,
      tabCount: tabTitles.length,
      tabs,
    };

    if (uploadToR2) {
      await putDailyBackupObject(stamp, 'sheets/manifest.json', JSON.stringify(manifest, null, 2));
    }

    return {
      ok: true,
      tabCount: tabTitles.length,
      spreadsheetId,
      r2Prefix: uploadToR2 ? `backups/daily/${stamp}/sheets/` : undefined,
    };
  } catch (e: unknown) {
    return {
      ok: false,
      tabCount: 0,
      spreadsheetId: '',
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
