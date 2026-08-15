/**
 * SRS-014 Phase D — available payout resolution for partial installment caps.
 * Money is integer milliemes only.
 */

export type ParseAvailablePayoutResult =
  | { ok: true; milli: number }
  | { ok: false; reason: 'invalid_available_payout' | 'negative_available_payout' };

/** Parse a single available-payout amount (milliemes). Fail closed on bad input. */
export function parseAvailablePayoutMilli(raw: unknown): ParseAvailablePayoutResult {
  if (raw == null || raw === '') {
    return { ok: false, reason: 'invalid_available_payout' };
  }
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    // Allow integer-valued floats from JSON (15000.0) but reject true floats / NaN.
    if (!Number.isFinite(n) || Math.trunc(n) !== n) {
      return { ok: false, reason: 'invalid_available_payout' };
    }
  }
  const milli = Math.trunc(n);
  if (milli < 0) return { ok: false, reason: 'negative_available_payout' };
  return { ok: true, milli };
}

/**
 * Parse cron/query JSON map: `{ "R001": 15000, ... }` (values = milliemes).
 * Invalid entries are omitted and listed in `invalidRiderCodes`.
 */
export function parseAvailablePayoutMilliByRiderJson(raw: string | null | undefined): {
  byRider: Record<string, number>;
  invalidRiderCodes: string[];
} {
  const byRider: Record<string, number> = {};
  const invalidRiderCodes: string[] = [];
  if (raw == null || !String(raw).trim()) return { byRider, invalidRiderCodes };

  let parsed: unknown;
  try {
    parsed = JSON.parse(String(raw));
  } catch {
    return { byRider, invalidRiderCodes: ['*'] };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { byRider, invalidRiderCodes: ['*'] };
  }

  for (const [code, value] of Object.entries(parsed as Record<string, unknown>)) {
    const riderCode = String(code || '').trim();
    if (!riderCode) continue;
    const p = parseAvailablePayoutMilli(value);
    if (!p.ok) {
      invalidRiderCodes.push(riderCode);
      continue;
    }
    byRider[riderCode] = p.milli;
  }
  return { byRider, invalidRiderCodes };
}

/**
 * Build the per-rider available-payout map for a cron run.
 * Overrides win; optional loader fills gaps (tests / future source).
 * Riders without an entry are omitted → engine treats as uncapped.
 */
export async function resolveAvailablePayoutMilliByRider(params: {
  riderCodes: string[];
  overrideByRider?: Record<string, number>;
  loadByRider?: (riderCode: string) => Promise<number | null | undefined>;
}): Promise<Record<string, number>> {
  const out: Record<string, number> = {};

  for (const [code, value] of Object.entries(params.overrideByRider || {})) {
    const riderCode = String(code || '').trim();
    if (!riderCode) continue;
    const p = parseAvailablePayoutMilli(value);
    if (p.ok) out[riderCode] = p.milli;
  }

  for (const rawCode of params.riderCodes) {
    const riderCode = String(rawCode || '').trim();
    if (!riderCode || out[riderCode] != null) continue;
    if (!params.loadByRider) continue;
    const loaded = await params.loadByRider(riderCode);
    if (loaded == null) continue;
    const p = parseAvailablePayoutMilli(loaded);
    if (p.ok) out[riderCode] = p.milli;
  }

  return out;
}
