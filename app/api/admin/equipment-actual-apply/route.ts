import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { assertAdminApiAccess } from '@/lib/adminApiAccess';
import { adminHasPermission } from '@/lib/adminPermissions';
import { applyActualPayrollFromLegacySheet } from '@/lib/equipmentDeductions/actualLegacyApply';
import {
  arabicMonthName,
  DEDUCTION_CYCLE_LABELS,
  type DeductionCycleKey,
} from '@/lib/equipmentSheetConstants';
import { isSrs014FinancialApplyEnabled } from '@/lib/srs014Flags';

export const dynamic = 'force-dynamic';

const CYCLE_KEYS = new Set<string>(Object.keys(DEDUCTION_CYCLE_LABELS));

/** Apply ACTUAL payroll from الاستقطاعات_الفعلية to liability (idempotent). */
export async function POST(request: NextRequest) {
  const token = extractBearerToken(request);
  if (!token) {
    return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
  }
  const decoded = verifyToken(token) as {
    role?: string;
    code?: string;
    name?: string;
  } | null;
  if (!decoded || decoded.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'المديرون فقط' }, { status: 401 });
  }

  const dr = await assertAdminApiAccess(decoded, 'deductions_reconcile');
  if (dr) return dr;
  if (!adminHasPermission(decoded, 'deductions_verify')) {
    return NextResponse.json(
      { success: false, error: 'صلاحية deductions_verify مطلوبة' },
      { status: 403 }
    );
  }

  if (isSrs014FinancialApplyEnabled()) {
    return NextResponse.json(
      { success: false, error: 'Financial Apply must remain OFF for legacy actual apply' },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const cycleRaw = String(body.deductionCycle || '').trim();
    if (!CYCLE_KEYS.has(cycleRaw)) {
      return NextResponse.json({ success: false, error: 'حدد دورة الاستقطاع' }, { status: 400 });
    }
    const cycleKey = cycleRaw as DeductionCycleKey;
    const monthNum = parseInt(String(body.month ?? ''), 10);
    const yearNum = parseInt(String(body.year ?? ''), 10);
    if (Number.isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      return NextResponse.json({ success: false, error: 'حدد الشهر' }, { status: 400 });
    }
    if (Number.isNaN(yearNum) || yearNum < 2020) {
      return NextResponse.json({ success: false, error: 'حدد السنة' }, { status: 400 });
    }

    const result = await applyActualPayrollFromLegacySheet({
      cycleLabel: DEDUCTION_CYCLE_LABELS[cycleKey],
      monthLabel: arabicMonthName(monthNum),
      year: yearNum,
      actor: { code: decoded.code || 'admin', name: decoded.name || decoded.code || 'admin' },
    });

    return NextResponse.json({ success: true, result, financialApplyEnabled: false });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'حدث خطأ';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
