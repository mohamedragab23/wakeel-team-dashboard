/**
 * Load Admin equipment pricing from أسعار_المعدات.
 * Rider liability creation must use requireAdminEquipmentPricingForLiability (fail closed).
 */

import { getSheetData } from '@/lib/googleSheets';
import { APPROVED_ADMIN_EQUIPMENT_PRICING_EGP } from '@/lib/equipmentPricing/approvedDefaults';
import {
  snapshotFromPricingMilli,
  validateAndConvertAdminPricingEgp,
} from '@/lib/equipmentPricing/validate';
import type {
  AdminEquipmentPricingEgp,
  EquipmentPriceSnapshot,
  EquipmentPricingMilli,
} from '@/lib/equipmentPricing/types';
import { ADMIN_EQUIPMENT_PRICING_SHEET } from '@/lib/equipmentPricing/types';

export type LoadAdminPricingResult =
  | {
      ok: true;
      egp: AdminEquipmentPricingEgp;
      pricing: EquipmentPricingMilli;
      snapshot: EquipmentPriceSnapshot;
      source: 'sheets';
    }
  | { ok: false; error: string; code: 'PRICING_UNAVAILABLE' | 'PRICING_INVALID' };

function parseEgpCell(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  if (!Number.isFinite(n)) return undefined;
  return n;
}

/** Parse sheet row → partial EGP (no defaults applied). */
export function parseAdminPricingRow(row: unknown[] | undefined): Partial<AdminEquipmentPricingEgp> {
  return {
    motorcycleBox: parseEgpCell(row?.[0]),
    bicycleBox: parseEgpCell(row?.[1]),
    tshirt: parseEgpCell(row?.[2]),
    jacket: parseEgpCell(row?.[3]),
    helmet: parseEgpCell(row?.[4]),
    securityCheck: parseEgpCell(row?.[5]),
  };
}

/**
 * Read Admin pricing from Sheets with NO silent liability fallback.
 * Missing/invalid → ok:false.
 */
export async function loadAdminEquipmentPricingFromSheets(): Promise<LoadAdminPricingResult> {
  try {
    const data = await getSheetData(ADMIN_EQUIPMENT_PRICING_SHEET, false);
    if (!data || data.length < 2 || !data[1]) {
      return {
        ok: false,
        code: 'PRICING_UNAVAILABLE',
        error: 'Admin equipment pricing sheet empty or missing',
      };
    }
    const partial = parseAdminPricingRow(data[1]);
    const validated = validateAndConvertAdminPricingEgp(partial);
    if (!validated.ok) {
      return {
        ok: false,
        code: 'PRICING_INVALID',
        error: `${validated.error}: ${validated.detail}`,
      };
    }
    return {
      ok: true,
      egp: validated.egp,
      pricing: validated.pricing,
      snapshot: snapshotFromPricingMilli(validated.pricing),
      source: 'sheets',
    };
  } catch (e) {
    return {
      ok: false,
      code: 'PRICING_UNAVAILABLE',
      error: e instanceof Error ? e.message : 'Admin equipment pricing load failed',
    };
  }
}

/**
 * Fail-closed loader for NEW rider liability / economic commitment.
 */
export async function requireAdminEquipmentPricingForLiability(): Promise<LoadAdminPricingResult> {
  return loadAdminEquipmentPricingFromSheets();
}

export type AdminUiPricingLoad = {
  egp: AdminEquipmentPricingEgp;
  fromSheets: boolean;
  displayOnlyDefaults: boolean;
  /**
   * Sheet has bag/shirt (etc.) but securityCheck column not persisted yet.
   * UI may display suggested security=100 for Admin to Save — NOT valid for NEW liability create.
   */
  needsSecurityColumnSave: boolean;
};

/**
 * Merge a partial Sheets row for Admin UI display only.
 * Never used by requireAdminEquipmentPricingForLiability (fail closed).
 */
export function mergePartialPricingForAdminUiDisplay(
  partial: Partial<AdminEquipmentPricingEgp>
): { egp: AdminEquipmentPricingEgp; needsSecurityColumnSave: boolean } {
  const base = { ...APPROVED_ADMIN_EQUIPMENT_PRICING_EGP };
  const keys: (keyof AdminEquipmentPricingEgp)[] = [
    'motorcycleBox',
    'bicycleBox',
    'tshirt',
    'jacket',
    'helmet',
    'securityCheck',
  ];
  for (const k of keys) {
    const v = partial[k];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) {
      base[k] = v;
    }
  }
  const needsSecurityColumnSave =
    partial.securityCheck === undefined ||
    partial.securityCheck === null ||
    (typeof partial.securityCheck === 'number' && !Number.isFinite(partial.securityCheck));
  if (needsSecurityColumnSave) {
    base.securityCheck = APPROVED_ADMIN_EQUIPMENT_PRICING_EGP.securityCheck;
  }
  return { egp: base, needsSecurityColumnSave };
}

/**
 * UI/API helper: prefer Sheets; if unavailable return approved defaults for display only.
 * MUST NOT be used as silent authority for liability creation.
 *
 * When Sheets has 530/530/135/0/0 but missing securityCheck:
 * - preserve those sheet values for UI
 * - suggest securityCheck=100 for Admin Save
 * - mark needsSecurityColumnSave=true
 * - liability create path remains fail-closed until Save persists column F
 */
export async function loadAdminEquipmentPricingForAdminUi(): Promise<AdminUiPricingLoad> {
  const loaded = await loadAdminEquipmentPricingFromSheets();
  if (loaded.ok) {
    return {
      egp: loaded.egp,
      fromSheets: true,
      displayOnlyDefaults: false,
      needsSecurityColumnSave: false,
    };
  }

  // Try raw sheet row for UI merge (display only).
  try {
    const data = await getSheetData(ADMIN_EQUIPMENT_PRICING_SHEET, false);
    if (data && data.length >= 2 && data[1]) {
      const partial = parseAdminPricingRow(data[1]);
      const hasCore =
        typeof partial.motorcycleBox === 'number' &&
        typeof partial.bicycleBox === 'number' &&
        typeof partial.tshirt === 'number';
      if (hasCore) {
        const merged = mergePartialPricingForAdminUiDisplay(partial);
        return {
          egp: merged.egp,
          fromSheets: true,
          displayOnlyDefaults: false,
          needsSecurityColumnSave: merged.needsSecurityColumnSave,
        };
      }
    }
  } catch {
    // fall through to display defaults
  }

  return {
    egp: { ...APPROVED_ADMIN_EQUIPMENT_PRICING_EGP },
    fromSheets: false,
    displayOnlyDefaults: true,
    needsSecurityColumnSave: true,
  };
}

/** Test / injectable helper — builds a validated snapshot from EGP without I/O. */
export function pricingSnapshotFromEgpForTests(
  egp: AdminEquipmentPricingEgp,
  capturedAt = '2026-08-13T00:00:00.000Z'
): { pricing: EquipmentPricingMilli; snapshot: EquipmentPriceSnapshot } {
  const v = validateAndConvertAdminPricingEgp(egp);
  if (!v.ok) throw new Error(`test pricing invalid: ${v.detail}`);
  return {
    pricing: v.pricing,
    snapshot: snapshotFromPricingMilli(v.pricing, capturedAt),
  };
}
