/**
 * Google Sheets Sync Engine
 * Syncs system database to Google Sheets in background
 * Google Sheets is backup/sync storage, NOT primary source
 */

import { systemDB, Rider, PerformanceData, Debt } from './database';
import { appendToSheet, updateSheetRange, getSheetData } from './googleSheets';

class SyncEngine {
  private isSyncing = false;
  private syncQueue: string[] = [];

  /**
   * Sync riders to Google Sheets
   */
  async syncRidersToSheets(): Promise<{ success: boolean; synced: number; errors: string[] }> {
    if (this.isSyncing) {
      this.syncQueue.push('riders');
      return { success: false, synced: 0, errors: ['جاري المزامنة بالفعل'] };
    }

    this.isSyncing = true;
    const errors: string[] = [];
    let synced = 0;

    try {
      // Get all riders from system database
      const riders = await systemDB.getRiders();

      if (riders.length === 0) {
        this.isSyncing = false;
        return { success: true, synced: 0, errors: [] };
      }

      // Get existing data from sheets
      const existingData = await getSheetData('المناديب', false); // Don't use cache
      const existingRiderIds = new Set(
        existingData.slice(1).map((row: any[]) => row[0]?.toString().trim()).filter(Boolean)
      );

      // Prepare new rows (only riders not in sheets)
      const newRows: any[][] = [];
      for (const rider of riders) {
        if (!existingRiderIds.has(rider.riderId)) {
          newRows.push([
            rider.riderId,
            rider.riderName,
            rider.zone,
            rider.supervisorId,
            '', // Supervisor name (will be filled by sheets formulas)
            rider.phone || '',
            rider.joinDate || new Date().toISOString().split('T')[0],
            rider.status === 'active' ? 'نشط' : 'متوقف',
          ]);
        }
      }

      // Append new rows to sheets
      if (newRows.length > 0) {
        try {
          await appendToSheet('المناديب', newRows, false);
          synced = newRows.length;
        } catch (error: any) {
          errors.push(`فشل مزامنة المناديب: ${error.message}`);
        }
      }

      // Update sync status
      await systemDB.setSyncStatus('riders', {
        lastSync: new Date().toISOString(),
        synced,
        errors: errors.length,
      });

      this.isSyncing = false;

      // Process queue
      if (this.syncQueue.length > 0) {
        const next = this.syncQueue.shift();
        if (next === 'riders') {
          // Already done
        } else if (next === 'performance') {
          await this.syncPerformanceToSheets();
        } else if (next === 'debts') {
          await this.syncDebtsToSheets();
        }
      }

      return { success: errors.length === 0, synced, errors };
    } catch (error: any) {
      this.isSyncing = false;
      errors.push(`خطأ في المزامنة: ${error.message}`);
      return { success: false, synced, errors };
    }
  }

  /**
   * Sync performance data to Google Sheets
   */
  async syncPerformanceToSheets(): Promise<{ success: boolean; synced: number; errors: string[] }> {
    if (this.isSyncing) {
      this.syncQueue.push('performance');
      return { success: false, synced: 0, errors: ['جاري المزامنة بالفعل'] };
    }

    this.isSyncing = true;
    const errors: string[] = [];
    let synced = 0;

    try {
      // Get last sync timestamp
      const lastSync = await systemDB.getSyncStatus('performance');
      const lastSyncDate = lastSync?.lastSyncDate || null;

      // Get performance data from system (only new since last sync)
      // For now, sync all (can be optimized later)
      const allRiders = await systemDB.getRiders();
      const allPerformance: PerformanceData[] = [];

      // Get performance for all riders (no date filter for initial sync)
      for (const rider of allRiders) {
        const riderPerformance = await systemDB.getPerformanceData(rider.supervisorId);
        allPerformance.push(...riderPerformance.filter((p) => p.riderId === rider.riderId));
      }

      // Remove duplicates (by date + riderId)
      const uniquePerformance = new Map<string, PerformanceData>();
      for (const perf of allPerformance) {
        const key = `${perf.riderId}_${perf.date}`;
        if (!uniquePerformance.has(key)) {
          uniquePerformance.set(key, perf);
        }
      }

      // Get existing data from sheets
      const existingData = await getSheetData('البيانات اليومية', false);
      const existingKeys = new Set(
        existingData.slice(1).map((row: any[]) => {
          const date = row[0]?.toString().trim();
          const riderId = row[1]?.toString().trim();
          return date && riderId ? `${riderId}_${date}` : null;
        }).filter(Boolean)
      );

      // Prepare new rows
      const newRows: any[][] = [];
      for (const perf of uniquePerformance.values()) {
        const key = `${perf.riderId}_${perf.date}`;
        if (!existingKeys.has(key)) {
          newRows.push([
            perf.date,
            perf.riderId,
            perf.workHours,
            perf.breaks,
            perf.delay,
            perf.absence ? 'نعم' : 'لا',
            perf.orders,
            `${perf.acceptanceRate}%`,
            perf.wallet,
          ]);
        }
      }

      // Append new rows
      if (newRows.length > 0) {
        try {
          await appendToSheet('البيانات اليومية', newRows, false);
          synced = newRows.length;
        } catch (error: any) {
          errors.push(`فشل مزامنة بيانات الأداء: ${error.message}`);
        }
      }

      // Update sync status
      await systemDB.setSyncStatus('performance', {
        lastSync: new Date().toISOString(),
        lastSyncDate: new Date().toISOString(),
        synced,
        errors: errors.length,
      });

      this.isSyncing = false;

      // Process queue
      if (this.syncQueue.length > 0) {
        const next = this.syncQueue.shift();
        if (next === 'performance') {
          // Already done
        } else if (next === 'riders') {
          await this.syncRidersToSheets();
        } else if (next === 'debts') {
          await this.syncDebtsToSheets();
        }
      }

      return { success: errors.length === 0, synced, errors };
    } catch (error: any) {
      this.isSyncing = false;
      errors.push(`خطأ في المزامنة: ${error.message}`);
      return { success: false, synced, errors };
    }
  }

