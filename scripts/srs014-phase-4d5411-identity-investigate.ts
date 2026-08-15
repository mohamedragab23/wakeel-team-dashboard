/**
 * 4D.5.4.11 — READ-ONLY identity investigation for rider 4811093.
 * Fuzzy/phone/name/NID matches = HUMAN_REVIEW only. Never merge/link/write.
 */
import fs from 'node:fs';
import path from 'node:path';
import { getSheetData } from '@/lib/googleSheets';
import { SHEET_EQUIPMENT_LIABILITY } from '@/lib/equipmentLiability/constants';
import { rowToEquipmentLiability } from '@/lib/equipmentLiability/store';
import { loadAllCandidates } from '@/lib/recruitment/recruitmentService';
import {
  normalizeIdentityPhone,
  normalizeNationalId,
  phonesMatchForDuplicate,
} from '@/lib/recruitment/phaseB';
import { normalizeRiderCodeForPerformance } from '@/lib/riderCodeUtils';
import { assessEquipmentLiabilityReadiness } from '@/lib/recruitment/equipmentLiabilityReadiness';
import { loadAdminEquipmentPricingFromSheets } from '@/lib/equipmentPricing/loadAdminPricing';
import { isSrs014FinancialApplyEnabled } from '@/lib/srs014Flags';

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

function nameTokens(name: string): string[] {
  return String(name || '')
    .replace(/_WAKEEL.*/i, '')
    .replace(/[_\-]+/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 3);
}

function tokenOverlapScore(a: string, b: string): number {
  const ta = new Set(nameTokens(a));
  const tb = nameTokens(b);
  if (ta.size === 0 || tb.length === 0) return 0;
  let hit = 0;
  for (const t of tb) if (ta.has(t)) hit++;
  return hit;
}

