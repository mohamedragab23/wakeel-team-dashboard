import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { assertAdminApiAccess } from '@/lib/adminApiAccess';
import { isEquipmentLedgerEnabled, SRS014_FLAG_OFF_BODY } from '@/lib/srs014Flags';
import {
  listEquipmentPaymentProposals,
  reviewEquipmentPaymentProposal,
  type OpeningAcceptFields,
  type ProposalWorkflowStatus,
} from '@/lib/equipmentLiability/paymentProposals';
import type { EquipmentPaymentStatus } from '@/lib/equipmentLiability/paymentStatus';
import type { OpeningSecurityStatus } from '@/lib/equipmentLiability/openingBalance';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const token = extractBearerToken(request);
  if (!token) return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
  const decoded = verifyToken(token) as { role?: string; permissions?: string } | null;
  const access = await assertAdminApiAccess(decoded, 'equipment_liability');
  if (access) return access;

  if (!isEquipmentLedgerEnabled()) {
    return NextResponse.json(SRS014_FLAG_OFF_BODY, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get('status') || 'pending';
  const proposals = await listEquipmentPaymentProposals(
    statusParam === 'all' ? undefined : { status: statusParam as ProposalWorkflowStatus }
  );
  return NextResponse.json({ success: true, proposals });
}

export async function POST(request: NextRequest) {
  const token = extractBearerToken(request);
  if (!token) return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
  const decoded = verifyToken(token) as {
    role?: string;
    code?: string;
    name?: string;
    permissions?: string;
  } | null;
  const access = await assertAdminApiAccess(decoded, 'equipment_liability');
  if (access) return access;

  if (!isEquipmentLedgerEnabled()) {
    return NextResponse.json(SRS014_FLAG_OFF_BODY, { status: 503 });
  }

  try {
    const body = await request.json();
    const proposalId = String(body.proposalId || '').trim();
    const action = String(body.action || '').trim() as 'accept' | 'reject' | 'modify_accept';
    const reviewerNote = String(body.reviewerNote || '').trim();
    const modifiedSettlementPaidEgp =
      body.modifiedSettlementPaidEgp == null || body.modifiedSettlementPaidEgp === ''
        ? null
        : Number(body.modifiedSettlementPaidEgp);
    const modifiedPaymentStatus = body.modifiedPaymentStatus
      ? (String(body.modifiedPaymentStatus).trim() as EquipmentPaymentStatus)
      : null;

    let opening: OpeningAcceptFields | undefined;
    if (body.opening && typeof body.opening === 'object') {
      const o = body.opening;
      const securityStatus = String(o.securityStatus || '').trim() as OpeningSecurityStatus;
      opening = {
        motorcycleBagHeld: Boolean(o.motorcycleBagHeld),
        bicycleBagHeld: Boolean(o.bicycleBagHeld),
        tshirtQuantity: Math.trunc(Number(o.tshirtQuantity) || 0),
        jacketQuantity: Math.trunc(Number(o.jacketQuantity) || 0),
        helmetQuantity: Math.trunc(Number(o.helmetQuantity) || 0),
        securityStatus,
        historicalPaidEgp: Number(o.historicalPaidEgp) || 0,
        operatorConfirmation: Boolean(o.operatorConfirmation),
        zoneSnapshot: String(o.zoneSnapshot || '').trim(),
      };
    }

    if (!proposalId) {
      return NextResponse.json({ success: false, error: 'معرّف الاقتراح مطلوب' }, { status: 400 });
    }
    if (!['accept', 'reject', 'modify_accept'].includes(action)) {
      return NextResponse.json({ success: false, error: 'إجراء غير صالح' }, { status: 400 });
    }

    const result = await reviewEquipmentPaymentProposal({
      proposalId,
      action,
      reviewerCode: decoded?.code || '',
      reviewerName: decoded?.name || decoded?.code || '',
      reviewerNote,
      modifiedSettlementPaidEgp,
      modifiedPaymentStatus,
      opening,
    });

    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      proposal: result.proposal,
      issue: result.issue
        ? {
            equipmentIssueId: result.issue.equipmentIssueId,
            outstandingMilli: result.issue.outstandingMilli,
            settlementPaidMilli: result.issue.settlementPaidMilli,
            status: result.issue.status,
          }
        : undefined,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'حدث خطأ';
    console.error('[admin/equipment-payment-proposals POST]', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
