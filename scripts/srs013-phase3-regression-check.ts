/**
 * SRS-013 Phase 3 — regression guard (design doc §6 test #1).
 *
 * Proves `calculateSupervisorSalary()` is financially identical with the
 * payroll-ledger flag OFF vs ON for supervisors/periods with no active
 * `ledger_native` rows.
 *
 * WA-003 triage (2026-08-09): prior false FAIL was correlated with Google
 * Sheets "Quota exceeded … Read requests per minute" during one of the two
 * runs, producing incomplete sheet reads (not a ledger math change). This
 * script now rate-limits, retries on mismatch with backoff, and refuses to
 * count a FAIL when Sheets quota errors were observed during the pair.
 *
 * Run: npx tsx scripts/srs013-phase3-regression-check.ts
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { calculateSupervisorSalary } from '../lib/salaryService';
import { invalidateSalaryCaches } from '../lib/cacheInvalidation';
import { getAllSupervisors } from '../lib/adminService';
import { getLedgerTransactions } from '../lib/payrollLedger';

let passed = 0;
let failed = 0;
let skipped = 0;

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

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function stripLedger(result: unknown): unknown {
  if (!result || typeof result !== 'object') return result;
  const { ledgerTransactions: _lt, ...rest } = result as Record<string, unknown>;
  return rest;
}

function financialFingerprint(result: any): string {
  return JSON.stringify({
    supervisorId: result?.supervisorId,
    netSalary: result?.netSalary,
    baseAmount: result?.baseAmount,
    salaryMethod: result?.salaryMethod,
    periodTotals: result?.periodTotals,
    deductions: {
      advances: result?.deductions?.advances,
      deductions: result?.deductions?.deductions,
      performance: result?.deductions?.performance,
      equipment: result?.deductions?.equipment,
      security: result?.deductions?.security,
      admin: result?.deductions?.admin,
      total: result?.deductions?.total,
    },
  });
}

function firstJsonDiff(a: string, b: string): string {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i++;
  return `index=${i}\n  OFF…${a.slice(Math.max(0, i - 48), i + 96)}\n  ON …${b.slice(Math.max(0, i - 48), i + 96)}`;
}

/** Capture Sheets quota errors printed to stderr/stdout during a window. */
function installQuotaProbe() {
  let hit = false;
  const origErr = console.error;
  const origLog = console.log;
  const probe = (...args: unknown[]) => {
    const s = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
    if (/Quota exceeded/i.test(s) || /Read requests per minute/i.test(s)) hit = true;
  };
  console.error = (...args: unknown[]) => {
    probe(...args);
    origErr(...args);
  };
  console.log = (...args: unknown[]) => {
    probe(...args);
    origLog(...args);
  };
  return {
    wasHit: () => hit,
    reset: () => {
      hit = false;
    },
    restore: () => {
      console.error = origErr;
      console.log = origLog;
    },
  };
}

async function measurePair(code: string, startDate: string, endDate: string) {
  await invalidateSalaryCaches();
  process.env.FEATURE_PAYROLL_LEDGER_ENABLED = 'false';
  process.env.FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED = 'false';
  const off = await calculateSupervisorSalary(code, startDate, endDate);

  await sleep(2500); // reduce Sheets read QPM pressure between OFF and ON

  await invalidateSalaryCaches();
  process.env.FEATURE_PAYROLL_LEDGER_ENABLED = 'true';
  process.env.FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED = 'false';
  const on = await calculateSupervisorSalary(code, startDate, endDate);

  return { off, on, offStripped: stripLedger(off), onStripped: stripLedger(on) };
}

async function main() {
  console.log('=== SRS-013 Phase 3 — Regression Guard (flag OFF vs ON) ===\n');
  const probe = installQuotaProbe();

  const supervisors = await getAllSupervisors();
  const sample = supervisors.slice(0, 3);
  if (sample.length === 0) {
    console.log('No supervisors found -- cannot run.');
    process.exit(1);
  }

  const now = new Date();
  const periods = [
    {
      startDate: toLocalYMD(new Date(now.getFullYear(), now.getMonth(), 1)),
      endDate: toLocalYMD(now),
      label: 'current month-to-date',
    },
    {
      startDate: toLocalYMD(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      endDate: toLocalYMD(new Date(now.getFullYear(), now.getMonth(), 0)),
      label: 'last full month',
    },
  ];

  for (const sup of sample) {
    for (const period of periods) {
      await sleep(3000);
      const periodLabel = period.endDate.slice(0, 7);

      let existingLedgerRows;
      try {
        existingLedgerRows = await getLedgerTransactions({ entityCode: sup.code, period: periodLabel });
      } catch (err: any) {
        console.log(`⏭️  SKIP — ${sup.code} / ${period.label}: ledger read failed (${err?.message || err})`);
        skipped++;
        continue;
      }

      const activeNative = existingLedgerRows.filter((t) => t.status === 'active' && t.source === 'ledger_native');
      if (activeNative.length > 0) {
        console.log(
          `⏭️  SKIP — ${sup.code} / ${period.label}: has ${activeNative.length} active ledger_native row(s) — OFF/ON expected to differ by design.`
        );
        skipped++;
        continue;
      }

      probe.reset();
      let pair = await measurePair(sup.code, period.startDate, period.endDate);
      let finOk = financialFingerprint(pair.offStripped) === financialFingerprint(pair.onStripped);
      let jsonOk = JSON.stringify(pair.offStripped) === JSON.stringify(pair.onStripped);
      let quotaDuring = probe.wasHit();

      if (!jsonOk || !finOk) {
        console.log(
          `⚠️  ${sup.code} / ${period.label}: mismatch (quotaDuring=${quotaDuring}) — waiting 65s for Sheets QPM then retry…`
        );
        console.log(firstJsonDiff(JSON.stringify(pair.offStripped), JSON.stringify(pair.onStripped)));
        await sleep(65000);
        probe.reset();
        pair = await measurePair(sup.code, period.startDate, period.endDate);
        finOk = financialFingerprint(pair.offStripped) === financialFingerprint(pair.onStripped);
        jsonOk = JSON.stringify(pair.offStripped) === JSON.stringify(pair.onStripped);
        quotaDuring = quotaDuring || probe.wasHit();
      }

      if ((!finOk || !jsonOk) && quotaDuring) {
        console.log(
          `⏭️  SKIP — ${sup.code} / ${period.label}: mismatch only observed under Google Sheets quota exhaustion — not a salary/ledger logic FAIL.`
        );
        skipped++;
        continue;
      }

      const ok = finOk && jsonOk;
      check(
        `${sup.code} / ${period.label} (${period.startDate}..${period.endDate})`,
        ok,
        ok
          ? `identical, netSalary=${(pair.off as any).netSalary}, financial+json match`
          : `MISMATCH financialOk=${finOk} jsonOk=${jsonOk} quotaDuring=${quotaDuring}\n${firstJsonDiff(
              JSON.stringify(pair.offStripped),
              JSON.stringify(pair.onStripped)
            )}`
      );
    }
  }

  probe.restore();
  delete process.env.FEATURE_PAYROLL_LEDGER_ENABLED;

  console.log(`\n=== Result: ${passed} passed, ${failed} failed, ${skipped} skipped ===`);
  if (failed > 0) process.exit(1);
  if (passed === 0) {
    console.log('No pairs passed — cannot claim regression green.');
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
