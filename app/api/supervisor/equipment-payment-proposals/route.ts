import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { isEquipmentLedgerEnabled, SRS014_FLAG_OFF_BODY } from '@/lib/srs014Flags';
import { assertSupervisorRider } from '@/lib/riderValidation';
import {
  createEquipmentPaymentProposal,
  listEquipmentPaymentProposals,
} from '@/lib/equipmentLiability/paymentProposals';
import { getById } from '@/lib/equipmentLiability/store';
import type { EquipmentPaymentStatus } from '@/lib/equipmentLiability/paymentStatus';

export const dynamic = 'force-dynamic';

const STATUSES: EquipmentPaymentStatus[] = ['UNPAID', 'PARTIALLY_PAID', 'PAID'];

export async function GET(request: NextRequest) {
  const token = extractBearerToken(request);
  if (!token) return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
  const decoded = verifyToken(token) as { role?: string; code?: string } | null;
  if (!decoded || decoded.role !== 'supervisor') {
    return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
  }
  if (!isEquipmentLedgerEnabled()) {
    return NextResponse.json(SRS014_FLAG_OFF_BODY, { status: 503 });
  }

  try {
    const proposals = await listEquipmentPaymentProposals({
      supervisorCode: decoded.code || '',
    });
    return NextResponse.json({ success: true, proposals });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'حدث خطأ';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const token = extractBearerToken(request);
  if (!token) return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
  const decoded = verifyToken(token) as {
    role?: string;
    code?: string;
    name?: string;
  } | null;
  if (!decoded || decoded.role !== 'supervisor') {
    return NextResponse.json({ success: false, error: 'غير مصرح — للمشرفين فقط' }, { status: 401 });
  }
  if (!isEquipmentLedgerEnabled()) {
    return NextResponse.json(SRS014_FLAG_OFF_BODY, { status: 503 });
  }

  try {
    const body = await request.json();
    const equipmentIssueId = String(body.equipmentIssueId || '').trim();
    const proposedPaymentStatus = String(body.proposedPaymentStatus || '').trim() as EquipmentPaymentStatus;
    const proposedOutstandingNote = String(body.proposedOutstandingNote || '').trim();
    const proposedSettlementPaidEgp =
      body.proposedSettlementPaidEgp == null || body.proposedSettlementPaidEgp === ''
        ? null
        : Number(body.proposedSettlementPaidEgp);

    if (!equipmentIssueId) {
      return NextResponse.json({ success: false, error: 'معرّف العهدة مطلوب' }, { status: 400 });
    }
    if (!STATUSES.includes(proposedPaymentStatus)) {
      return NextResponse.json({ success: false, error: 'حالة السداد المقترحة غير صالحة' }, { status: 400 });
    }

    const issue = await getById(equipmentIssueId);
    if (!issue) {
      return NextResponse.json({ success: false, error: 'عهدة المعدات غير موجودة' }, { status: 404 });
    }

    const ownership = await assertSupervisorRider(
      issue.riderCode,
      issue.riderNameSnapshot,
      decoded.code || ''
    );
    if (!ownership.ok) {
      return NextResponse.json(
        { success: false, error: ownership.error || 'المندوب غير تابع لك' },
        { status: 403 }
      );
    }

    const result = await createEquipmentPaymentProposal({
      equipmentIssueId,
      proposedPaymentStatus,
      proposedSettlementPaidEgp,
      proposedOutstandingNote,
      supervisorCode: decoded.code || '',
      supervisorName: decoded.name || decoded.code || '',
    });

    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, proposal: result.proposal });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'حدث خطأ';
    console.error('[supervisor/equipment-payment-proposals POST]', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
