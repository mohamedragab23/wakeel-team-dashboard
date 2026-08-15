/**
 * SRS-013 Phase 0 — unified Audit Log helper.
 *
 * Writes to one new, net-new Google Sheets tab (`سجل_العمليات`), created
 * lazily and idempotently on first use via the existing, untouched
 * `ensureSheetExists()`. Used by Phases 1/3/4/5, not by Phase 0 itself —
 * Phase 0 only ships the helper and the (empty) tab.
 *
 * Zero impact on any existing tab: `ensureSheetExists`/`appendToSheet` are
 * called exactly as they already are elsewhere in the codebase, with a new
 * tab name — no signature change, no shared-state mutation of any kind.
 */
import { appendToSheet, ensureSheetExists } from '@/lib/googleSheets';
import { recordMetric } from '@/lib/telemetry';

export const AUDIT_LOG_SHEET_NAME = 'سجل_العمليات';

export const AUDIT_LOG_HEADERS = [
  'logId',
  'domain',
  'action',
  'entityType',
  'entityCode',
  'actorCode',
  'actorName',
  'beforeJson',
  'afterJson',
  'timestamp',
];

export type AuditLogDomain =
  | 'payroll'
  | 'rent'
  | 'rooster_import'
  | 'rider_data'
  | 'equipment'
  | 'recruitment'
  | 'payout_cycles'
  | 'auth';

// `ensureSheetExists` is already idempotent server-side (checks metadata
// before creating), but this in-process guard avoids one extra Sheets API
// round-trip per call within the same warm serverless instance.
let ensuredOnce = false;

async function ensureAuditLogSheet(): Promise<void> {
  if (ensuredOnce) return;
  await ensureSheetExists(AUDIT_LOG_SHEET_NAME, AUDIT_LOG_HEADERS);
  ensuredOnce = true;
}

function newLogId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `log_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/**
 * Appends one immutable row to the unified audit log. Frozen signature
 * per SRS013_DESIGN_FREEZE.md, Phase 0 §3.
 *
 * Also records an `audit_event` telemetry sample (SRS-013 §13) —
 * fire-and-forget, never blocks or fails the caller.
 */
export async function appendAuditLog(entry: {
  domain: AuditLogDomain;
  action: string;
  entityType: string;
  entityCode: string;
  actorCode: string;
  actorName: string;
  before?: unknown;
  after?: unknown;
}): Promise<void> {
  await ensureAuditLogSheet();

  const row = [
    newLogId(),
    entry.domain,
    entry.action,
    entry.entityType,
    entry.entityCode,
    entry.actorCode,
    entry.actorName,
    entry.before !== undefined ? JSON.stringify(entry.before) : '',
    entry.after !== undefined ? JSON.stringify(entry.after) : '',
    new Date().toISOString(),
  ];

  await appendToSheet(AUDIT_LOG_SHEET_NAME, [row]);

  void recordMetric({
    feature: 'audit_log',
    metric: 'audit_event',
    tags: { domain: entry.domain, action: entry.action },
  });
}
