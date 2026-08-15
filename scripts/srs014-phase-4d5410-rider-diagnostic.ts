/**
 * 4D.5.4.10 — READ-ONLY deep diagnostic for a single rider (default 4811093).
 * No append/update/approve. No Liability. No Financial Apply.
 * Fuzzy matches are reported for HUMAN REVIEW only — never auto-linked.
 */
import fs from 'node:fs';
import path from 'node:path';
import { getSheetData } from '@/lib/googleSheets';
import { SHEET_EQUIPMENT_LIABILITY } from '@/lib/equipmentLiability/constants';
import { rowToEquipmentLiability } from '@/lib/equipmentLiability/store';
import { loadAdminEquipmentPricingFromSheets } from '@/lib/equipmentPricing/loadAdminPricing';
import { loadAllCandidates } from '@/lib/recruitment/recruitmentService';
import { assessEquipmentLiabilityReadiness } from '@/lib/recruitment/equipmentLiabilityReadiness';
import {
  normalizeIdentityPhone,
  normalizeNationalId,
  phonesMatchForDuplicate,
} from '@/lib/recruitment/phaseB';
import { normalizeRiderCodeForPerformance } from '@/lib/riderCodeUtils';
import {
  isSrs014FinancialApplyEnabled,
  isEquipmentLedgerEnabled,
  isRecruitmentV2Enabled,
} from '@/lib/srs014Flags';

const TARGET = process.argv[2] || '4811093';

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

