/**
 * READ-ONLY August 2026 equipment deduction reconciliation report.
 * Does not mutate production sheets.
 */
import fs from 'node:fs';
import path from 'node:path';
import { getSheetData } from '@/lib/googleSheets';
import { loadAugustReconciliationFromSheets } from '@/lib/equipmentDeductions/augustReconciliation';
import { listIssues } from '@/lib/equipmentLiability/store';
import { listPayoutCycles } from '@/lib/payoutCycles/store';

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    const k = m[1].trim();
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v.replace(/\\n/g, '\n');
  }
}

async function main() {
  loadEnvLocal();
  const report = await loadAugustReconciliationFromSheets({
    listPayoutCycles: () => listPayoutCycles({ year: 2026, month: 8 }),
    getSheetData: (name) => getSheetData(name, false),
    listIssues: () => listIssues({}),
  });

  const outPath = path.join(process.cwd(), 'tmp-equipment-august-2026-reconciliation.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify({ outPath, summary: report.summary, dataAccessNotes: report.dataAccessNotes }, null, 2));
}

main().catch((e) => {
  console.error(JSON.stringify({ FATAL: true, message: e instanceof Error ? e.message : String(e) }));
  process.exit(1);
});
