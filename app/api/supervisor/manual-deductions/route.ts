import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { isManualDeductionsV2Enabled, SRS014_FLAG_OFF_BODY } from '@/lib/srs014Flags';
import { assertSupervisorRider } from '@/lib/riderValidation';
import { appendLedgerTransaction } from '@/lib/payrollLedger';
import { getPayoutCycleById } from '@/lib/payoutCycles/store';
import { egpToMilliemes, milliemesToEgp } from '@/lib/money';
import { appendAuditLog } from '@/lib/auditLog';

export const dynamic = 'force-dynamic';

const REASONS = ['سلفة', 'خصم تشغيل'] as const;

/**
 * SRS-014 Phase F — Manual deductions V2 (no Excel).
 * Posts ledger_native rows; Excel upload remains for legacy.
 */
export async function GET(request: NextRequest) {
  const token = extractBearerToken(request);
  if (!token) return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
  const decoded = verifyToken(token);
  if (!decoded || (decoded.role !== 'supervisor' && decoded.role !== 'admin')) {
    return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
  }
  return NextResponse.json({ success: true, enabled: isManualDeductionsV2Enabled() });
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
    const reason = String(body.reason || '').trim() as (typeof REASONS)[number];
    const cycleId = String(body.cycleId || '').trim();
    const notes = String(body.notes || '').trim();
    const amountEgp = Number(body.amount);

    if (!riderCode) {
      return NextResponse.json({ success: false, error: 'كود المندوب مطلوب' }, { status: 400 });
    }
    if (!REASONS.includes(reason)) {
      return NextResponse.json({ success: false, error: 'السبب يجب أن يكون سلفة أو خصم تشغيل' }, { status: 400 });
    }
    if (!Number.isFinite(amountEgp) || amountEgp <= 0) {
      return NextResponse.json({ success: false, error: 'المبلغ يجب أن يكون أكبر من صفر' }, { status: 400 });
    }
    if (!cycleId) {
      return NextResponse.json({ success: false, error: 'cycleId مطلوب' }, { status: 400 });
    }

    if (decoded.role === 'supervisor') {
      const ownership = await assertSupervisorRider(riderCode, riderName, decoded.code || '');
      if (!ownership.ok) {
        return NextResponse.json({ success: false, error: ownership.error || 'المندوب غير تابع لك' }, { status: 403 });
      }
    }

    const cycle = await getPayoutCycleById(cycleId);
    if (!cycle) {
      return NextResponse.json({ success: false, error: 'دورة القبض غير موجودة' }, { status: 400 });
    }

    const amountMilli = egpToMilliemes(amountEgp);
    const period = `${cycle.year}-${String(cycle.month).padStart(2, '0')}`;
    const category = reason === 'سلفة' ? 'manual_advance' : 'manual_operational_deduction';
    const ledgerType = reason === 'سلفة' ? 'advance' : 'deduction';

    const txn = await appendLedgerTransaction({
      entityType: 'rider',
      entityCode: riderCode,
      entityNameSnapshot: riderName,
      type: ledgerType,
      rawAmount: milliemesToEgp(amountMilli),
      reason: notes ? `${reason} — ${notes}` : reason,
      period,
      createdBy: decoded.code || 'supervisor',
      createdByName: decoded.name || decoded.code || 'supervisor',
      source: 'ledger_native',
      category,
      cycleId,
    });

    void appendAuditLog({
      domain: 'payroll',
      action: 'manual_deduction_v2',
      entityType: 'rider',
      entityCode: riderCode,
      actorCode: decoded.code || '',
      actorName: decoded.name || '',
      after: { txn, reason, cycleId, amountMilli },
    }).catch(() => {});

    return NextResponse.json({ success: true, transaction: txn });
  } catch (error: any) {
    console.error('[manual-deductions POST]', error);
    return NextResponse.json({ success: false, error: error.message || 'حدث خطأ' }, { status: 500 });
  }
}
