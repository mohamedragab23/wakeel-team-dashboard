/**
 * SRS-013 Phase 3 — Payroll Ledger + Permanent Financial History.
 *
 * New, append-only Google Sheets tab (`سجل_المعاملات_المالية`). Rows are
 * never updated or deleted after creation — the single exception is the
 * `status` cell (col L), which is the only cell ever mutated in-place, and
 * only forward (`active` -> `corrected`/`voided`, never back). This is how
 * "edit"/"delete" are expressed without ever destroying a financial record
 * (SRS013_DESIGN_FREEZE.md Phase 3 §2).
 *
 * Zero impact on any existing tab: `الخصومات`, `السلف`, `خصومات_الإدارة`,
 * `الأهداف`, `إعدادات_الرواتب` keep their exact current schema/behavior.
 * This module only ever reads/writes the new tab.
 */
import { appendToSheet, ensureSheetExists, getSheetData, updateSheetRange } from '@/lib/googleSheets';
import { appendAuditLog } from '@/lib/auditLog';
import { recordMetric } from '@/lib/telemetry';

export const PAYROLL_LEDGER_SHEET_NAME = 'سجل_المعاملات_المالية';

export const PAYROLL_LEDGER_HEADERS = [
  'transactionId',
  'entityType',
  'entityCode',
  'entityNameSnapshot',
  'type',
  'amount',
  'reason',
  'period',
  'createdBy',
  'createdByName',
  'createdAt',
  'status',
  'correctsTransactionId',
  'source',
];

export type LedgerEntityType = 'rider' | 'supervisor';
export type LedgerTransactionType = 'bonus' | 'deduction' | 'advance' | 'adjustment';
export type LedgerStatus = 'active' | 'voided' | 'corrected';
export type LedgerSource = 'ledger_native' | 'legacy_mirror';

export type LedgerTransaction = {
  transactionId: string;
  entityType: LedgerEntityType;
  entityCode: string;
  entityNameSnapshot: string;
  type: LedgerTransactionType;
  /** Signed — bonus/adjustment-as-entered are positive-by-convention, deduction/advance are stored negative. */
  amount: number;
  reason: string;
  period: string; // YYYY-MM
  createdBy: string;
  createdByName: string;
  createdAt: string;
  status: LedgerStatus;
  correctsTransactionId: string;
  source: LedgerSource;
};

let ensuredOnce = false;

async function ensureLedgerSheet(): Promise<void> {
  if (ensuredOnce) return;
  await ensureSheetExists(PAYROLL_LEDGER_SHEET_NAME, PAYROLL_LEDGER_HEADERS);
  ensuredOnce = true;
}

