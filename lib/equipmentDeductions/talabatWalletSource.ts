/**
 * Talabat Wallet / Salaries file — EXTERNAL RESULT source mapping.
 *
 * Confirmed business columns (do not invent alternate Actual sources):
 * - REQUESTED_AMOUNT  = `3Pl Internal Deductions`
 * - ACTUAL_AMOUNT     = `Applaied Deduction on Wallet`  ← only this reduces liability
 *
 * Spelling `Applaied` is intentional (source file). Internal field:
 * actualWalletDeductionMilli — mapping must stay explicit.
 *
 * NEVER use as Actual: Net Salary, Net After Deduction, Salaries Compensation,
 * Expected, Requested, or 3Pl Internal Deductions.
 */

import { egpToMilliemes } from '@/lib/money';
import { normalizeDeductionHeader } from '@/lib/deductionsReconcile';

/** Exact source labels as they appear (or alias) in Talabat wallet Excel. */
export const TALABAT_WALLET_SOURCE_COLUMNS = {
  riderId: 'Rider ID',
  /** REQUESTED — what we uploaded / asked Talabat to deduct. */
  requested: '3Pl Internal Deductions',
  /** ACTUAL — what Talabat executed on the wallet. Spelling is source-accurate. */
  actual: 'Applaied Deduction on Wallet',
} as const;

export const TALABAT_WALLET_REQUESTED_ALIASES = [
  '3pl internal deductions',
  '3pl_internal_deductions',
  '3Pl Internal Deductions',
] as const;

export const TALABAT_WALLET_ACTUAL_ALIASES = [
  'applaied deduction on wallet',
  'applied deduction on wallet',
  'applaied_deduction_on_wallet',
  'applied_deduction_on_wallet',
  'Applaied Deduction on Wallet',
] as const;

export const TALABAT_WALLET_RIDER_ALIASES = ['rider id', 'rider_id', 'Rider ID'] as const;

/** Columns that must NEVER be used as Actual. */
export const TALABAT_WALLET_FORBIDDEN_ACTUAL_COLUMNS = [
  '3Pl Internal Deductions',
  'Net Salary',
  'Net After Deduction',
  'Salaries Compensation',
  'Salaries',
  'Deduction',
] as const;

