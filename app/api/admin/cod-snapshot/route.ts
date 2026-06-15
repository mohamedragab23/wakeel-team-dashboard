import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { assertAdminApiAccess } from '@/lib/adminFeatureAccess';
import { parseCodWalletExcel, saveCodSnapshotForDate, loadCodDebtByRiderForDate } from '@/lib/codDebtLookup';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const token = extractBearerToken(request);
    if (!token) return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    const decoded = verifyToken(token);
    if (!decoded || decoded.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }
    const deny = assertAdminApiAccess(decoded, 'performance_upload');
    if (deny) return deny;

    const date = new URL(request.url).searchParams.get('date')?.trim() || '';
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ success: false, error: 'تاريخ مطلوب YYYY-MM-DD' }, { status: 400 });
    }
    const map = await loadCodDebtByRiderForDate(date);
    return NextResponse.json({ success: true, date, count: map.size });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = extractBearerToken(request);
    if (!token) return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    const decoded = verifyToken(token);
    if (!decoded || decoded.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }
    const deny = assertAdminApiAccess(decoded, 'performance_upload');
    if (deny) return deny;

    const formData = await request.formData();
    const file = formData.get('file');
    const dateIso = String(formData.get('date') ?? '').trim();
    if (!dateIso || !/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
      return NextResponse.json({ success: false, error: 'تاريخ المديونية مطلوب (YYYY-MM-DD)' }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: 'ملف COD مطلوب' }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const debtMap = parseCodWalletExcel(buffer, dateIso);
    const count = await saveCodSnapshotForDate(dateIso, debtMap, true);

    return NextResponse.json({
      success: true,
      message: `تم حفظ مديونية ${count} مندوب ليوم ${dateIso}`,
      count,
      date: dateIso,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
