/**
 * SRS-014 Phase C — dedicated acceptance suite (offline).
 * No Google Sheets writes. No Phase C flags enabled in Production.
 * Covers blockers A–AD from the Phase C remediation contract.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  BAG_COST_MILLI,
  FULL_LIABILITY_MILLI,
  LIABILITY_AFTER_SECURITY_PAID_MILLI,
  SECURITY_FEE_MILLI,
  TWO_TSHIRTS_COST_MILLI,
  formatMilliemesAsEgp,
  originalLiabilityMilliemes,
} from '@/lib/money';
import { defaultCandidateFields, type Candidate } from '@/lib/recruitment/types';
import { normalizeRiderCodeForPerformance } from '@/lib/riderCodeUtils';
import { adminFeatureAllowed } from '@/lib/adminFeatureAccess';
import {
  isAutoEquipmentDeductionsEnabled,
  isEquipmentInventoryV2Enabled,
  isEquipmentLedgerEnabled,
  isEquipmentReturnsV2Enabled,
  isManualDeductionsV2Enabled,
} from '@/lib/srs014Flags';
import { shouldSkipEquipmentAutoDeductions } from '@/lib/payoutCycles/eligibility';
import {
  PHASE_C_ERROR,
  assertPhaseCCandidateReady,
  normalizeAndValidateRiderCode,
} from '@/lib/equipmentLiability/phaseCGates';
import {
  deliveryLiabilityLockKey,
  riderLiabilityLockKey,
} from '@/lib/equipmentLiability/phaseCLock';
import { EQUIPMENT_LIABILITY_HEADERS, SHEET_EQUIPMENT_LIABILITY } from '@/lib/equipmentLiability/constants';
import {
  computeLiabilityFields,
  createLiabilityFromDelivery,
  withImmutableOriginal,
  type CreateLiabilityDeps,
  type EquipmentLiabilityIssue,
} from '@/lib/equipmentLiability/store';

function candidate(partial: Partial<Candidate> & { riderCode: string }): Candidate {
  const base = defaultCandidateFields(
    {
      fullName: partial.fullName || 'Phase C QA',
      phone: partial.phone || '01000000000',
      jobAd: 'qa',
      activationStatus: partial.activationStatus ?? 'مفعل - تم القبول',
      activationConfirmed: partial.activationConfirmed ?? 'مؤكد',
      activationDate: partial.activationDate ?? '2026-08-01',
      riderCode: partial.riderCode,
      finalAssignedSupervisorCode: partial.finalAssignedSupervisorCode ?? 'WA-001',
      securityInquiryPayment: partial.securityInquiryPayment ?? 'NOT_PAID',
    },
    'qa'
  );
  return { id: partial.id || 'cand-qa-1', ...base, ...partial };
}

function deliveryInput(overrides?: Partial<Parameters<typeof createLiabilityFromDelivery>[0]>) {
  return {
    deliveryRowRef: '42',
    riderCode: '877614',
    riderNameSnapshot: 'QA Rider',
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

function memoryDeps(opts?: {
  candidates?: Map<string, Candidate | null>;
  issues?: EquipmentLiabilityIssue[];
  lockBusy?: boolean;
}): {
  deps: CreateLiabilityDeps;
  issues: EquipmentLiabilityIssue[];
  auditSkipped: boolean;
} {
  const issues = opts?.issues ?? [];
  const candidates = opts?.candidates ?? new Map<string, Candidate | null>();
  let lockHeld = false;

  const deps: CreateLiabilityDeps = {
    skipAudit: true,
    getByDeliveryRowRef: async (ref) => issues.find((i) => i.deliveryRowRef === ref) || null,
    findCandidateByRiderCode: async (code) => {
      const normalized = normalizeRiderCodeForPerformance(code);
      if (candidates.has(normalized)) return candidates.get(normalized) ?? null;
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

  return { deps, issues, auditSkipped: true };
}

describe('Phase C — liability amounts (A–D, Q–V)', () => {
  it('A/V: NOT_PAID = 900 liability', () => {
    const fields = computeLiabilityFields({ securityPaidUpfront: false, bagType: 'motorcycle' });
    assert.equal(fields.originalLiabilityMilli, 90000);
    assert.equal(FULL_LIABILITY_MILLI, 90000);
    assert.equal(formatMilliemesAsEgp(fields.originalLiabilityMilli), '900.00');
    assert.equal(originalLiabilityMilliemes('NOT_PAID'), 90000);
  });

  it('B/U: PAID = 800 liability', () => {
    const fields = computeLiabilityFields({ securityPaidUpfront: true, bagType: 'bicycle' });
    assert.equal(fields.originalLiabilityMilli, 80000);
    assert.equal(LIABILITY_AFTER_SECURITY_PAID_MILLI, 80000);
    assert.equal(formatMilliemesAsEgp(fields.originalLiabilityMilli), '800.00');
    assert.equal(originalLiabilityMilliemes('PAID'), 80000);
  });

  it('C: PAID security fee → subtract 100 → 800', () => {
    assert.equal(
      BAG_COST_MILLI + TWO_TSHIRTS_COST_MILLI + SECURITY_FEE_MILLI - SECURITY_FEE_MILLI,
      80000
    );
    const fields = computeLiabilityFields({ securityPaidUpfront: true, bagType: 'motorcycle' });
    assert.equal(fields.securityFeeMilli, 10000);
    assert.equal(fields.securityFeeMilli, SECURITY_FEE_MILLI);
    assert.equal(fields.originalLiabilityMilli, 80000);
  });

  it('D: NOT_PAID security fee → 900', () => {
    assert.equal(BAG_COST_MILLI + TWO_TSHIRTS_COST_MILLI + SECURITY_FEE_MILLI, 90000);
    const fields = computeLiabilityFields({ securityPaidUpfront: false, bagType: 'motorcycle' });
    assert.equal(fields.originalLiabilityMilli, 90000);
  });

  it('Q: jacket excluded from money', () => {
    const a = computeLiabilityFields({
      securityPaidUpfront: false,
      bagType: 'motorcycle',
      jacketHeld: true,
    });
    const b = computeLiabilityFields({
      securityPaidUpfront: false,
      bagType: 'motorcycle',
      jacketHeld: false,
    });
    assert.equal(a.originalLiabilityMilli, b.originalLiabilityMilli);
    assert.equal(a.jacketHeld, true);
  });

  it('R: helmet excluded from money', () => {
    const a = computeLiabilityFields({
      securityPaidUpfront: false,
      bagType: 'motorcycle',
      helmetHeld: true,
    });
    const b = computeLiabilityFields({
      securityPaidUpfront: false,
      bagType: 'motorcycle',
      helmetHeld: false,
    });
    assert.equal(a.originalLiabilityMilli, b.originalLiabilityMilli);
    assert.equal(a.helmetHeld, true);
  });

  it('S: motorcycle pouch = 530', () => {
    const fields = computeLiabilityFields({ securityPaidUpfront: false, bagType: 'motorcycle' });
    assert.equal(fields.bagCostMilli, 53000);
    assert.equal(BAG_COST_MILLI, 53000);
  });

  it('T: bicycle pouch = 530', () => {
    const fields = computeLiabilityFields({ securityPaidUpfront: false, bagType: 'bicycle' });
    assert.equal(fields.bagCostMilli, 53000);
  });

  it('frozen source of truth: pouch+shirts+security; no float', () => {
    assert.equal(BAG_COST_MILLI, 53000);
    assert.equal(TWO_TSHIRTS_COST_MILLI, 27000);
    assert.equal(SECURITY_FEE_MILLI, 10000);
    const moneySrc = readFileSync(join(process.cwd(), 'lib/money.ts'), 'utf8');
    assert.ok(!/أسعار_المعدات/.test(moneySrc));
    assert.ok(Number.isInteger(FULL_LIABILITY_MILLI));
    assert.ok(Number.isInteger(LIABILITY_AFTER_SECURITY_PAID_MILLI));
  });
});

describe('Phase C — activation / rider / assignment / security gates (E–L)', () => {
  it('E: missing candidate → reject', () => {
    const r = assertPhaseCCandidateReady(null, '877614');
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, PHASE_C_ERROR.CANDIDATE_NOT_FOUND);
  });

  it('F: missing/invalid security fee → reject (never default NOT_PAID)', () => {
    const missing = assertPhaseCCandidateReady(
      candidate({ riderCode: '877614', securityInquiryPayment: '' }),
      '877614'
    );
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.equal(missing.code, PHASE_C_ERROR.SECURITY_FEE_INVALID);

    const invalid = assertPhaseCCandidateReady(
      candidate({
        riderCode: '877614',
        securityInquiryPayment: 'MAYBE' as Candidate['securityInquiryPayment'],
      }),
      '877614'
    );
    assert.equal(invalid.ok, false);
    if (!invalid.ok) assert.equal(invalid.code, PHASE_C_ERROR.SECURITY_FEE_INVALID);
  });

  it('G: inactive candidate → reject', () => {
    const r = assertPhaseCCandidateReady(
      candidate({
        riderCode: '877614',
        activationStatus: 'غير مفعل',
        activationConfirmed: 'غير مؤكد',
      }),
      '877614'
    );
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, PHASE_C_ERROR.CANDIDATE_NOT_ACTIVATED);
  });

  it('H: missing rider code → reject', () => {
    const r = normalizeAndValidateRiderCode('');
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, PHASE_C_ERROR.RIDER_CODE_MISSING);
    const gate = assertPhaseCCandidateReady(candidate({ riderCode: '877614' }), '');
    assert.equal(gate.ok, false);
    if (!gate.ok) assert.equal(gate.code, PHASE_C_ERROR.RIDER_CODE_MISSING);
  });

  it('I: invalid rider code → reject', () => {
    const r = normalizeAndValidateRiderCode('WA-001');
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, PHASE_C_ERROR.RIDER_CODE_INVALID);
  });

  it('J: mismatched rider code → reject', () => {
    const r = assertPhaseCCandidateReady(candidate({ riderCode: '877614' }), '999999');
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, PHASE_C_ERROR.RIDER_CODE_MISMATCH);
  });

  it('K: missing Admin Ops assignment → reject', () => {
    const r = assertPhaseCCandidateReady(
      candidate({ riderCode: '877614', finalAssignedSupervisorCode: '' }),
      '877614'
    );
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, PHASE_C_ERROR.ADMIN_ASSIGNMENT_REQUIRED);
  });

  it('L: valid candidate → gate ok + create liability', async () => {
    const c = candidate({ riderCode: '877614', securityInquiryPayment: 'NOT_PAID' });
    const gate = assertPhaseCCandidateReady(c, '0877614');
    assert.equal(gate.ok, true);
    if (!gate.ok) return;

    const { deps, issues } = memoryDeps({
      candidates: new Map([['877614', c]]),
    });
    const result = await createLiabilityFromDelivery(deliveryInput(), { code: 'admin', name: 'Admin' }, deps);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.created, true);
    assert.equal(result.issue.originalLiabilityMilli, 90000);
    assert.equal(issues.length, 1);
  });
});

describe('Phase C — duplicate / concurrency / atomicity (M–P)', () => {
  it('M: same delivery twice → one liability', async () => {
    const c = candidate({ riderCode: '877614', securityInquiryPayment: 'PAID' });
    const { deps, issues } = memoryDeps({ candidates: new Map([['877614', c]]) });
    const a1 = await createLiabilityFromDelivery(deliveryInput(), { code: 'a', name: 'A' }, deps);
    const a2 = await createLiabilityFromDelivery(deliveryInput(), { code: 'a', name: 'A' }, deps);
    assert.equal(a1.ok, true);
    assert.equal(a2.ok, true);
    if (!a1.ok || !a2.ok) return;
    assert.equal(a1.created, true);
    assert.equal(a2.created, false);
    assert.equal(a1.issue.equipmentIssueId, a2.issue.equipmentIssueId);
    assert.equal(issues.length, 1);
  });

  it('N: same rider second delivery → EQUIPMENT_LIABILITY_ALREADY_EXISTS', async () => {
    const c = candidate({ riderCode: '877614', securityInquiryPayment: 'NOT_PAID' });
    const { deps } = memoryDeps({ candidates: new Map([['877614', c]]) });
    const first = await createLiabilityFromDelivery(
      deliveryInput({ deliveryRowRef: '10' }),
      { code: 'a', name: 'A' },
      deps
    );
    assert.equal(first.ok, true);
    const second = await createLiabilityFromDelivery(
      deliveryInput({ deliveryRowRef: '11' }),
      { code: 'a', name: 'A' },
      deps
    );
    assert.equal(second.ok, false);
    if (second.ok) return;
    assert.equal(second.code, PHASE_C_ERROR.EQUIPMENT_LIABILITY_ALREADY_EXISTS);
    assert.equal(second.error, 'EQUIPMENT_LIABILITY_ALREADY_EXISTS');
  });

  it('O: concurrent duplicate approval → one liability (lock + re-check)', async () => {
    const c = candidate({ riderCode: '877614', securityInquiryPayment: 'PAID' });
    const issues: EquipmentLiabilityIssue[] = [];
    let lockHeld = false;
    const deps: CreateLiabilityDeps = {
      skipAudit: true,
      getByDeliveryRowRef: async (ref) => issues.find((i) => i.deliveryRowRef === ref) || null,
      findCandidateByRiderCode: async () => c,
      hasActiveEquipmentIssue: async (riderCode) =>
        issues.some((i) => i.riderCode === riderCode && i.status === 'open'),
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
        await new Promise((r) => setTimeout(r, 20));
        issues.push(issue);
      },
    };

    const [r1, r2] = await Promise.all([
      createLiabilityFromDelivery(deliveryInput({ deliveryRowRef: '77' }), { code: 'a', name: 'A' }, deps),
      createLiabilityFromDelivery(deliveryInput({ deliveryRowRef: '77' }), { code: 'b', name: 'B' }, deps),
    ]);

    const oks = [r1, r2].filter((r) => r.ok);
    const busyOrDup = [r1, r2].filter(
      (r) =>
        !r.ok &&
        (r.code === PHASE_C_ERROR.LOCK_BUSY ||
          r.code === PHASE_C_ERROR.EQUIPMENT_LIABILITY_ALREADY_EXISTS)
    );
    const idempotent = [r1, r2].filter((r) => r.ok && r.created === false);

    assert.ok(oks.length >= 1, 'at least one success');
    assert.equal(issues.length, 1, 'exactly one liability row');
    assert.ok(
      busyOrDup.length + idempotent.length >= 1,
      'second request blocked or idempotent'
    );
    assert.equal(deliveryLiabilityLockKey('77'), 'equipment:liability:delivery:77');
    assert.equal(riderLiabilityLockKey('877614'), 'equipment:liability:rider:877614');
  });

  it('P: liability failure must not leave false approved financial state (route order)', () => {
    const route = readFileSync(join(process.cwd(), 'app/api/equipment-deliveries/route.ts'), 'utf8');
    const ledgerBlock = route.slice(route.indexOf('if (ledgerOn)'));
    const createIdx = ledgerBlock.indexOf('createLiabilityFromDelivery');
    const failIdx = ledgerBlock.indexOf('if (!liability.ok)');
    const approveIdx = ledgerBlock.indexOf('updateSheetRow(SHEET_EQUIPMENT_DELIVERY');
    assert.ok(createIdx >= 0);
    assert.ok(failIdx > createIdx);
    assert.ok(approveIdx > failIdx, 'approve write only after liability success');
    // Legacy path still inventory-then-approve when flag OFF
    assert.ok(route.includes('Legacy path (ledger flag OFF)'));
  });
});

describe('Phase C — immutability / isolation / sheet / permissions / flags (W–AD)', () => {
  it('originalLiabilityMilli immutable via withImmutableOriginal', () => {
    const issue = {
      equipmentIssueId: 'eq-1',
      riderCode: '877614',
      deliveryRowRef: '1',
      originalLiabilityMilli: 90000,
      outstandingMilli: 90000,
      amountDeductedMilli: 0,
    } as EquipmentLiabilityIssue;
    const updated = withImmutableOriginal(issue, {
      originalLiabilityMilli: 1,
      outstandingMilli: 60000,
      amountDeductedMilli: 30000,
      equipmentIssueId: 'hacked',
      riderCode: '000',
      deliveryRowRef: '999',
    });
    assert.equal(updated.originalLiabilityMilli, 90000);
    assert.equal(updated.equipmentIssueId, 'eq-1');
    assert.equal(updated.riderCode, '877614');
    assert.equal(updated.deliveryRowRef, '1');
    assert.equal(updated.outstandingMilli, 60000);
  });

  it('W/X/Y: Phase C create does not post payroll / auto deduction / salary', () => {
    const store = readFileSync(join(process.cwd(), 'lib/equipmentLiability/store.ts'), 'utf8');
    assert.ok(!/appendLedgerTransaction/.test(store));
    assert.ok(!/salaryService/.test(store));
    assert.ok(!/computeAutoDeductionDecision/.test(store));
    assert.ok(!/roosterLive/.test(store));
    assert.equal(isAutoEquipmentDeductionsEnabled(), false);
  });

  it('Z: returns settlement not part of Phase C create path', () => {
    const store = readFileSync(join(process.cwd(), 'lib/equipmentLiability/store.ts'), 'utf8');
    const createFn = store.slice(store.indexOf('export async function createLiabilityFromDelivery'));
    const nextExport = createFn.indexOf('\nexport async function updateBalance');
    const body = createFn.slice(0, nextExport);
    assert.ok(!/applySettlementPayment/.test(body));
    assert.ok(!/markIssueWaived/.test(body));
    assert.equal(isEquipmentReturnsV2Enabled(), false);
  });

  it('AA: permissions — equipment_liability limited admin gate', () => {
    assert.equal(adminFeatureAllowed('limited:dashboard', 'equipment_liability'), false);
    assert.equal(adminFeatureAllowed('limited:equipment_liability', 'equipment_liability'), true);
    assert.equal(adminFeatureAllowed('', 'equipment_liability'), true);
    const route = readFileSync(join(process.cwd(), 'app/api/admin/equipment-liability/route.ts'), 'utf8');
    assert.ok(route.includes("assertAdminApiAccess(decoded, 'equipment_liability')"));
    const deliveries = readFileSync(join(process.cwd(), 'app/api/equipment-deliveries/route.ts'), 'utf8');
    assert.ok(deliveries.includes("decoded.role !== 'admin'"));
  });

  it('AB: audit record on create (production path)', () => {
    const store = readFileSync(join(process.cwd(), 'lib/equipmentLiability/store.ts'), 'utf8');
    assert.ok(store.includes("action: 'create_liability'"));
    assert.ok(store.includes('appendAuditLog'));
  });

  it('AC: sheet integrity — additive headers / append-only sheet name', () => {
    assert.equal(SHEET_EQUIPMENT_LIABILITY, 'عهدة_المعدات');
    assert.ok(EQUIPMENT_LIABILITY_HEADERS.includes('originalLiabilityMilli'));
    assert.ok(EQUIPMENT_LIABILITY_HEADERS.includes('deliveryRowRef'));
    const store = readFileSync(join(process.cwd(), 'lib/equipmentLiability/store.ts'), 'utf8');
    assert.ok(store.includes('ensureSheetExists'));
    assert.ok(store.includes('appendToSheet'));
    assert.ok(!/deleteSheetRow/.test(store));
  });

  it('AD: flag OFF regression — ledger helpers default false; Phase C flags absent/off', () => {
    const prev = {
      ledger: process.env.FEATURE_EQUIPMENT_LEDGER_ENABLED,
      auto: process.env.FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED,
      returns: process.env.FEATURE_EQUIPMENT_RETURNS_V2_ENABLED,
      manual: process.env.FEATURE_MANUAL_DEDUCTIONS_V2_ENABLED,
      inv: process.env.FEATURE_EQUIPMENT_INVENTORY_V2_ENABLED,
    };
    try {
      delete process.env.FEATURE_EQUIPMENT_LEDGER_ENABLED;
      delete process.env.FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED;
      delete process.env.FEATURE_EQUIPMENT_RETURNS_V2_ENABLED;
      delete process.env.FEATURE_MANUAL_DEDUCTIONS_V2_ENABLED;
      delete process.env.FEATURE_EQUIPMENT_INVENTORY_V2_ENABLED;
      assert.equal(isEquipmentLedgerEnabled(), false);
      assert.equal(isAutoEquipmentDeductionsEnabled(), false);
      assert.equal(isEquipmentReturnsV2Enabled(), false);
      assert.equal(isManualDeductionsV2Enabled(), false);
      assert.equal(isEquipmentInventoryV2Enabled(), false);
      assert.equal(
        shouldSkipEquipmentAutoDeductions({ equipmentDeductionEnabled: true, isClosing: false }),
        false
      );
    } finally {
      for (const [k, v] of Object.entries(prev)) {
        const envKey =
          k === 'ledger'
            ? 'FEATURE_EQUIPMENT_LEDGER_ENABLED'
            : k === 'auto'
              ? 'FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED'
              : k === 'returns'
                ? 'FEATURE_EQUIPMENT_RETURNS_V2_ENABLED'
                : k === 'manual'
                  ? 'FEATURE_MANUAL_DEDUCTIONS_V2_ENABLED'
                  : 'FEATURE_EQUIPMENT_INVENTORY_V2_ENABLED';
        if (v === undefined) delete process.env[envKey];
        else process.env[envKey] = v;
      }
    }
  });

  it('PAID create uses 800 from candidate fee (not caller securityPaidUpfront)', async () => {
    const c = candidate({ riderCode: '877614', securityInquiryPayment: 'PAID' });
    const { deps } = memoryDeps({ candidates: new Map([['877614', c]]) });
    const result = await createLiabilityFromDelivery(
      deliveryInput({ securityPaidUpfront: false }),
      { code: 'a', name: 'A' },
      deps
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.issue.securityPaidUpfront, true);
    assert.equal(result.issue.originalLiabilityMilli, 80000);
  });

  it('candidate lookup failure blocks create (no 900 default)', async () => {
    const { deps, issues } = memoryDeps({ candidates: new Map([['877614', null]]) });
    const result = await createLiabilityFromDelivery(deliveryInput(), { code: 'a', name: 'A' }, deps);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, PHASE_C_ERROR.CANDIDATE_NOT_FOUND);
    assert.equal(issues.length, 0);
  });
});