function parseMoney(v: unknown): number {
  if (v === undefined || v === null || v === '') return NaN;
  const s = String(v).replace(/,/g, '').replace(/[^\d.-]/g, '');
  if (s === '' || s === '-') return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function buildNormToOriginal(obj: Record<string, unknown>): Record<string, string> {
  const m: Record<string, string> = {};
  for (const k of Object.keys(obj)) {
    m[normalizeDeductionHeader(k)] = k;
  }
  return m;
}

function pickField(
  norm: Record<string, string>,
  obj: Record<string, unknown>,
  aliases: readonly string[]
): { value: string; matchedSourceHeader: string | null } {
  for (const a of aliases) {
    const nk = normalizeDeductionHeader(a);
    const orig = norm[nk];
    if (orig !== undefined) {
      const v = obj[orig];
      if (v !== undefined && v !== null) {
        return { value: String(v).trim(), matchedSourceHeader: orig };
      }
    }
  }
  return { value: '', matchedSourceHeader: null };
}

export type TalabatWalletParsedRow = {
  rowIndex: number;
  riderId: string;
  /** Source: `3Pl Internal Deductions` (EGP). */
  threePlInternalDeductionsEgp: number;
  requestedFromFileMilli: number;
  /** Source: `Applaied Deduction on Wallet` (EGP). */
  applaiedDeductionOnWalletEgp: number;
  /** Normalized Actual — ONLY field that may reduce liability. */
  actualWalletDeductionMilli: number;
  sourceMapping: {
    riderIdHeader: string | null;
    requestedHeader: string | null;
    actualHeader: string | null;
    requestedSourceLabel: typeof TALABAT_WALLET_SOURCE_COLUMNS.requested;
    actualSourceLabel: typeof TALABAT_WALLET_SOURCE_COLUMNS.actual;
  };
};

export type TalabatWalletParseResult = {
  rows: TalabatWalletParsedRow[];
  errors: string[];
  columnPresence: {
    hasRiderId: boolean;
    has3PlInternalDeductions: boolean;
    hasApplaiedDeductionOnWallet: boolean;
  };
};

/**
 * Parse Talabat wallet/salary Excel rows.
 * Actual is taken exclusively from Applaied Deduction on Wallet.
 */
export function parseTalabatWalletRows(
  json: Record<string, unknown>[]
): TalabatWalletParseResult {
  const rows: TalabatWalletParsedRow[] = [];
  const errors: string[] = [];
  let hasRiderId = false;
  let has3Pl = false;
  let hasApplaied = false;

  json.forEach((obj, idx) => {
    const norm = buildNormToOriginal(obj);
    const rider = pickField(norm, obj, TALABAT_WALLET_RIDER_ALIASES);
    const requested = pickField(norm, obj, TALABAT_WALLET_REQUESTED_ALIASES);
    const actual = pickField(norm, obj, TALABAT_WALLET_ACTUAL_ALIASES);

    if (rider.matchedSourceHeader) hasRiderId = true;
    if (requested.matchedSourceHeader) has3Pl = true;
    if (actual.matchedSourceHeader) hasApplaied = true;

    const riderId = rider.value.replace(/\s+/g, '').trim();
    if (!riderId) {
      errors.push(`صف ${idx + 2}: Rider ID فارغ — FAIL CLOSED`);
      return;
    }

    const reqEgp = parseMoney(requested.value);
    const actEgp = parseMoney(actual.value);
    if (Number.isNaN(actEgp)) {
      errors.push(
        `صف ${idx + 2}: قيمة «${TALABAT_WALLET_SOURCE_COLUMNS.actual}» غير رقمية (${riderId})`
      );
      return;
    }
    const threePlEgp = Number.isNaN(reqEgp) ? 0 : reqEgp;

    rows.push({
      rowIndex: idx + 2,
      riderId,
      threePlInternalDeductionsEgp: threePlEgp,
      requestedFromFileMilli: egpToMilliemes(threePlEgp),
      applaiedDeductionOnWalletEgp: actEgp,
      actualWalletDeductionMilli: egpToMilliemes(actEgp),
      sourceMapping: {
        riderIdHeader: rider.matchedSourceHeader,
        requestedHeader: requested.matchedSourceHeader,
        actualHeader: actual.matchedSourceHeader,
        requestedSourceLabel: TALABAT_WALLET_SOURCE_COLUMNS.requested,
        actualSourceLabel: TALABAT_WALLET_SOURCE_COLUMNS.actual,
      },
    });
  });

  return {
    rows,
    errors,
    columnPresence: {
      hasRiderId,
      has3PlInternalDeductions: has3Pl,
      hasApplaiedDeductionOnWallet: hasApplaied,
    },
  };
}

/** Aggregate Applaied + 3Pl by exact Rider ID (no fuzzy / name match). */
export function aggregateTalabatWalletByRiderId(
  rows: TalabatWalletParsedRow[]
): Map<string, TalabatWalletParsedRow> {
  const map = new Map<string, TalabatWalletParsedRow>();
  for (const r of rows) {
    const cur = map.get(r.riderId);
    if (!cur) {
      map.set(r.riderId, { ...r });
      continue;
    }
    map.set(r.riderId, {
      ...cur,
      threePlInternalDeductionsEgp:
        cur.threePlInternalDeductionsEgp + r.threePlInternalDeductionsEgp,
      requestedFromFileMilli: cur.requestedFromFileMilli + r.requestedFromFileMilli,
      applaiedDeductionOnWalletEgp:
        cur.applaiedDeductionOnWalletEgp + r.applaiedDeductionOnWalletEgp,
      actualWalletDeductionMilli:
        cur.actualWalletDeductionMilli + r.actualWalletDeductionMilli,
    });
  }
  return map;
}
