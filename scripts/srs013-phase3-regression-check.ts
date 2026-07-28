/**
 * SRS-013 Phase 3 — regression guard (design doc §6 test #1).
 *
 * Proves `calculateSupervisorSalary()` is byte-identical with the flag OFF
 * vs ON (when no active `ledger_native` rows exist) for several real
 * supervisors and several periods. Calls the library function directly
 * (single process) and explicitly clears both cache layers between the two
 * measurements so neither run can observe the other's cached result --
 * see scripts/srs013-phase3-verify.ts's Test 15 comment for why that
 * matters with this app's L1(in-process)+L2(Redis) tiered cache.
 *
 * Run: npx tsx scripts/srs013-phase3-regression-check.ts
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { calculateSupervisorSalary } from '../lib/salaryService';
import { invalidateSalaryCaches } from '../lib/cacheInvalidation';
import { getAllSupervisors } from '../lib/adminService';

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail: string) {
  if (ok) {
    passed++;
    console.log(`✅ PASS — ${name}: ${detail}`);
  } else {
    failed++;
    console.log(`❌ FAIL — ${name}: ${detail}`);
  }
}

function toLocalYMD(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function main() {
  console.log('=== SRS-013 Phase 3 — Regression Guard (flag OFF vs ON, byte-identical) ===\n');

  const supervisors = await getAllSupervisors();
  const sample = supervisors.slice(0, 3);
  if (sample.length === 0) {
    console.log('No supervisors found -- cannot run.');
    process.exit(1);
  }

  const now = new Date();
  const periods = [
    { startDate: toLocalYMD(new Date(now.getFullYear(), now.getMonth(), 1)), endDate: toLocalYMD(now), label: 'current month-to-date' },
    { startDate: toLocalYMD(new Date(now.getFullYear(), now.getMonth() - 1, 1)), endDate: toLocalYMD(new Date(now.getFullYear(), now.getMonth(), 0)), label: 'last full month' },
  ];

  for (const sup of sample) {
    for (const period of periods) {
      await invalidateSalaryCaches();
      process.env.FEATURE_PAYROLL_LEDGER_ENABLED = 'false';
      const off = await calculateSupervisorSalary(sup.code, period.startDate, period.endDate);

      await invalidateSalaryCaches();
      process.env.FEATURE_PAYROLL_LEDGER_ENABLED = 'true';
      const on = await calculateSupervisorSalary(sup.code, period.startDate, period.endDate);

      const { ledgerTransactions, ...onWithoutLedger } = on as any;
      const offJson = JSON.stringify(off);
      const onJson = JSON.stringify(onWithoutLedger);
      const identical = offJson === onJson;

      check(
        `${sup.code} / ${period.label} (${period.startDate}..${period.endDate})`,
        identical,
        identical
          ? `byte-identical, netSalary=${(off as any).netSalary}, ledgerTransactions present when ON=${Array.isArray(ledgerTransactions)}`
          : `MISMATCH!\n  OFF=${offJson}\n  ON =${onJson}`
      );
    }
  }

  delete process.env.FEATURE_PAYROLL_LEDGER_ENABLED;

  console.log(`\n=== Result: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
