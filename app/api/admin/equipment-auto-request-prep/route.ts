import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { assertAdminApiAccess } from '@/lib/adminApiAccess';
import {
  isSrs014FinancialApplyEnabled,
  SRS014_FLAG_OFF_BODY,
  isPayoutCyclesEnabled,
} from '@/lib/srs014Flags';
import { getPayoutCycleById } from '@/lib/payoutCycles/store';
import { runEquipmentAutoRequestsForDate } from '@/lib/equipmentDeductions/autoRequest';
import { appendAuditLog } from '@/lib/auditLog';

export const dynamic = 'force-dynamic';

/**
 * Manual admin prep of equipment REQUEST rows for a payout cycle.
 * Same domain as cron Auto REQUEST — FA stays OFF.
 * Explicit button may run even when FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED is OFF.
 */
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

  if (!isPayoutCyclesEnabled()) {
    return NextResponse.json(SRS014_FLAG_OFF_BODY, { status: 503 });
  }

  try {
    const body = await request.json();
    const cycleId = String(body.cycleId || '').trim();
    const operatorConfirmation = Boolean(body.operatorConfirmation);
    if (!cycleId) {
      return NextResponse.json({ success: false, error: 'cycleId مطلوب' }, { status: 400 });
    }
    if (!operatorConfirmation) {
      return NextResponse.json(
        { success: false, error: 'يلزم التأكيد لتجهيز طلبات الاستقطاع' },
        { status: 400 }
      );
    }

    const cycle = await getPayoutCycleById(cycleId);
    if (!cycle) {
      return NextResponse.json({ success: false, error: 'دورة القبض غير موجودة' }, { status: 404 });
    }

    const asOfDate = String(
      cycle.deductionGenerationDate || cycle.endDate || ''
    ).trim();
    if (!asOfDate) {
      return NextResponse.json(
        {
          success: false,
          error: 'عيّن تاريخ توليد الاستقطاع (أو تاريخ نهاية الدورة) على دورة القبض أولاً',
        },
        { status: 400 }
      );
    }

    const result = await runEquipmentAutoRequestsForDate(
      asOfDate,
      {
        code: decoded?.code || 'admin',
        name: decoded?.name || decoded?.code || 'admin',
      },
      {
        deps: {
          // Explicit admin prep — not blocked by cron AUTO flag.
          isEnabled: () => true,
        },
      }
    );

    void appendAuditLog({
      domain: 'equipment',
      action: 'admin_prepare_cycle_equipment_requests',
      entityType: 'payout_cycle',
      entityCode: cycleId,
      actorCode: decoded?.code || '',
      actorName: decoded?.name || '',
      after: {
        asOfDate,
        requested: result.requested,
        queued: result.queued,
        skipped: result.skipped,
        errors: result.errors,
        financialApplyEnabled: isSrs014FinancialApplyEnabled(),
      },
    }).catch(() => undefined);

    return NextResponse.json({
      success: true,
      cycleId,
      asOfDate,
      result: {
        enabled: result.enabled,
        processed: result.processed,
        requested: result.requested,
        queued: result.queued,
        skipped: result.skipped,
        errors: result.errors,
      },
      financialApplyEnabled: isSrs014FinancialApplyEnabled(),
      note: 'REQUEST فقط على الاستقطاعات — لا خصم محفظة. خصم يدوي V2 يُضاف للورقة عند رفع المشرف.',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'حدث خطأ';
    console.error('[admin/equipment-auto-request-prep POST]', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
