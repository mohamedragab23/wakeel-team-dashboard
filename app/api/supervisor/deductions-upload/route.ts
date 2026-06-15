import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import * as XLSX from 'xlsx';
import { appendToSheet, ensureHeaderRow, ensureSheetExists } from '@/lib/googleSheets';
import {
  arabicMonthName,
  DEDUCTION_CYCLE_LABELS,
  DEDUCTION_IMPORT_HEADERS,
  DEDUCTION_UPLOAD_LOG_HEADERS,
  type DeductionCycleKey,
  SHEET_DEDUCTIONS_IMPORT,
  SHEET_DEDUCTIONS_UPLOAD_LOG,
} from '@/lib/equipmentSheetConstants';

export const dynamic = 'force-dynamic';

const CYCLE_KEYS = new Set<string>(Object.keys(DEDUCTION_CYCLE_LABELS));

function normalizeHeader(h: string): string {
  return h
    .toString()
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function mapRowFromObject(obj: Record<string, any>): {
  riderCode: string;
  riderName: string;
  amount: number;
  reason: string;
  zone: string;
} | null {
  const keys = Object.keys(obj);
  const norm: Record<string, string> = {};
  for (const k of keys) {
    norm[normalizeHeader(k)] = k;
  }

  const pick = (...candidates: string[]): string => {
    for (const c of candidates) {
      const n = normalizeHeader(c);
      if (norm[n] !== undefined) {
        const v = obj[norm[n]];
        return v !== undefined && v !== null ? String(v).trim() : '';
      }
    }
    return '';
  };

  const riderCode = pick('كود المندوب', 'كود_المندوب', 'code', 'rider code', 'rider_code');
  const riderName = pick('اسم المندوب', 'اسم_المندوب', 'name', 'rider name');
  const amountStr = pick('قيمة الاستقطاع', 'قيمة_الاستقطاع', 'amount', 'value', 'القيمة');
  const reason = pick('سبب الاستقطاع', 'سبب_الاستقطاع', 'reason', 'السبب');
  const zone = pick('الزون', 'zone', 'المنطقة', 'region');

  if (!riderCode) return null;

  const amount = Number(String(amountStr).replace(/,/g, ''));
  if (Number.isNaN(amount)) {
    return null;
  }

  return { riderCode, riderName, amount, reason, zone };
}

export async function POST(request: NextRequest) {
  try {
    const token = extractBearerToken(request);
    if (!token) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }
    const decoded = verifyToken(token);
    if (!decoded || decoded.role !== 'supervisor') {
      return NextResponse.json({ success: false, error: 'المشرفون فقط' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ success: false, error: 'لم يتم إرفاق ملف' }, { status: 400 });
    }

    const cycleRaw = (formData.get('deductionCycle') ?? '').toString().trim();
    if (!CYCLE_KEYS.has(cycleRaw)) {
      return NextResponse.json(
        { success: false, error: 'حدد دورة الاستقطاع (الأولى، الثانية، الثالثة، الرابعة، أو التقفيلة)' },
        { status: 400 }
      );
    }
    const cycleKey = cycleRaw as DeductionCycleKey;
    const cycleLabel = DEDUCTION_CYCLE_LABELS[cycleKey];

    const monthNum = parseInt((formData.get('month') ?? '').toString().trim(), 10);
    if (Number.isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      return NextResponse.json({ success: false, error: 'حدد الشهر (1–12)' }, { status: 400 });
    }
    const monthLabel = arabicMonthName(monthNum);

    const yearNum = parseInt((formData.get('year') ?? '').toString().trim(), 10);
    if (Number.isNaN(yearNum) || yearNum < 2020 || yearNum > 2100) {
      return NextResponse.json({ success: false, error: 'حدد السنة بشكل صحيح' }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buf, { type: 'buffer', cellDates: true });
    const firstSheet = workbook.SheetNames[0];
    if (!firstSheet) {
      return NextResponse.json({ success: false, error: 'الملف فارغ' }, { status: 400 });
    }

    const sheet = workbook.Sheets[firstSheet];
    const json = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });
    if (!json.length) {
      return NextResponse.json({ success: false, error: 'لا توجد صفوف في الملف' }, { status: 400 });
    }

    const uploadDate = new Date().toISOString().split('T')[0];
    const supCode = decoded.code?.toString().trim() || '';
    const supName = decoded.name?.toString().trim() || '';

    const rows: any[][] = [];
    const errors: string[] = [];

    json.forEach((obj, idx) => {
      const parsed = mapRowFromObject(obj);
      if (!parsed) {
        errors.push(`صف ${idx + 2}: بيانات ناقصة أو قيمة غير رقمية`);
        return;
      }
      rows.push([
        uploadDate,
        supCode,
        supName,
        parsed.riderCode,
        parsed.riderName,
        parsed.amount,
        parsed.reason,
        parsed.zone,
        cycleLabel,
        monthLabel,
        yearNum,
      ]);
    });

    if (rows.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'لم يتم استيراد أي صف صحيح',
          details: errors.slice(0, 20),
        },
        { status: 400 }
      );
    }

    const importHeaders = [...DEDUCTION_IMPORT_HEADERS];
    const logHeaders = [...DEDUCTION_UPLOAD_LOG_HEADERS];

    await ensureSheetExists(SHEET_DEDUCTIONS_IMPORT, importHeaders);
    await ensureHeaderRow(SHEET_DEDUCTIONS_IMPORT, importHeaders);
    await appendToSheet(SHEET_DEDUCTIONS_IMPORT, rows, false);

    try {
      await ensureSheetExists(SHEET_DEDUCTIONS_UPLOAD_LOG, logHeaders);
      await ensureHeaderRow(SHEET_DEDUCTIONS_UPLOAD_LOG, logHeaders);
      await appendToSheet(
        SHEET_DEDUCTIONS_UPLOAD_LOG,
        [[new Date().toISOString(), supCode, supName, cycleLabel, monthLabel, yearNum, rows.length]],
        false
      );
    } catch (logErr) {
      console.error('[deductions-upload] log sheet:', logErr);
    }

    return NextResponse.json({
      success: true,
      message: `تم إضافة ${rows.length} صف — الدورة ${cycleLabel}، ${monthLabel} ${yearNum}`,
      imported: rows.length,
      period: { cycle: cycleLabel, month: monthLabel, year: yearNum },
      errors: errors.length ? errors.slice(0, 30) : undefined,
    });
  } catch (error: any) {
    console.error('[deductions-upload]', error);
    return NextResponse.json({ success: false, error: error.message || 'حدث خطأ' }, { status: 500 });
  }
}
