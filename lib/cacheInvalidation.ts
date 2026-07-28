import { cache, CACHE_KEYS } from '@/lib/cache';
import { tieredCacheDelete, tieredCacheDeleteByPrefix } from '@/lib/tieredCache';
import { invalidateSupervisorCaches, notifySupervisorsOfChange } from '@/lib/realtimeSync';

export interface RiderCacheInvalidationOptions {
  oldSupervisorCode?: string;
  newSupervisorCode?: string;
  extraSheets?: string[];
  notify?: boolean;
}

const PERFORMANCE_PREFIXES = [
  'dashboard:',
  'riders:',
  'ridersData:',
  'performance:',
  'strategic-ops:',
  'salary:',
] as const;

const SYNC_SHEETS = [
  'البيانات اليومية',
  'المناديب',
  'المشرفين',
  'الديون',
  'السلف',
  'الخصومات',
  'المعدات',
  'استعلام أمني',
  'إعدادات_الرواتب',
] as const;

/** Clear one sheet tab from L1 + L2 (read cache only). */
export async function invalidateSheetCache(sheetName: string): Promise<void> {
  const baseKey = CACHE_KEYS.sheetData(sheetName);
  await tieredCacheDelete(baseKey);
  for (const key of cache.keys()) {
    if (key.startsWith(`${baseKey}::`)) {
      await tieredCacheDelete(key);
    }
  }
}

/** After performance sync / daily sheet replace — invalidate derived caches. */
export async function invalidateAfterPerformanceSync(supervisorCode?: string): Promise<void> {
  await invalidateSheetCache('البيانات اليومية');

  for (const prefix of PERFORMANCE_PREFIXES) {
    await tieredCacheDeleteByPrefix(prefix);
  }

  cache.clear('admin:riders');

  if (supervisorCode?.trim()) {
    const c = supervisorCode.trim();
    await tieredCacheDelete(CACHE_KEYS.supervisorRiders(c));
    await tieredCacheDelete(CACHE_KEYS.ridersData(c));
    for (const key of cache.keys()) {
      if (key.startsWith(`dashboard:${c}:`)) {
        await tieredCacheDelete(key);
      }
    }
  }
}

/** Broader invalidation for rider workflow / assignment changes. */
export async function invalidateRiderWorkflowCaches(
  options: RiderCacheInvalidationOptions = {}
): Promise<void> {
  const { oldSupervisorCode, newSupervisorCode, extraSheets = [], notify = true } = options;

  const supervisorCodes = new Set<string>();
  if (oldSupervisorCode?.trim()) supervisorCodes.add(oldSupervisorCode.trim());
  if (newSupervisorCode?.trim()) supervisorCodes.add(newSupervisorCode.trim());

  for (const code of supervisorCodes) {
    invalidateSupervisorCaches(code);
    await tieredCacheDelete(CACHE_KEYS.supervisorRiders(code));
    await tieredCacheDelete(CACHE_KEYS.ridersData(code));
    await tieredCacheDeleteByPrefix(`dashboard:${code}:`);
  }

  cache.clear('admin:riders');
  await tieredCacheDeleteByPrefix('riders:');

  const sheetsToClear = new Set([
    'المناديب',
    'طلبات_الإقالة',
    'طلبات_إعادة_التفعيل',
    'طلبات_التعيين',
    'بيانات_المناديب_الاستراتيجية',
    'سجل_بيانات_المناديب_الاستراتيجية',
    ...extraSheets,
  ]);
  for (const sheet of sheetsToClear) {
    await invalidateSheetCache(sheet);
  }

  for (const prefix of ['ridersData:', 'performance:', 'salary:'] as const) {
    await tieredCacheDeleteByPrefix(prefix);
  }

  const allKeys = cache.keys();
  for (const key of allKeys) {
    if (
      key.includes('supervisor-riders') ||
      key.includes('riders-data') ||
      key.includes('riders:') ||
      key.includes('ridersData:') ||
      key.includes('sheet:المناديب') ||
      key.includes('sheet:طلبات_')
    ) {
      await tieredCacheDelete(key);
    }
  }

  if (notify) {
    notifySupervisorsOfChange('riders');
  }
}

/** Invalidate strategic ops computed reports (L1 + L2). */
export async function invalidateStrategicOpsCaches(): Promise<void> {
  await tieredCacheDeleteByPrefix('strategic-ops:');
}

/** Invalidate salary calculation caches (L1 + L2). */
export async function invalidateSalaryCaches(supervisorCode?: string): Promise<void> {
  if (supervisorCode?.trim()) {
    await tieredCacheDeleteByPrefix(`salary:${supervisorCode.trim()}:`);
  } else {
    await tieredCacheDeleteByPrefix('salary:');
  }
}

/** Full cache bust after bulk sync or admin reset (Sheets read caches + derived). */
export async function invalidateAfterBulkDataSync(): Promise<void> {
  for (const sheet of SYNC_SHEETS) {
    await invalidateSheetCache(sheet);
  }
  for (const prefix of PERFORMANCE_PREFIXES) {
    await tieredCacheDeleteByPrefix(prefix);
  }
  cache.clear('admin:supervisors');
  cache.clear('admin:riders');
}

/** Invalidate derived caches when a sheet tab is written (Sheets remains SoT). */
export async function invalidateAfterSheetWrite(sheetName: string): Promise<void> {
  await invalidateSheetCache(sheetName);

  if (sheetName === 'البيانات اليومية') {
    for (const prefix of PERFORMANCE_PREFIXES) {
      await tieredCacheDeleteByPrefix(prefix);
    }
    cache.clear('admin:riders');
    return;
  }

  if (
    sheetName === 'المناديب' ||
    sheetName === 'المشرفين' ||
    sheetName.startsWith('طلبات_')
  ) {
    await tieredCacheDeleteByPrefix('riders:');
    await tieredCacheDeleteByPrefix('ridersData:');
    await tieredCacheDeleteByPrefix('dashboard:');
    await tieredCacheDeleteByPrefix('performance:');
    cache.clear('admin:riders');
    return;
  }

  if (
    sheetName === 'إعدادات_الرواتب' ||
    sheetName === 'السلف' ||
    sheetName === 'الخصومات' ||
    sheetName === 'المعدات' ||
    sheetName === 'استعلام أمني' ||
    sheetName === 'قبض_المشرفين' ||
    // Pre-existing gap discovered during the SRS-013 Phase 3 production
    // rollout verification (2026-07-28): خصومات_الإدارة (admin-applied
    // supervisor deductions, app/api/admin/salary/admin-deductions/route.ts)
    // feeds straight into calculateSupervisorSalary()'s `adminDeductionTotal`
    // exactly like the sheets above, but was never added to this list --
    // meaning a brand-new admin deduction silently sat invisible in the
    // salary calc for up to the full 10-minute cache TTL. Confirmed via the
    // Phase 3 acceptance script's double-counting-guard test (delta stayed
    // 0 instead of -300 immediately after posting a deduction). Unrelated to
    // the new Payroll Ledger's own logic -- fixed here as a plain bugfix.
    sheetName === 'خصومات_الإدارة' ||
    // SRS-013 Phase 3: Payroll Ledger rows feed straight into netSalary
    // (see lib/payrollLedger.ts / lib/salaryService.ts additive step) --
    // without this, a new bonus/deduction/void/correction would sit in the
    // stale 10-minute salary cache exactly like every other sheet above.
    sheetName === 'سجل_المعاملات_المالية'
  ) {
    await invalidateSalaryCaches();
  }
}
