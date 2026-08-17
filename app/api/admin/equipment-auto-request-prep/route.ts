import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { assertAdminApiAccess } from '@/lib/adminApiAccess';
import {
  isSrs014FinancialApplyEnabled,
  SRS014_FLAG_OFF_BODY,
  isPayoutCyclesEnabled,
} from '@/lib/srs014Flags';
import { findPayoutCycleForPrep, updatePayoutCycle } from '@/lib/payoutCycles/store';
import { adminFeatureAllowed } from '@/lib/adminFeatureAccess';
import { runEquipmentAutoRequestsForDate } from '@/lib/equipmentDeductions/autoRequest';
import { appendAuditLog } from '@/lib/auditLog';

export const dynamic = 'force-dynamic';

const SKIP_REASON_AR: Record<string, string> = {
  cycle_draft: 'الدورة مسودة',
  cycle_finalized: 'الدورة مقفلة',
  cycle_not_found: 'الدورة غير موجودة',
  no_cycle_for_date: 'لا توجد دورة مطابقة لتاريخ التوليد',
  missing_activation_date: 'تاريخ التفعيل ناقص على العهدة',
  activation_in_current_cycle: 'التفعيل داخل نفس الدورة (الاستقطاع يبدأ من الدورة التالية)',
  cycle_not_after_activation: 'الدورة ليست بعد تاريخ التفعيل',
  closing_cycle: 'دورة تقفيلة',
  equipment_deduction_disabled: 'استقطاع المعدات غير مفعّل على الدورة',
  no_outstanding: 'لا تبقّى مبلغ على العهدة',
  no_open_liabilities: 'لا توجد عهدات معدات مفتوحة',
};

function arabicSkipSummary(skipReasons: Record<string, number>): string {
  const parts = Object.entries(skipReasons)
    .filter(([, n]) => n > 0)
    .map(([reason, n]) => `${SKIP_REASON_AR[reason] || reason}: ${n}`);
  return parts.join(' · ');
}

