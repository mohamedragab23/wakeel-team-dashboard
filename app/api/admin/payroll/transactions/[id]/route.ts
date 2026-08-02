/**
 * SRS-013 Phase 3 — Payroll Ledger — single-transaction correct/void.
 *
 * `PATCH` = "edit": flips the original row's `status` to `corrected` and
 * appends a brand-new `active` row with `correctsTransactionId` pointing
 * back at it. `DELETE` = "delete": sets `status=voided` on that row only.
 * Neither ever overwrites or removes a row — append-only, per the frozen
 * design (SRS013_DESIGN_FREEZE.md Phase 3 §3).
 */
import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { assertAdminApiAccess } from '@/lib/adminFeatureAccess';
import { assertLimitedAdminSupervisorZoneAccess, assertLimitedAdminRiderZoneAccess } from '@/lib/adminZoneScope';
import { correctLedgerTransaction, findLedgerTransactionById, voidLedgerTransaction } from '@/lib/payrollLedger';
import { recordMetric } from '@/lib/telemetry';

export const dynamic = 'force-dynamic';

function isPayrollLedgerEnabled(): boolean {
  return String(process.env.FEATURE_PAYROLL_LEDGER_ENABLED || '').trim().toLowerCase() === 'true';
}

type Decoded = { role?: string; permissions?: string; name?: string; code?: string; dataZone?: string };

function authenticate(request: NextRequest): { ok: true; decoded: Decoded } | { ok: false; response: NextResponse } {
  const token = extractBearerToken(request);
  if (!token) {
    return { ok: false, response: NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 }) };
  }
  const decoded = verifyToken(token) as Decoded | null;
  if (!decoded || decoded.role !== 'admin') {
    return { ok: false, response: NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 }) };
  }
  return { ok: true, decoded };
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const startedAt = Date.now();
  const auth = authenticate(request);
  if (!auth.ok) return auth.response;
  const { decoded } = auth;
  const access = assertAdminApiAccess(decoded, 'payroll_ledger');
  if (access) return access;

  if (!isPayrollLedgerEnabled()) {
    return NextResponse.json({ success: false, enabled: false, error: 'سجل المعاملات المالية غير مفعّل حاليًا' }, { status: 503 });
  }

  const transactionId = params.id;
  const body = await request.json().catch(() => null);
  const amount = Number(body?.amount);
  const reason = String(body?.reason ?? '').trim();
  if (!Number.isFinite(amount) || amount === 0) {
    return NextResponse.json({ success: false, error: 'amount يجب أن يكون رقمًا غير صفري' }, { status: 400 });
  }

  try {
    const existing = await findLedgerTransactionById(transactionId);
    if (!existing) {
      return NextResponse.json({ success: false, error: 'المعاملة غير موجودة' }, { status: 404 });
    }
    if (existing.transaction.entityType === 'supervisor') {
      const zoneDeny = await assertLimitedAdminSupervisorZoneAccess(decoded as any, existing.transaction.entityCode);
      if (zoneDeny) return zoneDeny;
    } else if (existing.transaction.entityType === 'rider') {
      const zoneDeny = await assertLimitedAdminRiderZoneAccess(decoded as any, existing.transaction.entityCode);
      if (zoneDeny) return zoneDeny;
    }

    const result = await correctLedgerTransaction(
      transactionId,
      { amount, reason },
      { code: decoded.code || '', name: decoded.name || '' }
    );
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }
    void recordMetric({ feature: 'payroll_ledger', metric: 'exec_ms', value: Date.now() - startedAt, tags: { op: 'correct' } });
    return NextResponse.json({ success: true, original: result.original, corrected: result.corrected });
  } catch (error: any) {
    void recordMetric({ feature: 'payroll_ledger', metric: 'api_failure' });
    console.error('[api/admin/payroll/transactions/:id] PATCH', error);
    return NextResponse.json({ success: false, error: error?.message || 'خطأ' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const startedAt = Date.now();
  const auth = authenticate(request);
  if (!auth.ok) return auth.response;
  const { decoded } = auth;
  const access = assertAdminApiAccess(decoded, 'payroll_ledger');
  if (access) return access;

  if (!isPayrollLedgerEnabled()) {
    return NextResponse.json({ success: false, enabled: false, error: 'سجل المعاملات المالية غير مفعّل حاليًا' }, { status: 503 });
  }

  const transactionId = params.id;

  try {
    const existing = await findLedgerTransactionById(transactionId);
    if (!existing) {
      return NextResponse.json({ success: false, error: 'المعاملة غير موجودة' }, { status: 404 });
    }
    if (existing.transaction.entityType === 'supervisor') {
      const zoneDeny = await assertLimitedAdminSupervisorZoneAccess(decoded as any, existing.transaction.entityCode);
      if (zoneDeny) return zoneDeny;
    } else if (existing.transaction.entityType === 'rider') {
      const zoneDeny = await assertLimitedAdminRiderZoneAccess(decoded as any, existing.transaction.entityCode);
      if (zoneDeny) return zoneDeny;
    }

    const result = await voidLedgerTransaction(transactionId, { code: decoded.code || '', name: decoded.name || '' });
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }
    void recordMetric({ feature: 'payroll_ledger', metric: 'exec_ms', value: Date.now() - startedAt, tags: { op: 'void' } });
    return NextResponse.json({ success: true, transaction: result.transaction });
  } catch (error: any) {
    void recordMetric({ feature: 'payroll_ledger', metric: 'api_failure' });
    console.error('[api/admin/payroll/transactions/:id] DELETE', error);
    return NextResponse.json({ success: false, error: error?.message || 'خطأ' }, { status: 500 });
  }
}
