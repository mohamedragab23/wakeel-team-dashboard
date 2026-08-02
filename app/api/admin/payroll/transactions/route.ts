/**
 * SRS-013 Phase 3 — Payroll Ledger.
 *
 * `GET /api/admin/payroll/transactions` — list (optionally filtered by
 * `entityCode`/`period`), or a capability check when neither is given.
 * `POST /api/admin/payroll/transactions` — create a native ledger row
 * (`source: 'ledger_native'`).
 *
 * Frozen contract: SRS013_DESIGN_FREEZE.md Phase 3 §3.
 */
import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { assertAdminApiAccess } from '@/lib/adminFeatureAccess';
import { assertLimitedAdminSupervisorZoneAccess, assertLimitedAdminRiderZoneAccess } from '@/lib/adminZoneScope';
import { getAllSupervisors, getAllRiders } from '@/lib/adminService';
import {
  appendLedgerTransaction,
  getLedgerTransactions,
  type LedgerEntityType,
  type LedgerTransactionType,
} from '@/lib/payrollLedger';
import { recordMetric } from '@/lib/telemetry';

export const dynamic = 'force-dynamic';

const VALID_ENTITY_TYPES: LedgerEntityType[] = ['rider', 'supervisor'];
const VALID_TX_TYPES: LedgerTransactionType[] = ['bonus', 'deduction', 'advance', 'adjustment'];

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

async function resolveEntityNameSnapshot(entityType: LedgerEntityType, entityCode: string): Promise<string> {
  try {
    if (entityType === 'supervisor') {
      const sups = await getAllSupervisors();
      return sups.find((s) => s.code === entityCode)?.name || entityCode;
    }
    const riders = await getAllRiders();
    return riders.find((r) => r.code === entityCode)?.name || entityCode;
  } catch {
    return entityCode;
  }
}

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const auth = authenticate(request);
  if (!auth.ok) return auth.response;
  const { decoded } = auth;
  const access = assertAdminApiAccess(decoded, 'payroll_ledger');
  if (access) return access;

  const { searchParams } = new URL(request.url);
  const entityCode = searchParams.get('entityCode')?.trim() || undefined;
  const period = searchParams.get('period')?.trim() || undefined;
  // Optional, additive: absent (the only value every existing caller sends
  // today) preserves the exact prior behavior of always scope-checking
  // `entityCode` as a supervisor code. Only used to pick the correct
  // zone-scope check below when a future/rider-aware caller passes it.
  const entityTypeParam = searchParams.get('entityType')?.trim();

  // Capability check -- no filters given, works regardless of flag state (mirrors Phase 1/2's pattern).
  if (!entityCode && !period) {
    return NextResponse.json({ success: true, enabled: isPayrollLedgerEnabled() });
  }

  if (!isPayrollLedgerEnabled()) {
    return NextResponse.json({ success: false, enabled: false, error: 'سجل المعاملات المالية غير مفعّل حاليًا' }, { status: 503 });
  }

  if (entityCode) {
    const zoneDeny =
      entityTypeParam === 'rider'
        ? await assertLimitedAdminRiderZoneAccess(decoded as any, entityCode)
        : await assertLimitedAdminSupervisorZoneAccess(decoded as any, entityCode);
    if (zoneDeny) return zoneDeny;
  }

  try {
    const transactions = await getLedgerTransactions({ entityCode, period });
    void recordMetric({ feature: 'payroll_ledger', metric: 'exec_ms', value: Date.now() - startedAt, tags: { op: 'list' } });
    return NextResponse.json({ success: true, transactions });
  } catch (error: any) {
    void recordMetric({ feature: 'payroll_ledger', metric: 'api_failure' });
    console.error('[api/admin/payroll/transactions] GET', error);
    return NextResponse.json({ success: false, error: error?.message || 'خطأ' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const auth = authenticate(request);
  if (!auth.ok) return auth.response;
  const { decoded } = auth;
  const access = assertAdminApiAccess(decoded, 'payroll_ledger');
  if (access) return access;

  if (!isPayrollLedgerEnabled()) {
    return NextResponse.json({ success: false, enabled: false, error: 'سجل المعاملات المالية غير مفعّل حاليًا' }, { status: 503 });
  }

  try {
    const body = await request.json().catch(() => null);
    const entityType = String(body?.entityType ?? '').trim() as LedgerEntityType;
    const entityCode = String(body?.entityCode ?? '').trim();
    const type = String(body?.type ?? '').trim() as LedgerTransactionType;
    const amount = Number(body?.amount);
    const reason = String(body?.reason ?? '').trim();
    const period = String(body?.period ?? '').trim();

    if (!VALID_ENTITY_TYPES.includes(entityType)) {
      return NextResponse.json({ success: false, error: `entityType غير صالح. المتاح: ${VALID_ENTITY_TYPES.join(', ')}` }, { status: 400 });
    }
    if (!entityCode) {
      return NextResponse.json({ success: false, error: 'entityCode مطلوب' }, { status: 400 });
    }
    if (!VALID_TX_TYPES.includes(type)) {
      return NextResponse.json({ success: false, error: `type غير صالح. المتاح: ${VALID_TX_TYPES.join(', ')}` }, { status: 400 });
    }
    if (!Number.isFinite(amount) || amount === 0) {
      return NextResponse.json({ success: false, error: 'amount يجب أن يكون رقمًا غير صفري' }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}$/.test(period)) {
      return NextResponse.json({ success: false, error: 'period يجب أن يكون بصيغة YYYY-MM' }, { status: 400 });
    }

    if (entityType === 'supervisor') {
      const zoneDeny = await assertLimitedAdminSupervisorZoneAccess(decoded as any, entityCode);
      if (zoneDeny) return zoneDeny;
    } else if (entityType === 'rider') {
      const zoneDeny = await assertLimitedAdminRiderZoneAccess(decoded as any, entityCode);
      if (zoneDeny) return zoneDeny;
    }

    const entityNameSnapshot = await resolveEntityNameSnapshot(entityType, entityCode);

    const transaction = await appendLedgerTransaction({
      entityType,
      entityCode,
      entityNameSnapshot,
      type,
      rawAmount: amount,
      reason,
      period,
      createdBy: decoded.code || '',
      createdByName: decoded.name || '',
      source: 'ledger_native',
    });

    void recordMetric({ feature: 'payroll_ledger', metric: 'exec_ms', value: Date.now() - startedAt, tags: { type } });
    return NextResponse.json({ success: true, transaction });
  } catch (error: any) {
    void recordMetric({ feature: 'payroll_ledger', metric: 'api_failure' });
    console.error('[api/admin/payroll/transactions] POST', error);
    return NextResponse.json({ success: false, error: error?.message || 'خطأ' }, { status: 500 });
  }
}
