/**
 * 4D.5.4.5 — READ-ONLY real rider mirror probe.
 * Uses getSheetData(..., false) only — no ensureSheet, no append, no update.
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
import { buildExpectedDeductionSnapshot } from '@/lib/equipmentDeductions/expectedSnapshot';
import { findFirstEligibleEquipmentCycle } from '@/lib/payoutCycles/eligibility';
import { proposePayoutCyclesForMonth } from '@/lib/payoutCycles/monthProposal';
import type { PayoutCycle } from '@/lib/payoutCycles/types';
import { scheduleFromPersistedOriginalMilli } from '@/lib/equipmentPricing';
import { isSrs014FinancialApplyEnabled } from '@/lib/srs014Flags';

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

function proposedToCycles(year: number, month: number): PayoutCycle[] {
  return proposePayoutCyclesForMonth(year, month).map((p) => ({
    cycleId: `${year}-${String(month).padStart(2, '0')}-C${p.cycleNumber}${p.isClosing ? '-CL' : ''}`,
    year,
    month,
    cycleNumber: p.cycleNumber,
    startDate: p.startDate,
    endDate: p.endDate,
    payoutDate: p.payoutDate || '',
    deductionGenerationDate: p.deductionGenerationDate || p.endDate,
    isClosing: p.isClosing,
    equipmentDeductionEnabled: p.equipmentDeductionEnabled,
    status: 'active' as const,
    notes: 'mirror-proposal-fallback',
    createdBy: 'mirror-ro',
    createdAt: '',
    updatedBy: '',
    updatedAt: '',
  }));
}

function parseCycleRow(row: unknown[], sheetRow: number): PayoutCycle | null {
  const cycleId = String(row[0] ?? '').trim();
  if (!cycleId) return null;
  return {
    cycleId,
    year: Number(row[1]) || 0,
    month: Number(row[2]) || 0,
    cycleNumber: Number(row[3]) || 0,
    startDate: String(row[4] ?? '').trim(),
    endDate: String(row[5] ?? '').trim(),
    payoutDate: String(row[6] ?? '').trim(),
    deductionGenerationDate: String(row[7] ?? '').trim(),
    isClosing: String(row[8] ?? '').toLowerCase() === 'true',
    equipmentDeductionEnabled: String(row[9] ?? '').toLowerCase() !== 'false',
    status: (String(row[10] ?? 'active') as PayoutCycle['status']) || 'active',
    notes: String(row[11] ?? ''),
    createdBy: String(row[12] ?? ''),
    createdAt: String(row[13] ?? ''),
    updatedBy: String(row[14] ?? ''),
    updatedAt: String(row[15] ?? ''),
    sheetRow,
  };
}

async function main() {
  loadEnvLocal();
  const report: Record<string, unknown> = {
    mode: 'READ_ONLY',
    financialApplyEnabled: isSrs014FinancialApplyEnabled(),
    sheets: {} as Record<string, unknown>,
  };

  const liabilityData = await getSheetData(SHEET_EQUIPMENT_LIABILITY, false);
  const pricingData = await getSheetData(ADMIN_EQUIPMENT_PRICING_SHEET, false);
  const cyclesData = await getSheetData(SHEET_PAYOUT_CYCLES, false);
  const deliveryData = await getSheetData('تسليم_المعدات', false);

  (report.sheets as any).liabilityRows = liabilityData?.length || 0;
  (report.sheets as any).liabilityHeader = liabilityData?.[0] || null;
  (report.sheets as any).pricingRows = pricingData?.length || 0;
  (report.sheets as any).pricingHeader = pricingData?.[0] || null;
  (report.sheets as any).pricingRow1 = pricingData?.[1] || null;
  (report.sheets as any).cycleRows = cyclesData?.length || 0;
  (report.sheets as any).deliveryRows = deliveryData?.length || 0;

  const issues = [];
  for (let i = 1; i < (liabilityData?.length || 0); i++) {
    const issue = rowToEquipmentLiability(liabilityData[i], i + 1);
    if (issue) issues.push(issue);
  }
  const open = issues.filter((i) => i.status === 'open' && i.outstandingMilli > 0);
  (report.sheets as any).openLiabilities = open.length;
  (report.sheets as any).totalLiabilities = issues.length;

  let adminPricing: unknown = null;
  if (pricingData && pricingData.length >= 2) {
    const partial = parseAdminPricingRow(pricingData[1]);
    const validated = validateAndConvertAdminPricingEgp(partial);
    adminPricing = validated.ok
      ? { ok: true, egp: validated.egp, milli: validated.pricing }
      : { ok: false, error: validated };
  } else {
    adminPricing = { ok: false, error: 'PRICING_SHEET_EMPTY_OR_MISSING' };
  }
  report.adminPricing = adminPricing;

  let cycles: PayoutCycle[] = [];
  for (let i = 1; i < (cyclesData?.length || 0); i++) {
    const c = parseCycleRow(cyclesData[i], i + 1);
    if (c) cycles.push(c);
  }
  if (cycles.length === 0) {
    cycles = [
      ...proposedToCycles(2026, 8),
      ...proposedToCycles(2026, 7),
      ...proposedToCycles(2026, 9),
    ];
    report.cyclesSource = 'PROPOSAL_FALLBACK_NO_SHEET_ROWS';
  } else {
    report.cyclesSource = 'SHEET_دورات_القبض';
  }
  report.cycleCount = cycles.length;
  report.cyclesPreview = cycles.slice(0, 12).map((c) => ({
    cycleId: c.cycleId,
    startDate: c.startDate,
    endDate: c.endDate,
    isClosing: c.isClosing,
    equipmentDeductionEnabled: c.equipmentDeductionEnabled,
    payoutDate: c.payoutDate,
  }));

  if (open.length === 0) {
    report.REAL_RIDER_MIRROR = 'NOT_AVAILABLE';
    report.reason = 'No open liability rows with outstanding > 0 found in عهدة_المعدات via read-only getSheetData';
    fs.writeFileSync(
      path.join(process.cwd(), 'tmp-srs014-4d545-mirror.json'),
      JSON.stringify(report, null, 2),
      'utf8'
    );
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  // Prefer: has activationDate, known security flag, no amountDeducted yet (pre-apply).
  const ranked = [...open].sort((a, b) => {
    const score = (x: typeof a) =>
      (x.activationDate ? 2 : 0) +
      (x.amountDeductedMilli === 0 ? 2 : 0) +
      (x.pricingSource === 'ADMIN_EQUIPMENT_PRICES' ? 1 : 0) +
      (x.originalLiabilityMilli === 80000 || x.originalLiabilityMilli === 90000 ? 1 : 0);
    return score(b) - score(a);
  });
  const rider = ranked[0]!;

  const act = rider.activationDate || rider.issueDate;
  const first = findFirstEligibleEquipmentCycle(cycles, act);
  const monthCycles = cycles.filter(
    (c) => c.year === (first?.year || 2026) && c.month === (first?.month || 8)
  );
  const target =
    first ||
    monthCycles.find((c) => !c.isClosing && c.equipmentDeductionEnabled) ||
    monthCycles[0];

  let expectedLine = null as null | ReturnType<typeof buildExpectedDeductionSnapshot>['lines'][0];
  let expectedSnap = null as ReturnType<typeof buildExpectedDeductionSnapshot> | null;
  if (target) {
    expectedSnap = buildExpectedDeductionSnapshot({
      asOfDate: target.endDate,
      cycle: target,
      allCycles: cycles,
      openIssues: [rider],
    });
    expectedLine = expectedSnap.lines[0] || null;
  }

  const schedule = scheduleFromPersistedOriginalMilli(rider.originalLiabilityMilli);
  const securityImplied =
    rider.securityPaidUpfront === true
      ? 'PAID'
      : rider.securityPaidUpfront === false
        ? 'NOT_PAID'
        : 'UNKNOWN';

  const bagPlusShirts = rider.bagCostMilli + rider.shirtCostMilli;
  const expectedBaseIfPaid = bagPlusShirts;
  const expectedBaseIfUnpaid = bagPlusShirts + rider.securityFeeMilli;
  const liabilityMatchesPaid =
    rider.securityPaidUpfront && rider.originalLiabilityMilli === expectedBaseIfPaid;
  const liabilityMatchesUnpaid =
    !rider.securityPaidUpfront && rider.originalLiabilityMilli === expectedBaseIfUnpaid;

  report.REAL_RIDER_MIRROR = 'AVAILABLE';
  report.selected = {
    riderCode: rider.riderCode,
    riderName: rider.riderNameSnapshot,
    zone: rider.zoneSnapshot,
    supervisor: rider.supervisorCodeSnapshot,
    activationDate: rider.activationDate,
    issueDate: rider.issueDate,
    bagType: rider.bagType,
    bagCostMilli: rider.bagCostMilli,
    shirtQty: rider.shirtQty,
    shirtCostMilli: rider.shirtCostMilli,
    securityFeeMilli: rider.securityFeeMilli,
    securityPaidUpfront: rider.securityPaidUpfront,
    securityImplied,
    originalLiabilityMilli: rider.originalLiabilityMilli,
    outstandingMilli: rider.outstandingMilli,
    amountDeductedMilli: rider.amountDeductedMilli,
    settlementPaidMilli: rider.settlementPaidMilli,
    installmentsCompleted: rider.installmentsCompleted,
    status: rider.status,
    pricingSource: rider.pricingSource || 'LEGACY_NO_SNAPSHOT',
    pricingCapturedAt: rider.pricingCapturedAt || null,
    snapMotorcycleBagMilli: rider.snapMotorcycleBagMilli || null,
    snapBicycleBagMilli: rider.snapBicycleBagMilli || null,
    snapShirtUnitMilli: rider.snapShirtUnitMilli || null,
    deliveryRowRef: rider.deliveryRowRef,
    equipmentIssueId: rider.equipmentIssueId,
    jacketHeld: rider.jacketHeld,
    helmetHeld: rider.helmetHeld,
    LEGACY_LIABILITY: rider.pricingSource !== 'ADMIN_EQUIPMENT_PRICES',
    scheduleFromPersistedOriginal: schedule,
    liabilityMatchesPaidSemantics: liabilityMatchesPaid,
    liabilityMatchesUnpaidSemantics: liabilityMatchesUnpaid,
  };
  report.cycle = {
    firstEligibleCycleId: first?.cycleId || null,
    firstEligibleRange: first ? `${first.startDate}→${first.endDate}` : null,
    targetCycleId: target?.cycleId || null,
    targetRange: target ? `${target.startDate}→${target.endDate}` : null,
    targetIsClosing: target?.isClosing ?? null,
    payday: target?.payoutDate || '(blank/admin)',
  };
  report.expected = expectedLine
    ? {
        expectedDeductionMilli: expectedLine.expectedDeductionMilli,
        carryForwardMilli: expectedLine.carriedRemainderMilli,
        eligible: expectedLine.eligible,
        reasonIfZero: expectedLine.reasonIfZero,
        financialMutation: expectedSnap?.financialMutation === false,
      }
    : { error: 'NO_TARGET_CYCLE' };
  report.actualPayroll = {
    status: 'NOT_VERIFIED',
    note: 'No Manager Excel Actual file was attached/read in this probe; Actual comparison requires an ops-provided FILE_VALID artifact',
  };
  report.managerCompareEvidence = {
    status: 'PRE-APPLY / NOT YET EXECUTED',
    note: 'Read-only probe did not create or read evidence/apply sheets for this rider',
  };
  report.safety = {
    financialApplyEnabled: isSrs014FinancialApplyEnabled(),
    mutations: 0,
    writes: 0,
  };

  const outPath = path.join(process.cwd(), 'tmp-srs014-4d545-mirror.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify({ outPath, REAL_RIDER_MIRROR: report.REAL_RIDER_MIRROR, selected: report.selected, cycle: report.cycle, expected: report.expected }, null, 2));
}

main().catch((e) => {
  const err = { FATAL: true, message: e instanceof Error ? e.message : String(e) };
  fs.writeFileSync(
    path.join(process.cwd(), 'tmp-srs014-4d545-mirror.json'),
    JSON.stringify(err, null, 2),
    'utf8'
  );
  console.error(JSON.stringify(err));
  process.exit(1);
});
