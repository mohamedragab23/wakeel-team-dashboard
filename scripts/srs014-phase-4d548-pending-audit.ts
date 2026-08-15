/**
 * 4D.5.4.8 — READ-ONLY audit of 4 pending equipment deliveries vs candidates.
 * Does NOT mutate candidates, deliveries, or liabilities.
 */
import fs from 'node:fs';
import path from 'node:path';
import { getSheetData } from '@/lib/googleSheets';
import { loadAllCandidates } from '@/lib/recruitment/recruitmentService';
import { assertPhaseCCandidateReady } from '@/lib/equipmentLiability/phaseCGates';
import { normalizeSecurityFeeInput } from '@/lib/recruitment/phaseB';
import { normalizeRiderCodeForPerformance } from '@/lib/riderCodeUtils';
import { deriveRecruitmentPipelineStage } from '@/lib/recruitment/phaseB';
import {
  isEquipmentLedgerEnabled,
  isRecruitmentV2Enabled,
  isSrs014FinancialApplyEnabled,
} from '@/lib/srs014Flags';
import { loadAdminEquipmentPricingFromSheets } from '@/lib/equipmentPricing/loadAdminPricing';
import { SHEET_EQUIPMENT_LIABILITY } from '@/lib/equipmentLiability/constants';

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
  const deliveryData = await getSheetData('تسليم_المعدات', false);
  const live = await getSheetData('المناديب', false);
  const liability = await getSheetData(SHEET_EQUIPMENT_LIABILITY, false);
  const cands = await loadAllCandidates(false);
  const pricing = await loadAdminEquipmentPricingFromSheets();

  const pending = (deliveryData || [])
    .slice(1)
    .map((row, idx) => ({ row, rowIndex: idx + 1 }))
    .filter(({ row }) => (String(row[12] ?? 'pending').trim() || 'pending') === 'pending')
    .map(({ row, rowIndex }) => ({
      kind: 'EQUIPMENT_DELIVERY_PENDING' as const,
      deliveryRowIndex: rowIndex,
      riderCode: String(row[2] ?? '').trim(),
      nameMin: minName(String(row[3] ?? '')),
      zone: String(row[4] ?? '').trim(),
      deliveryType: String(row[5] ?? '').trim(),
      moto: Number(row[6]) || 0,
      bike: Number(row[7]) || 0,
      tshirt: Number(row[8]) || 0,
      supervisorCode: String(row[0] ?? '').trim(),
      hasNationalIdInDelivery: false,
      phoneInDelivery: '',
    }));

  const reports = [];
  for (const p of pending) {
    const code = normalizeRiderCodeForPerformance(p.riderCode);
    const liveRow = live
      .slice(1)
      .find((r) => normalizeRiderCodeForPerformance(String(r[0] ?? '')) === code);
    const cand =
      cands.find(
        (c) => normalizeRiderCodeForPerformance(c.riderCode) === code
      ) || null;
    // fuzzy name only for existence hint — not used to invent linkage
    const nameHits = cands
      .filter((c) => {
        const a = String(c.fullName || '').toLowerCase();
        const b = String(p.nameMin || '')
          .toLowerCase()
          .replace('…', '')
          .trim();
        return b.length >= 8 && a.includes(b.slice(0, 10));
      })
      .slice(0, 3)
      .map((c) => ({
        candidateId: c.id,
        nameMin: minName(c.fullName),
        riderCode: c.riderCode || '(empty)',
        activationStatus: c.activationStatus,
        security: normalizeSecurityFeeInput(c.securityInquiryPayment) || 'UNKNOWN',
        ops: c.finalAssignedSupervisorCode || '(empty)',
        stage: deriveRecruitmentPipelineStage(c),
      }));

    const gate = assertPhaseCCandidateReady(cand, p.riderCode);
    reports.push({
      ...p,
      inLiveRiders: Boolean(liveRow),
      liveJoinDate: liveRow ? String(liveRow[6] ?? '') : '',
      liveStatus: liveRow ? String(liveRow[7] ?? '') : '',
      candidateExactByRiderCode: Boolean(cand),
      candidateId: cand?.id || null,
      candidateStage: cand ? deriveRecruitmentPipelineStage(cand) : null,
      securityStatus: cand
        ? normalizeSecurityFeeInput(cand.securityInquiryPayment) || 'UNKNOWN'
        : 'UNKNOWN',
      riderCodeOnCandidate: cand?.riderCode || '(none)',
      opsSupervisor: cand?.finalAssignedSupervisorCode || '(none)',
      activationStatus: cand?.activationStatus || '(no candidate)',
      activationConfirmed: cand?.activationConfirmed || '(no candidate)',
      lectureAttendance: cand?.lectureAttendance || '(no candidate)',
      phaseCGate: gate.ok ? { ok: true } : { ok: false, code: gate.code },
      nameFuzzyHits: nameHits,
      whyBlocked: !cand
        ? 'CANDIDATE_NOT_FOUND — delivery rider exists in المناديب but no Candidate.riderCode link'
        : !gate.ok
          ? gate.code
          : 'READY',
      humanActionRequired: !cand
        ? [
            'Confirm whether a real recruitment Candidate exists for this live rider',
            'If yes: set authoritative riderCode + Security PAID|NOT_PAID + activation + finalAssignedSupervisorCode via normal UI',
            'If no: this delivery is outside Recruitment V2 chain (legacy live-rider path) — HUMAN decision whether to onboard into candidates',
          ]
        : gate.ok
          ? []
          : ['Complete missing Phase-C fields via normal Recruitment/Admin UI (do not invent)'],
    });
  }

  const activated = cands.filter(
    (c) =>
      c.activationStatus === 'مفعل - تم القبول' || c.activationConfirmed === 'مؤكد'
  );

  console.log(
    JSON.stringify(
      {
        mode: 'READ_ONLY_4D548',
        flagsLocal: {
          RECRUITMENT_V2: isRecruitmentV2Enabled(),
          EQUIPMENT_LEDGER: isEquipmentLedgerEnabled(),
          FINANCIAL_APPLY: isSrs014FinancialApplyEnabled(),
        },
        pricingOk: pricing.ok,
        pricingEgp: pricing.ok ? pricing.egp : null,
        liabilityDataRows: Math.max(0, (liability?.length || 1) - 1),
        candidatesTotal: cands.length,
        withRiderCode: cands.filter((c) => String(c.riderCode || '').trim()).length,
        withSecurityExplicit: cands.filter(
          (c) => normalizeSecurityFeeInput(c.securityInquiryPayment) !== null
        ).length,
        withOpsSupervisor: cands.filter((c) =>
          String(c.finalAssignedSupervisorCode || '').trim()
        ).length,
        activatedCount: activated.length,
        activatedMissingRiderCode: activated.filter(
          (c) => !String(c.riderCode || '').trim()
        ).length,
        pendingDeliveries: reports,
        clarification:
          'These 4 pending items are EQUIPMENT DELIVERY rows (تسليم_المعدات), NOT recruitment candidate requests.',
        financialMutations: 0,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
