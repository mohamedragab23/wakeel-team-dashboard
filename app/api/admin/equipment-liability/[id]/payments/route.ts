import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { assertAdminApiAccess } from '@/lib/adminFeatureAccess';
import { isEquipmentLedgerEnabled, SRS014_FLAG_OFF_BODY } from '@/lib/srs014Flags';
import {
  listPaymentsForIssue,
  recordEquipmentLiabilityCashPayment,
  toDeskIssueView,
} from '@/lib/equipmentLiability/payments';
import { egpToMilliemes } from '@/lib/money';

export const dynamic = 'force-dynamic';

type Decoded = { role?: string; permissions?: string; name?: string; code?: string };

export async function GET(
  _request: NextRequest,
  context: { params: { id: string } }
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
    const id = String(context.params.id || '').trim();
    const payments = await listPaymentsForIssue(id);
    return NextResponse.json({ success: true, payments });
  } catch (error: any) {
    console.error('[equipment-liability payments GET]', error);
    return NextResponse.json(
      { success: false, error: error.message || 'فشل قراءة سجل المدفوعات' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  context: { params: { id: string } }
) {
  const token = extractBearerToken(request);
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
    const id = String(context.params.id || '').trim();
    const body = await request.json();

    let amountMilli: number;
    if (body.amountMilli != null && body.amountMilli !== '') {
      amountMilli = Number(body.amountMilli);
    } else if (body.amountEgp != null && body.amountEgp !== '') {
      amountMilli = egpToMilliemes(Number(body.amountEgp));
    } else {
      return NextResponse.json(
        {
          success: false,
          error: 'EQUIPMENT_PAYMENT_INVALID_AMOUNT',
          code: 'EQUIPMENT_PAYMENT_INVALID_AMOUNT',
        },
        { status: 400 }
      );
    }

    const result = await recordEquipmentLiabilityCashPayment(
      {
        equipmentIssueId: id,
        amountMilli,
        paymentMethod: String(body.paymentMethod || 'CASH'),
        note: body.note != null ? String(body.note) : '',
        idempotencyKey: String(body.idempotencyKey || ''),
        paymentDate: body.paymentDate != null ? String(body.paymentDate) : undefined,
      },
      {
        code: decoded?.code || 'admin',
        name: decoded?.name || decoded?.code || 'admin',
      }
    );

    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: result.error, code: result.code },
        { status: result.httpStatus }
      );
    }

    return NextResponse.json({
      success: true,
      replayed: result.replayed,
      payment: result.payment,
      issue: toDeskIssueView(result.issue),
      paymentStatus: result.paymentStatus,
      receipt: {
        paymentId: result.payment.paymentId,
        amountMilli: result.payment.amountMilli,
        resultingOutstandingMilli: result.payment.resultingOutstandingMilli,
        resultingSettlementPaidMilli: result.payment.resultingSettlementPaidMilli,
        actorCode: result.payment.actorCode,
        actorName: result.payment.actorName,
        createdAt: result.payment.createdAt,
        paymentMethod: result.payment.paymentMethod,
      },
    });
  } catch (error: any) {
    console.error('[equipment-liability payments POST]', error);
    return NextResponse.json(
      { success: false, error: error.message || 'فشل تسجيل الدفعة' },
      { status: 500 }
    );
  }
}
