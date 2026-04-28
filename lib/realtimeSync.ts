/**
 * Real-time sync utilities for manager-supervisor data synchronization
 */

import { cache, CACHE_KEYS } from './cache';

/**
 * Clear all supervisor-related caches when manager makes changes
 * This ensures supervisors see updated data immediately
 */
export function invalidateSupervisorCaches(supervisorCode?: string) {
  // Clear general caches
  cache.clear('admin:supervisors');
  cache.clear('admin:riders');
  cache.clear(CACHE_KEYS.sheetData('المشرفين'));
  cache.clear(CACHE_KEYS.sheetData('المناديب'));
  cache.clear(CACHE_KEYS.sheetData('الديون'));
  cache.clear(CACHE_KEYS.sheetData('البيانات اليومية'));

  // Clear specific supervisor caches if code provided
  if (supervisorCode) {
    cache.clear(CACHE_KEYS.supervisorRiders(supervisorCode));
    cache.clear(CACHE_KEYS.dashboardData(supervisorCode));
    cache.clear(CACHE_KEYS.ridersData(supervisorCode));
    // Clear performance caches for common date ranges (we clear all to be safe)
    // Performance data cache keys include date ranges, so we clear the sheet data cache
    // which will force a refresh on next request
  }
}

/**
 * Notify all supervisors about data changes
 * This can be extended with WebSocket or Server-Sent Events in the future
 */
export function notifySupervisorsOfChange(changeType: 'riders' | 'debts' | 'performance' | 'supervisors') {
  // For now, we just clear caches
  // In production, you might want to use WebSocket or SSE for real-time updates
  invalidateSupervisorCaches();
}

