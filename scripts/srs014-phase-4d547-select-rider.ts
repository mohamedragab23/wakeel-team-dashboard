/**
 * 4D.5.4.7 — READ-ONLY candidate selection for real rider liability.
 * No append/update/approve. No Financial Apply.
 */
import fs from 'node:fs';
import path from 'node:path';
import { getSheetData } from '@/lib/googleSheets';
import { SHEET_EQUIPMENT_LIABILITY } from '@/lib/equipmentLiability/constants';
import { rowToEquipmentLiability } from '@/lib/equipmentLiability/store';
import {
  isEquipmentLedgerEnabled,
  isSrs014FinancialApplyEnabled,
  isAutoEquipmentDeductionsEnabled,
} from '@/lib/srs014Flags';
import { loadAllCandidates } from '@/lib/recruitment/recruitmentService';

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

async function main() {
  loadEnvLocal();
  const fa = isSrs014FinancialApplyEnabled();
  const ledger = isEquipmentLedgerEnabled();
  const auto = isAutoEquipmentDeductionsEnabled();

  const liabilityData = await getSheetData(SHEET_EQUIPMENT_LIABILITY, false);
  const deliveryData = await getSheetData('تسليم_المعدات', false);
  const pricingData = await getSheetData('أسعار_المعدات', false);

  const issues = (liabilityData || [])
    .slice(1)
    .map((r, i) => rowToEquipmentLiability(r as unknown[], i + 2))
    .filter(Boolean);
  const openRiderCodes = new Set(
    issues
      .filter((i) => i && String(i.status || '').toLowerCase() !== 'closed')
      .map((i) => i!.riderCode)
  );

  const deliveries = (deliveryData || []).slice(1).map((row, idx) => {
    const rowIndex = idx + 1; // sheet data index used by API
    return {
      rowIndex,
      supervisorCode: String(row[0] ?? '').trim(),
      supervisorName: String(row[1] ?? '').trim(),
      riderCode: String(row[2] ?? '').trim(),
      riderName: String(row[3] ?? '').trim(),
      zone: String(row[4] ?? '').trim(),
      deliveryType: String(row[5] ?? '').trim(),
      moto: Number(row[6]) || 0,
      bike: Number(row[7]) || 0,
      tshirt: Number(row[8]) || 0,
      jacket: Number(row[9]) || 0,
      helmet: Number(row[10]) || 0,
      status: String(row[12] ?? 'pending').trim() || 'pending',
      equipmentIssueId: String(row[17] ?? '').trim(),
    };
  });

  const pending = deliveries.filter((d) => d.status === 'pending');
  const approvedNoIssue = deliveries.filter(
    (d) => d.status === 'approved' && !d.equipmentIssueId
  );
  const assignmentPending = pending.filter((d) => {
    const t = d.deliveryType;
    return (
      /تعيين|assignment|new/i.test(t) ||
      (!/تبديل|swap/i.test(t) && (d.moto > 0 || d.bike > 0))
    );
  });

  let candidates: Awaited<ReturnType<typeof loadAllCandidates>> = [];
  try {
    candidates = await loadAllCandidates(false);
  } catch (e) {
    console.log(JSON.stringify({ candidatesLoadError: String(e) }));
  }

  const readyCandidates = candidates
    .filter((c) => {
      const code = String(c.riderCode || '').trim();
      if (!code) return false;
      if (openRiderCodes.has(code)) return false;
      const actOk =
        String(c.activationConfirmed || '') === 'نعم' ||
        String(c.activationStatus || '').toLowerCase().includes('activ');
      const hasDate = Boolean(String(c.activationDate || '').trim());
      return actOk && hasDate;
    })
    .slice(0, 40)
    .map((c) => ({
      riderCode: c.riderCode,
      fullName: c.fullName,
      zone: c.zone,
      activationDate: c.activationDate,
      activationConfirmed: c.activationConfirmed,
      activationStatus: c.activationStatus,
      securityInquiryPayment: c.securityInquiryPayment,
      vehicleType: c.vehicleType,
      finalAssignedSupervisorCode: c.finalAssignedSupervisorCode,
      equipmentStatus: c.equipmentStatus,
    }));

  // Pending deliveries whose rider is Phase-C plausible and has no open liability
  const pendingSuitable = assignmentPending
    .filter((d) => d.riderCode && !openRiderCodes.has(d.riderCode))
    .map((d) => {
      const c = candidates.find(
        (x) =>
          String(x.riderCode || '').trim().toUpperCase() ===
          d.riderCode.toUpperCase()
      );
      return {
        ...d,
        candidateFound: Boolean(c),
        activationDate: c?.activationDate || '',
        activationConfirmed: c?.activationConfirmed || '',
        securityInquiryPayment: c?.securityInquiryPayment || '',
        vehicleType: c?.vehicleType || '',
        finalAssignedSupervisorCode: c?.finalAssignedSupervisorCode || '',
      };
    });

  const out = {
    mode: 'READ_ONLY_SELECT',
    flags: {
      FEATURE_SRS014_FINANCIAL_APPLY_ENABLED: fa,
      FEATURE_EQUIPMENT_LEDGER_ENABLED: ledger,
      FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED: auto,
    },
    pricingHeader: pricingData?.[0] || null,
    pricingRow: pricingData?.[1] || null,
    liabilityRowCount: Math.max(0, (liabilityData?.length || 1) - 1),
    openLiabilityCount: openRiderCodes.size,
    openRiderCodes: [...openRiderCodes].slice(0, 20),
    deliveryTotal: deliveries.length,
    pendingCount: pending.length,
    assignmentPendingCount: assignmentPending.length,
    approvedNoIssueCount: approvedNoIssue.length,
    pendingSuitable: pendingSuitable.slice(0, 25),
    readyCandidatesSample: readyCandidates.slice(0, 15),
    pendingSample: pending.slice(0, 10),
    approvedNoIssueSample: approvedNoIssue.slice(0, 10),
  };

  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
