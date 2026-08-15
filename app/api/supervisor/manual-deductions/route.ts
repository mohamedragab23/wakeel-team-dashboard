import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { isManualDeductionsV2Enabled, SRS014_FLAG_OFF_BODY } from '@/lib/srs014Flags';
import { assertSupervisorRider } from '@/lib/riderValidation';
import { appendAuditLog } from '@/lib/auditLog';
import {
  emitManualV2RequestObligation,
  isManualV2CycleKey,
  isManualV2UiReason,
  MANUAL_V2_UI_REASONS,
} from '@/lib/equipmentDeductions/manualV2Request';

export const dynamic = 'force-dynamic';

/**
 * Manual Deductions V2 — writes REQUEST on الاستقطاعات (source=manual_v2).
 * REQUEST ≠ collection. No Financial Apply / wallet / ledger_native on create.
 */
export async function GET(request: NextRequest) {
  const token = extractBearerToken(request);
  if (!token) return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
  const decoded = verifyToken(token);
  if (!decoded || (decoded.role !== 'supervisor' && decoded.role !== 'admin')) {
    return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
  }
  return NextResponse.json({
    success: true,
    enabled: isManualDeductionsV2Enabled(),
    reasons: MANUAL_V2_UI_REASONS,
  });
}

export async function POST(request: NextRequest) {
  const token = extractBearerToken(request);
  if (!token) return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
  const decoded = verifyToken(token) as {
    role?: string;
    code?: string;
    name?: string;
  } | null;
  if (!decoded || (decoded.role !== 'supervisor' && decoded.role !== 'admin')) {
    return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
  }
  if (!isManualDeductionsV2Enabled()) {
    return NextResponse.json(SRS014_FLAG_OFF_BODY, { status: 503 });
  }

  try {
    const body = await request.json();
    const riderCode = String(body.riderCode || '').trim();
    const riderName = String(body.riderName || riderCode).trim();
    const zone = String(body.zone || '').trim();
    const uiReason = String(body.reason || '').trim();
    const reasonOther = String(body.reasonOther || '').trim();
    const notes = String(body.notes || '').trim();
    const amountEgp = Number(body.amount);
    const year = Number(body.year);
    const month = Number(body.month);
    const cycleKey = String(body.cycleKey || '').trim();

    if (!riderCode) {
      return NextResponse.json({ success: false, error: 'كود المندوب مطلوب' }, { status: 400 });
    }
    if (!isManualV2UiReason(uiReason)) {
      return NextResponse.json(
        { success: false, error: 'السبب غير صالح — اختر من القائمة' },
        { status: 400 }
      );
    }
    if (!isManualV2CycleKey(cycleKey)) {
      return NextResponse.json(
        { success: false, error: 'دورة الاستقطاع يجب أن تكون الأولى أو الثانية أو الثالثة' },
        { status: 400 }
      );
    }

    if (decoded.role === 'supervisor') {
      const ownership = await assertSupervisorRider(riderCode, riderName, decoded.code || '');
      if (!ownership.ok) {
        return NextResponse.json(
          { success: false, error: ownership.error || 'المندوب غير تابع لك' },
          { status: 403 }
        );
      }
    }

    const result = await emitManualV2RequestObligation({
      riderCode,
      riderName,
      zone,
      amountEgp,
      uiReason,
      reasonOther,
      year,
      month,
      cycleKey,
      notes,
      supervisorCode: decoded.code || '',
      supervisorName: decoded.name || decoded.code || '',
    });

    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    void appendAuditLog({
      domain: 'payroll',
      action: 'manual_deduction_v2_request',
      entityType: 'rider',
      entityCode: riderCode,
      actorCode: decoded.code || '',
      actorName: decoded.name || '',
      after: {
        deductionId: result.deductionId,
        cycleId: result.cycleId,
        cycleLabel: result.cycleLabel,
        reason: result.reason,
        amountEgp,
        zone,
        outcome: result.outcome,
        source: 'manual_v2',
        financialSideEffects: result.financialSideEffects,
      },
    }).catch(() => undefined);

    return NextResponse.json({
      success: true,
      deductionId: result.deductionId,
      cycleId: result.cycleId,
      cycleLabel: result.cycleLabel,
      reason: result.reason,
      outcome: result.outcome,
      financialSideEffects: result.financialSideEffects,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'حدث خطأ';
    console.error('[manual-deductions POST]', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
