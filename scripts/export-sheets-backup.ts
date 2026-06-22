/**
 * Read-only Google Sheets backup exporter.
 *
 * Usage (from project root):
 *   npm run export:sheets-backup
 *
 * Requires .env.local with valid Google credentials (same as the app).
 * Writes JSON files under exports/sheets-backup-<timestamp>/ — never modifies Sheets.
 */
import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';
import { getMainSpreadsheetId, getSheetsClientFor } from '../lib/googleSheetsAuth';

config({ path: path.resolve(process.cwd(), '.env.local') });
config({ path: path.resolve(process.cwd(), '.env') });

type TabManifest = {
  title: string;
  rowCount: number;
  columnCount: number;
  exportedAt: string;
  file: string;
};

async function main() {
  const spreadsheetId = getMainSpreadsheetId();
  const sheets = await getSheetsClientFor('main');
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const rawTitles =
    meta.data.sheets?.map((s: { properties?: { title?: string | null } }) => s.properties?.title) ?? [];
  const tabTitles = rawTitles.filter((t: string | null | undefined): t is string => Boolean(t));

  if (tabTitles.length === 0) {
    throw new Error('No sheet tabs found in spreadsheet');
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.resolve(process.cwd(), 'exports', `sheets-backup-${stamp}`);
  fs.mkdirSync(outDir, { recursive: true });

  const manifest: {
    spreadsheetId: string;
    exportedAt: string;
    tabCount: number;
    tabs: TabManifest[];
  } = {
    spreadsheetId,
    exportedAt: new Date().toISOString(),
    tabCount: tabTitles.length,
    tabs: [],
  };

  console.log(`[export-sheets-backup] Exporting ${tabTitles.length} tabs → ${outDir}`);

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

    fs.writeFileSync(path.join(outDir, safeFile), JSON.stringify(payload, null, 0), 'utf8');

    const colCount = values.reduce((max: number, row: string[]) => Math.max(max, row.length), 0);
    manifest.tabs.push({
      title,
      rowCount: values.length,
      columnCount: colCount,
      exportedAt: payload.exportedAt,
      file: safeFile,
    });

    console.log(`  ✓ ${title} (${values.length} rows)`);
  }

  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`[export-sheets-backup] Done. Manifest: ${path.join(outDir, 'manifest.json')}`);
}

main().catch((e) => {
  console.error('[export-sheets-backup] Failed:', e);
  process.exit(1);
});
