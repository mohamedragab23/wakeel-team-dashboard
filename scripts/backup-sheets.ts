/**
 * Daily Google Sheets read-only backup.
 * Delegates to export-sheets-backup logic — never writes to Sheets.
 */
import { spawn } from 'child_process';
import path from 'path';

async function runExport(): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['run', 'export:sheets-backup'], {
      cwd: process.cwd(),
      shell: true,
      stdio: 'inherit',
    });
    child.on('close', (code) => (code === 0 ? resolve(0) : reject(new Error(`exit ${code}`))));
    child.on('error', reject);
  });
}

async function main() {
  const startedAt = new Date().toISOString();
  console.log(`[backup-sheets] Starting read-only export at ${startedAt}`);
  await runExport();
  console.log(`[backup-sheets] Done at ${new Date().toISOString()}`);
  console.log(JSON.stringify({ success: true, type: 'sheets', readOnly: true, outDir: path.join('exports') }));
}

main().catch((e) => {
  console.error('[backup-sheets] failed:', e);
  process.exit(1);
});
