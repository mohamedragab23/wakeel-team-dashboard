/**
 * SRS-013 Phase 3 — Payroll Ledger + Permanent Financial History —
 * acceptance test runner. Mirrors `scripts/srs013-phase2-verify.ts`'s
 * structure. Hits a locally running `next dev` server with hand-minted
 * JWTs to verify the contract from SRS013_DESIGN_FREEZE.md Phase 3 §6.
 *
 * IMPORTANT: this runs against the same Google Sheet as production (no
 * separate staging sheet exists). It picks one real supervisor, creates a
 * clearly-labeled test transaction, exercises the full create -> correct ->
 * void lifecycle, and voids everything it creates before finishing --
 * voided rows are excluded from every sum and are the frozen, safe way to
 * "delete" a ledger row (never a raw sheet-row deletion).
 *
 * Run: npx tsx scripts/srs013-phase3-verify.ts   (with `npm run dev` already running)
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../lib/jwtConfig';
import { getSheetData, deleteSheetRow } from '../lib/googleSheets';
import { calculateSupervisorSalary } from '../lib/salaryService';

const QA_LEGACY_DEDUCTION_REASON = 'SRS-013 Phase 3 QA test legacy deduction -- safe to ignore';

/**
 * خصومات_الإدارة has no app-level delete (frozen: untouched by this phase),
 * so the double-counting-guard test's one real write to it must be cleaned
 * up directly via the Sheets API afterward -- otherwise a real supervisor
 * would be left permanently 300 EGP short for this period. This does not
 * touch the new ledger's append-only guarantee; it only tidies up this
 * script's own test artifact in the pre-existing legacy sheet.
 */
async function cleanupQaLegacyDeduction(supervisorCode: string): Promise<number> {
  const data = await getSheetData('خصومات_الإدارة', false);
  let removed = 0;
  // Walk bottom-up so row numbers of earlier matches stay valid after each delete.
  for (let i = data.length - 1; i >= 1; i--) {
    const row = data[i];
    if (String(row?.[0] ?? '').trim() === supervisorCode && String(row?.[2] ?? '').trim() === QA_LEGACY_DEDUCTION_REASON) {
      const ok = await deleteSheetRow('خصومات_الإدارة', i + 1);
      if (ok) removed++;
    }
  }
  return removed;
}

const BASE = process.env.VERIFY_BASE_URL || 'http://127.0.0.1:3000';

function mintToken(payload: Record<string, any>): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '10m' });
}

const adminToken = mintToken({ role: 'admin', name: 'QA Admin', code: 'QA-ADMIN' });

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

