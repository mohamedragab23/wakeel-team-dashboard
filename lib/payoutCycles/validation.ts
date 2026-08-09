import type { PayoutCycle, PayoutCycleInput, PayoutCycleStatus } from './types';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidIsoDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function parseBoolCell(v: unknown, defaultValue = false): boolean {
  const s = String(v ?? '')
    .trim()
    .toLowerCase();
  if (!s) return defaultValue;
  return s === 'true' || s === '1' || s === 'yes' || s === 'نعم';
}

export type CycleValidationError = { field?: string; message: string };

/**
 * Pure validation for create/update (does not mutate).
 * `existing` = other cycles in the same year/month (excluding the one being edited).
 */
export function validatePayoutCycleInput(
  input: PayoutCycleInput,
  existing: Pick<
    PayoutCycle,
    'cycleId' | 'year' | 'month' | 'cycleNumber' | 'startDate' | 'endDate' | 'isClosing' | 'status'
  >[],
  opts?: { editingCycleId?: string }
): CycleValidationError[] {
  const errors: CycleValidationError[] = [];
  const year = Number(input.year);
  const month = Number(input.month);
  const cycleNumber = Number(input.cycleNumber);

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    errors.push({ field: 'year', message: 'year must be a valid calendar year' });
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    errors.push({ field: 'month', message: 'month must be 1–12' });
  }
  if (!Number.isInteger(cycleNumber) || cycleNumber < 1) {
    errors.push({ field: 'cycleNumber', message: 'cycleNumber must be >= 1' });
  }

  for (const f of ['startDate', 'endDate', 'payoutDate', 'deductionGenerationDate'] as const) {
    if (!isValidIsoDate(String(input[f] || ''))) {
      errors.push({ field: f, message: `${f} must be YYYY-MM-DD` });
    }
  }

  if (isValidIsoDate(input.startDate) && isValidIsoDate(input.endDate) && input.startDate > input.endDate) {
    errors.push({ field: 'endDate', message: 'startDate must be <= endDate' });
  }

  const status = (input.status || 'draft') as PayoutCycleStatus;
  if (!['draft', 'active', 'finalized'].includes(status)) {
    errors.push({ field: 'status', message: 'status must be draft|active|finalized' });
  }

  const peers = existing.filter((c) => {
    if (opts?.editingCycleId && c.cycleId === opts.editingCycleId) return false;
    return c.year === year && c.month === month;
  });

  if (peers.some((c) => c.cycleNumber === cycleNumber)) {
    errors.push({ field: 'cycleNumber', message: 'cycleNumber must be unique within year/month' });
  }

  if (isValidIsoDate(input.startDate) && isValidIsoDate(input.endDate)) {
    for (const p of peers) {
      if (!(input.endDate < p.startDate || input.startDate > p.endDate)) {
        errors.push({
          field: 'startDate',
          message: `date range overlaps cycle ${p.cycleId} (${p.startDate}–${p.endDate})`,
        });
        break;
      }
    }
  }

  const isClosing = Boolean(input.isClosing);
  const closingPeers = peers.filter((c) => c.isClosing);
  if (isClosing && closingPeers.length > 0) {
    errors.push({ field: 'isClosing', message: 'only one closing cycle allowed per year/month' });
  }

  if (isClosing && isValidIsoDate(input.endDate)) {
    const later = peers.filter((c) => c.endDate > input.endDate);
    if (later.length > 0) {
      errors.push({
        field: 'isClosing',
        message: 'closing cycle must be the last by endDate within the month',
      });
    }
  }

  if (!isClosing) {
    const closing = peers.find((c) => c.isClosing);
    if (closing && isValidIsoDate(input.endDate) && input.endDate > closing.endDate) {
      errors.push({
        field: 'endDate',
        message: 'non-closing cycle cannot end after the closing cycle',
      });
    }
  }

  return errors;
}

export function assertCanMutateCycle(
  cycle: Pick<PayoutCycle, 'status'>,
  opts?: { allowFinalizedCorrection?: boolean }
): CycleValidationError | null {
  if (cycle.status === 'finalized' && !opts?.allowFinalizedCorrection) {
    return {
      field: 'status',
      message: 'finalized cycles cannot be silently edited; use explicit correction',
    };
  }
  return null;
}
