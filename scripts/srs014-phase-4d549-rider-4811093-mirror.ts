/**
 * READ-ONLY Real Rider Mirror for a single riderCode.
 * No append/update/approve/liability create. No Financial Apply.
 */
import fs from 'node:fs';
import path from 'node:path';
import { getSheetData } from '@/lib/googleSheets';
import { SHEET_EQUIPMENT_LIABILITY } from '@/lib/equipmentLiability/constants';
import { rowToEquipmentLiability } from '@/lib/equipmentLiability/store';
import { ADMIN_EQUIPMENT_PRICING_SHEET } from '@/lib/equipmentPricing/types';
import {
  loadAdminEquipmentPricingFromSheets,
  parseAdminPricingRow,
} from '@/lib/equipmentPricing/loadAdminPricing';
import { validateAndConvertAdminPricingEgp } from '@/lib/equipmentPricing/validate';
import { scheduleFromPersistedOriginalMilli } from '@/lib/equipmentPricing';
import { SHEET_PAYOUT_CYCLES } from '@/lib/payoutCycles/constants';
import { findFirstEligibleEquipmentCycle } from '@/lib/payoutCycles/eligibility';
import { proposePayoutCyclesForMonth } from '@/lib/payoutCycles/monthProposal';
import type { PayoutCycle } from '@/lib/payoutCycles/types';
import { buildExpectedDeductionSnapshot } from '@/lib/equipmentDeductions/expectedSnapshot';
import { loadAllCandidates } from '@/lib/recruitment/recruitmentService';
import { assessEquipmentWorkflowEligibility } from '@/lib/recruitment/equipmentEligibility';
import { deriveRecruitmentPipelineStage } from '@/lib/recruitment/phaseB';
import { normalizeRiderCodeForPerformance } from '@/lib/riderCodeUtils';
import {
  isAutoEquipmentDeductionsEnabled,
  isEquipmentLedgerEnabled,
  isRecruitmentV2Enabled,
  isSrs014FinancialApplyEnabled,
} from '@/lib/srs014Flags';

const TARGET = '4811093';

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

