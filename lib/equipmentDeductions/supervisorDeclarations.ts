/**
 * Supervisor cycle-scoped payment declarations (authoritative operational evidence).
 * Sheet: إقرارات_سداد_معدات_مشرف
 */
import {
  appendToSheet,
  ensureHeaderRow,
  ensureSheetExists,
  getSheetDataOrThrow,
} from '@/lib/googleSheets';
import { appendAuditLog } from '@/lib/auditLog';
import {
  declaredPaidFromStatus,
  normalizeRiderCodeKey,
  validateDeclaredPaid,
  type SupervisorPaymentStatus,
} from '@/lib/equipmentDeductions/equipmentFinancialModel';
import { applySettlementPayment, getById, listIssues } from '@/lib/equipmentLiability/store';
import { normalizeSupervisorCodeForMatch } from '@/lib/dataFilter';
import { getSupervisorRiders } from '@/lib/dataService';
import type { PayoutCycle } from '@/lib/payoutCycles/types';
import {
  ARABIC_MONTH_NAMES,
  DEDUCTION_CYCLE_LABELS,
  type DeductionCycleKey,
} from '@/lib/equipmentSheetConstants';

function cycleLabelForPayout(cycle: PayoutCycle): string {
  if (cycle.isClosing) return DEDUCTION_CYCLE_LABELS.closing;
  const keys: DeductionCycleKey[] = ['first', 'second', 'third', 'fourth'];
  const key = keys[Math.max(0, Math.trunc(cycle.cycleNumber) - 1)];
  return key ? DEDUCTION_CYCLE_LABELS[key] : '';
}

function monthLabelForPayout(cycle: PayoutCycle): string {
  const m = Math.trunc(cycle.month);
  if (m < 1 || m > 12) return '';
  return ARABIC_MONTH_NAMES[m - 1];
}

export const SHEET_SUPERVISOR_EQUIPMENT_DECLARATIONS = 'إقرارات_سداد_معدات_مشرف';

export const SUPERVISOR_EQUIPMENT_DECLARATION_HEADERS = [
  'declarationId',
  'riderCode',
  'riderName',
  'supervisorCode',
  'supervisorName',
  'cycleId',
  'cycleLabel',
  'monthLabel',
  'year',
  'paymentStatus',
  'declaredPaidMilli',
  'originalLiabilityMilli',
  'notes',
  'createdAt',
  'supersedesDeclarationId',
] as const;

export type SupervisorEquipmentDeclaration = {
  declarationId: string;
  riderCode: string;
  riderName: string;
  supervisorCode: string;
  supervisorName: string;
  cycleId: string;
  cycleLabel: string;
  monthLabel: string;
  year: number;
  paymentStatus: SupervisorPaymentStatus;
  declaredPaidMilli: number;
  originalLiabilityMilli: number;
  notes: string;
  createdAt: string;
  supersedesDeclarationId: string;
  sheetRow?: number;
};

function cell(row: unknown[], i: number): string {
  return String(row[i] ?? '').trim();
}

