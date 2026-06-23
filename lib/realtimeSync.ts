/**
 * Real-time sync utilities for manager-supervisor data synchronization
 */

import { cache, CACHE_KEYS } from './cache';
import { tieredCacheDelete, tieredCacheDeleteByPrefix } from './tieredCache';

/**
 * Clear all supervisor-related caches when manager makes changes
 * This ensures supervisors see updated data immediately
 */
export function invalidateSupervisorCaches(supervisorCode?: string) {
  cache.clear('admin:supervisors');
  cache.clear('admin:riders');
  void tieredCacheDelete('admin:supervisors');
  void tieredCacheDelete('admin:riders');

  const sheetTabs = ['المشرفين', 'المناديب', 'الديون', 'البيانات اليومية'] as const;
  for (const sheet of sheetTabs) {
    void tieredCacheDelete(CACHE_KEYS.sheetData(sheet));
  }

  void tieredCacheDeleteByPrefix('performance:');

  if (supervisorCode) {
    const c = supervisorCode.trim();
    void tieredCacheDelete(CACHE_KEYS.supervisorRiders(c));
    void tieredCacheDelete(CACHE_KEYS.ridersData(c));
    void tieredCacheDeleteByPrefix(`dashboard:${c}:`);
  }
}

/**
 * Notify all supervisors about data changes
 * This can be extended with WebSocket or Server-Sent Events in the future
 */
export function notifySupervisorsOfChange(changeType: 'riders' | 'debts' | 'performance' | 'supervisors') {
  invalidateSupervisorCaches();
}