function minName(name: string): string {
  const parts = String(name || '')
    .replace(/_WAKEEL.*/i, '')
    .trim()
    .split(/\s+/);
  if (parts.length <= 2) return parts.join(' ') || '(unknown)';
  return `${parts[0]} ${parts[1]}…`;
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
  const norm = normalizeRiderCodeForPerformance(TARGET);

  const [liabilityData, pricingData, cyclesData, deliveryData, live, cands, pricingLoad] =
    await Promise.all([
      getSheetData(SHEET_EQUIPMENT_LIABILITY, false),
      getSheetData(ADMIN_EQUIPMENT_PRICING_SHEET, false),
      getSheetData(SHEET_PAYOUT_CYCLES, false),
      getSheetData('تسليم_المعدات', false),
      getSheetData('المناديب', false),
      loadAllCandidates(false),
      loadAdminEquipmentPricingFromSheets(),
    ]);

  const liveRow = live
    .slice(1)
    .find((r) => normalizeRiderCodeForPerformance(String(r[0] ?? '')) === norm);
  const candidate =
    cands.find((c) => normalizeRiderCodeForPerformance(c.riderCode) === norm) || null;
  const nameHits = cands
    .filter((c) => {
      if (!liveRow) return false;
      const liveName = String(liveRow[1] ?? '')
        .toLowerCase()
        .replace(/_wakeel.*/i, '')
        .trim();
      const cn = String(c.fullName || '')
        .toLowerCase()
        .replace(/_wakeel.*/i, '')
        .trim();
      const token = liveName.split(/\s+/).slice(0, 2).join(' ');
      return token.length >= 6 && cn.includes(token.slice(0, 10));
    })
    .slice(0, 5)
    .map((c) => ({
      candidateId: c.id,
      nameMin: minName(c.fullName),
      riderCode: c.riderCode || '(empty)',
      activationStatus: c.activationStatus,
      security: c.securityInquiryPayment || '(empty)',
      ops: c.finalAssignedSupervisorCode || '(empty)',
    }));

  const eligibility = assessEquipmentWorkflowEligibility(candidate, TARGET);

  const deliveries = (deliveryData || [])
    .slice(1)
    .map((row, idx) => ({ row, rowIndex: idx + 1 }))
    .filter(
      ({ row }) => normalizeRiderCodeForPerformance(String(row[2] ?? '')) === norm
    )
    .map(({ row, rowIndex }) => ({
      deliveryRowIndex: rowIndex,
      supervisorCode: String(row[0] ?? '').trim(),
      nameMin: minName(String(row[3] ?? '')),
      zone: String(row[4] ?? '').trim(),
      deliveryType: String(row[5] ?? '').trim(),
      moto: Number(row[6]) || 0,
      bike: Number(row[7]) || 0,
      tshirt: Number(row[8]) || 0,
      jacket: Number(row[9]) || 0,
      helmet: Number(row[10]) || 0,
      status: String(row[12] ?? 'pending').trim() || 'pending',
      equipmentIssueId: String(row[17] ?? '').trim(),
    }));

  const issues = [];
  for (let i = 1; i < (liabilityData?.length || 0); i++) {
    const issue = rowToEquipmentLiability(liabilityData![i], i + 1);
    if (issue && normalizeRiderCodeForPerformance(issue.riderCode) === norm) {
      issues.push(issue);
    }
  }

  let cycles: PayoutCycle[] = [];
  for (let i = 1; i < (cyclesData?.length || 0); i++) {
    const c = parseCycleRow(cyclesData![i], i + 1);
    if (c) cycles.push(c);
  }
  let cyclesSource = 'SHEET_دورات_القبض';
  if (cycles.length === 0) {
    cycles = [...proposedToCycles(2026, 8), ...proposedToCycles(2026, 7)];
    cyclesSource = 'PROPOSAL_FALLBACK';
  }

  const open = issues.filter((i) => i.status === 'open' && i.outstandingMilli > 0);
  const primary = open[0] || issues[0] || null;

  let cycleBlock: Record<string, unknown> | null = null;
  let expectedBlock: Record<string, unknown> | null = null;
  let snapshotBlock: Record<string, unknown> | null = null;
  let moneyMeaning: Record<string, unknown> | null = null;

  if (primary) {
    const act = primary.activationDate || primary.issueDate;
    const first = findFirstEligibleEquipmentCycle(cycles, act);
    const monthCycles = cycles.filter(
      (c) => c.year === (first?.year || 2026) && c.month === (first?.month || 8)
    );
    const target =
      first ||
      monthCycles.find((c) => !c.isClosing && c.equipmentDeductionEnabled) ||
      monthCycles[0];
    cycleBlock = {
      activationOrIssueDate: act,
      firstEligibleCycleId: first?.cycleId || null,
      firstEligibleRange: first ? `${first.startDate}→${first.endDate}` : null,
      targetCycleId: target?.cycleId || null,
      targetRange: target ? `${target.startDate}→${target.endDate}` : null,
      targetIsClosing: target?.isClosing ?? null,
      payday: target?.payoutDate || '(blank)',
    };
    if (target) {
      const snap = buildExpectedDeductionSnapshot({
        asOfDate: target.endDate,
        cycle: target,
        allCycles: cycles,
        openIssues: [primary],
      });
      const line = snap.lines[0];
      expectedBlock = line
        ? {
            expectedDeductionMilli: line.expectedDeductionMilli,
            expectedDeductionEgp: (line.expectedDeductionMilli / 100).toFixed(2),
            carriedRemainderMilli: line.carriedRemainderMilli,
            eligible: line.eligible,
            reasonIfZero: line.reasonIfZero,
            financialMutation: snap.financialMutation === false,
          }
        : { error: 'NO_LINE' };
    }
    const schedule = scheduleFromPersistedOriginalMilli(primary.originalLiabilityMilli);
    const securityImplied =
      primary.securityPaidUpfront === true
        ? 'PAID'
        : primary.securityPaidUpfront === false
          ? 'NOT_PAID'
          : 'UNKNOWN';
    moneyMeaning = {
      securityImplied,
      originalLiabilityMilli: primary.originalLiabilityMilli,
      originalLiabilityEgp: primary.originalLiabilityMilli / 100,
      bagCostMilli: primary.bagCostMilli,
      shirtCostMilli: primary.shirtCostMilli,
      securityFeeMilli: primary.securityFeeMilli,
      scheduleMilli: schedule,
      scheduleEgp: schedule.map((x) => x / 100),
      matches800:
        primary.securityPaidUpfront === true && primary.originalLiabilityMilli === 80000,
      matches900:
        primary.securityPaidUpfront === false && primary.originalLiabilityMilli === 90000,
    };
    snapshotBlock = {
      pricingSource: primary.pricingSource || 'LEGACY_NO_SNAPSHOT',
      pricingCapturedAt: primary.pricingCapturedAt || null,
      snapMotorcycleBagMilli: primary.snapMotorcycleBagMilli ?? null,
      snapBicycleBagMilli: primary.snapBicycleBagMilli ?? null,
      snapShirtUnitMilli: primary.snapShirtUnitMilli ?? null,
      snapSecurityFeeMilli: (primary as { snapSecurityFeeMilli?: number }).snapSecurityFeeMilli ?? null,
    };
  }

  let adminPricing: unknown = null;
  if (pricingData && pricingData.length >= 2) {
    const partial = parseAdminPricingRow(pricingData[1]);
    const validated = validateAndConvertAdminPricingEgp(partial);
    adminPricing = validated.ok
      ? { ok: true, egp: validated.egp }
      : { ok: false, detail: validated };
  }

  const mirrorStatus = primary
    ? 'PASS_PARTIAL'
    : eligibility.equipmentWorkflowEligible
      ? 'READY_NO_LIABILITY_YET'
      : 'NOT_AVAILABLE';

  const report = {
    mode: 'READ_ONLY',
    riderCode: TARGET,
    at: new Date().toISOString(),
    flags: {
      FINANCIAL_APPLY: isSrs014FinancialApplyEnabled(),
      EQUIPMENT_LEDGER_local: isEquipmentLedgerEnabled(),
      AUTO_DEDUCTIONS_local: isAutoEquipmentDeductionsEnabled(),
      RECRUITMENT_V2_local: isRecruitmentV2Enabled(),
    },
    mutations: 0,
    liabilityCreated: 0,
    financialApplyExecuted: false,
    liveRider: liveRow
      ? {
          found: true,
          nameMin: minName(String(liveRow[1] ?? '')),
          zone: String(liveRow[2] ?? ''),
          supervisorCode: String(liveRow[3] ?? ''),
          joinDate: String(liveRow[6] ?? ''),
          status: String(liveRow[7] ?? ''),
        }
      : { found: false },
    candidate: candidate
      ? {
          found: true,
          candidateId: candidate.id,
          nameMin: minName(candidate.fullName),
          riderCode: candidate.riderCode,
          activationStatus: candidate.activationStatus,
          activationConfirmed: candidate.activationConfirmed,
          activationDate: candidate.activationDate,
          securityInquiryPayment: candidate.securityInquiryPayment || '(empty)',
          finalAssignedSupervisorCode: candidate.finalAssignedSupervisorCode || '(empty)',
          equipmentStatus: candidate.equipmentStatus,
          lectureAttendance: candidate.lectureAttendance,
          pipelineStage: deriveRecruitmentPipelineStage(candidate),
        }
      : { found: false },
    nameFuzzyHits: nameHits,
    equipmentEligibility: eligibility,
    deliveries,
    liabilities: {
      count: issues.length,
      openCount: open.length,
      rows: issues.map((i) => ({
        equipmentIssueId: i.equipmentIssueId,
        status: i.status,
        originalLiabilityMilli: i.originalLiabilityMilli,
        outstandingMilli: i.outstandingMilli,
        amountDeductedMilli: i.amountDeductedMilli,
        deliveryRowRef: i.deliveryRowRef,
        issueDate: i.issueDate,
        activationDate: i.activationDate,
        pricingSource: i.pricingSource || null,
      })),
    },
    adminPricing,
    pricingLoadOk: pricingLoad.ok,
    pricingEgp: pricingLoad.ok ? pricingLoad.egp : null,
    cyclesSource,
    cycle: cycleBlock,
    priceSnapshot: snapshotBlock,
    moneyMeaning,
    expected: expectedBlock,
    actualPayroll: {
      status: 'NOT_VERIFIED',
      note: 'No Manager Excel Actual read in this probe',
    },
    managerCompare: { status: 'NOT_VERIFIED' },
    evidence: { status: 'NOT_VERIFIED' },
    allocation: { status: 'NOT_VERIFIED' },
    REAL_RIDER_MIRROR: mirrorStatus,
  };

  const out = path.join(process.cwd(), 'tmp-srs014-4811093-mirror.json');
  fs.writeFileSync(out, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
