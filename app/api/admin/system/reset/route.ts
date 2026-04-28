import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { clearSheetData } from '@/lib/googleSheets';
import { invalidateSupervisorCaches, notifySupervisorsOfChange } from '@/lib/realtimeSync';
import { cache, CACHE_KEYS } from '@/lib/cache';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ResetTarget =
  | 'performance'
  | 'riders'
  | 'requests'
  | 'debts'
  | 'deductions'
  | 'all';

const SHEETS_BY_TARGET: Record<Exclude<ResetTarget, 'all'>, string[]> = {
  performance: ['البيانات اليومية'],
  riders: ['المناديب'],
  requests: ['طلبات_التعيين', 'طلبات_الإقالة'],
  debts: ['الديون', 'المديونية'],
  deductions: ['الخصومات', 'السلف', 'المعدات'],
};

function getSheetsForTarget(target: ResetTarget): string[] {
  if (target === 'all') {
    return Array.from(new Set(Object.values(SHEETS_BY_TARGET).flat()));
  }
  return SHEETS_BY_TARGET[target] || [];
}

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '').trim();
    if (!token) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }

    const decoded = verifyToken(token);
    if (!decoded || decoded.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'غير مصرح - المدير فقط' }, { status: 401 });
    }

    let body: any = {};
    try {
      body = await request.json();
    } catch {
      // allow empty body
    }

    const target = (body?.target || 'all') as ResetTarget;
    const keepHeaderRow = body?.keepHeaderRow !== false; // default true

    const sheetsToClear = getSheetsForTarget(target);
    if (sheetsToClear.length === 0) {
      return NextResponse.json(
        { success: false, error: 'هدف التصفير غير صحيح' },
        { status: 400 }
      );
    }

    console.log(
      `[SystemReset] Admin ${decoded.code} requested reset target="${target}", keepHeaderRow=${keepHeaderRow}`
    );

    const results: { sheet: string; cleared: boolean }[] = [];

    for (const sheetName of sheetsToClear) {
      // Some sheets may not exist yet; clearSheetData returns false if not found.
      // We treat "not found" as non-fatal for a reset flow.
      try {
        const ok = await clearSheetData(sheetName, keepHeaderRow);
        results.push({ sheet: sheetName, cleared: ok });
      } catch (e: any) {
        console.warn(`[SystemReset] Failed clearing sheet "${sheetName}":`, e?.message || e);
        results.push({ sheet: sheetName, cleared: false });
      }
    }

    // Aggressive cache invalidation to ensure everyone sees the empty state.
    invalidateSupervisorCaches();

    // Clear all performance / dashboard / riders / debts caches (defensive).
    const keys = cache.keys();
    for (const key of keys) {
      if (
        key.includes('performance') ||
        key.includes('dashboard') ||
        key.includes('riders-data') ||
        key.includes('supervisor-riders') ||
        key.includes('debts') ||
        key.startsWith('sheet:')
      ) {
        cache.clear(key);
      }
    }

    // Also clear known sheet cache keys for the targets
    for (const sheetName of sheetsToClear) {
      cache.clear(CACHE_KEYS.sheetData(sheetName));
    }

    notifySupervisorsOfChange('performance');
    notifySupervisorsOfChange('riders');
    notifySupervisorsOfChange('debts');

    const clearedSheets = results.filter((r) => r.cleared).map((r) => r.sheet);
    const failedSheets = results.filter((r) => !r.cleared).map((r) => r.sheet);

    return NextResponse.json({
      success: failedSheets.length === 0,
      message:
        failedSheets.length === 0
          ? 'تمت تهيئة النظام بنجاح (تصفير البيانات التشغيلية)'
          : 'تمت التهيئة جزئياً (بعض الأوراق لم تُصفَّر)',
      target,
      keepHeaderRow,
      clearedSheets,
      failedSheets,
      results,
    });
  } catch (error: any) {
    console.error('[SystemReset] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'حدث خطأ في تهيئة النظام' },
      { status: 500 }
    );
  }
}