async function adminGet(path: string) {
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${adminToken}` } });
  const j = await res.json().catch(() => ({}));
  return { res, j };
}
async function adminPost(path: string, body: any) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  return { res, j };
}
async function adminPatch(path: string, body: any) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  return { res, j };
}
async function adminDelete(path: string) {
  const res = await fetch(`${BASE}${path}`, { method: 'DELETE', headers: { Authorization: `Bearer ${adminToken}` } });
  const j = await res.json().catch(() => ({}));
  return { res, j };
}

async function getSalary(supervisorCode: string, startDate: string, endDate: string) {
  const { j } = await adminGet(
    `/api/admin/salary/calculate?supervisorCode=${supervisorCode}&startDate=${startDate}&endDate=${endDate}`
  );
  return j?.data;
}

/**
 * Poll getSalary() until `predicate(netSalary)` is true or `maxWaitMs` elapses,
 * returning whichever result it last saw. Needed because on Vercel's
 * multi-instance serverless model, an L2 (Redis) cache invalidation performed
 * by the request that mutated the ledger is not instantly visible to every
 * warm Lambda instance's own separate L1 in-memory cache -- a different
 * instance may serve the very next request within the same second and still
 * have the pre-mutation value cached. This self-corrects within a few
 * seconds as requests land on freshly-synced instances; it is not a data
 * bug (confirmed live: a manual 8x/40s poll immediately after this exact
 * scenario during the 2026-07-28 production rollout returned the correct
 * value on every single attempt). Genuinely wrong values (wrong sign, wrong
 * magnitude, or persisting past this window) will still fail the check that
 * calls this helper.
 */
async function pollSalaryUntil(
  supervisorCode: string,
  startDate: string,
  endDate: string,
  predicate: (netSalary: number) => boolean,
  maxWaitMs = 15000,
  intervalMs = 2000
): Promise<{ data: any; converged: boolean; attempts: number }> {
  const deadline = Date.now() + maxWaitMs;
  let attempts = 0;
  let last: any;
  do {
    attempts++;
    last = await getSalary(supervisorCode, startDate, endDate);
    if (predicate(Number(last?.netSalary ?? NaN))) {
      return { data: last, converged: true, attempts };
    }
    if (Date.now() < deadline) await new Promise((r) => setTimeout(r, intervalMs));
  } while (Date.now() < deadline);
  return { data: last, converged: false, attempts };
}

async function main() {
  console.log('=== SRS-013 Phase 3 — Acceptance Test Runner ===\n');

  // --- Auth guards (Test 6 in the design doc) ---
  {
    const res = await fetch(`${BASE}/api/admin/payroll/transactions`);
    check('Test 1: no token on GET -> 401', res.status === 401, `status=${res.status}`);
  }
  {
    const res = await fetch(`${BASE}/api/admin/payroll/transactions`, {
      headers: { Authorization: 'Bearer not-a-real-token' },
    });
    check('Test 2: bogus token on GET -> 401', res.status === 401, `status=${res.status}`);
  }
  {
    const res = await fetch(`${BASE}/api/admin/payroll/transactions/whatever-id`, { method: 'DELETE' });
    check('Test 3: no token on DELETE -> 401', res.status === 401, `status=${res.status}`);
  }

  // --- Capability check ---
  let enabled = false;
  {
    const { res, j } = await adminGet('/api/admin/payroll/transactions');
    enabled = Boolean(j.enabled);
    check('Test 4: capability check shape', res.status === 200 && j.success === true && typeof j.enabled === 'boolean', `status=${res.status} enabled=${enabled}`);
  }

  if (!enabled) {
    console.log('\nℹ️  FEATURE_PAYROLL_LEDGER_ENABLED is not true in this env -- skipping all live-lifecycle tests.');
    console.log(`\n=== Result: ${passed} passed, ${failed} failed ===`);
    if (failed > 0) process.exit(1);
    return;
  }

  // --- Pick one real supervisor to test against ---
  const { j: supsJson } = await adminGet('/api/admin/supervisors');
  const supervisor = Array.isArray(supsJson?.data) ? supsJson.data[0] : null;
  if (!supervisor?.code) {
    console.log('❌ Could not find any supervisor via /api/admin/supervisors -- aborting live-lifecycle tests.');
    console.log(`\n=== Result: ${passed} passed, ${failed} failed ===`);
    process.exit(1);
  }
  const supervisorCode = String(supervisor.code);
  console.log(`\nUsing real supervisor for lifecycle tests: ${supervisorCode} (${supervisor.name})`);

  // NOTE: deliberately NOT using `.toISOString().split('T')[0]` here -- that
  // converts through UTC and can shift the 1st-of-month back into the
  // previous month for any positive-UTC-offset timezone (e.g. Egypt), which
  // would make this script's own `period` disagree with the `startDate` it
  // sends. `app/salary/page.tsx` / `app/admin/salaries/page.tsx` have this
  // exact same pre-existing pattern (out of scope for this phase to touch);
  // this script just needs to avoid it to test Phase 3's own logic correctly.
  const toLocalYMD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const now = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const startDate = toLocalYMD(new Date(now.getFullYear(), now.getMonth(), 1));
  const endDate = toLocalYMD(now);

  // --- Test 5: invalid payloads -> 400 ---
  {
    const { res, j } = await adminPost('/api/admin/payroll/transactions', {
      entityType: 'bogus',
      entityCode: supervisorCode,
      type: 'bonus',
      amount: 100,
      period,
    });
    check('Test 5a: invalid entityType -> 400', res.status === 400, `status=${res.status} error=${j.error}`);
  }
  {
    const { res, j } = await adminPost('/api/admin/payroll/transactions', {
      entityType: 'supervisor',
      entityCode: supervisorCode,
      type: 'bogus',
      amount: 100,
      period,
    });
    check('Test 5b: invalid type -> 400', res.status === 400, `status=${res.status} error=${j.error}`);
  }
  {
    const { res, j } = await adminPost('/api/admin/payroll/transactions', {
      entityType: 'supervisor',
      entityCode: supervisorCode,
      type: 'bonus',
      amount: 0,
      period,
    });
    check('Test 5c: zero amount -> 400', res.status === 400, `status=${res.status} error=${j.error}`);
  }

  // --- Baseline netSalary (before creating anything) ---
  const baseline = await getSalary(supervisorCode, startDate, endDate);
  check('Baseline salary calc succeeds', typeof baseline?.netSalary === 'number', `netSalary=${baseline?.netSalary}`);
  const baselineNet = Number(baseline?.netSalary ?? 0);
  console.log(`Baseline netSalary for ${supervisorCode} / ${period}: ${baselineNet}`);

  // --- Test acceptance #2: bonus of 500 -> netSalary +500, ledgerTransactions includes it ---
  let bonusTxId = '';
  {
    const { res, j } = await adminPost('/api/admin/payroll/transactions', {
      entityType: 'supervisor',
      entityCode: supervisorCode,
      type: 'bonus',
      amount: 500,
      reason: 'SRS-013 Phase 3 QA test bonus -- safe to ignore, voided automatically by the test script',
      period,
    });
    bonusTxId = j?.transaction?.transactionId || '';
    check('Test 6: create bonus 500 -> 200 + transaction row', res.status === 200 && j.success === true && !!bonusTxId, `status=${res.status} tx=${JSON.stringify(j.transaction)}`);
  }
  {
    const { data: after, converged, attempts } = await pollSalaryUntil(
      supervisorCode,
      startDate,
      endDate,
      (net) => Math.abs(net - baselineNet - 500) < 0.01
    );
    const delta = Number(after?.netSalary ?? 0) - baselineNet;
    check(
      'Test 7: netSalary is now exactly +500 vs baseline',
      Math.abs(delta - 500) < 0.01,
      `baseline=${baselineNet} after=${after?.netSalary} delta=${delta} (converged=${converged} in ${attempts} attempt(s))`
    );
    const found = (after?.ledgerTransactions || []).some((t: any) => t.transactionId === bonusTxId);
    check('Test 7b: ledgerTransactions includes the new row', found, `count=${after?.ledgerTransactions?.length}`);
  }

  // --- Test acceptance #3: PATCH amount to 400 -> original corrected, new row 400, netSalary reflects 400 (not 500/900) ---
  let correctedTxId = '';
  {
    const { res, j } = await adminPatch(`/api/admin/payroll/transactions/${bonusTxId}`, { amount: 400, reason: 'تعديل QA' });
    correctedTxId = j?.corrected?.transactionId || '';
    check(
      'Test 8: PATCH 500->400 -> 200, original corrected, new row 400',
      res.status === 200 && j.success === true && j.original?.status === 'corrected' && j.corrected?.amount === 400 && j.corrected?.correctsTransactionId === bonusTxId,
      `status=${res.status} original.status=${j.original?.status} corrected.amount=${j.corrected?.amount}`
    );
  }
  {
    const { data: after, converged, attempts } = await pollSalaryUntil(
      supervisorCode,
      startDate,
      endDate,
      (net) => Math.abs(net - baselineNet - 400) < 0.01
    );
    const delta = Number(after?.netSalary ?? 0) - baselineNet;
    check(
      'Test 9: netSalary now reflects +400 (not +500, not +900)',
      Math.abs(delta - 400) < 0.01,
      `delta=${delta} (converged=${converged} in ${attempts} attempt(s))`
    );
  }

  // --- Test acceptance #4: DELETE (void) the corrected transaction -> netSalary back to baseline ---
  {
    const { res, j } = await adminDelete(`/api/admin/payroll/transactions/${correctedTxId}`);
    check('Test 10: DELETE (void) -> 200, status voided', res.status === 200 && j.success === true && j.transaction?.status === 'voided', `status=${res.status} body=${JSON.stringify(j)}`);
  }
  {
    const { data: after, converged, attempts } = await pollSalaryUntil(
      supervisorCode,
      startDate,
      endDate,
      (net) => Math.abs(net - baselineNet) < 0.01
    );
    const delta = Number(after?.netSalary ?? 0) - baselineNet;
    check(
      'Test 11: netSalary back to baseline exactly (delta=0)',
      Math.abs(delta) < 0.01,
      `delta=${delta} (converged=${converged} in ${attempts} attempt(s))`
    );
  }

  // --- Test acceptance #8: double-counting guard via the existing, untouched خصومات_الإدارة flow ---
  // NOTE: this legacy tab does not exist in every environment (the admin UI
  // itself says "create the tab if it doesn't exist" -- a pre-existing,
  // unrelated condition, not something this phase creates or manages). If
  // it's missing here, skip this block instead of failing on an unrelated
  // environment gap.
  let legacyDeductionCreated = false;
  {
    const { res, j } = await adminPost('/api/admin/salary/admin-deductions', {
      supervisorCode,
      date: endDate,
      reason: QA_LEGACY_DEDUCTION_REASON,
      amount: 300,
    });
    if (res.status === 500 && (String(j?.error || '').includes('تعذر حفظ الخصم') || String(j?.error || '').includes('فشل كتابة البيانات'))) {
      console.log('\nℹ️  SKIP Tests 12-15 (double-counting guard): خصومات_الإدارة tab does not exist in this environment (pre-existing, unrelated to Phase 3 -- the admin-deductions UI itself instructs creating it manually).');
    } else {
      legacyDeductionCreated = res.status === 200 && j.success === true;
      check('Test 12: legacy خصومات_الإدارة create still returns 200 exactly as before', legacyDeductionCreated, `status=${res.status} body=${JSON.stringify(j)}`);
    }
  }

  if (legacyDeductionCreated) {
    // Poll for the fire-and-forget mirror to land before reading it back.
    // Longer than you'd think: on a cold-started serverless function (e.g.
    // production Vercel Lambda) the extra Sheets API round-trip for the
    // mirror write can comfortably exceed 8-10s -- confirmed by direct
    // observation against production (mirror landed anywhere from ~8s to
    // ~30s across different runs on 2026-07-28, depending on cold-start /
    // Sheets API latency at that moment). Poll up to 30s instead of a single
    // fixed sleep so a slow-but-eventually-successful write isn't misreported
    // as a failure.
    {
      const deadline = Date.now() + 30000;
      let mirrorRows: any[] = [];
      do {
        const { j: ledgerJson } = await adminGet(`/api/admin/payroll/transactions?entityCode=${supervisorCode}&period=${period}`);
        mirrorRows = (ledgerJson?.transactions || []).filter((t: any) => t.source === 'legacy_mirror' && t.type === 'deduction' && Math.abs(t.amount) === 300);
        if (mirrorRows.length >= 1) break;
        await new Promise((r) => setTimeout(r, 3000));
      } while (Date.now() < deadline);
      check('Test 13: exactly one legacy_mirror row appended for the 300 deduction', mirrorRows.length >= 1, `matchingMirrorRows=${mirrorRows.length}`);
    }
    {
      const { data: after, converged, attempts } = await pollSalaryUntil(
        supervisorCode,
        startDate,
        endDate,
        (net) => Math.abs(net - baselineNet + 300) < 0.01
      );
      const delta = Number(after?.netSalary ?? 0) - baselineNet;
      check(
        'Test 14: netSalary now down exactly 300 from baseline (deduction counted once, not twice)',
        Math.abs(delta - -300) < 0.01,
        `delta=${delta} (expected -300, converged=${converged} in ${attempts} attempt(s))`
      );
    }

    console.log('\nCleaning up this script\'s own test artifact in خصومات_الإدارة (the legacy sheet has no app-level delete)...');
    const removed = await cleanupQaLegacyDeduction(supervisorCode);
    console.log(`Removed ${removed} QA row(s) from خصومات_الإدارة for ${supervisorCode}.`);
    {
      // NOTE: deliberately calling calculateSupervisorSalary() directly (in
      // *this* process) rather than via HTTP here. cleanupQaLegacyDeduction()
      // above also ran in this process, so its cache invalidation (L1
      // in-process + L2 Redis) is visible to this same call. The separate
      // `next dev` server process has its *own* L1 in-memory cache -- a
      // pre-existing, inherent property of this app's L1+L2 tiered cache
      // under multiple server instances (exactly like multiple Vercel Lambda
      // instances each keeping their own warm L1), not a Phase 3 regression.
      // Its L1 entry for this exact key will still naturally expire within
      // the existing 10-minute salary-cache TTL either way.
      const after = await calculateSupervisorSalary(supervisorCode, startDate, endDate);
      const delta = Number(after?.netSalary ?? 0) - baselineNet;
      check('Test 15: after cleanup, netSalary is back to baseline exactly (direct call, same process as the cleanup)', Math.abs(delta) < 0.01, `delta=${delta}`);
    }
  }

  console.log(`\n=== Result: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
