import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { getSheetData } from '@/lib/googleSheets';
import { invalidateSupervisorCaches, notifySupervisorsOfChange } from '@/lib/realtimeSync';
import { cache, CACHE_KEYS } from '@/lib/cache';
import { getMainSpreadsheetId, getSheetsClientFor } from '@/lib/googleSheetsAuth';

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

function groupContiguousDescending(rows: number[]): Array<{ startRow: number; endRow: number }> {
  // rows are 1-based sheet row numbers, expected sorted DESC.
  const ranges: Array<{ startRow: number; endRow: number }> = [];
  let start = -1;
  let end = -1;
  for (const r of rows) {
    if (start === -1) {
      start = r;
      end = r;
      continue;
    }
    // contiguous downward: e.g., 100, 99, 98...
    if (r === end - 1) {
      end = r;
    } else {
      ranges.push({ startRow: end, endRow: start });
      start = r;
      end = r;
    }
  }
  if (start !== -1) ranges.push({ startRow: end, endRow: start });
  return ranges;
}

async function deleteRowsBatch(sheetName: string, rowNumbersDesc: number[]) {
  if (rowNumbersDesc.length === 0) return { deleted: 0 };

  const spreadsheetId = getMainSpreadsheetId();
  const sheets = await getSheetsClientFor('main');

  // Get sheetId once
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
  const sheet = spreadsheet.data.sheets?.find((s: any) => s.properties?.title === sheetName);
  if (!sheet) throw new Error(`Sheet "${sheetName}" not found`);
  const sheetId = sheet.properties.sheetId;

  const ranges = groupContiguousDescending(rowNumbersDesc);
  const requests = ranges.map((r) => ({
    deleteDimension: {
      range: {
        sheetId,
        dimension: 'ROWS',
        startIndex: r.startRow - 1, // 0-based inclusive
        endIndex: r.endRow, // 0-based exclusive (row number)
      },
    },
  }));

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests },
  });

  const deleted = rowNumbersDesc.length;
  return { deleted };
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
    const { deleted } = await deleteRowsBatch('البيانات اليومية', rowsToDelete);

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