async function main() {
  loadEnvLocal();
  const norm = normalizeRiderCodeForPerformance(TARGET);

  const [live, cands, deliveries, liabilities, pricing, assignmentReqs] =
    await Promise.all([
      getSheetData('المناديب', false),
      loadAllCandidates(false),
      getSheetData('تسليم_المعدات', false),
      getSheetData(SHEET_EQUIPMENT_LIABILITY, false),
      loadAdminEquipmentPricingFromSheets(),
      getSheetData('طلبات_التعيين', false).catch(() => null),
    ]);

  const liveRow = live
    .slice(1)
    .find((r) => normalizeRiderCodeForPerformance(String(r[0] ?? '')) === norm);

  const livePhone = liveRow ? String(liveRow[5] ?? '').trim() : '';
  const liveName = liveRow ? String(liveRow[1] ?? '').trim() : '';

  const byRiderCode =
    cands.find((c) => normalizeRiderCodeForPerformance(c.riderCode) === norm) ||
    null;

  // HUMAN-REVIEW ONLY — never auto-merge
  const phoneHits = livePhone
    ? cands
        .filter((c) => phonesMatchForDuplicate(c.phone, livePhone) || phonesMatchForDuplicate(c.phoneSecondary, livePhone))
        .slice(0, 10)
        .map((c) => ({
          candidateId: c.id,
          nameMin: minName(c.fullName),
          riderCode: c.riderCode || '(empty)',
          phoneMatch: true,
          nationalIdPresent: Boolean(normalizeNationalId(c.nationalId)),
          activationStatus: c.activationStatus,
          security: c.securityInquiryPayment || '(empty)',
          ops: c.finalAssignedSupervisorCode || '(empty)',
          reviewOnly: true,
        }))
    : [];

  const nameToken = liveName
    .replace(/_WAKEEL.*/i, '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .slice(0, 2)
    .join(' ');
  const nameHits =
    nameToken.length >= 6
      ? cands
          .filter((c) =>
            String(c.fullName || '')
              .toLowerCase()
              .includes(nameToken.slice(0, 12))
          )
          .slice(0, 10)
          .map((c) => ({
            candidateId: c.id,
            nameMin: minName(c.fullName),
            riderCode: c.riderCode || '(empty)',
            phoneDigitsLen: normalizeIdentityPhone(c.phone).length,
            activationStatus: c.activationStatus,
            security: c.securityInquiryPayment || '(empty)',
            ops: c.finalAssignedSupervisorCode || '(empty)',
            reviewOnly: true,
          }))
      : [];

  const deliveryRows = (deliveries || [])
    .slice(1)
    .map((row, idx) => ({ row, rowIndex: idx + 1 }))
    .filter(
      ({ row }) => normalizeRiderCodeForPerformance(String(row[2] ?? '')) === norm
    )
    .map(({ row, rowIndex }) => ({
      deliveryRowIndex: rowIndex,
      riderCode: String(row[2] ?? '').trim(),
      nameMin: minName(String(row[3] ?? '')),
      deliveryType: String(row[5] ?? '').trim(),
      moto: Number(row[6]) || 0,
      bike: Number(row[7]) || 0,
      tshirt: Number(row[8]) || 0,
      status: String(row[12] ?? 'pending').trim() || 'pending',
      equipmentIssueId: String(row[17] ?? '').trim(),
    }));

  // Name-only delivery hits (HUMAN REVIEW) — same first two name tokens
  const deliveryNameHits =
    nameToken.length >= 6
      ? (deliveries || [])
          .slice(1)
          .map((row, idx) => ({ row, rowIndex: idx + 1 }))
          .filter(({ row }) =>
            String(row[3] ?? '')
              .toLowerCase()
              .includes(nameToken.slice(0, 12))
          )
          .slice(0, 10)
          .map(({ row, rowIndex }) => ({
            deliveryRowIndex: rowIndex,
            riderCode: String(row[2] ?? '').trim(),
            nameMin: minName(String(row[3] ?? '')),
            status: String(row[12] ?? '').trim(),
            reviewOnly: true,
          }))
      : [];

  const liabilityRows = [];
  for (let i = 1; i < (liabilities?.length || 0); i++) {
    const issue = rowToEquipmentLiability(liabilities![i], i + 1);
    if (issue && normalizeRiderCodeForPerformance(issue.riderCode) === norm) {
      liabilityRows.push({
        equipmentIssueId: issue.equipmentIssueId,
        status: issue.status,
        originalLiabilityMilli: issue.originalLiabilityMilli,
        outstandingMilli: issue.outstandingMilli,
        deliveryRowRef: issue.deliveryRowRef,
        pricingSource: issue.pricingSource || null,
      });
    }
  }

  // Legacy assignment requests by rider code if sheet present
  let assignmentHits: unknown[] = [];
  if (assignmentReqs && assignmentReqs.length > 1) {
    const header = (assignmentReqs[0] || []).map((h) => String(h).toLowerCase());
    const codeIdx = header.findIndex((h) => h.includes('كود') || h.includes('rider'));
    assignmentHits = assignmentReqs
      .slice(1)
      .map((row, idx) => ({ row, rowIndex: idx + 1 }))
      .filter(({ row }) => {
        if (codeIdx >= 0) {
          return normalizeRiderCodeForPerformance(String(row[codeIdx] ?? '')) === norm;
        }
        // fallback scan first 8 cells
        return row
          .slice(0, 8)
          .some((c) => normalizeRiderCodeForPerformance(String(c ?? '')) === norm);
      })
      .slice(0, 5)
      .map(({ row, rowIndex }) => ({
        rowIndex,
        cellsPreview: row.slice(0, 6).map((c) => String(c ?? '').slice(0, 40)),
      }));
  }

  const readiness = assessEquipmentLiabilityReadiness({
    candidate: byRiderCode,
    deliveryRiderCode: TARGET,
    delivery: deliveryRows[0]
      ? {
          deliveryRowRef: String(deliveryRows[0].deliveryRowIndex),
          riderCode: deliveryRows[0].riderCode,
          deliveryType: deliveryRows[0].deliveryType,
          motorcyclePouch: deliveryRows[0].moto,
          bicyclePouch: deliveryRows[0].bike,
          tshirtQty: deliveryRows[0].tshirt,
          status: deliveryRows[0].status,
        }
      : null,
    riderMaster: { found: Boolean(liveRow), riderCode: TARGET },
    pricing: { adminPricingOk: pricing.ok },
  });

  const out = {
    mode: 'READ_ONLY_4D_5_4_10',
    riderCode: TARGET,
    at: new Date().toISOString(),
    flags: {
      FINANCIAL_APPLY: isSrs014FinancialApplyEnabled(),
      EQUIPMENT_LEDGER_local: isEquipmentLedgerEnabled(),
      RECRUITMENT_V2_local: isRecruitmentV2Enabled(),
    },
    mutations: 0,
    liveRider: liveRow
      ? {
          found: true,
          nameMin: minName(liveName),
          zone: String(liveRow[2] ?? ''),
          supervisorCode: String(liveRow[3] ?? ''),
          phonePresent: Boolean(livePhone),
          joinDate: String(liveRow[6] ?? ''),
          status: String(liveRow[7] ?? ''),
        }
      : { found: false },
    candidateByRiderCode: byRiderCode
      ? {
          found: true,
          candidateId: byRiderCode.id,
          nameMin: minName(byRiderCode.fullName),
          riderCode: byRiderCode.riderCode,
          activationStatus: byRiderCode.activationStatus,
          activationConfirmed: byRiderCode.activationConfirmed,
          security: byRiderCode.securityInquiryPayment || '(empty)',
          ops: byRiderCode.finalAssignedSupervisorCode || '(empty)',
        }
      : { found: false },
    humanReviewOnly: {
      note: 'Fuzzy/phone/name hits are NOT auto-linked. Human must confirm identity.',
      phoneHits,
      nameHits,
      deliveryNameHits,
    },
    deliveriesByRiderCode: deliveryRows,
    liabilitiesByRiderCode: liabilityRows,
    assignmentRequestHits: assignmentHits,
    pricingOk: pricing.ok,
    pricingEgp: pricing.ok ? pricing.egp : null,
    readiness,
    REAL_RIDER_MIRROR: liabilityRows.length > 0 ? 'AVAILABLE' : 'NOT_AVAILABLE',
  };

  fs.writeFileSync(
    path.join(process.cwd(), `tmp-srs014-4d5410-${TARGET}.json`),
    JSON.stringify(out, null, 2),
    'utf8'
  );
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
