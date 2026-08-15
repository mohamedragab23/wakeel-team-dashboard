import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { assertAdminApiAccess } from '@/lib/adminApiAccess';
import { isEquipmentLedgerEnabled, SRS014_FLAG_OFF_BODY } from '@/lib/srs014Flags';
import { reconcileEquipmentLiabilityPayment } from '@/lib/equipmentLiability/paymentReconcile';
import { findPaymentById, toDeskIssueView } from '@/lib/equipmentLiability/payments';
import { getById } from '@/lib/equipmentLiability/store';

export const dynamic = 'force-dynamic';

type Decoded = { role?: string; permissions?: string; name?: string; code?: string };

/**
 * Manual Retry/Reconcile — uses original paymentId / idempotencyKey.
 * Never creates a new payment history row.
 */
export async function POST(
  _request: NextRequest,
  context: { params: { paymentId: string } }
) {
  const token = extractBearerToken(_request);
  if (!token) {
    return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
  }
  const decoded = verifyToken(token) as Decoded | null;
  const access = await assertAdminApiAccess(decoded, 'equipment_liability');
  if (access) return access;

  if (!isEquipmentLedgerEnabled()) {
    return NextResponse.json(SRS014_FLAG_OFF_BODY, { status: 503 });
  }

  try {
    const paymentId = String(context.params.paymentId || '').trim();
    if (!paymentId) {
      return NextResponse.json({ success: false, error: 'paymentId مطلوب' }, { status: 400 });
    }

    const before = await findPaymentById(paymentId);
    if (!before) {
      return NextResponse.json({ success: false, error: 'الدفعة غير موجودة' }, { status: 404 });
    }

    const item = await reconcileEquipmentLiabilityPayment(paymentId, {
      code: decoded?.code || 'admin',
      name: decoded?.name || decoded?.code || 'admin',
    });

    const payment = await findPaymentById(paymentId);
    const issue = payment ? await getById(payment.equipmentIssueId) : null;

    return NextResponse.json({
      success: true,
      reconcile: item,
      payment,
      issue: issue ? toDeskIssueView(issue) : null,
    });
  } catch (error: any) {
    console.error('[equipment-liability payment reconcile]', error);
    return NextResponse.json(
      { success: false, error: error.message || 'فشل المطابقة' },
      { status: 500 }
    );
  }
}
