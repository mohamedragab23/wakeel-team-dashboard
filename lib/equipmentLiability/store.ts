import {
  appendToSheet,
  ensureHeaderRow,
  ensureSheetExists,
  getSheetDataOrThrow,
  updateSheetRow,
} from '@/lib/googleSheets';
import { appendAuditLog } from '@/lib/auditLog';
import { splitInstallmentsMilliemes } from '@/lib/money';
import {
  computeAssignmentLiabilityFields,
  requireAdminEquipmentPricingForLiability,
  scheduleFromPersistedOriginalMilli,
  type EquipmentPriceSnapshot,
  type LoadAdminPricingResult,
} from '@/lib/equipmentPricing';
import { shirtSwapOriginalMilli } from '@/lib/equipmentLiability/swapRules';
import { normalizeRiderCodeForPerformance } from '@/lib/riderCodeUtils';
import { loadAllCandidates } from '@/lib/recruitment/recruitmentService';
import {
  EQUIPMENT_LIABILITY_HEADERS,
  SHEET_EQUIPMENT_LIABILITY,
  type EquipmentBagType,
  type EquipmentLiabilityStatus,
} from './constants';
import {
  PHASE_C_ERROR,
  PHASE_C_ERROR_AR,
  assertPhaseCAdminOverride,
  assertPhaseCCandidateReady,
  type PhaseCErrorCode,
} from './phaseCGates';
import { acquirePhaseCLiabilityLocks } from './phaseCLock';

export type EquipmentLiabilityIssue = {
  equipmentIssueId: string;
  riderCode: string;
  riderNameSnapshot: string;
  zoneSnapshot: string;
  supervisorCodeSnapshot: string;
  supervisorNameSnapshot: string;
  issueDate: string;
  activationDate: string;
  bagType: EquipmentBagType;
  bagCostMilli: number;
  shirtQty: number;
  shirtCostMilli: number;
  securityFeeMilli: number;
  securityPaidUpfront: boolean;
  originalLiabilityMilli: number;
  outstandingMilli: number;
  /** Installment / auto-deduction progress only (never settlement cash). */
  amountDeductedMilli: number;
  /** Cash return settlement paid (does not advance installments). */
  settlementPaidMilli: number;
  installmentsCompleted: number;
  status: EquipmentLiabilityStatus;
  deliveryRowRef: string;
  jacketHeld: boolean;
  helmetHeld: boolean;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  sheetRow?: number;
  /** Derived at read time from persisted originalLiabilityMilli — never live Admin re-price. */
  installmentSchedule?: number[];
  /** Immutable Admin / opening price snapshot metadata (4D.5.4.2 / 4D.5.4.13). */
  pricingSource?: 'ADMIN_EQUIPMENT_PRICES' | 'LEGACY_NO_SNAPSHOT' | 'OPENING_MIGRATION';
  pricingCapturedAt?: string;
  snapMotorcycleBagMilli?: number;
  snapBicycleBagMilli?: number;
  snapShirtUnitMilli?: number;
};

export type DeliveryLiabilityInput = {
  deliveryRowRef: string;
  riderCode: string;
  riderNameSnapshot: string;
  zoneSnapshot: string;
  supervisorCodeSnapshot: string;
  supervisorNameSnapshot: string;
  issueDate: string;
  /** Ignored when Phase C gates resolve activation from candidate. */
  activationDate?: string;
  bagType: EquipmentBagType;
  /**
   * @deprecated Phase C ignores caller-supplied security; fee comes from candidate only.
   * Kept optional for type compatibility with older call sites.
   */
  securityPaidUpfront?: boolean;
  jacketHeld?: boolean;
  helmetHeld?: boolean;
  /**
   * Admin-only: skip Candidate sheet when missing — must confirm security + supervisor.
   */
  adminOverride?: {
    operatorConfirmation: boolean;
    securityStatus: 'PAID' | 'NOT_PAID';
    activationDate?: string;
  };
};

/** Preserve originalLiabilityMilli on every balance mutation (immutability). */
export function withImmutableOriginal(
  issue: EquipmentLiabilityIssue,
  patch: Partial<EquipmentLiabilityIssue>
): EquipmentLiabilityIssue {
  return {
    ...issue,
    ...patch,
    originalLiabilityMilli: issue.originalLiabilityMilli,
    equipmentIssueId: issue.equipmentIssueId,
    deliveryRowRef: issue.deliveryRowRef,
    riderCode: issue.riderCode,
  };
}