async function main() {
  loadEnvLocal();
  const norm = normalizeRiderCodeForPerformance(TARGET)!;

  const [live, cands, deliverySheet, liabilities, pricing, assignmentReqs, outreach] =
    await Promise.all([
      getSheetData('المناديب', false),
      loadAllCandidates(false),
      getSheetData('تسليم_المعدات', false),
      getSheetData(SHEET_EQUIPMENT_LIABILITY, false),
      loadAdminEquipmentPricingFromSheets(),
      getSheetData('طلبات_التعيين', false).catch(() => null),
      getSheetData('Outreach', false).catch(() =>
        getSheetData(' outreaching', false).catch(() => null)
      ),
    ]);

  // Try alternate outreach sheet names if needed
  let outreachData = outreach;
  if (!outreachData) {
    for (const name of [' outreaching', 'التواصل', 'مرشحين_التواصل', 'Outreach_Leads']) {
      try {
        const d = await getSheetData(name.trim(), false);
        if (d?.length) {
          outreachData = d;
          break;
        }
      } catch {
        /* ignore */
      }
    }
  }

  const liveHeader = (live?.[0] || []).map((h) => String(h ?? ''));
  const liveRow = live
    .slice(1)
    .find((r) => normalizeRiderCodeForPerformance(String(r[0] ?? '')) === norm);

  const liveFull = liveRow
    ? {
        found: true,
        header: liveHeader,
        cells: liveRow.map((c, i) => ({
          col: i,
          header: liveHeader[i] || `col${i}`,
          valuePreview: String(c ?? '').slice(0, 80),
          empty: !String(c ?? '').trim(),
        })),
        name: String(liveRow[1] ?? ''),
        nameMin: minName(String(liveRow[1] ?? '')),
        zone: String(liveRow[2] ?? ''),
        supervisorCode: String(liveRow[3] ?? ''),
        supervisorName: String(liveRow[4] ?? ''),
        phone: String(liveRow[5] ?? '').trim(),
        joinDate: String(liveRow[6] ?? ''),
        status: String(liveRow[7] ?? ''),
        // scan all cells for phone-like / NID-like
        phoneLike: liveRow
          .map((c, i) => ({ i, v: normalizeIdentityPhone(String(c ?? '')) }))
          .filter((x) => x.v.length >= 8),
        nidLike: liveRow
          .map((c, i) => ({ i, v: normalizeNationalId(String(c ?? '')) }))
          .filter((x) => x.v.length === 14),
      }
    : { found: false };

  const byRiderCode =
    cands.find((c) => normalizeRiderCodeForPerformance(c.riderCode) === norm) || null;

  const livePhone =
    liveFull.found && 'phone' in liveFull
      ? liveFull.phone || liveFull.phoneLike[0]?.v || ''
      : '';
  const liveName = liveFull.found && 'name' in liveFull ? liveFull.name : '';

  const phoneHits = livePhone
    ? cands
        .filter(
          (c) =>
            phonesMatchForDuplicate(c.phone, livePhone) ||
            phonesMatchForDuplicate(c.phoneSecondary, livePhone)
        )
        .map((c) => ({
          matchType: 'phone' as const,
          authoritative: false,
          humanReviewOnly: true,
          candidateId: c.id,
          nameMin: minName(c.fullName),
          riderCode: c.riderCode || '(empty)',
          activationStatus: c.activationStatus,
          activationConfirmed: c.activationConfirmed,
          lectureAttendance: c.lectureAttendance,
          securityInquiryPayment: c.securityInquiryPayment || '(empty)',
          finalAssignedSupervisorCode: c.finalAssignedSupervisorCode || '(empty)',
          nationalIdPresent: Boolean(normalizeNationalId(c.nationalId)),
        }))
    : [];

  const nidHits: unknown[] = [];
  if (liveFull.found && 'nidLike' in liveFull && liveFull.nidLike.length) {
    for (const n of liveFull.nidLike) {
      for (const c of cands) {
        if (normalizeNationalId(c.nationalId) === n.v) {
          nidHits.push({
            matchType: 'nationalId',
            authoritative: false,
            humanReviewOnly: true,
            candidateId: c.id,
            nameMin: minName(c.fullName),
            riderCode: c.riderCode || '(empty)',
            securityInquiryPayment: c.securityInquiryPayment || '(empty)',
          });
        }
      }
    }
  }

  const scored = cands
    .map((c) => ({
      c,
      score: tokenOverlapScore(liveName, c.fullName),
    }))
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 15)
    .map(({ c, score }) => ({
      matchType: 'name_token_overlap',
      authoritative: false,
      humanReviewOnly: true,
      overlapScore: score,
      candidateId: c.id,
      nameMin: minName(c.fullName),
      fullNamePreview: String(c.fullName).slice(0, 60),
      riderCode: c.riderCode || '(empty)',
      phoneDigitsLen: normalizeIdentityPhone(c.phone).length,
      activationStatus: c.activationStatus,
      activationConfirmed: c.activationConfirmed,
      lectureAttendance: c.lectureAttendance,
      securityInquiryPayment: c.securityInquiryPayment || '(empty)',
      finalAssignedSupervisorCode: c.finalAssignedSupervisorCode || '(empty)',
    }));

  // Exact normalized name equality (still not auto-link — human must confirm)
  const liveNormName = nameTokens(liveName).join(' ');
  const exactNameHits = cands
    .filter((c) => nameTokens(c.fullName).join(' ') === liveNormName && liveNormName.length >= 8)
    .map((c) => ({
      matchType: 'exact_normalized_name',
      authoritative: false,
      humanReviewOnly: true,
      note: 'Name equality alone is NOT authoritative for linkage',
      candidateId: c.id,
      nameMin: minName(c.fullName),
      riderCode: c.riderCode || '(empty)',
      securityInquiryPayment: c.securityInquiryPayment || '(empty)',
      finalAssignedSupervisorCode: c.finalAssignedSupervisorCode || '(empty)',
      activationStatus: c.activationStatus,
    }));

  const deliveries = (deliverySheet || [])
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
      status: String(row[12] ?? '').trim(),
      equipmentIssueId: String(row[17] ?? '').trim(),
    }));

  const liabilityRows = [];
  for (let i = 1; i < (liabilities?.length || 0); i++) {
    const issue = rowToEquipmentLiability(liabilities![i], i + 1);
    if (issue && normalizeRiderCodeForPerformance(issue.riderCode) === norm) {
      liabilityRows.push({
        equipmentIssueId: issue.equipmentIssueId,
        status: issue.status,
        originalLiabilityMilli: issue.originalLiabilityMilli,
      });
    }
  }

  let assignmentHits: unknown[] = [];
  if (assignmentReqs?.length) {
    const header = (assignmentReqs[0] || []).map((h) => String(h ?? ''));
    assignmentHits = assignmentReqs
      .slice(1)
      .map((row, idx) => ({ row, rowIndex: idx + 1 }))
      .filter(({ row }) =>
        row.some((c) => normalizeRiderCodeForPerformance(String(c ?? '')) === norm)
      )
      .slice(0, 10)
      .map(({ row, rowIndex }) => ({
        rowIndex,
        headerSample: header.slice(0, 8),
        cellsPreview: row.slice(0, 10).map((c) => String(c ?? '').slice(0, 40)),
      }));
  }

  // Authoritative only: Candidate.riderCode === 4811093
  const authoritative =
    byRiderCode != null
      ? {
          found: true as const,
          candidateId: byRiderCode.id,
          reason: 'Candidate.riderCode exactly equals live riderCode 4811093',
          candidate: {
            nameMin: minName(byRiderCode.fullName),
            riderCode: byRiderCode.riderCode,
            activationStatus: byRiderCode.activationStatus,
            activationConfirmed: byRiderCode.activationConfirmed,
            activationDate: byRiderCode.activationDate,
            lectureAttendance: byRiderCode.lectureAttendance,
            securityInquiryPayment: byRiderCode.securityInquiryPayment || '(empty)',
            finalAssignedSupervisorCode:
              byRiderCode.finalAssignedSupervisorCode || '(empty)',
          },
        }
      : {
          found: false as const,
          verdict: 'LEGACY_RIDER_WITHOUT_RECRUITMENT_CANDIDATE',
        };

  const readiness = assessEquipmentLiabilityReadiness({
    candidate: byRiderCode,
    deliveryRiderCode: TARGET,
    delivery: deliveries[0]
      ? {
          deliveryRowRef: String(deliveries[0].deliveryRowIndex),
          riderCode: deliveries[0].riderCode,
          deliveryType: deliveries[0].deliveryType,
          status: deliveries[0].status,
        }
      : null,
    riderMaster: { found: Boolean(liveRow), riderCode: TARGET },
    pricing: { adminPricingOk: pricing.ok },
  });

  const out = {
    mode: 'READ_ONLY_4D_5_4_11',
    riderCode: TARGET,
    at: new Date().toISOString(),
    FINANCIAL_APPLY: isSrs014FinancialApplyEnabled(),
    mutations: 0,
    liveRider: liveFull,
    authoritativeLinkage: authoritative,
    humanReviewCandidates: {
      note: 'NOT authoritative. Do not auto-merge.',
      phoneHits,
      nidHits,
      exactNameHits,
      nameTokenOverlapHits: scored,
    },
    deliveries,
    liabilities: liabilityRows,
    assignmentHits,
    pricingOk: pricing.ok,
    readiness,
    REAL_RIDER_MIRROR: liabilityRows.length ? 'AVAILABLE' : 'NOT_AVAILABLE',
  };

  fs.writeFileSync(
    path.join(process.cwd(), 'tmp-srs014-4d5411-4811093.json'),
    JSON.stringify(out, null, 2),
    'utf8'
  );
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
