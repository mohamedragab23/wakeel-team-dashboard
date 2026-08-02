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
import { redisSetNx, redisDel, isUpstashConfigured } from '@/lib/upstashRest';

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
  /**
   * Internal use only: `correctLedgerTransaction()` calls this function to
   * append the new "active" replacement row and already writes its own
   * `correct_transaction` audit entry covering that same row right after
   * -- set true there to avoid double-logging the same row as both
   * "created" and "corrected".
   */
  skipCreateAudit?: boolean;
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

  // Audit trail: log every genuinely new transaction (bonus/deduction/
  // advance/adjustment, whether ledger_native from the admin UI or an
  // automatic legacy_mirror). Skipped only for correctLedgerTransaction()'s
  // internal replacement-row append, which logs its own combined
  // before/after `correct_transaction` entry instead (see below).
  if (!params.skipCreateAudit) {
    void appendAuditLog({
      domain: 'payroll',
      action: 'create_transaction',
      entityType: transaction.entityType,
      entityCode: transaction.entityCode,
      actorCode: transaction.createdBy,
      actorName: transaction.createdByName,
      after: transaction,
    }).catch((err) => {
      // Fire-and-forget by design (must never block/fail the caller whose
      // financial write already succeeded), but an unhandled rejection here
      // would otherwise (a) surface as a silent audit gap -- we'd have no
      // record the log write failed -- and (b) on some Node/edge runtimes,
      // an unhandled promise rejection can crash the process. Always log so
      // the failure is at least visible in server logs.
      console.error('[payrollLedger] appendAuditLog(create_transaction) failed:', err);
      void recordMetric({ feature: 'audit_log', metric: 'api_failure', tags: { action: 'create_transaction' } });
    });
  }

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

const MUTATION_LOCK_PREFIX = 'payrollledger:lock:';
const MUTATION_LOCK_TTL_SECONDS = 15;

/**
 * `voidLedgerTransaction`/`correctLedgerTransaction` are both read-then-write
 * (`findLedgerTransactionById` then `setStatusCell`) with no atomic
 * compare-and-swap in Google Sheets. Without a lock, two near-simultaneous
 * requests for the *same* transactionId (an accidental UI double-submit, or
 * two admins acting on the same row at once) could both read `status:
 * 'active'` before either write lands, and both proceed -- e.g. two
 * concurrent corrections would each append their own replacement row from
 * the same original, double-counting the correction in the salary sum.
 * Guards against that with a short-lived, per-transactionId Redis lock
 * (fails open if Redis isn't configured, consistent with every other
 * optional-Redis usage in this codebase -- correctness here is
 * best-effort, not a hard guarantee, since this is a low-volume admin
 * action rather than a hot path).
 */
async function withLedgerMutationLock<T>(transactionId: string, fn: () => Promise<T>): Promise<T> {
  if (!isUpstashConfigured()) return fn();
  const lockKey = MUTATION_LOCK_PREFIX + transactionId;
  const gotLock = await redisSetNx(lockKey, '1', MUTATION_LOCK_TTL_SECONDS);
  if (!gotLock) {
    throw new Error('معاملة أخرى قيد التنفيذ على نفس السجل، حاول مرة أخرى بعد لحظات');
  }
  try {
    return await fn();
  } finally {
    await redisDel(lockKey);
  }
}

/** "Delete" — sets `status=voided` on that row only. No new row, no raw sheet-row deletion, ever. */
export async function voidLedgerTransaction(
  transactionId: string,
  actor: { code: string; name: string }
): Promise<{ success: true; transaction: LedgerTransaction } | { success: false; error: string }> {
  try {
    return await withLedgerMutationLock(transactionId, () => voidLedgerTransactionInner(transactionId, actor));
  } catch (err: any) {
    return { success: false, error: err?.message || 'تعذر تنفيذ العملية' };
  }
}

async function voidLedgerTransactionInner(
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
  }).catch((err) => {
    console.error('[payrollLedger] appendAuditLog(void_transaction) failed:', err);
    void recordMetric({ feature: 'audit_log', metric: 'api_failure', tags: { action: 'void_transaction' } });
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
  try {
    return await withLedgerMutationLock(transactionId, () =>
      correctLedgerTransactionInner(transactionId, updates, actor)
    );
  } catch (err: any) {
    return { success: false, error: err?.message || 'تعذر تنفيذ العملية' };
  }
}

async function correctLedgerTransactionInner(
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

  // From here on, the original row is already flipped to `corrected` (and so
  // excluded from every sum). If appending the replacement "active" row below
  // throws (Sheets write failure, quota, network blip, etc.) *without* any
  // compensation, the correction would be permanently lost mid-flight: the
  // original amount silently disappears from the ledger with nothing to
  // replace it -- a real orphan-data / money-vanishes bug, not just a failed
  // request. Guard against that by rolling the original row's status back to
  // `active` if the replacement append fails, so the two-step "flip + append"
  // behaves atomically from the caller's point of view: either both steps
  // land, or neither does.
  let corrected: LedgerTransaction;
  try {
    corrected = await appendLedgerTransaction({
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
      skipCreateAudit: true,
    });
  } catch (err) {
    const rolledBack = await setStatusCell(found.rowNumber, 'active').catch(() => false);
    console.error(
      `[payrollLedger] correctLedgerTransaction: replacement append failed after flipping ${found.transaction.transactionId} to 'corrected'. ` +
        `Rollback to 'active' ${rolledBack ? 'succeeded' : 'FAILED -- manual Sheets fix required for this row'}.`,
      err
    );
    void recordMetric({ feature: 'payroll_ledger', metric: 'api_failure', tags: { source: 'correct_rollback' } });
    return {
      success: false,
      error: rolledBack
        ? 'تعذر إتمام التعديل، تم التراجع تلقائيًا والمعاملة الأصلية ما زالت سارية. حاول مرة أخرى'
        : 'تعذر إتمام التعديل وفشل التراجع التلقائي أيضًا. راجع الدعم الفني فورًا قبل أي محاولة أخرى',
    };
  }

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
  }).catch((err) => {
    console.error('[payrollLedger] appendAuditLog(correct_transaction) failed:', err);
    void recordMetric({ feature: 'audit_log', metric: 'api_failure', tags: { action: 'correct_transaction' } });
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