function newDeclarationId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `sed_${crypto.randomUUID()}`;
  }
  return `sed_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

async function ensureDeclarationsSheet(): Promise<void> {
  await ensureSheetExists(SHEET_SUPERVISOR_EQUIPMENT_DECLARATIONS, [
    ...SUPERVISOR_EQUIPMENT_DECLARATION_HEADERS,
  ]);
  await ensureHeaderRow(SHEET_SUPERVISOR_EQUIPMENT_DECLARATIONS, [
    ...SUPERVISOR_EQUIPMENT_DECLARATION_HEADERS,
  ]);
}

function rowToDeclaration(row: unknown[], sheetRow: number): SupervisorEquipmentDeclaration | null {
  const id = cell(row, 0);
  if (!id) return null;
  const statusRaw = cell(row, 9);
  const status = (
    ['NOT_PAID', 'PARTIALLY_PAID', 'FULLY_PAID'].includes(statusRaw)
      ? statusRaw
      : 'NOT_PAID'
  ) as SupervisorPaymentStatus;
  return {
    declarationId: id,
    riderCode: cell(row, 1),
    riderName: cell(row, 2),
    supervisorCode: cell(row, 3),
    supervisorName: cell(row, 4),
    cycleId: cell(row, 5),
    cycleLabel: cell(row, 6),
    monthLabel: cell(row, 7),
    year: Math.trunc(Number(cell(row, 8)) || 0),
    paymentStatus: status,
    declaredPaidMilli: Math.trunc(Number(cell(row, 10)) || 0),
    originalLiabilityMilli: Math.trunc(Number(cell(row, 11)) || 0),
    notes: cell(row, 12),
    createdAt: cell(row, 13),
    supersedesDeclarationId: cell(row, 14),
    sheetRow,
  };
}

function declarationToRow(d: SupervisorEquipmentDeclaration): unknown[] {
  return [
    d.declarationId,
    d.riderCode,
    d.riderName,
    d.supervisorCode,
    d.supervisorName,
    d.cycleId,
    d.cycleLabel,
    d.monthLabel,
    d.year,
    d.paymentStatus,
    d.declaredPaidMilli,
    d.originalLiabilityMilli,
    d.notes,
    d.createdAt,
    d.supersedesDeclarationId,
  ];
}

export async function listSupervisorEquipmentDeclarations(filters?: {
  supervisorCode?: string;
  riderCode?: string;
  cycleId?: string;
}): Promise<SupervisorEquipmentDeclaration[]> {
  await ensureDeclarationsSheet();
  const data = await getSheetDataOrThrow(SHEET_SUPERVISOR_EQUIPMENT_DECLARATIONS, false);
  const out: SupervisorEquipmentDeclaration[] = [];
  for (let i = 1; i < data.length; i++) {
    const d = rowToDeclaration(data[i] || [], i + 1);
    if (!d) continue;
    if (
      filters?.supervisorCode &&
      normalizeSupervisorCodeForMatch(d.supervisorCode) !==
        normalizeSupervisorCodeForMatch(filters.supervisorCode)
    ) {
      continue;
    }
    if (
      filters?.riderCode &&
      normalizeRiderCodeKey(d.riderCode) !== normalizeRiderCodeKey(filters.riderCode)
    ) {
      continue;
    }
    if (filters?.cycleId && d.cycleId !== filters.cycleId) continue;
    out.push(d);
  }
  return out;
}

/** Latest declaration per rider+cycle (by createdAt). */
export function latestDeclarationsByRiderCycle(
  declarations: SupervisorEquipmentDeclaration[]
): Map<string, SupervisorEquipmentDeclaration> {
  const map = new Map<string, SupervisorEquipmentDeclaration>();
  for (const d of declarations) {
    const key = `${normalizeRiderCodeKey(d.riderCode)}|${d.cycleId}`;
    const prev = map.get(key);
    if (!prev || String(d.createdAt) >= String(prev.createdAt)) {
      map.set(key, d);
    }
  }
  return map;
}

export async function createSupervisorEquipmentDeclaration(input: {
  riderCode: string;
  riderName: string;
  supervisorCode: string;
  supervisorName: string;
  cycle: PayoutCycle;
  paymentStatus: SupervisorPaymentStatus;
  declaredPaidEgp?: number | null;
  notes?: string;
  equipmentIssueId?: string;
  /** When true, sync settlementPaid on liability to match declaration. */
  applyToLiability?: boolean;
}): Promise<
  | { ok: true; declaration: SupervisorEquipmentDeclaration }
  | { ok: false; error: string }
> {
  const riderCode = String(input.riderCode || '').trim();
  if (!riderCode) return { ok: false, error: 'كود المندوب مطلوب' };

  const riders = await getSupervisorRiders(input.supervisorCode, false);
  const want = normalizeRiderCodeKey(riderCode);
  const onRoster = riders.some((r) => normalizeRiderCodeKey(r.code) === want);
  if (!onRoster) return { ok: false, error: 'المندوب غير تابع لك' };

  let originalMilli = 0;
  let issueId = String(input.equipmentIssueId || '').trim();
  if (issueId) {
    const issue = await getById(issueId);
    if (!issue) return { ok: false, error: 'عهدة المعدات غير موجودة' };
    originalMilli = issue.originalLiabilityMilli;
  } else {
    const issues = await listIssues({ riderCode });
    const open = issues.find((i) => i.status === 'open') || issues[0];
    if (open) {
      originalMilli = open.originalLiabilityMilli;
      issueId = open.equipmentIssueId;
    }
  }
  if (originalMilli <= 0) {
    return { ok: false, error: 'لا توجد عهدة معدات مسجّلة لهذا المندوب' };
  }

  const validated = validateDeclaredPaid({
    status: input.paymentStatus,
    declaredPaidEgp: input.declaredPaidEgp,
    originalLiabilityMilli: originalMilli,
  });
  if (!validated.ok) return { ok: false, error: validated.error };

  const paidMilli = declaredPaidFromStatus({
    status: input.paymentStatus,
    declaredPaidMilli: validated.paidMilli,
    originalLiabilityMilli: originalMilli,
  });

  const prior = await listSupervisorEquipmentDeclarations({
    supervisorCode: input.supervisorCode,
    riderCode,
    cycleId: input.cycle.cycleId,
  });
  const latest = latestDeclarationsByRiderCycle(prior).get(
    `${want}|${input.cycle.cycleId}`
  );

  const declaration: SupervisorEquipmentDeclaration = {
    declarationId: newDeclarationId(),
    riderCode,
    riderName: input.riderName,
    supervisorCode: input.supervisorCode,
    supervisorName: input.supervisorName,
    cycleId: input.cycle.cycleId,
    cycleLabel: cycleLabelForPayout(input.cycle),
    monthLabel: monthLabelForPayout(input.cycle),
    year: input.cycle.year,
    paymentStatus: input.paymentStatus,
    declaredPaidMilli: paidMilli,
    originalLiabilityMilli: originalMilli,
    notes: String(input.notes || '').trim(),
    createdAt: new Date().toISOString(),
    supersedesDeclarationId: latest?.declarationId || '',
  };

  await ensureDeclarationsSheet();
  const ok = await appendToSheet(
    SHEET_SUPERVISOR_EQUIPMENT_DECLARATIONS,
    [declarationToRow(declaration)],
    false
  );
  if (!ok) return { ok: false, error: 'فشل حفظ الإقرار' };

  void appendAuditLog({
    domain: 'equipment',
    action: 'supervisor_equipment_declaration',
    entityType: 'equipment_declaration',
    entityCode: declaration.declarationId,
    actorCode: input.supervisorCode,
    actorName: input.supervisorName,
    after: {
      riderCode,
      cycleId: input.cycle.cycleId,
      paymentStatus: input.paymentStatus,
      declaredPaidMilli: paidMilli,
    },
  }).catch(() => undefined);

  if (input.applyToLiability !== false && issueId) {
    const issue = await getById(issueId);
    if (issue) {
      const targetSettlement = paidMilli;
      const delta = targetSettlement - (issue.settlementPaidMilli || 0);
      if (delta > 0) {
        await applySettlementPayment(issueId, delta, {
          code: input.supervisorCode,
          name: input.supervisorName,
        });
      } else if (input.paymentStatus === 'FULLY_PAID' && issue.outstandingMilli > 0) {
        await applySettlementPayment(issueId, issue.outstandingMilli, {
          code: input.supervisorCode,
          name: input.supervisorName,
        });
      }
    }
  }

  return { ok: true, declaration };
}

export function mapUiStatusToSupervisor(
  ui: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID'
): SupervisorPaymentStatus {
  if (ui === 'PAID') return 'FULLY_PAID';
  if (ui === 'PARTIALLY_PAID') return 'PARTIALLY_PAID';
  return 'NOT_PAID';
}
