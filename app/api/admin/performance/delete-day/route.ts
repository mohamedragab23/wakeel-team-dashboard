import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { deleteSheetRow, getSheetData } from '@/lib/googleSheets';
import { invalidateSupervisorCaches, notifySupervisorsOfChange } from '@/lib/realtimeSync';
import { cache, CACHE_KEYS } from '@/lib/cache';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function toLocalIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function normalizeAnyDateToIso(v: any): string | null {
  if (!v) return null;
  if (v instanceof Date && Number.isFinite(v.getTime())) return toLocalIsoDate(v);
  const s = String(v).trim();
  if (!s) return null;
  const mIso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (mIso) return `${mIso[1]}-${mIso[2]}-${mIso[3]}`;
  const mSlash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (mSlash) {
    const a = parseInt(mSlash[1], 10);
    const b = parseInt(mSlash[2], 10);
    const y = parseInt(mSlash[3], 10);
    const month = a > 12 ? b : a;
    const day = a > 12 ? a : b;
    const d = new Date(y, month - 1, day);
    return Number.isFinite(d.getTime()) ? toLocalIsoDate(d) : null;
  }
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? toLocalIsoDate(d) : null;
}

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });

    const decoded = verifyToken(token);
    if (!decoded || decoded.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'غير مصرح - المدير فقط' }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as any;
    const dateIso = (body?.date ?? '').toString().trim();
    if (!dateIso || !/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
      return NextResponse.json({ success: false, error: 'تاريخ غير صالح (YYYY-MM-DD)' }, { status: 400 });
    }

    const sheet = await getSheetData('البيانات اليومية', false);
    if (!sheet || sheet.length <= 1) {
      return NextResponse.json({ success: true, message: 'لا توجد بيانات للحذف', deleted: 0 });
    }

    // Collect row numbers (1-based) to delete, then delete from bottom to top
    const rowsToDelete: number[] = [];
    for (let i = 1; i < sheet.length; i++) {
      const row = sheet[i] || [];
      const iso = normalizeAnyDateToIso(row[0]);
      if (iso === dateIso) {
        rowsToDelete.push(i + 1); // sheet rows are 1-indexed
      }
    }

    // Delete from bottom to top to keep indices valid
    rowsToDelete.sort((a, b) => b - a);
    let deleted = 0;
    for (const rowNumber of rowsToDelete) {
      const ok = await deleteSheetRow('البيانات اليومية', rowNumber);
      if (ok) deleted++;
    }

    // Clear caches and notify
    cache.clear(CACHE_KEYS.sheetData('البيانات اليومية'));
    const allKeys = cache.keys();
    for (const key of allKeys) {
      if (key.includes('performance') || key.includes('dashboard') || key.includes('riders-data')) {
        cache.clear(key);
      }
    }
    invalidateSupervisorCaches();
    notifySupervisorsOfChange('performance');

    return NextResponse.json({
      success: true,
      message: deleted > 0 ? `تم حذف أداء يوم ${dateIso} بنجاح` : `لم يتم العثور على بيانات لهذا اليوم (${dateIso})`,
      deleted,
      date: dateIso,
    });
  } catch (error: any) {
    console.error('[DeletePerformanceDay] Error:', error);
    return NextResponse.json({ success: false, error: error.message || 'حدث خطأ' }, { status: 500 });
  }
}

