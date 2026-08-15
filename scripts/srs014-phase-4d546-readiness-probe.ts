/**
 * 4D.5.4.6 — READ-ONLY production data readiness probe.
 * No ensure/append/update/save. No Financial Apply.
 */
import fs from 'node:fs';
import path from 'node:path';
import { getSheetData } from '@/lib/googleSheets';
import { rowToEquipmentLiability } from '@/lib/equipmentLiability/store';
import { SHEET_EQUIPMENT_LIABILITY } from '@/lib/equipmentLiability/constants';
import { ADMIN_EQUIPMENT_PRICING_SHEET } from '@/lib/equipmentPricing/types';
import { parseAdminPricingRow } from '@/lib/equipmentPricing/loadAdminPricing';
import { validateAndConvertAdminPricingEgp } from '@/lib/equipmentPricing/validate';
import { SHEET_PAYOUT_CYCLES } from '@/lib/payoutCycles/constants';
import { shouldSkipEquipmentAutoDeductions } from '@/lib/payoutCycles/eligibility';
import {
  isAutoEquipmentDeductionsEnabled,
  isEquipmentLedgerEnabled,
  isEquipmentReturnsV2Enabled,
  isPayoutCyclesEnabled,
  isSrs014FinancialApplyEnabled,
} from '@/lib/srs014Flags';

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    const k = m[1].trim();
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v.replace(/\\n/g, '\n');
  }
}

function maskName(name: string): string {
  const s = String(name || '').trim();
  if (!s) return '';
  if (s.length <= 2) return '*'.repeat(s.length);
  return s[0] + '*'.repeat(Math.min(6, s.length - 2)) + s[s.length - 1];
}

