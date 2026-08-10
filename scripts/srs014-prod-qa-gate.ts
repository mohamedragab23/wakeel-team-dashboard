/**
 * SRS-014 Phase C — Production Safety Gate (offline contract + optional sheet QA).
 *
 * NEVER enables Vercel Production feature flags.
 * NEVER mutates payroll / salary / Rooster.
 *
 * Default mode (offline):
 *   npx tsx scripts/srs014-prod-qa-gate.ts
 *
 * Optional shared-sheet synthetic writes (requires explicit opt-in):
 *   SRS014_PC_QA_SHEET_WRITES=1 npx tsx scripts/srs014-prod-qa-gate.ts
 *
 * All synthetic identities use prefix SRS014_PC_QA_
 * Rider codes are reserved numeric QA codes (9990148xx).
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BAG_COST_MILLI,
  SECURITY_FEE_MILLI,
  TWO_TSHIRTS_COST_MILLI,
  formatMilliemesAsEgp,
} from '../lib/money';
import { defaultCandidateFields, type Candidate } from '../lib/recruitment/types';
import { normalizeRiderCodeForPerformance } from '../lib/riderCodeUtils';
import {
  PHASE_C_ERROR,
  assertPhaseCCandidateReady,
  normalizeAndValidateRiderCode,
} from '../lib/equipmentLiability/phaseCGates';
import {
  acquirePhaseCLiabilityLocks,
  deliveryLiabilityLockKey,
  riderLiabilityLockKey,
} from '../lib/equipmentLiability/phaseCLock';
import {
  computeLiabilityFields,
  createLiabilityFromDelivery,
  withImmutableOriginal,
  type CreateLiabilityDeps,
  type EquipmentLiabilityIssue,
} from '../lib/equipmentLiability/store';
import { isUpstashConfigured, redisDel, redisSetNx } from '../lib/upstashRest';
import {
  isAutoEquipmentDeductionsEnabled,
  isEquipmentInventoryV2Enabled,
  isEquipmentLedgerEnabled,
  isEquipmentReturnsV2Enabled,
  isManualDeductionsV2Enabled,
} from '../lib/srs014Flags';

const QA = 'SRS014_PC_QA_';
const ACTOR = { code: 'SRS014_PC_QA', name: 'SRS014 Phase C QA' };

type Row = { name: string; ok: boolean; detail: string };
const results: Row[] = [];

function record(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}: ${detail}`);
}

function candidate(partial: Partial<Candidate> & { riderCode: string }): Candidate {
  const base = defaultCandidateFields(
    {
      fullName: partial.fullName || `${QA}Rider`,
      phone: partial.phone || '01099901480',
      jobAd: `${QA}job`,
      activationStatus: partial.activationStatus ?? 'مفعل - تم القبول',
      activationConfirmed: partial.activationConfirmed ?? 'مؤكد',
      activationDate: partial.activationDate ?? '2026-08-01',
      riderCode: partial.riderCode,
      finalAssignedSupervisorCode: partial.finalAssignedSupervisorCode ?? 'WA-001',
      securityInquiryPayment: partial.securityInquiryPayment ?? 'NOT_PAID',
      notes: `${QA}notes`,
    },
    ACTOR.code
  );
  return { id: partial.id || `${QA}cand-1`, ...base, ...partial };
}

function deliveryInput(overrides?: Partial<Parameters<typeof createLiabilityFromDelivery>[0]>) {
  return {
    deliveryRowRef: `${QA}del-1`,
    riderCode: '999014801',
    riderNameSnapshot: `${QA}Rider`,
    zoneSnapshot: 'شرق',
    supervisorCodeSnapshot: 'WA-001',
    supervisorNameSnapshot: 'Ops',
    issueDate: '2026-08-10',
    bagType: 'motorcycle' as const,
    jacketHeld: false,
    helmetHeld: false,
    ...overrides,
  };
}

function memoryHarness(opts?: {
  candidates?: Map<string, Candidate | null>;
  issues?: EquipmentLiabilityIssue[];
  lockBusy?: boolean;
}) {
  const issues = opts?.issues ?? [];
  const candidates = opts?.candidates ?? new Map<string, Candidate | null>();
  let lockHeld = false;
  const deps: CreateLiabilityDeps = {
    skipAudit: true,
    getByDeliveryRowRef: async (ref) => issues.find((i) => i.deliveryRowRef === ref) || null,
    findCandidateByRiderCode: async (code) => {
      const n = normalizeRiderCodeForPerformance(code);
      if (candidates.has(n)) return candidates.get(n) ?? null;
      if (candidates.has(code)) return candidates.get(code) ?? null;
      return null;
    },
    hasActiveEquipmentIssue: async (riderCode) =>
      issues.some((i) => i.riderCode === riderCode && i.status === 'open'),
    acquirePhaseCLiabilityLocks: async () => {
      if (opts?.lockBusy || lockHeld) return { ok: false as const, busy: true as const };
      lockHeld = true;
      return {
        ok: true as const,
        release: async () => {
          lockHeld = false;
        },
      };
    },
    appendIssue: async (issue) => {
      issues.push(issue);
    },
  };
  return { deps, issues };
}

async function runOfflineContract() {
  console.log('\n=== Phase C offline contract (no Sheets writes) ===\n');

  // A/B/C amounts
  const unpaid = computeLiabilityFields({ securityPaidUpfront: false, bagType: 'motorcycle' });
  record(
    'A NOT_PAID = 900',
    unpaid.originalLiabilityMilli === 90000 && formatMilliemesAsEgp(unpaid.originalLiabilityMilli) === '900.00',
    `milli=${unpaid.originalLiabilityMilli}`
  );
  const paid = computeLiabilityFields({ securityPaidUpfront: true, bagType: 'bicycle' });
  record(
    'B/C PAID = 800',
    paid.originalLiabilityMilli === 80000 && formatMilliemesAsEgp(paid.originalLiabilityMilli) === '800.00',
    `milli=${paid.originalLiabilityMilli}`
  );
  record(
    'frozen components pouch+shirts+security',
    BAG_COST_MILLI === 53000 && TWO_TSHIRTS_COST_MILLI === 27000 && SECURITY_FEE_MILLI === 10000,
    `${BAG_COST_MILLI}+${TWO_TSHIRTS_COST_MILLI}+${SECURITY_FEE_MILLI}`
  );

  // Gates D–J
  {
    const missingCand = assertPhaseCCandidateReady(null, '999014801');
    record(
      'D missing candidate fails closed',
      !missingCand.ok && missingCand.code === PHASE_C_ERROR.CANDIDATE_NOT_FOUND,
      !missingCand.ok ? missingCand.code : 'ok'
    );
  }

  const inactive = assertPhaseCCandidateReady(
    candidate({
      riderCode: '999014801',
      activationStatus: 'غير مفعل',
      activationConfirmed: 'غير مؤكد',
    }),
    '999014801'
  );
  record(
    'E inactive rejected',
    !inactive.ok && inactive.code === PHASE_C_ERROR.CANDIDATE_NOT_ACTIVATED,
    String(!inactive.ok ? inactive.code : 'ok')
  );

  const missingRc = normalizeAndValidateRiderCode('');
  record(
    'F rider code missing',
    !missingRc.ok && missingRc.code === PHASE_C_ERROR.RIDER_CODE_MISSING,
    String(!missingRc.ok ? missingRc.code : 'ok')
  );

  const invalidRc = normalizeAndValidateRiderCode('WA-001');
  record(
    'G invalid rider code',
    !invalidRc.ok && invalidRc.code === PHASE_C_ERROR.RIDER_CODE_INVALID,
    String(!invalidRc.ok ? invalidRc.code : 'ok')
  );

  const mismatch = assertPhaseCCandidateReady(candidate({ riderCode: '999014801' }), '999014802');
  record(
    'H rider mismatch',
    !mismatch.ok && mismatch.code === PHASE_C_ERROR.RIDER_CODE_MISMATCH,
    String(!mismatch.ok ? mismatch.code : 'ok')
  );

  const noOps = assertPhaseCCandidateReady(
    candidate({ riderCode: '999014801', finalAssignedSupervisorCode: '' }),
    '999014801'
  );
  record(
    'I Admin assignment missing',
    !noOps.ok && noOps.code === PHASE_C_ERROR.ADMIN_ASSIGNMENT_REQUIRED,
    String(!noOps.ok ? noOps.code : 'ok')
  );

  const badFee = assertPhaseCCandidateReady(
    candidate({
      riderCode: '999014801',
      securityInquiryPayment: '' as Candidate['securityInquiryPayment'],
    }),
    '999014801'
  );
  record(
    'J invalid/missing security fee',
    !badFee.ok && badFee.code === PHASE_C_ERROR.SECURITY_FEE_INVALID,
    String(!badFee.ok ? badFee.code : 'ok')
  );

  // Valid create + amounts from candidate fee
  {
    const c = candidate({ riderCode: '999014801', securityInquiryPayment: 'PAID' });
    const { deps, issues } = memoryHarness({ candidates: new Map([['999014801', c]]) });
    const r = await createLiabilityFromDelivery(
      deliveryInput({ securityPaidUpfront: false }),
      ACTOR,
      deps
    );
    record(
      'A/C valid PAID path = 800',
      r.ok === true && r.ok && r.issue.originalLiabilityMilli === 80000 && issues.length === 1,
      r.ok ? `milli=${r.issue.originalLiabilityMilli}` : r.code
    );
  }
  {
    const c = candidate({ riderCode: '999014801', securityInquiryPayment: 'NOT_PAID' });
    const { deps, issues } = memoryHarness({ candidates: new Map([['999014801', c]]) });
    const r = await createLiabilityFromDelivery(deliveryInput({ deliveryRowRef: `${QA}del-np` }), ACTOR, deps);
    record(
      'B valid NOT_PAID path = 900',
      r.ok === true && r.ok && r.issue.originalLiabilityMilli === 90000 && issues.length === 1,
      r.ok ? `milli=${r.issue.originalLiabilityMilli}` : r.code
    );
  }

  // K idempotent deliveryRowRef
  {
    const c = candidate({ riderCode: '999014801', securityInquiryPayment: 'PAID' });
    const { deps, issues } = memoryHarness({ candidates: new Map([['999014801', c]]) });
    const a1 = await createLiabilityFromDelivery(deliveryInput({ deliveryRowRef: `${QA}idem` }), ACTOR, deps);
    const a2 = await createLiabilityFromDelivery(deliveryInput({ deliveryRowRef: `${QA}idem` }), ACTOR, deps);
    record(
      'K same deliveryRowRef idempotent',
      a1.ok && a2.ok && a1.ok && a2.ok && a1.created && !a2.created && issues.length === 1,
      `rows=${issues.length}`
    );
  }

  // L second delivery same rider
  {
    const c = candidate({ riderCode: '999014801', securityInquiryPayment: 'NOT_PAID' });
    const { deps } = memoryHarness({ candidates: new Map([['999014801', c]]) });
    await createLiabilityFromDelivery(deliveryInput({ deliveryRowRef: `${QA}d1` }), ACTOR, deps);
    const second = await createLiabilityFromDelivery(
      deliveryInput({ deliveryRowRef: `${QA}d2` }),
      ACTOR,
      deps
    );
    record(
      'L second open liability rejected',
      !second.ok && second.code === PHASE_C_ERROR.EQUIPMENT_LIABILITY_ALREADY_EXISTS,
      second.ok ? 'created' : second.error
    );
  }

  // M concurrent
  {
    const c = candidate({ riderCode: '999014801', securityInquiryPayment: 'PAID' });
    const issues: EquipmentLiabilityIssue[] = [];
    let lockHeld = false;
    const deps: CreateLiabilityDeps = {
      skipAudit: true,
      getByDeliveryRowRef: async (ref) => issues.find((i) => i.deliveryRowRef === ref) || null,
      findCandidateByRiderCode: async () => c,
      hasActiveEquipmentIssue: async (rc) => issues.some((i) => i.riderCode === rc && i.status === 'open'),
      acquirePhaseCLiabilityLocks: async () => {
        if (lockHeld) return { ok: false as const, busy: true as const };
        lockHeld = true;
        return {
          ok: true as const,
          release: async () => {
            lockHeld = false;
          },
        };
      },
      appendIssue: async (issue) => {
        await new Promise((r) => setTimeout(r, 15));
        issues.push(issue);
      },
    };
    const [r1, r2] = await Promise.all([
      createLiabilityFromDelivery(deliveryInput({ deliveryRowRef: `${QA}conc` }), ACTOR, deps),
      createLiabilityFromDelivery(deliveryInput({ deliveryRowRef: `${QA}conc` }), ACTOR, deps),
    ]);
    const oks = [r1, r2].filter((r) => r.ok).length;
    record(
      'M concurrent duplicate → one liability',
      issues.length === 1 && oks >= 1,
      `rows=${issues.length} oks=${oks} keys=${deliveryLiabilityLockKey('x')}/${riderLiabilityLockKey('y')}`
    );
  }

  // N liability failure prevents approve (route order)
  {
    const route = readFileSync(join(process.cwd(), 'app/api/equipment-deliveries/route.ts'), 'utf8');
    const block = route.slice(route.indexOf('if (ledgerOn)'));
    const createIdx = block.indexOf('createLiabilityFromDelivery');
    const failIdx = block.indexOf('if (!liability.ok)');
    const approveIdx = block.indexOf('updateSheetRow(SHEET_EQUIPMENT_DELIVERY');
    record(
      'N liability failure prevents approval write',
      createIdx >= 0 && failIdx > createIdx && approveIdx > failIdx,
      `order create=${createIdx} fail=${failIdx} approve=${approveIdx}`
    );
  }

  // O immutability
  {
    const issue = {
      equipmentIssueId: `${QA}eq`,
      riderCode: '999014801',
      deliveryRowRef: `${QA}del`,
      originalLiabilityMilli: 90000,
      outstandingMilli: 90000,
      amountDeductedMilli: 0,
    } as EquipmentLiabilityIssue;
    const updated = withImmutableOriginal(issue, {
      originalLiabilityMilli: 1,
      outstandingMilli: 60000,
      amountDeductedMilli: 30000,
    });
    record(
      'O originalLiabilityMilli immutable',
      updated.originalLiabilityMilli === 90000 && updated.outstandingMilli === 60000,
      `orig=${updated.originalLiabilityMilli} out=${updated.outstandingMilli}`
    );
  }

  // P/Q isolation
  {
    const store = readFileSync(join(process.cwd(), 'lib/equipmentLiability/store.ts'), 'utf8');
    record(
      'P/Q no payroll/salary/auto in create path',
      !/appendLedgerTransaction/.test(store) &&
        !/salaryService/.test(store) &&
        !/roosterLive/.test(store) &&
        !isAutoEquipmentDeductionsEnabled() &&
        !isEquipmentReturnsV2Enabled() &&
        !isManualDeductionsV2Enabled() &&
        !isEquipmentInventoryV2Enabled(),
      `ledgerFlagLocal=${isEquipmentLedgerEnabled()}`
    );
  }

  record(
    'R no unrelated Phase C flags ON in this process',
    !isEquipmentLedgerEnabled() &&
      !isAutoEquipmentDeductionsEnabled() &&
      !isEquipmentReturnsV2Enabled() &&
      !isManualDeductionsV2Enabled() &&
      !isEquipmentInventoryV2Enabled(),
    'all Phase C+ flags off/absent in process'
  );
}

async function runRedisProbe() {
  console.log('\n=== Redis / Upstash probe (QA keys only) ===\n');
  const configured = isUpstashConfigured();
  record('Redis configured', configured, configured ? 'Upstash credentials present' : 'NOT configured — fail-open lock path');

  if (!configured) return;

  const dKey = deliveryLiabilityLockKey(`${QA}lock-probe`);
  const rKey = riderLiabilityLockKey('999014899');
  await redisDel(dKey);
  await redisDel(rKey);

  const got1 = await redisSetNx(dKey, '1', 30);
  const got2 = await redisSetNx(dKey, '1', 30);
  const gotRider = await redisSetNx(rKey, '1', 30);
  record(
    'NX delivery lock acquire + reject duplicate',
    got1 === true && got2 === false,
    `first=${got1} second=${got2}`
  );
  record('NX rider lock acquire', gotRider === true, `got=${gotRider}`);

  const locks = await acquirePhaseCLiabilityLocks({
    deliveryRowRef: `${QA}lock-probe-2`,
    riderCode: '999014898',
  });
  if (locks.ok) {
    const busy = await acquirePhaseCLiabilityLocks({
      deliveryRowRef: `${QA}lock-probe-2`,
      riderCode: '999014898',
    });
    record('acquirePhaseCLiabilityLocks busy when held', !busy.ok, busy.ok ? 'not-busy' : 'busy');
    await locks.release();
    const again = await acquirePhaseCLiabilityLocks({
      deliveryRowRef: `${QA}lock-probe-2`,
      riderCode: '999014898',
    });
    record('lock release works', again.ok === true, again.ok ? 'reacquired' : 'busy');
    if (again.ok) await again.release();
  } else {
    record('acquirePhaseCLiabilityLocks busy when held', false, 'initial acquire failed');
  }

  await redisDel(dKey);
  await redisDel(rKey);
  await redisDel(deliveryLiabilityLockKey(`${QA}lock-probe-2`));
  await redisDel(riderLiabilityLockKey('999014898'));
}

async function runOptionalSheetWrites() {
  const enabled = String(process.env.SRS014_PC_QA_SHEET_WRITES || '').trim() === '1';
  if (!enabled) {
    console.log(
      '\n=== Sheet synthetic QA SKIPPED ===\nSet SRS014_PC_QA_SHEET_WRITES=1 to run controlled shared-sheet writes.\n' +
        'With FEATURE_EQUIPMENT_LEDGER_ENABLED OFF on Vercel, HTTP approve will not create liabilities;\n' +
        'optional mode calls createLiabilityFromDelivery() directly with SRS014_PC_QA_ synthetic candidates only.\n'
    );
    record(
      'Sheet synthetic QA',
      true,
      'SKIPPED by design (flag OFF; no Vercel bypass; set SRS014_PC_QA_SHEET_WRITES=1 for isolated sheet QA)'
    );
    return;
  }

  console.log('\n=== Optional sheet synthetic QA (SRS014_PC_QA_*) ===\n');
  // Delayed import so offline mode never touches Sheets.
  const { createCandidate } = await import('../lib/recruitment/recruitmentService');
  const { getSheetData, deleteSheetRow } = await import('../lib/googleSheets');
  const { SHEET_CANDIDATES } = await import('../lib/recruitment/types');
  const { SHEET_EQUIPMENT_LIABILITY } = await import('../lib/equipmentLiability/constants');
  const { AUDIT_LOG_SHEET_NAME } = await import('../lib/auditLog');
  const { listIssues } = await import('../lib/equipmentLiability/store');

  const riderPaid = '999014801';
  const riderUnpaid = '999014802';
  const createdIds: string[] = [];

  async function wipeQa(sheet: string): Promise<number> {
    const data = await getSheetData(sheet, false);
    let deleted = 0;
    for (let i = data.length - 1; i >= 1; i--) {
      const blob = JSON.stringify(data[i] ?? []);
      if (!blob.includes(QA)) continue;
      const ok = await deleteSheetRow(sheet, i + 1);
      if (ok) deleted++;
    }
    return deleted;
  }

  // Pre-clean
  await wipeQa(SHEET_EQUIPMENT_LIABILITY);
  await wipeQa(SHEET_CANDIDATES);

  const paidCand = await createCandidate(
    {
      fullName: `${QA}Paid`,
      phone: '01099901481',
      jobAd: `${QA}job`,
      activationStatus: 'مفعل - تم القبول',
      activationConfirmed: 'مؤكد',
      activationDate: '2026-08-01',
      riderCode: riderPaid,
      finalAssignedSupervisorCode: 'WA-001',
      securityInquiryPayment: 'PAID',
      notes: `${QA}paid`,
    },
    ACTOR.code,
    ACTOR.name,
    { skipNotification: true }
  );
  createdIds.push(paidCand.id);

  const unpaidCand = await createCandidate(
    {
      fullName: `${QA}Unpaid`,
      phone: '01099901482',
      jobAd: `${QA}job`,
      activationStatus: 'مفعل - تم القبول',
      activationConfirmed: 'مؤكد',
      activationDate: '2026-08-01',
      riderCode: riderUnpaid,
      finalAssignedSupervisorCode: 'WA-001',
      securityInquiryPayment: 'NOT_PAID',
      notes: `${QA}unpaid`,
    },
    ACTOR.code,
    ACTOR.name,
    { skipNotification: true }
  );
  createdIds.push(unpaidCand.id);

  const paidRes = await createLiabilityFromDelivery(
    {
      deliveryRowRef: `${QA}sheet-paid`,
      riderCode: riderPaid,
      riderNameSnapshot: `${QA}Paid`,
      zoneSnapshot: 'شرق',
      supervisorCodeSnapshot: 'WA-001',
      supervisorNameSnapshot: 'Ops',
      issueDate: '2026-08-10',
      bagType: 'motorcycle',
    },
    ACTOR
  );
  record(
    'Sheet A/C PAID → 800',
    paidRes.ok === true && paidRes.ok && paidRes.issue.originalLiabilityMilli === 80000,
    paidRes.ok ? paidRes.issue.equipmentIssueId : paidRes.code
  );

  const unpaidRes = await createLiabilityFromDelivery(
    {
      deliveryRowRef: `${QA}sheet-unpaid`,
      riderCode: riderUnpaid,
      riderNameSnapshot: `${QA}Unpaid`,
      zoneSnapshot: 'شرق',
      supervisorCodeSnapshot: 'WA-001',
      supervisorNameSnapshot: 'Ops',
      issueDate: '2026-08-10',
      bagType: 'bicycle',
    },
    ACTOR
  );
  record(
    'Sheet B NOT_PAID → 900',
    unpaidRes.ok === true && unpaidRes.ok && unpaidRes.issue.originalLiabilityMilli === 90000,
    unpaidRes.ok ? unpaidRes.issue.equipmentIssueId : unpaidRes.code
  );

  const idem = await createLiabilityFromDelivery(
    {
      deliveryRowRef: `${QA}sheet-paid`,
      riderCode: riderPaid,
      riderNameSnapshot: `${QA}Paid`,
      zoneSnapshot: 'شرق',
      supervisorCodeSnapshot: 'WA-001',
      supervisorNameSnapshot: 'Ops',
      issueDate: '2026-08-10',
      bagType: 'motorcycle',
    },
    ACTOR
  );
  record(
    'Sheet K idempotent deliveryRowRef',
    idem.ok === true && idem.ok && idem.created === false,
    idem.ok ? `created=${idem.created}` : idem.code
  );

  const second = await createLiabilityFromDelivery(
    {
      deliveryRowRef: `${QA}sheet-paid-2`,
      riderCode: riderPaid,
      riderNameSnapshot: `${QA}Paid`,
      zoneSnapshot: 'شرق',
      supervisorCodeSnapshot: 'WA-001',
      supervisorNameSnapshot: 'Ops',
      issueDate: '2026-08-10',
      bagType: 'motorcycle',
    },
    ACTOR
  );
  record(
    'Sheet L second open liability rejected',
    !second.ok && second.code === PHASE_C_ERROR.EQUIPMENT_LIABILITY_ALREADY_EXISTS,
    second.ok ? 'created' : second.error
  );

  if (paidRes.ok) {
    const { updateBalance } = await import('../lib/equipmentLiability/store');
    const before = paidRes.issue.originalLiabilityMilli;
    const bal = await updateBalance(paidRes.issue.equipmentIssueId, 10000, ACTOR, {
      incrementInstallment: true,
    });
    record(
      'Sheet O balance leaves originalLiabilityMilli immutable',
      bal.ok === true && bal.ok && bal.issue.originalLiabilityMilli === before,
      bal.ok ? `orig=${bal.issue.originalLiabilityMilli} out=${bal.issue.outstandingMilli}` : bal.error
    );
  }

  const issues = await listIssues();
  const qaIssues = issues.filter(
    (i) => i.deliveryRowRef.includes(QA) || i.riderNameSnapshot.includes(QA) || i.createdBy.includes('SRS014_PC_QA')
  );
  record('Sheet liability QA rows present before cleanup', qaIssues.length >= 2, `count=${qaIssues.length}`);

  // Cleanup ONLY QA rows
  const delLiab = await wipeQa(SHEET_EQUIPMENT_LIABILITY);
  const delCand = await wipeQa(SHEET_CANDIDATES);
  let delAudit = 0;
  try {
    delAudit = await wipeQa(AUDIT_LOG_SHEET_NAME);
  } catch (e: any) {
    console.warn('audit wipe skipped', e?.message || e);
  }

  const leftLiab = (await getSheetData(SHEET_EQUIPMENT_LIABILITY, false)).filter((r) =>
    JSON.stringify(r).includes(QA)
  ).length;
  const leftCand = (await getSheetData(SHEET_CANDIDATES, false)).filter((r) =>
    JSON.stringify(r).includes(QA)
  ).length;

  record(
    'Sheet cleanup zero leftovers',
    leftLiab === 0 && leftCand === 0,
    `deleted liability=${delLiab} candidates=${delCand} audit=${delAudit}; left L=${leftLiab} C=${leftCand}`
  );

  assert.ok(createdIds.length >= 2);
}

async function main() {
  console.log('=== SRS-014 Phase C Production QA Gate ===');
  console.log('Vercel flags are NOT modified. Local process Phase C flags remain off/absent.\n');

  // Ensure this process does not accidentally enable Phase C+ flags.
  delete process.env.FEATURE_EQUIPMENT_LEDGER_ENABLED;
  delete process.env.FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED;
  delete process.env.FEATURE_EQUIPMENT_RETURNS_V2_ENABLED;
  delete process.env.FEATURE_MANUAL_DEDUCTIONS_V2_ENABLED;
  delete process.env.FEATURE_EQUIPMENT_INVENTORY_V2_ENABLED;

  await runOfflineContract();
  await runRedisProbe();
  await runOptionalSheetWrites();

  const failed = results.filter((r) => !r.ok).length;
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n=== Result: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
