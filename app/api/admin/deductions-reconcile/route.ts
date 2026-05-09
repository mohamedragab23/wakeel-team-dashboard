import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { assertAdminApiAccess } from '@/lib/adminFeatureAccess';
import { adminHasPermission } from '@/lib/adminPermissions';
import * as XLSX from 'xlsx';
import { appendToSheet, ensureHeaderRow, ensureSheetExists, getSheetData } from '@/lib/googleSheets';
import {
  DEDUCTION_CYCLE_LABELS,
  DEDUCTIONS_ACTUAL_HEADERS,
  SHEET_DEDUCTIONS_ACTUAL,
  SHEET_DEDUCTIONS_IMPORT,
  type DeductionCycleKey,
} from '@/lib/equipmentSheetConstants';
import {
  aggregateAdminByRider,
  aggregateSupervisorDeductionsForPeriod,
  buildActualDeductionRows,
  parseAdminExcelRows,
  periodFromForm,
} from '@/lib/deductionsReconcile';

export const dynamic = 'force-dynamic';

const CYCLE_KEYS = new Set<string>(Object.keys(DEDUCTION_CYCLE_LABELS));

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }
    const decoded = verifyToken(token);
    if (!decoded || decoded.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'المديرون فقط' }, { status: 401 });
    }

    const dr = assertAdminApiAccess(decoded, 'deductions_reconcile');
    if (dr) return dr;

    if (!adminHasPermission(decoded, 'deductions_verify')) {
      return NextResponse.json(
        {
          success: false,
          error:
            'لا تملك صلاحية مقارنة الاستقطاعات. أضف في عمود صلاحيات الأدمن: deductions_verify أو استقطاعات_ادمن',
        },
        { status: 403 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ success: false, error: 'لم يتم إرفاق ملف' }, { status: 400 });
    }

    const cycleRaw = (formData.get('deductionCycle') ?? '').toString().trim();
    if (!CYCLE_KEYS.has(cycleRaw)) {
      return NextResponse.json({ success: false, error: 'حدد دورة الاستقطاع' }, { status: 400 });
    }
    const cycleKey = cycleRaw as DeductionCycleKey;

    const monthNum = parseInt((formData.get('month') ?? '').toString().trim(), 10);
    if (Number.isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      return NextResponse.json({ success: false, error: 'حدد الشهر' }, { status: 400 });
    }

    const yearNum = parseInt((formData.get('year') ?? '').toString().trim(), 10);
    if (Number.isNaN(yearNum) || yearNum < 2020 || yearNum > 2100) {
      return NextResponse.json({ success: false, error: 'حدد السنة' }, { status: 400 });
    }

    const { cycleLabel, monthLabel, yearNum: y } = periodFromForm(cycleKey, monthNum, yearNum);

    const buf = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buf, { type: 'buffer', cellDates: true });
    const firstSheet = workbook.SheetNames[0];
    if (!firstSheet) {
      return NextResponse.json({ success: false, error: 'الملف فارغ' }, { status: 400 });
    }

    const sheet = workbook.Sheets[firstSheet];
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    if (!json.length) {
      return NextResponse.json({ success: false, error: 'لا توجد صفوف في الملف' }, { status: 400 });
    }

    const { rows: adminRows, errors: parseErrors } = parseAdminExcelRows(json);
    if (adminRows.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'لم يُستورد أي صف صالح من شيت المدير',
          details: parseErrors.slice(0, 25),
        },
        { status: 400 }
      );
    }

    const admMap = aggregateAdminByRider(adminRows);

    const supSheet = await getSheetData(SHEET_DEDUCTIONS_IMPORT, false);
    const supMap = aggregateSupervisorDeductionsForPeriod(supSheet, cycleLabel, monthLabel, y);

    const compareDate = new Date().toISOString().split('T')[0];
    const { rows: outRows, stats } = buildActualDeductionRows(supMap, admMap, cycleLabel, monthLabel, y, compareDate);

    if (outRows.length === 0) {
      return NextResponse.json({
        success: true,
        message:
          'لا توجد بيانات للمقارنة لهذه الفترة (لا صفوف مشرف مطابقة ولا صفوف مدير ذات خصم). تحقق من الدورة/الشهر/السنة في ورقة الاستقطاعات.',
        written: 0,
        stats,
        parseWarnings: parseErrors.length ? parseErrors.slice(0, 20) : undefined,
      });
    }

    const headers = [...DEDUCTIONS_ACTUAL_HEADERS];
    await ensureSheetExists(SHEET_DEDUCTIONS_ACTUAL, headers);
    await ensureHeaderRow(SHEET_DEDUCTIONS_ACTUAL, headers);
    await appendToSheet(SHEET_DEDUCTIONS_ACTUAL, outRows, false);

    return NextResponse.json({
      success: true,
      message: `تمت المقارنة وإضافة ${outRows.length} صفًا إلى ورقة «الاستقطاعات_الفعلية»`,
      written: outRows.length,
      stats,
      period: { cycle: cycleLabel, month: monthLabel, year: y },
      parseWarnings: parseErrors.length ? parseErrors.slice(0, 20) : undefined,
    });
  } catch (error: any) {
    console.error('[deductions-reconcile]', error);
    return NextResponse.json({ success: false, error: error.message || 'حدث خطأ' }, { status: 500 });
  }
}