/** Optional deps for offline Phase C acceptance tests (production omits this). */
export type CreateLiabilityDeps = {
  getByDeliveryRowRef?: (deliveryRowRef: string) => Promise<EquipmentLiabilityIssue | null>;
  findCandidateByRiderCode?: (
    riderCode: string
  ) => Promise<import('@/lib/recruitment/types').Candidate | null>;
  hasActiveEquipmentIssue?: (riderCode: string) => Promise<boolean>;
  acquirePhaseCLiabilityLocks?: typeof acquirePhaseCLiabilityLocks;
  appendIssue?: (issue: EquipmentLiabilityIssue) => Promise<void>;
  skipAudit?: boolean;
  /** Inject Admin pricing (tests). Production loads أسعار_المعدات fail-closed. */
  loadPricing?: () => Promise<LoadAdminPricingResult>;
};

export async function findCandidateByRiderCode(riderCodeRaw: string) {
  const normalized = normalizeRiderCodeForPerformance(riderCodeRaw);
  if (!normalized) return null;
  const all = await loadAllCandidates(false);
  return (
    all.find((c) => normalizeRiderCodeForPerformance(c.riderCode) === normalized) || null
  );
}

async function resolvePhaseCGateForDelivery(
  input: DeliveryLiabilityInput,
  findCandidate: (riderCode: string) => Promise<import('@/lib/recruitment/types').Candidate | null>
): Promise<
  | {
      ok: true;
      riderCode: string;
      securityPaidUpfront: boolean;
      activationDate: string;
      finalAssignedSupervisorCode: string;
      viaAdminOverride: boolean;
    }
  | { ok: false; code: PhaseCErrorCode; error: string }
> {
  if (input.adminOverride?.operatorConfirmation) {
    const over = assertPhaseCAdminOverride(input.riderCode, {
      operatorConfirmation: true,
      securityStatus: input.adminOverride.securityStatus,
      activationDate: input.adminOverride.activationDate || input.activationDate,
      finalAssignedSupervisorCode: input.supervisorCodeSnapshot,
    });
    if (!over.ok) {
      return { ok: false, code: over.code, error: over.error };
    }
    return {
      ok: true,
      riderCode: over.riderCode,
      securityPaidUpfront: over.securityPaidUpfront,
      activationDate: over.activationDate,
      finalAssignedSupervisorCode: over.finalAssignedSupervisorCode,
      viaAdminOverride: true,
    };
  }

  const candidate = await findCandidate(input.riderCode);
  const gate = assertPhaseCCandidateReady(candidate, input.riderCode);
  if (!gate.ok) {
    return {
      ok: false,
      code: gate.code,
      error:
        gate.code === PHASE_C_ERROR.EQUIPMENT_LIABILITY_ALREADY_EXISTS
          ? PHASE_C_ERROR.EQUIPMENT_LIABILITY_ALREADY_EXISTS
          : PHASE_C_ERROR_AR[gate.code],
    };
  }
  return { ...gate, viaAdminOverride: false };
}

let ensuredOnce = false;

