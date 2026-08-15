/**
 * 4D.5.4.15 — Opening Balance pilot allowlist (pure).
 * Refuse persist unless riderCode is explicitly listed.
 * 4811093 is always blocked (read-only diagnostic).
 *
 * Fail-closed config: malformed tokens, duplicates, or >3 eligible codes
 * invalidate the entire allowlist (no silent truncation at the persist gate).
 */

import { normalizeAndValidateRiderCode } from '@/lib/equipmentLiability/phaseCGates';
import { isSrs014OpeningBalanceWriteEnabled } from '@/lib/srs014Flags';

/** Read-only diagnostic rider — never Opening-write eligible. */
export const OPENING_PILOT_BLOCKED_DIAGNOSTIC_RIDER = '4811093';

export const OPENING_PILOT_MAX_ALLOWLIST = 3;

export { isSrs014OpeningBalanceWriteEnabled };

export type OpeningPilotAllowlistConfigResult =
  | { ok: true; list: string[] }
  | { ok: false; code: string; error: string };

/**
 * Strict allowlist parse for the persist boundary.
 * Env: FEATURE_SRS014_OPENING_PILOT_ALLOWLIST
 */
export function validateOpeningPilotAllowlistConfig(
  raw: string | undefined | null = process.env.FEATURE_SRS014_OPENING_PILOT_ALLOWLIST
): OpeningPilotAllowlistConfigResult {
  const parts = String(raw || '')
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return { ok: true, list: [] };
  }

  const out: string[] = [];
  const seen = new Set<string>();

  for (const p of parts) {
    const n = normalizeAndValidateRiderCode(p);
    if (!n.ok) {
      return {
        ok: false,
        code: 'PILOT_ALLOWLIST_MALFORMED',
        error: `رمز غير صالح في قائمة الطيار: ${p}`,
      };
    }
    if (n.riderCode === OPENING_PILOT_BLOCKED_DIAGNOSTIC_RIDER) {
      // Listed diagnostic is ignored for eligibility; persist of 4811093 still hard-blocked.
      continue;
    }
    if (seen.has(n.riderCode)) {
      return {
        ok: false,
        code: 'PILOT_ALLOWLIST_DUPLICATE',
        error: `تكرار كود في قائمة الطيار: ${n.riderCode}`,
      };
    }
    seen.add(n.riderCode);
    out.push(n.riderCode);
  }

  if (out.length > OPENING_PILOT_MAX_ALLOWLIST) {
    return {
      ok: false,
      code: 'PILOT_ALLOWLIST_TOO_LARGE',
      error: `قائمة الطيار تتجاوز ${OPENING_PILOT_MAX_ALLOWLIST} مناديب`,
    };
  }

  return { ok: true, list: out };
}

/** Display/membership helper — empty when config is invalid (fail closed). */
export function parseOpeningPilotAllowlist(
  raw: string | undefined | null = process.env.FEATURE_SRS014_OPENING_PILOT_ALLOWLIST
): string[] {
  const v = validateOpeningPilotAllowlistConfig(raw);
  return v.ok ? v.list : [];
}

export function isRiderOnOpeningPilotAllowlist(riderCode: string): boolean {
  const n = normalizeAndValidateRiderCode(riderCode);
  if (!n.ok) return false;
  if (n.riderCode === OPENING_PILOT_BLOCKED_DIAGNOSTIC_RIDER) return false;
  return parseOpeningPilotAllowlist().includes(n.riderCode);
}

export type OpeningPilotAllowlistResult =
  | { ok: true; riderCode: string }
  | { ok: false; code: string; error: string };

/** Hard gate before any Opening persist. */
export function assertOpeningPilotPersistAllowed(
  riderCode: string
): OpeningPilotAllowlistResult {
  const n = normalizeAndValidateRiderCode(riderCode);
  if (!n.ok) {
    return { ok: false, code: 'RIDER_CODE_INVALID', error: 'كود المندوب غير صالح' };
  }
  if (n.riderCode === OPENING_PILOT_BLOCKED_DIAGNOSTIC_RIDER) {
    return {
      ok: false,
      code: 'DIAGNOSTIC_RIDER_BLOCKED',
      error: '4811093 للقراءة فقط — ممنوع إنشاء Opening Liability',
    };
  }
  if (!isSrs014OpeningBalanceWriteEnabled()) {
    return {
      ok: false,
      code: 'PRODUCTION_WRITE_DISABLED',
      error:
        'كتابة Opening Liability معطّلة (FEATURE_SRS014_OPENING_BALANCE_WRITE_ENABLED)',
    };
  }

  const cfg = validateOpeningPilotAllowlistConfig();
  if (!cfg.ok) {
    return { ok: false, code: cfg.code, error: cfg.error };
  }
  if (cfg.list.length === 0) {
    return {
      ok: false,
      code: 'PILOT_ALLOWLIST_EMPTY',
      error: 'قائمة الطيار فارغة — يلزم FEATURE_SRS014_OPENING_PILOT_ALLOWLIST صراحة',
    };
  }
  // 4D.5.4.15B — first real Production Opening: exactly ONE rider on allowlist.
  if (cfg.list.length !== 1) {
    return {
      ok: false,
      code: 'PILOT_ALLOWLIST_MUST_BE_EXACTLY_ONE',
      error: `طيار Opening الحالي يتطلب مندوبًا واحدًا فقط في allowlist (الآن: ${cfg.list.length})`,
    };
  }
  if (!cfg.list.includes(n.riderCode)) {
    return {
      ok: false,
      code: 'RIDER_NOT_ON_PILOT_ALLOWLIST',
      error: `المندوب ${n.riderCode} غير مدرج في قائمة الطيار`,
    };
  }
  return { ok: true, riderCode: n.riderCode };
}

/** Explicit human Go for first Production Opening write (15B). */
export function assertConfirmOpeningProductionWrite(
  value: unknown
): { ok: true } | { ok: false; code: string; error: string } {
  const normalized =
    value === true ||
    String(value || '')
      .trim()
      .toUpperCase() === 'YES';
  if (!normalized) {
    return {
      ok: false,
      code: 'CONFIRM_OPENING_PRODUCTION_WRITE_REQUIRED',
      error: 'يلزم CONFIRM_OPENING_PRODUCTION_WRITE=YES قبل أي كتابة Production',
    };
  }
  return { ok: true };
}