function newTransactionId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `txn_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/**
 * Sign convention (frozen): the admin always enters a positive magnitude
 * (except `adjustment`, entered signed as-is since it's a free-form manual
 * correction). Storing the *signed* value in column F means the salary
 * step below is a trivial sum — no per-type branching needed at read time.
 */
export function computeSignedAmount(type: LedgerTransactionType, rawAmount: number): number {
  const magnitude = Math.abs(rawAmount);
  switch (type) {
    case 'bonus':
      return magnitude;
    case 'deduction':
    case 'advance':
      return -magnitude;
    case 'adjustment':
      return rawAmount; // entered signed, used as-is
    default:
      return rawAmount;
  }
}

function rowToTransaction(row: unknown[]): LedgerTransaction | null {
  const transactionId = String(row[0] ?? '').trim();
  if (!transactionId) return null;
  return {
    transactionId,
    entityType: (String(row[1] ?? '').trim() as LedgerEntityType) || 'supervisor',
    entityCode: String(row[2] ?? '').trim(),
    entityNameSnapshot: String(row[3] ?? '').trim(),
    type: (String(row[4] ?? '').trim() as LedgerTransactionType) || 'adjustment',
    amount: Number(row[5] ?? 0) || 0,
    reason: String(row[6] ?? '').trim(),
    period: String(row[7] ?? '').trim(),
    createdBy: String(row[8] ?? '').trim(),
    createdByName: String(row[9] ?? '').trim(),
    createdAt: String(row[10] ?? '').trim(),
    status: (String(row[11] ?? '').trim() as LedgerStatus) || 'active',
    correctsTransactionId: String(row[12] ?? '').trim(),
    source: (String(row[13] ?? '').trim() as LedgerSource) || 'ledger_native',
  };
}

function transactionToRow(t: LedgerTransaction): unknown[] {
  return [
    t.transactionId,
    t.entityType,
    t.entityCode,
    t.entityNameSnapshot,
    t.type,
    t.amount,
    t.reason,
    t.period,
    t.createdBy,
    t.createdByName,
    t.createdAt,
    t.status,
    t.correctsTransactionId,
    t.source,
  ];
}

/** Appends one immutable ledger row. Used by both the native Payroll API and the legacy-mirror side-effect. */
export async function appendLedgerTransaction(params: {
  entityType: LedgerEntityType;
  entityCode: string;
  entityNameSnapshot: string;
  type: LedgerTransactionType;
  rawAmount: number;
  reason: string;
  period: string;
  createdBy: string;
  createdByName: string;
  source: LedgerSource;
  correctsTransactionId?: string;
}): Promise<LedgerTransaction> {
  await ensureLedgerSheet();

  const transaction: LedgerTransaction = {
    transactionId: newTransactionId(),
    entityType: params.entityType,
    entityCode: params.entityCode.trim(),
    entityNameSnapshot: params.entityNameSnapshot.trim(),
    type: params.type,
    amount: computeSignedAmount(params.type, params.rawAmount),
    reason: params.reason.trim() || (params.type === 'deduction' ? 'خصم إداري' : ''),
    period: params.period.trim(),
    createdBy: params.createdBy.trim(),
    createdByName: params.createdByName.trim(),
    createdAt: new Date().toISOString(),
    status: 'active',
    correctsTransactionId: params.correctsTransactionId ?? '',
    source: params.source,
  };

  await appendToSheet(PAYROLL_LEDGER_SHEET_NAME, [transactionToRow(transaction)]);

  void recordMetric({
    feature: 'payroll_ledger',
    metric: 'audit_event',
    tags: { type: transaction.type, source: transaction.source },
  });

  return transaction;
}

/** Reads the full ledger (small enough to scan in one shot at this org's scale, same pattern as every other Sheets-backed list in this codebase). */
async function readAllLedgerRows(): Promise<{ rowNumber: number; transaction: LedgerTransaction }[]> {
  await ensureLedgerSheet();
  const data = await getSheetData(PAYROLL_LEDGER_SHEET_NAME, false);
  const out: { rowNumber: number; transaction: LedgerTransaction }[] = [];
  for (let i = 1; i < data.length; i++) {
    const transaction = rowToTransaction(data[i]);
    if (!transaction) continue;
    out.push({ rowNumber: i + 1, transaction }); // 1-based sheet row number
  }
  return out;
}

export async function getLedgerTransactions(filters?: {
  entityCode?: string;
  entityType?: LedgerEntityType;
  period?: string;
}): Promise<LedgerTransaction[]> {
  const rows = await readAllLedgerRows();
  return rows
    .map((r) => r.transaction)
    .filter((t) => {
      if (filters?.entityCode && t.entityCode !== filters.entityCode.trim()) return false;
      if (filters?.entityType && t.entityType !== filters.entityType) return false;
      if (filters?.period && t.period !== filters.period.trim()) return false;
      return true;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function findLedgerTransactionById(
  transactionId: string
): Promise<{ rowNumber: number; transaction: LedgerTransaction } | null> {
  const rows = await readAllLedgerRows();
  return rows.find((r) => r.transaction.transactionId === transactionId) ?? null;
}

/** Mutates only the `status` cell (col L) — never touches any other column, per the frozen append-only design. */
async function setStatusCell(rowNumber: number, status: LedgerStatus): Promise<boolean> {
  return updateSheetRange(PAYROLL_LEDGER_SHEET_NAME, `L${rowNumber}:L${rowNumber}`, [[status]]);
}

/** "Delete" — sets `status=voided` on that row only. No new row, no raw sheet-row deletion, ever. */
export async function voidLedgerTransaction(
  transactionId: string,
  actor: { code: string; name: string }
): Promise<{ success: true; transaction: LedgerTransaction } | { success: false; error: string }> {
  const found = await findLedgerTransactionById(transactionId);
  if (!found) return { success: false, error: 'المعاملة غير موجودة' };
  if (found.transaction.status !== 'active') {
    return { success: false, error: 'لا يمكن حذف معاملة ملغاة أو معدَّلة مسبقًا' };
  }
  const ok = await setStatusCell(found.rowNumber, 'voided');
  if (!ok) return { success: false, error: 'تعذر تحديث حالة المعاملة' };

  void appendAuditLog({
    domain: 'payroll',
    action: 'void_transaction',
    entityType: found.transaction.entityType,
    entityCode: found.transaction.entityCode,
    actorCode: actor.code,
    actorName: actor.name,
    before: found.transaction,
    after: { ...found.transaction, status: 'voided' },
  });

  return { success: true, transaction: { ...found.transaction, status: 'voided' } };
}

/**
 * "Edit" — the original row's `status` flips to `corrected` (excluded from
 * every sum from that point on) and a brand-new `active` row is appended
 * with the new amount/reason and `correctsTransactionId` pointing back at
 * the original. Never overwrites the original amount/reason in-place.
 */
export async function correctLedgerTransaction(
  transactionId: string,
  updates: { amount: number; reason: string },
  actor: { code: string; name: string }
): Promise<
  | { success: true; original: LedgerTransaction; corrected: LedgerTransaction }
  | { success: false; error: string }
> {
  const found = await findLedgerTransactionById(transactionId);
  if (!found) return { success: false, error: 'المعاملة غير موجودة' };
  if (found.transaction.status !== 'active') {
    return { success: false, error: 'لا يمكن تعديل معاملة ملغاة أو معدَّلة مسبقًا' };
  }

  const ok = await setStatusCell(found.rowNumber, 'corrected');
  if (!ok) return { success: false, error: 'تعذر تحديث حالة المعاملة الأصلية' };

  const corrected = await appendLedgerTransaction({
    entityType: found.transaction.entityType,
    entityCode: found.transaction.entityCode,
    entityNameSnapshot: found.transaction.entityNameSnapshot,
    type: found.transaction.type,
    rawAmount: updates.amount,
    reason: updates.reason || found.transaction.reason,
    period: found.transaction.period,
    createdBy: actor.code,
    createdByName: actor.name,
    source: 'ledger_native',
    correctsTransactionId: found.transaction.transactionId,
  });

  const original = { ...found.transaction, status: 'corrected' as LedgerStatus };

  void appendAuditLog({
    domain: 'payroll',
    action: 'correct_transaction',
    entityType: found.transaction.entityType,
    entityCode: found.transaction.entityCode,
    actorCode: actor.code,
    actorName: actor.name,
    before: original,
    after: corrected,
  });

  return { success: true, original, corrected };
}

/**
 * The additive salary-calculation step (SRS013_DESIGN_FREEZE.md Phase 3
 * §3): sums *only* `source='ledger_native'` AND `status='active'` rows for
 * one supervisor + one YYYY-MM period. `legacy_mirror` rows are always
 * excluded here (they're already counted by the untouched
 * `خصومات_الإدارة` sheet math in `salaryService.ts`) — this is the frozen
 * double-counting guard. Excluding non-`active` status also transparently
 * handles corrections/voids: a `corrected` original and a `voided` row are
 * simply not summed, no chain-following logic needed.
 */
export async function sumLedgerNativeForEntityPeriod(
  entityType: LedgerEntityType,
  entityCode: string,
  period: string
): Promise<{ total: number; transactions: LedgerTransaction[] }> {
  const all = await getLedgerTransactions({ entityCode, entityType, period });
  const counted = all.filter((t) => t.source === 'ledger_native' && t.status === 'active');
  const total = counted.reduce((sum, t) => sum + t.amount, 0);
  return { total, transactions: all };
}

/**
 * Fire-and-forget mirror for the existing, untouched `خصومات_الإدارة`
 * create-deduction flow (SRS013_DESIGN_FREEZE.md Phase 3 §2/§3). Must
 * never throw into the caller — same pattern as `sendAdminTelegramNotificationSafe`.
 */
export async function mirrorLegacyAdminDeduction(params: {
  supervisorCode: string;
  supervisorName: string;
  dateStr: string;
  reason: string;
  amount: number;
  createdBy: string;
  createdByName: string;
}): Promise<void> {
  try {
    const period = derivePeriodFromLegacyDateStr(params.dateStr);
    await appendLedgerTransaction({
      entityType: 'supervisor',
      entityCode: params.supervisorCode,
      entityNameSnapshot: params.supervisorName,
      type: 'deduction',
      rawAmount: params.amount,
      reason: params.reason,
      period,
      createdBy: params.createdBy,
      createdByName: params.createdByName,
      source: 'legacy_mirror',
    });
  } catch (err) {
    console.error('[payrollLedger] mirrorLegacyAdminDeduction failed (non-fatal, primary write already succeeded):', err);
    void recordMetric({ feature: 'payroll_ledger', metric: 'api_failure', tags: { source: 'legacy_mirror' } });
  }
}

/** خصومات_الإدارة's `date` column is free-form (exact date, or a bare month number) — normalize to YYYY-MM for the ledger's period column. */
function derivePeriodFromLegacyDateStr(dateStr: string): string {
  const s = dateStr.trim();
  const isoMatch = s.match(/^(\d{4})-(\d{2})-\d{2}/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}`;
  const slashMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slashMatch) {
    const year = slashMatch[3];
    const month = slashMatch[1].padStart(2, '0'); // best-effort M/D/Y, matches salaryService's own parsing convention
    return `${year}-${month}`;
  }
  const now = new Date();
  const bareMonth = parseInt(s, 10);
  if (Number.isFinite(bareMonth) && bareMonth >= 1 && bareMonth <= 12) {
    return `${now.getFullYear()}-${String(bareMonth).padStart(2, '0')}`;
  }
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
