/**
 * Rider 360 — read-only aggregate across recruitment / liability / obligations.
 * Does not mutate money or enable financial apply.
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { assertAdminApiAccess } from '@/lib/adminApiAccess';
import { normalizeRiderCodeForPerformance } from '@/lib/riderCodeUtils';
import { findCandidateByRiderCode } from '@/lib/equipmentLiability/store';
import { listOpenIssues, getById } from '@/lib/equipmentLiability/store';
import {
  createSheetsObligationLedgerStore,
  listPersistedObligations,
} from '@/lib/equipmentDeductions/requestPersistence';
import {
  appendToSheet,
  ensureHeaderRow,
  ensureSheetExists,
  getSheetDataOrThrow,
  updateSheetRow,
} from '@/lib/googleSheets';
import { listByCandidate } from '@/lib/recruitment/contactsStore';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const token = extractBearerToken(request);
    if (!token) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const decoded = verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const denied = await assertAdminApiAccess(decoded, 'equipment_liability');
    if (denied) return denied;

    const raw = request.nextUrl.searchParams.get('riderCode') || '';
    const riderCode = normalizeRiderCodeForPerformance(raw);
    if (!riderCode) {
      return NextResponse.json(
        { success: false, error: 'riderCode required' },
        { status: 400 }
      );
    }

    const candidate = await findCandidateByRiderCode(riderCode);
    let contacts: unknown[] = [];
    try {
      if (candidate?.id) {
        contacts = await listByCandidate(candidate.id);
      }
    } catch {
      contacts = [];
    }

    const openAll = await listOpenIssues();
    const openIssues = openAll.filter((i) => i.riderCode === riderCode);

    let obligations: unknown[] = [];
    try {
      const store = await createSheetsObligationLedgerStore({
        ensureSheetExists,
        ensureHeaderRow,
        getSheetDataOrThrow,
        appendToSheet,
        updateSheetRow,
      });
      const all = await listPersistedObligations(store);
      obligations = all
        .filter(
          (r) => normalizeRiderCodeForPerformance(r.obligation.riderCode) === riderCode
        )
        .map((r) => ({
          deductionId: r.obligation.deductionId,
          reason: r.obligation.reason,
          originalAmount: r.obligation.originalAmount,
          paidAmount: r.obligation.paidAmount,
          remainingAmount: r.obligation.remainingAmount,
          status: r.obligation.status,
          currentCycleId: r.obligation.currentCycleId,
          equipmentIssueId: r.obligation.equipmentIssueId,
        }));
    } catch {
      obligations = [];
    }

    // Optional single issue expand
    const issueId = request.nextUrl.searchParams.get('equipmentIssueId');
    let issueDetail = null;
    if (issueId) {
      issueDetail = await getById(issueId);
    }

    return NextResponse.json({
      success: true,
      financialMutation: false,
      financialApplyEnabled: false,
      riderCode,
      identity: candidate
        ? {
            name: candidate.fullName,
            phone: candidate.phone,
            phoneSecondary: candidate.phoneSecondary,
            nationalId: candidate.nationalId,
            zone: candidate.zone,
            riderCode: candidate.riderCode,
            activationStatus: candidate.activationStatus,
            activationConfirmed: candidate.activationConfirmed,
            activationDate: candidate.activationDate,
            lectureDate: candidate.lectureDate,
            lectureAttendance: candidate.lectureAttendance,
            finalAssignedSupervisorCode: candidate.finalAssignedSupervisorCode,
            securityInquiryPayment: candidate.securityInquiryPayment,
            vehicleType: candidate.vehicleType,
          }
        : null,
      contacts,
      equipmentLiability: {
        openIssues,
        issueDetail,
      },
      obligations,
      notes: [
        'Read-only aggregate. Expected/Actual/Apply details require Manager Compare + Financial Apply Gos.',
        'FEATURE_SRS014_FINANCIAL_APPLY_ENABLED remains OFF on this path.',
      ],
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[rider-360]', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