  /**
   * Sync debts to Google Sheets
   */
  async syncDebtsToSheets(): Promise<{ success: boolean; synced: number; errors: string[] }> {
    if (this.isSyncing) {
      this.syncQueue.push('debts');
      return { success: false, synced: 0, errors: ['جاري المزامنة بالفعل'] };
    }

    this.isSyncing = true;
    const errors: string[] = [];
    let synced = 0;

    try {
      // Get all debts from system database
      const debts = await systemDB.getDebts();

      if (debts.length === 0) {
        this.isSyncing = false;
        return { success: true, synced: 0, errors: [] };
      }

      // Get existing data from sheets
      let existingData: any[][];
      try {
        existingData = await getSheetData('الديون', false);
      } catch {
        existingData = [['كود المندوب', 'المديونية', 'التاريخ', 'ملاحظات']];
      }

      const existingKeys = new Set(
        existingData.slice(1).map((row: any[]) => {
          const riderId = row[0]?.toString().trim();
          const date = row[2]?.toString().trim();
          return riderId && date ? `${riderId}_${date}` : null;
        }).filter(Boolean)
      );

      // Prepare new rows
      const newRows: any[][] = [];
      for (const debt of debts) {
        const key = `${debt.riderId}_${debt.date}`;
        if (!existingKeys.has(key)) {
          newRows.push([debt.riderId, debt.amount, debt.date, debt.notes || '']);
        }
      }

      // Append new rows
      if (newRows.length > 0) {
        try {
          await appendToSheet('الديون', newRows, false);
          synced = newRows.length;
        } catch (error: any) {
          errors.push(`فشل مزامنة الديون: ${error.message}`);
        }
      }

      // Update sync status
      await systemDB.setSyncStatus('debts', {
        lastSync: new Date().toISOString(),
        synced,
        errors: errors.length,
      });

      this.isSyncing = false;

      // Process queue
      if (this.syncQueue.length > 0) {
        const next = this.syncQueue.shift();
        if (next === 'debts') {
          // Already done
        } else if (next === 'riders') {
          await this.syncRidersToSheets();
        } else if (next === 'performance') {
          await this.syncPerformanceToSheets();
        }
      }

      return { success: errors.length === 0, synced, errors };
    } catch (error: any) {
      this.isSyncing = false;
      errors.push(`خطأ في المزامنة: ${error.message}`);
      return { success: false, synced, errors };
    }
  }

  /**
   * Full system sync
   */
  async fullSystemSync(): Promise<{
    success: boolean;
    riders: number;
    performance: number;
    debts: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let ridersSynced = 0;
    let performanceSynced = 0;
    let debtsSynced = 0;

    try {
      // Sync in order
      const ridersResult = await this.syncRidersToSheets();
      ridersSynced = ridersResult.synced;
      errors.push(...ridersResult.errors);

      const performanceResult = await this.syncPerformanceToSheets();
      performanceSynced = performanceResult.synced;
      errors.push(...performanceResult.errors);

      const debtsResult = await this.syncDebtsToSheets();
      debtsSynced = debtsResult.synced;
      errors.push(...debtsResult.errors);

      return {
        success: errors.length === 0,
        riders: ridersSynced,
        performance: performanceSynced,
        debts: debtsSynced,
        errors,
      };
    } catch (error: any) {
      errors.push(`خطأ في المزامنة الكاملة: ${error.message}`);
      return {
        success: false,
        riders: ridersSynced,
        performance: performanceSynced,
        debts: debtsSynced,
        errors,
      };
    }
  }
}

// Export singleton
export const syncEngine = new SyncEngine();

