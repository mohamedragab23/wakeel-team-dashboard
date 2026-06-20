import { cache, CACHE_KEYS } from '@/lib/cache';
import { invalidateSupervisorCaches, notifySupervisorsOfChange } from '@/lib/realtimeSync';

export interface RiderCacheInvalidationOptions {
  oldSupervisorCode?: string;
  newSupervisorCode?: string;
  extraSheets?: string[];
  notify?: boolean;
}

/** Unified cache invalidation after rider / request workflow changes. */
export async function invalidateRiderWorkflowCaches(
  options: RiderCacheInvalidationOptions = {}
): Promise<void> {
  const { oldSupervisorCode, newSupervisorCode, extraSheets = [], notify = true } = options;

  const supervisorCodes = new Set<string>();
  if (oldSupervisorCode?.trim()) supervisorCodes.add(oldSupervisorCode.trim());
  if (newSupervisorCode?.trim()) supervisorCodes.add(newSupervisorCode.trim());

  for (const code of supervisorCodes) {
    invalidateSupervisorCaches(code);
    cache.clear(CACHE_KEYS.supervisorRiders(code));
    cache.clear(CACHE_KEYS.ridersData(code));
  }

  cache.clear('admin:riders');
  cache.clear(CACHE_KEYS.sheetData('المناديب'));

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
    cache.clear(CACHE_KEYS.sheetData(sheet));
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
      cache.clear(key);
    }
  }

  if (notify) {
    notifySupervisorsOfChange('riders');
  }
}
