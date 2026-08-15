import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { assertAdminApiAccess } from '@/lib/adminApiAccess';
import { isEquipmentLedgerEnabled, SRS014_FLAG_OFF_BODY } from '@/lib/srs014Flags';
import { getById } from '@/lib/equipmentLiability/store';
import {
  listPaymentsForIssue,
  toDeskIssueView,
} from '@/lib/equipmentLiability/payments';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  context: { params: { id: string } }
) {
  const token = extractBearerToken(_request);
  if (!token) {
    return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
  }
  const decoded = verifyToken(token) as { role?: string; permissions?: string } | null;
  const access = await assertAdminApiAccess(decoded, 'equipment_liability');
  if (access) return access;

  if (!isEquipmentLedgerEnabled()) {
    return NextResponse.json(SRS014_FLAG_OFF_BODY, { status: 503 });
  }

  try {
    const id = String(context.params.id || '').trim();
    if (!id) {
      return NextResponse.json({ success: false, error: 'معرف العهدة مطلوب' }, { status: 400 });
    }

    const issue = await getById(id);
    if (!issue) {
      return NextResponse.json(
        { success: false, error: 'EQUIPMENT_PAYMENT_LIABILITY_NOT_FOUND' },
        { status: 404 }
      );
    }

    let payments = [];
    try {
      payments = await listPaymentsForIssue(id);
    } catch (err) {
      console.error('[equipment-liability detail] payments read failed:', err);
      return NextResponse.json(
        { success: false, error: 'فشل قراءة سجل المدفوعات' },
        { status: 500 }
      );
    }

    const lastPaymentAt = payments[0]?.createdAt || payments[0]?.paymentDate;
    return NextResponse.json({
      success: true,
      issue: toDeskIssueView(issue, lastPaymentAt),
      payments,
    });
  } catch (error: any) {
    console.error('[equipment-liability detail GET]', error);
    return NextResponse.json(
      { success: false, error: error.message || 'فشل قراءة العهدة' },
      { status: 500 }
    );
  }
}