function explainEmptyPrep(params: {
  processed: number;
  skipReasons: Record<string, number>;
  errors: string[];
}): string {
  if (params.errors.some((e) => e.startsWith('sheets_failure'))) {
    return `فشل قراءة الشيت: ${params.errors[0]}`;
  }
  if (params.errors.includes('cycle_draft')) {
    return 'الدورة ما زالت مسودة. فعّلها ثم أعد التجهيز.';
  }
  if (params.errors.includes('cycle_finalized')) {
    return 'الدورة مقفلة — لا يمكن تجهيز طلبات معدات عليها.';
  }
  if (params.processed === 0) {
    return (
      'مفيش عهدات معدات مفتوحة تتحوّل لاستقطاع. ' +
      'للطيارين الجدد: اعتمد تسليم المعدات. للناس القديمة: اعتمد اقتراح العهدة/التسوية من مسؤول المعدات. ' +
      'بعدها اضغط تجهيز طلبات المعدات تاني.'
    );
  }
  const skips = arabicSkipSummary(params.skipReasons);
  return skips
    ? `اتعالج ${params.processed} مندوب لكن مفيش صف استقطاع اتكتب. الأسباب: ${skips}`
    : `اتعالج ${params.processed} مندوب لكن مفيش صف استقطاع اتكتب على شيت الاستقطاعات.`;
}

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
  const accessEq = await assertAdminApiAccess(decoded, 'equipment_liability');
  const canPrepFromCycles = adminFeatureAllowed(decoded?.permissions, 'payout_cycles');
  if (accessEq && !canPrepFromCycles) return accessEq;

  if (!isPayoutCyclesEnabled()) {
    return NextResponse.json(SRS014_FLAG_OFF_BODY, { status: 503 });
  }

  try {
    const body = await request.json();
    const cycleId = String(body.cycleId || '').trim();
    const operatorConfirmation = Boolean(body.operatorConfirmation);
    if (!cycleId && !(body.year && body.month && body.cycleNumber)) {
      return NextResponse.json({ success: false, error: 'cycleId مطلوب' }, { status: 400 });
    }
    if (!operatorConfirmation) {
      return NextResponse.json(
        { success: false, error: 'يلزم التأكيد لتجهيز طلبات الاستقطاع' },
        { status: 400 }
      );
    }

    const actor = {
      code: decoded?.code || 'admin',
      name: decoded?.name || decoded?.code || 'admin',
    };

    let cycle = await findPayoutCycleForPrep({
      cycleId,
      year: body.year != null ? Number(body.year) : undefined,
      month: body.month != null ? Number(body.month) : undefined,
      cycleNumber: body.cycleNumber != null ? Number(body.cycleNumber) : undefined,
    });
    if (!cycle) {
      return NextResponse.json(
        {
          success: false,
          error:
            'دورة القبض غير موجودة في الشيت. حدّث الصفحة ثم أعد المحاولة. لو الرسالة تكررت فشل قراءة شيت دورات_القبض.',
        },
        { status: 404 }
      );
    }

    let activatedFromDraft = false;
    if (cycle.status === 'draft') {
      const activated = await updatePayoutCycle(cycle.cycleId, { status: 'active' }, actor);
      if (!activated.ok) {
        return NextResponse.json(
          {
            success: false,
            error: activated.errors?.[0]?.message || 'تعذر تفعيل الدورة من المسودة',
          },
          { status: 409 }
        );
      }
      cycle = activated.cycle;
      activatedFromDraft = true;
    }

    const asOfDate = String(cycle.deductionGenerationDate || cycle.endDate || '').trim();
    if (!asOfDate) {
      return NextResponse.json(
        {
          success: false,
          error: 'عيّن تاريخ توليد الاستقطاع (أو تاريخ نهاية الدورة) على دورة القبض أولاً',
        },
        { status: 400 }
      );
    }

    const result = await runEquipmentAutoRequestsForDate(asOfDate, actor, {
      cycleId: cycle.cycleId,
      deps: {
        // Explicit admin prep — not blocked by cron AUTO flag.
        isEnabled: () => true,
      },
    });

    void appendAuditLog({
      domain: 'equipment',
      action: 'admin_prepare_cycle_equipment_requests',
      entityType: 'payout_cycle',
      entityCode: cycle.cycleId,
      actorCode: decoded?.code || '',
      actorName: decoded?.name || '',
      after: {
        asOfDate,
        requested: result.requested,
        queued: result.queued,
        skipped: result.skipped,
        skipReasons: result.skipReasons,
        errors: result.errors,
        processed: result.processed,
        activatedFromDraft,
        financialApplyEnabled: isSrs014FinancialApplyEnabled(),
      },
    }).catch(() => undefined);

    const wrote = result.requested + result.queued;
    if (wrote === 0) {
      return NextResponse.json(
        {
          success: false,
          error: explainEmptyPrep({
            processed: result.processed,
            skipReasons: result.skipReasons,
            errors: result.errors,
          }),
          cycleId: cycle.cycleId,
          asOfDate,
          activatedFromDraft,
          result: {
            enabled: result.enabled,
            processed: result.processed,
            requested: result.requested,
            queued: result.queued,
            skipped: result.skipped,
            skipReasons: result.skipReasons,
            errors: result.errors,
          },
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      cycleId: cycle.cycleId,
      asOfDate,
      activatedFromDraft,
      result: {
        enabled: result.enabled,
        processed: result.processed,
        requested: result.requested,
        queued: result.queued,
        skipped: result.skipped,
        skipReasons: result.skipReasons,
        errors: result.errors,
      },
      financialApplyEnabled: isSrs014FinancialApplyEnabled(),
      note: 'اتكتب على شيت الاستقطاعات (معدات) — الأدمن يرفع الشيت لحسابات طلبات. لا خصم محفظة من الداشبورد.',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'حدث خطأ';
    console.error('[admin/equipment-auto-request-prep POST]', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