function newIssueId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `eq_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function cell(row: unknown[], i: number): string {
  return String(row[i] ?? '').trim();
}

function parseBoolCell(v: string): boolean {
  const s = v.trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
}

/**
 * Pure liability field computation from an immutable Admin price snapshot.
 * Does NOT read money.ts business prices.
 */
export function computeLiabilityFields(params: {
  securityPaidUpfront: boolean;
  bagType: EquipmentBagType;
  jacketHeld?: boolean;
  helmetHeld?: boolean;
  pricing: EquipmentPriceSnapshot;
}): {
  bagCostMilli: number;
  shirtQty: number;
  shirtCostMilli: number;
  securityFeeMilli: number;
  originalLiabilityMilli: number;
  outstandingMilli: number;
  amountDeductedMilli: number;
  settlementPaidMilli: number;
  installmentsCompleted: number;
  installmentSchedule: number[];
  jacketHeld: boolean;
  helmetHeld: boolean;
  priceSnapshot: EquipmentPriceSnapshot;
} {
  return computeAssignmentLiabilityFields({
    snapshot: params.pricing,
    bagType: params.bagType,
    securityPaidUpfront: params.securityPaidUpfront,
    jacketHeld: params.jacketHeld,
    helmetHeld: params.helmetHeld,
  });
}

export function rowToEquipmentLiability(row: unknown[], sheetRow: number): EquipmentLiabilityIssue | null {
  const equipmentIssueId = cell(row, 0);
  if (!equipmentIssueId) return null;

  const securityPaidUpfront = parseBoolCell(cell(row, 13));
  const statusRaw = cell(row, 18) || 'open';
  const bagTypeRaw = cell(row, 8) || 'motorcycle';
  const status = (['open', 'settled', 'waived', 'closed'].includes(statusRaw)
    ? statusRaw
    : 'open') as EquipmentLiabilityStatus;
  const bagType = (bagTypeRaw === 'bicycle' ? 'bicycle' : 'motorcycle') as EquipmentBagType;

  const originalLiabilityMilli = Math.max(0, Math.trunc(Number(cell(row, 14)) || 0));
  const pricingSourceRaw = cell(row, 27);
  const pricingSource =
    pricingSourceRaw === 'ADMIN_EQUIPMENT_PRICES' ||
    pricingSourceRaw === 'LEGACY_NO_SNAPSHOT' ||
    pricingSourceRaw === 'OPENING_MIGRATION'
      ? pricingSourceRaw
      : originalLiabilityMilli > 0 || Number(cell(row, 9)) > 0
        ? 'LEGACY_NO_SNAPSHOT'
        : undefined;

  // Persisted amounts are authoritative — never substitute live Admin / money.ts prices.
  return {
    equipmentIssueId,
    riderCode: cell(row, 1),
    riderNameSnapshot: cell(row, 2),
    zoneSnapshot: cell(row, 3),
    supervisorCodeSnapshot: cell(row, 4),
    supervisorNameSnapshot: cell(row, 5),
    issueDate: cell(row, 6),
    activationDate: cell(row, 7),
    bagType,
    bagCostMilli: Math.max(0, Math.trunc(Number(cell(row, 9)) || 0)),
    shirtQty: (() => {
      const raw = cell(row, 10);
      if (raw === '') return 2; // legacy FLOW B default when column empty
      return Math.max(0, Math.trunc(Number(raw) || 0));
    })(),
    shirtCostMilli: Math.max(0, Math.trunc(Number(cell(row, 11)) || 0)),
    securityFeeMilli: Math.max(0, Math.trunc(Number(cell(row, 12)) || 0)),
    securityPaidUpfront,
    originalLiabilityMilli,
    outstandingMilli: Math.max(0, Math.trunc(Number(cell(row, 15)) || 0)),
    amountDeductedMilli: Math.max(0, Math.trunc(Number(cell(row, 16)) || 0)),
    installmentsCompleted: Math.max(0, Math.trunc(Number(cell(row, 17)) || 0)),
    status,
    deliveryRowRef: cell(row, 19),
    jacketHeld: parseBoolCell(cell(row, 20)),
    helmetHeld: parseBoolCell(cell(row, 21)),
    createdAt: cell(row, 22),
    createdBy: cell(row, 23),
    updatedAt: cell(row, 24),
    updatedBy: cell(row, 25),
    settlementPaidMilli: Math.max(0, Math.trunc(Number(cell(row, 26)) || 0)),
    sheetRow,
    installmentSchedule: scheduleFromPersistedOriginalMilli(originalLiabilityMilli),
    pricingSource,
    pricingCapturedAt: cell(row, 28) || undefined,
    snapMotorcycleBagMilli: Math.max(0, Math.trunc(Number(cell(row, 29)) || 0)) || undefined,
    snapBicycleBagMilli: Math.max(0, Math.trunc(Number(cell(row, 30)) || 0)) || undefined,
    snapShirtUnitMilli: Math.max(0, Math.trunc(Number(cell(row, 31)) || 0)) || undefined,
  };
}

function issueToRow(issue: EquipmentLiabilityIssue): unknown[] {
  return [
    issue.equipmentIssueId,
    issue.riderCode,
    issue.riderNameSnapshot,
    issue.zoneSnapshot,
    issue.supervisorCodeSnapshot,
    issue.supervisorNameSnapshot,
    issue.issueDate,
    issue.activationDate,
    issue.bagType,
    issue.bagCostMilli,
    issue.shirtQty,
    issue.shirtCostMilli,
    issue.securityFeeMilli,
    issue.securityPaidUpfront ? 'TRUE' : 'FALSE',
    issue.originalLiabilityMilli,
    issue.outstandingMilli,
    issue.amountDeductedMilli,
    issue.installmentsCompleted,
    issue.status,
    issue.deliveryRowRef,
    issue.jacketHeld ? 'TRUE' : 'FALSE',
    issue.helmetHeld ? 'TRUE' : 'FALSE',
    issue.createdAt,
    issue.createdBy,
    issue.updatedAt,
    issue.updatedBy,
    issue.settlementPaidMilli ?? 0,
    issue.pricingSource || '',
    issue.pricingCapturedAt || '',
    issue.snapMotorcycleBagMilli ?? '',
    issue.snapBicycleBagMilli ?? '',
    issue.snapShirtUnitMilli ?? '',
  ];
}

export async function ensureEquipmentLiabilitySheet(): Promise<void> {
  if (ensuredOnce) return;
  await ensureSheetExists(SHEET_EQUIPMENT_LIABILITY, [...EQUIPMENT_LIABILITY_HEADERS]);
  await ensureHeaderRow(SHEET_EQUIPMENT_LIABILITY, [...EQUIPMENT_LIABILITY_HEADERS]);
  ensuredOnce = true;
}

/** Append one liability row (FLOW A Opening persist uses this via pilot deps). */
export async function appendLiabilityIssue(issue: EquipmentLiabilityIssue): Promise<void> {
  await ensureEquipmentLiabilitySheet();
  await appendToSheet(SHEET_EQUIPMENT_LIABILITY, [issueToRow(issue)]);
}

async function readAllIssues(): Promise<EquipmentLiabilityIssue[]> {
  await ensureEquipmentLiabilitySheet();
  // Fail closed: Sheets quota/transport errors must not look like "no liabilities".
  // A:Z truncates after col 26 and drops settlementPaidMilli + pricing snapshot columns.
  const data = await getSheetDataOrThrow(
    SHEET_EQUIPMENT_LIABILITY,
    false,
    `${SHEET_EQUIPMENT_LIABILITY}!A:AZ`
  );
  const out: EquipmentLiabilityIssue[] = [];
  for (let i = 1; i < data.length; i++) {
    const issue = rowToEquipmentLiability(data[i], i + 1);
    if (issue) out.push(issue);
  }
  return out;
}

export async function listIssues(filters?: {
  status?: EquipmentLiabilityStatus;
  riderCode?: string;
  supervisorCode?: string;
}): Promise<EquipmentLiabilityIssue[]> {
  return (await readAllIssues()).filter((i) => {
    if (filters?.status && i.status !== filters.status) return false;
    if (filters?.riderCode && i.riderCode !== filters.riderCode.trim()) return false;
    if (filters?.supervisorCode && i.supervisorCodeSnapshot !== filters.supervisorCode.trim()) return false;
    return true;
  });
}

export async function listOpenIssues(): Promise<EquipmentLiabilityIssue[]> {
  return listIssues({ status: 'open' });
}

export async function getById(equipmentIssueId: string): Promise<EquipmentLiabilityIssue | null> {
  const all = await readAllIssues();
  return all.find((i) => i.equipmentIssueId === equipmentIssueId) || null;
}

export async function getByDeliveryRowRef(deliveryRowRef: string): Promise<EquipmentLiabilityIssue | null> {
  const ref = deliveryRowRef.trim();
  if (!ref) return null;
  const all = await readAllIssues();
  return all.find((i) => i.deliveryRowRef === ref) || null;
}

export async function createLiabilityFromDelivery(
  input: DeliveryLiabilityInput,
  actor: { code: string; name: string },
  deps?: CreateLiabilityDeps
): Promise<
  | { ok: true; issue: EquipmentLiabilityIssue; created: boolean }
  | { ok: false; error: string; code: PhaseCErrorCode }
> {
  const deliveryRowRef = String(input.deliveryRowRef || '').trim();
  if (!deliveryRowRef) {
    return {
      ok: false,
      code: PHASE_C_ERROR.LIABILITY_CREATE_FAILED,
      error: 'معرّف صف التسليم مطلوب',
    };
  }

  const getByRef = deps?.getByDeliveryRowRef ?? getByDeliveryRowRef;
  const findCandidate = deps?.findCandidateByRiderCode ?? findCandidateByRiderCode;
  const hasOpen = deps?.hasActiveEquipmentIssue ?? hasActiveEquipmentIssue;
  const acquireLocks = deps?.acquirePhaseCLiabilityLocks ?? acquirePhaseCLiabilityLocks;

  const existingByDelivery = await getByRef(deliveryRowRef);
  if (existingByDelivery) {
    return { ok: true, issue: existingByDelivery, created: false };
  }

  const gate = await resolvePhaseCGateForDelivery(input, findCandidate);
  if (!gate.ok) {
    return {
      ok: false,
      code: gate.code,
      error: gate.error,
    };
  }

  if (await hasOpen(gate.riderCode)) {
    return {
      ok: false,
      code: PHASE_C_ERROR.EQUIPMENT_LIABILITY_ALREADY_EXISTS,
      error: PHASE_C_ERROR.EQUIPMENT_LIABILITY_ALREADY_EXISTS,
    };
  }

  const locks = await acquireLocks({
    deliveryRowRef,
    riderCode: gate.riderCode,
  });
  if (!locks.ok) {
    return {
      ok: false,
      code: PHASE_C_ERROR.LOCK_BUSY,
      error: PHASE_C_ERROR_AR.LOCK_BUSY,
    };
  }

  try {
    // Re-check under lock (concurrency / Sheets lag).
    const againDelivery = await getByRef(deliveryRowRef);
    if (againDelivery) return { ok: true, issue: againDelivery, created: false };

    if (await hasOpen(gate.riderCode)) {
      return {
        ok: false,
        code: PHASE_C_ERROR.EQUIPMENT_LIABILITY_ALREADY_EXISTS,
        error: PHASE_C_ERROR.EQUIPMENT_LIABILITY_ALREADY_EXISTS,
      };
    }

    const loadPricing = deps?.loadPricing ?? requireAdminEquipmentPricingForLiability;
    const pricingLoad = await loadPricing();
    if (!pricingLoad.ok) {
      return {
        ok: false,
        code:
          pricingLoad.code === 'PRICING_UNAVAILABLE'
            ? PHASE_C_ERROR.PRICING_UNAVAILABLE
            : PHASE_C_ERROR.PRICING_INVALID,
        error: PHASE_C_ERROR_AR[
          pricingLoad.code === 'PRICING_UNAVAILABLE'
            ? 'PRICING_UNAVAILABLE'
            : 'PRICING_INVALID'
        ],
      };
    }

    const computed = computeLiabilityFields({
      securityPaidUpfront: gate.securityPaidUpfront,
      bagType: input.bagType,
      jacketHeld: input.jacketHeld,
      helmetHeld: input.helmetHeld,
      pricing: pricingLoad.snapshot,
    });

    const now = new Date().toISOString();
    const snap = computed.priceSnapshot;
    const issue: EquipmentLiabilityIssue = {
      equipmentIssueId: newIssueId(),
      riderCode: gate.riderCode,
      riderNameSnapshot: input.riderNameSnapshot.trim(),
      zoneSnapshot: input.zoneSnapshot.trim(),
      supervisorCodeSnapshot:
        input.supervisorCodeSnapshot.trim() || gate.finalAssignedSupervisorCode,
      supervisorNameSnapshot: input.supervisorNameSnapshot.trim(),
      issueDate: input.issueDate.trim(),
      activationDate: gate.activationDate,
      bagType: input.bagType,
      bagCostMilli: computed.bagCostMilli,
      shirtQty: computed.shirtQty,
      shirtCostMilli: computed.shirtCostMilli,
      securityFeeMilli: computed.securityFeeMilli,
      securityPaidUpfront: gate.securityPaidUpfront,
      originalLiabilityMilli: computed.originalLiabilityMilli,
      outstandingMilli: computed.outstandingMilli,
      amountDeductedMilli: computed.amountDeductedMilli,
      settlementPaidMilli: computed.settlementPaidMilli,
      installmentsCompleted: computed.installmentsCompleted,
      status: 'open',
      deliveryRowRef,
      jacketHeld: computed.jacketHeld,
      helmetHeld: computed.helmetHeld,
      createdAt: now,
      createdBy: actor.code,
      updatedAt: now,
      updatedBy: actor.code,
      installmentSchedule: computed.installmentSchedule,
      pricingSource: 'ADMIN_EQUIPMENT_PRICES',
      pricingCapturedAt: snap.capturedAt,
      snapMotorcycleBagMilli: snap.motorcycleBagMilli,
      snapBicycleBagMilli: snap.bicycleBagMilli,
      snapShirtUnitMilli: snap.shirtMilli,
    };

    if (deps?.appendIssue) {
      await deps.appendIssue(issue);
    } else {
      await ensureEquipmentLiabilitySheet();
      await appendToSheet(SHEET_EQUIPMENT_LIABILITY, [issueToRow(issue)]);
    }

    // Post-append uniqueness: if a twin row appeared, return the first by delivery ref.
    const after = await getByRef(deliveryRowRef);
    const finalIssue = after || issue;

    if (!deps?.skipAudit) {
      void appendAuditLog({
        domain: 'equipment',
        action: 'create_liability',
        entityType: 'equipment_issue',
        entityCode: finalIssue.equipmentIssueId,
        actorCode: actor.code,
        actorName: actor.name,
        after: {
          ...finalIssue,
          viaAdminOverride: gate.viaAdminOverride,
        },
      }).catch((err) => console.error('[equipmentLiability] audit create failed:', err));
    }

    return {
      ok: true,
      issue: finalIssue,
      created: !after || after.equipmentIssueId === issue.equipmentIssueId,
    };
  } finally {
    await locks.release();
  }
}

/**
 * Shirt-only swap liability (تبديل + paid shirts).
 * May coexist with an open assignment liability (does not use hasActiveEquipmentIssue).
 * Bag free; security not re-charged. Idempotent by deliveryRowRef.
 */
export async function createShirtSwapLiabilityFromDelivery(
  input: DeliveryLiabilityInput & { shirtQty: number },
  actor: { code: string; name: string },
  deps?: CreateLiabilityDeps
): Promise<
  | { ok: true; issue: EquipmentLiabilityIssue; created: boolean }
  | { ok: false; error: string; code: PhaseCErrorCode }
> {
  const deliveryRowRef = String(input.deliveryRowRef || '').trim();
  if (!deliveryRowRef) {
    return {
      ok: false,
      code: PHASE_C_ERROR.LIABILITY_CREATE_FAILED,
      error: 'معرّف صف التسليم مطلوب',
    };
  }

  const getByRef = deps?.getByDeliveryRowRef ?? getByDeliveryRowRef;
  const findCandidate = deps?.findCandidateByRiderCode ?? findCandidateByRiderCode;
  const acquireLocks = deps?.acquirePhaseCLiabilityLocks ?? acquirePhaseCLiabilityLocks;

  const existingByDelivery = await getByRef(deliveryRowRef);
  if (existingByDelivery) {
    return { ok: true, issue: existingByDelivery, created: false };
  }

  const gate = await resolvePhaseCGateForDelivery(input, findCandidate);
  if (!gate.ok) {
    return {
      ok: false,
      code: gate.code,
      error: gate.error,
    };
  }

  const shirtQty = Math.max(0, Math.trunc(input.shirtQty));
  if (shirtQty <= 0) {
    return {
      ok: false,
      code: PHASE_C_ERROR.LIABILITY_CREATE_FAILED,
      error: 'كمية التيشيرت للتبديل المدفوع يجب أن تكون > 0',
    };
  }

  const locks = await acquireLocks({
    deliveryRowRef,
    riderCode: gate.riderCode,
  });
  if (!locks.ok) {
    return {
      ok: false,
      code: PHASE_C_ERROR.LOCK_BUSY,
      error: PHASE_C_ERROR_AR.LOCK_BUSY,
    };
  }

  try {
    const againDelivery = await getByRef(deliveryRowRef);
    if (againDelivery) return { ok: true, issue: againDelivery, created: false };

    const loadPricing = deps?.loadPricing ?? requireAdminEquipmentPricingForLiability;
    const pricingLoad = await loadPricing();
    if (!pricingLoad.ok) {
      return {
        ok: false,
        code:
          pricingLoad.code === 'PRICING_UNAVAILABLE'
            ? PHASE_C_ERROR.PRICING_UNAVAILABLE
            : PHASE_C_ERROR.PRICING_INVALID,
        error: PHASE_C_ERROR_AR[
          pricingLoad.code === 'PRICING_UNAVAILABLE'
            ? 'PRICING_UNAVAILABLE'
            : 'PRICING_INVALID'
        ],
      };
    }

    const shirtUnitMilli = pricingLoad.snapshot.shirtMilli;
    const originalLiabilityMilli = shirtSwapOriginalMilli(shirtQty, shirtUnitMilli);
    if (originalLiabilityMilli <= 0) {
      return {
        ok: false,
        code: PHASE_C_ERROR.LIABILITY_CREATE_FAILED,
        error: 'كمية التيشيرت للتبديل المدفوع يجب أن تكون > 0',
      };
    }

    const schedule = splitInstallmentsMilliemes(originalLiabilityMilli, 3);
    const now = new Date().toISOString();
    const snap = pricingLoad.snapshot;
    const issue: EquipmentLiabilityIssue = {
      equipmentIssueId: newIssueId(),
      riderCode: gate.riderCode,
      riderNameSnapshot: input.riderNameSnapshot.trim(),
      zoneSnapshot: input.zoneSnapshot.trim(),
      supervisorCodeSnapshot:
        input.supervisorCodeSnapshot.trim() || gate.finalAssignedSupervisorCode,
      supervisorNameSnapshot: input.supervisorNameSnapshot.trim(),
      issueDate: input.issueDate.trim(),
      activationDate: gate.activationDate,
      bagType: input.bagType,
      bagCostMilli: 0,
      shirtQty,
      shirtCostMilli: originalLiabilityMilli,
      securityFeeMilli: 0,
      securityPaidUpfront: true,
      originalLiabilityMilli,
      outstandingMilli: originalLiabilityMilli,
      amountDeductedMilli: 0,
      settlementPaidMilli: 0,
      installmentsCompleted: 0,
      status: 'open',
      deliveryRowRef,
      jacketHeld: Boolean(input.jacketHeld),
      helmetHeld: Boolean(input.helmetHeld),
      createdAt: now,
      createdBy: actor.code,
      updatedAt: now,
      updatedBy: actor.code,
      installmentSchedule: schedule,
      pricingSource: 'ADMIN_EQUIPMENT_PRICES',
      pricingCapturedAt: snap.capturedAt,
      snapMotorcycleBagMilli: snap.motorcycleBagMilli,
      snapBicycleBagMilli: snap.bicycleBagMilli,
      snapShirtUnitMilli: snap.shirtMilli,
    };

    if (deps?.appendIssue) {
      await deps.appendIssue(issue);
    } else {
      await ensureEquipmentLiabilitySheet();
      await appendToSheet(SHEET_EQUIPMENT_LIABILITY, [issueToRow(issue)]);
    }

    const after = await getByRef(deliveryRowRef);
    const finalIssue = after || issue;

    if (!deps?.skipAudit) {
      void appendAuditLog({
        domain: 'equipment',
        action: 'create_shirt_swap_liability',
        entityType: 'equipment_issue',
        entityCode: finalIssue.equipmentIssueId,
        actorCode: actor.code,
        actorName: actor.name,
        after: finalIssue,
      }).catch((err) => console.error('[equipmentLiability] audit shirt swap failed:', err));
    }

    return {
      ok: true,
      issue: finalIssue,
      created: !after || after.equipmentIssueId === issue.equipmentIssueId,
    };
  } finally {
    await locks.release();
  }
}

/** Apply an installment deduction to the issue balance (mutates sheet row). */
export async function updateBalance(
  equipmentIssueId: string,
  deductionMilli: number,
  actor: { code: string; name: string },
  opts?: { incrementInstallment?: boolean }
): Promise<{ ok: true; issue: EquipmentLiabilityIssue } | { ok: false; error: string }> {
  const issue = await getById(equipmentIssueId);
  if (!issue || !issue.sheetRow) return { ok: false, error: 'issue not found' };

  const deduct = Math.max(0, Math.trunc(deductionMilli));
  const newDeducted = issue.amountDeductedMilli + deduct;
  const newOutstanding = Math.max(0, issue.outstandingMilli - deduct);
  // Partial payout must NOT advance installment index — remainder of the same
  // installment carries to the next eligible cycle.
  const shouldIncrement = opts?.incrementInstallment ?? deduct > 0;
  const newInstallments = issue.installmentsCompleted + (shouldIncrement ? 1 : 0);
  const newStatus: EquipmentLiabilityStatus =
    newOutstanding <= 0 && issue.status === 'open' ? 'settled' : issue.status;

  const now = new Date().toISOString();
  const updated = withImmutableOriginal(issue, {
    amountDeductedMilli: newDeducted,
    outstandingMilli: newOutstanding,
    installmentsCompleted: newInstallments,
    status: newStatus,
    updatedAt: now,
    updatedBy: actor.code,
  });

  await updateSheetRow(SHEET_EQUIPMENT_LIABILITY, issue.sheetRow, issueToRow(updated));

  void appendAuditLog({
    domain: 'equipment',
    action: 'update_liability_balance',
    entityType: 'equipment_issue',
    entityCode: equipmentIssueId,
    actorCode: actor.code,
    actorName: actor.name,
    before: issue,
    after: updated,
  }).catch((err) => console.error('[equipmentLiability] audit balance update failed:', err));

  return { ok: true, issue: updated };
}

/**
 * Apply a cash settlement payment without advancing installment index
 * (return settlement ≠ cycle installment).
 *
 * Settlement reduces outstanding and increments settlementPaidMilli only.
 * It must NOT inflate amountDeductedMilli (installment progress).
 * Overpayment is rejected (never clamped to outstanding).
 */
export async function applySettlementPayment(
  equipmentIssueId: string,
  paidMilli: number,
  actor: { code: string; name: string }
): Promise<{ ok: true; issue: EquipmentLiabilityIssue } | { ok: false; error: string }> {
  const issue = await getById(equipmentIssueId);
  if (!issue || !issue.sheetRow) return { ok: false, error: 'issue not found' };
  if (issue.status !== 'open') return { ok: false, error: 'issue not open' };

  if (!Number.isFinite(paidMilli)) {
    return { ok: false, error: 'EQUIPMENT_PAYMENT_INVALID_AMOUNT' };
  }
  const paid = Math.trunc(paidMilli);
  if (paid <= 0) {
    return { ok: false, error: 'EQUIPMENT_PAYMENT_INVALID_AMOUNT' };
  }
  if (paid > issue.outstandingMilli) {
    return { ok: false, error: 'EQUIPMENT_PAYMENT_EXCEEDS_OUTSTANDING' };
  }

  const newOutstanding = issue.outstandingMilli - paid;
  const newSettlementPaid = Math.max(0, (issue.settlementPaidMilli || 0) + paid);
  const newStatus: EquipmentLiabilityStatus =
    newOutstanding <= 0 ? 'settled' : issue.status;

  const now = new Date().toISOString();
  const updated = withImmutableOriginal(issue, {
    // Installment progress unchanged — settlement is not an installment payment.
    amountDeductedMilli: issue.amountDeductedMilli,
    settlementPaidMilli: newSettlementPaid,
    outstandingMilli: newOutstanding,
    status: newStatus,
    updatedAt: now,
    updatedBy: actor.code,
  });

  await updateSheetRow(SHEET_EQUIPMENT_LIABILITY, issue.sheetRow, issueToRow(updated));

  void appendAuditLog({
    domain: 'equipment',
    action: 'settlement_payment',
    entityType: 'equipment_issue',
    entityCode: equipmentIssueId,
    actorCode: actor.code,
    actorName: actor.name,
    before: issue,
    after: updated,
  }).catch((err) => console.error('[equipmentLiability] audit settlement payment failed:', err));

  return { ok: true, issue: updated };
}

/** Zero outstanding and mark issue waived (used by settlement approval). */
export async function markIssueWaived(
  equipmentIssueId: string,
  actor: { code: string; name: string }
): Promise<{ ok: true; issue: EquipmentLiabilityIssue } | { ok: false; error: string }> {
  const issue = await getById(equipmentIssueId);
  if (!issue || !issue.sheetRow) return { ok: false, error: 'issue not found' };

  const now = new Date().toISOString();
  const updated = withImmutableOriginal(issue, {
    outstandingMilli: 0,
    status: 'waived',
    updatedAt: now,
    updatedBy: actor.code,
  });

  await updateSheetRow(SHEET_EQUIPMENT_LIABILITY, issue.sheetRow, issueToRow(updated));

  void appendAuditLog({
    domain: 'equipment',
    action: 'waive_liability',
    entityType: 'equipment_issue',
    entityCode: equipmentIssueId,
    actorCode: actor.code,
    actorName: actor.name,
    before: issue,
    after: updated,
  }).catch((err) => console.error('[equipmentLiability] audit waive failed:', err));

  return { ok: true, issue: updated };
}

export async function listOpenLiabilityRiderCodesForSupervisor(supervisorCode: string): Promise<string[]> {
  const code = supervisorCode.trim();
  const open = await listOpenIssues();
  return [...new Set(open.filter((i) => i.supervisorCodeSnapshot === code).map((i) => i.riderCode))];
}

export async function hasActiveEquipmentIssue(riderCode: string): Promise<boolean> {
  const code = riderCode.trim();
  const open = await listOpenIssues();
  return open.some((i) => i.riderCode === code);
}