async function main() {
  loadEnvLocal();
  const out: Record<string, unknown> = {
    phase: '4D.5.4.6',
    mode: 'READ_ONLY',
    flags: {
      FINANCIAL_APPLY: isSrs014FinancialApplyEnabled(),
      AUTO: isAutoEquipmentDeductionsEnabled(),
      LEDGER: isEquipmentLedgerEnabled(),
      RETURNS: isEquipmentReturnsV2Enabled(),
      CYCLES: isPayoutCyclesEnabled(),
    },
  };

  const liabilityData = await getSheetData(SHEET_EQUIPMENT_LIABILITY, false);
  const pricingData = await getSheetData(ADMIN_EQUIPMENT_PRICING_SHEET, false);
  const cyclesData = await getSheetData(SHEET_PAYOUT_CYCLES, false);
  const deliveryData = await getSheetData('تسليم_المعدات', false);

  const issues = [];
  for (let i = 1; i < (liabilityData?.length || 0); i++) {
    const issue = rowToEquipmentLiability(liabilityData[i], i + 1);
    if (issue) issues.push(issue);
  }
  const open = issues.filter((i) => i.status === 'open' && i.outstandingMilli > 0);

  const pricingHeader = pricingData?.[0] || [];
  const pricingRow1 = pricingData?.[1] || [];
  const partial = parseAdminPricingRow(pricingRow1);
  const validated = validateAndConvertAdminPricingEgp(partial);

  out.adminPricing = {
    header: pricingHeader,
    row1: pricingRow1,
    hasSecurityColumn: String(pricingHeader[5] || '')
      .toLowerCase()
      .includes('security'),
    parsed: partial,
    validated: validated.ok
      ? { ok: true, egp: validated.egp }
      : { ok: false, error: (validated as any).error, detail: (validated as any).detail },
    SECURITY_PRICE_CONFIG: validated.ok ? 'PASS' : 'BLOCKED',
  };

  const cycles = [];
  for (let i = 1; i < (cyclesData?.length || 0); i++) {
    const r = cyclesData[i];
    if (!r?.[0]) continue;
    const cycle = {
      cycleId: String(r[0]),
      year: Number(r[1]),
      month: Number(r[2]),
      cycleNumber: Number(r[3]),
      startDate: String(r[4] || ''),
      endDate: String(r[5] || ''),
      payday: String(r[6] || ''),
      deductionGenerationDate: String(r[7] || ''),
      isClosing: String(r[8] || '').toLowerCase() === 'true',
      equipmentDeductionEnabled: String(r[9] || '').toLowerCase() !== 'false',
      status: String(r[10] || ''),
    };
    cycles.push({
      ...cycle,
      engineWouldSkipAutoEquipment: shouldSkipEquipmentAutoDeductions(cycle),
    });
  }
  const closing = cycles.find((c) => c.isClosing);
  out.cycles = cycles;
  out.closing = closing
    ? {
        ...closing,
        CLOSING_CONFIG:
          closing.isClosing && closing.equipmentDeductionEnabled
            ? 'INCONSISTENT'
            : closing.isClosing && !closing.equipmentDeductionEnabled
              ? 'CONSISTENT'
              : 'UNKNOWN',
        CLOSING_ENGINE_GUARD: closing.isClosing
          ? shouldSkipEquipmentAutoDeductions(closing)
            ? 'PASS'
            : 'FAIL'
          : 'N/A',
      }
    : { CLOSING_CONFIG: 'MISSING' };

  // Delivery sample (masked) — do not invent liability
  const deliveryHeader = deliveryData?.[0] || [];
  const deliverySamples = [];
  for (let i = 1; i < Math.min(deliveryData?.length || 0, 8); i++) {
    const r = deliveryData[i];
    deliverySamples.push({
      supervisorCode: String(r?.[0] || ''),
      riderCode: String(r?.[2] || ''),
      riderNameMasked: maskName(String(r?.[3] || '')),
      zone: String(r?.[4] || ''),
      deliveryType: String(r?.[5] || ''),
      moto: r?.[6],
      bike: r?.[7],
      tshirt: r?.[8],
      jacket: r?.[9],
      helmet: r?.[10],
      statusLike: r?.[13] || r?.[14] || '',
    });
  }

  out.sheets = {
    liabilityRows: liabilityData?.length || 0,
    liabilityHeader: liabilityData?.[0] || null,
    openLiabilities: open.length,
    totalLiabilitiesParsed: issues.length,
    pricingRows: pricingData?.length || 0,
    cycleRows: cyclesData?.length || 0,
    deliveryRows: deliveryData?.length || 0,
    deliveryHeader,
    deliverySamples,
  };

  if (open.length === 0) {
    out.REAL_RIDER_MIRROR = 'NOT_AVAILABLE';
    out.REAL_RIDER = 'BLOCKED';
    out.reason =
      'No persisted open liability in عهدة_المعدات. Deliveries may exist but Phase C liability rows are absent. LEDGER flag OFF in this environment. DO NOT create liability in this phase.';
  } else {
    const rider = open[0]!;
    out.REAL_RIDER_MIRROR = 'AVAILABLE';
    out.REAL_RIDER = 'PASS';
    out.selected = {
      riderCode: rider.riderCode,
      riderNameMasked: maskName(rider.riderNameSnapshot),
      zone: rider.zoneSnapshot,
      supervisor: rider.supervisorCodeSnapshot,
      activationDate: rider.activationDate,
      bagType: rider.bagType,
      originalLiabilityMilli: rider.originalLiabilityMilli,
      outstandingMilli: rider.outstandingMilli,
      securityPaidUpfront: rider.securityPaidUpfront,
      pricingSource: rider.pricingSource || 'LEGACY_NO_SNAPSHOT',
    };
  }

  out.mutations = 0;
  out.FINANCIAL_APPLY_FLAG = isSrs014FinancialApplyEnabled() ? 'ON' : 'OFF';

  const outPath = path.join(process.cwd(), 'tmp-srs014-4d546-readiness.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
  console.log(JSON.stringify({ outPath, REAL_RIDER_MIRROR: out.REAL_RIDER_MIRROR, SECURITY_PRICE_CONFIG: (out.adminPricing as any).SECURITY_PRICE_CONFIG, closing: out.closing, flags: out.flags, sheetsSummary: { ...(out.sheets as any), deliverySamples: undefined, deliveryHeader: undefined, liabilityHeader: undefined } }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
