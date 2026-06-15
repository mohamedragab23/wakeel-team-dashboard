import { getSheetData, appendToSheet, updateSheetRange, deleteSheetRow } from './googleSheets';
import { cache, CACHE_KEYS } from './cache';
import {
  buildSupervisorCodeIndex,
  normalizeSupervisorCode,
  resolveSupervisorCodeInSheet,
  type SupervisorOrgRole,
} from '@/lib/orgHierarchy';
import {
  resolveSupervisorsSheetLayout,
  parseSupervisorRowFromSheet,
  supervisorToRowCells,
  sheetRangeForSupervisorDataRow,
} from './supervisorsSheetParser';
import { findRiderInSheet } from '@/lib/riderCodeUtils';
import { invalidateRiderWorkflowCaches } from '@/lib/cacheInvalidation';

export interface Supervisor {
  code: string;
  name: string;
  region: string;
  email: string;
  password: string;
  salaryType?: 'fixed' | 'commission_type1' | 'commission_type2';
  /** عند التحديث: `null` أو `''` يفرّغ عمود المبلغ في الشيت */
  salaryAmount?: number | string | null;
  commissionFormula?: string | null;
  target?: number; // Monthly target for supervisor
  /** عمود J في شيت المشرفين: دور تنظيمي (مشرف / مدير زون / مدير منطقة) */
  orgRole?: SupervisorOrgRole;
  /** عمود K: كود المدير المباشر في نفس الشيت (مدير زون ← مدير منطقة ← مشرف) */
  parentCode?: string;
}

export interface Rider {
  code: string;
  name: string;
  region: string;
  supervisorCode: string;
  supervisorName?: string;
  phone?: string;
  joinDate?: string;
  status?: string;
}

export interface Debt {
  riderCode: string;
  amount: number;
  date?: string;
  notes?: string;
}

/**
 * Get all supervisors
 */
export async function getAllSupervisors(useCache: boolean = true): Promise<Supervisor[]> {
  const cacheKey = 'admin:supervisors';
  
  if (useCache) {
    const cached = cache.get<Supervisor[]>(cacheKey);
    if (cached) {
      console.log(`[GetAllSupervisors] Returning ${cached.length} supervisors from cache`);
      return cached;
    }
  }

  try {
    console.log(`[GetAllSupervisors] Fetching fresh data from sheet (useCache: ${useCache})`);
    const data = await getSheetData('المشرفين', useCache);
    const supervisors: Supervisor[] = [];
    const { dataStartIndex, columns } = resolveSupervisorsSheetLayout(data);

    for (let i = dataStartIndex; i < data.length; i++) {
      const row = data[i] || [];
      const parsed = parseSupervisorRowFromSheet(row, columns);
      if (!parsed) continue;
      supervisors.push(parsed as Supervisor);
    }

    console.log(`[GetAllSupervisors] Found ${supervisors.length} supervisors in sheet`);
    
    if (useCache) {
      cache.set(cacheKey, supervisors, 15 * 60 * 1000); // 15 minutes (optimized for mobile)
    }
    
    return supervisors;
  } catch (error) {
    console.error('[GetAllSupervisors] Error fetching supervisors:', error);
    return [];
  }
}

/**
 * Add new supervisor
 */
export async function addSupervisor(supervisor: Supervisor): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`[AddSupervisor] Starting to add supervisor: ${supervisor.code}`);
    
    // Validate
    if (!supervisor.code || !supervisor.name || !supervisor.email || !supervisor.password) {
      console.error(`[AddSupervisor] Validation failed: missing required fields`);
      return { success: false, error: 'جميع الحقول مطلوبة' };
    }

    // Check if code exists - use fresh data (no cache)
    const existing = await getAllSupervisors(false); // Don't use cache to check for duplicates
    const codeTrimmed = supervisor.code.toString().trim();
    if (existing.some((s) => s.code.toString().trim() === codeTrimmed)) {
      console.error(`[AddSupervisor] Code already exists: ${codeTrimmed}`);
      return { success: false, error: 'كود المشرف موجود بالفعل' };
    }

    console.log(`[AddSupervisor] Code is unique, proceeding to add to sheet`);

    const matrix = await getSheetData('المشرفين', false);
    const { dataStartIndex, columns } = resolveSupervisorsSheetLayout(matrix);
    const allInSheet: Supervisor[] = [];
    for (let i = dataStartIndex; i < matrix.length; i++) {
      const parsed = parseSupervisorRowFromSheet(matrix[i] || [], columns);
      if (parsed) allInSheet.push(parsed as Supervisor);
    }
    const index = buildSupervisorCodeIndex(allInSheet);
    const toWrite = { ...supervisor };
    const parentRaw = String(supervisor.parentCode ?? '').trim();
    if (parentRaw) {
      const resolved = resolveSupervisorCodeInSheet(parentRaw, index);
      if (!resolved) {
        return {
          success: false,
          error: `كود المدير المباشر "${parentRaw}" غير موجود في شيت المشرفين`,
        };
      }
      toWrite.parentCode = resolved;
    } else {
      toWrite.parentCode = '';
    }

    const row = supervisorToRowCells([], columns, toWrite);

    console.log(`[AddSupervisor] Row data:`, row);

    try {
      const success = await appendToSheet('المشرفين', [row], false); // Don't use cache for write
      console.log(`[AddSupervisor] appendToSheet returned: ${success}`);

      if (success) {
        // Clear ALL supervisor-related caches
        cache.clear('admin:supervisors');
        cache.clear(CACHE_KEYS.supervisorRiders(supervisor.code));
        
        // Also clear the sheet data cache
        cache.clear(CACHE_KEYS.sheetData('المشرفين'));
        
        console.log(`[AddSupervisor] Cache cleared, verifying supervisor was added...`);
        
        // Wait a moment for Google Sheets to update
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Verify the supervisor was actually added by reading from sheet
        const { getSheetData } = await import('./googleSheets');
        const verifyData = await getSheetData('المشرفين', false); // Don't use cache
        const found = verifyData.some((r: any[]) => r[0]?.toString().trim() === codeTrimmed);
        
        if (found) {
          console.log(`[AddSupervisor] Supervisor verified in sheet: ${codeTrimmed}`);
        } else {
          console.error(`[AddSupervisor] Supervisor NOT found in sheet after adding: ${codeTrimmed}`);
          console.log(`[AddSupervisor] Sheet data sample:`, verifyData.slice(0, 3));
        }
        
        // Notify supervisors (if realtimeSync exists)
        try {
          const { invalidateSupervisorCaches } = await import('./realtimeSync');
          invalidateSupervisorCaches(supervisor.code);
        } catch (syncError) {
          console.warn(`[AddSupervisor] Could not invalidate realtime sync:`, syncError);
        }
        
        return { success: true };
      }

      console.error(`[AddSupervisor] appendToSheet returned false`);
      return { success: false, error: 'فشل إضافة المشرف إلى الجدول' };
    } catch (appendError: any) {
      console.error(`[AddSupervisor] Error in appendToSheet:`, appendError);
      console.error(`[AddSupervisor] Error stack:`, appendError.stack);
      return { success: false, error: `فشل إضافة المشرف: ${appendError.message || 'خطأ غير معروف'}` };
    }
  } catch (error: any) {
    console.error(`[AddSupervisor] Unexpected error:`, error);
    return { success: false, error: error.message || 'حدث خطأ غير متوقع' };
  }
}

/**
 * Update supervisor
 */
function pickSupervisorPatch(updates: Partial<Supervisor>): Partial<Supervisor> {
  const patch: Partial<Supervisor> = {};
  const keys: (keyof Supervisor)[] = [
    'code',
    'name',
    'region',
    'email',
    'password',
    'salaryType',
    'salaryAmount',
    'commissionFormula',
    'target',
    'orgRole',
    'parentCode',
  ];
  for (const k of keys) {
    if (k in updates && updates[k] !== undefined) {
      (patch as Record<string, unknown>)[k] = updates[k];
    }
  }
  return patch;
}

export async function updateSupervisor(
  code: string,
  updates: Partial<Supervisor>
): Promise<{ success: boolean; error?: string }> {
  try {
    const data = await getSheetData('المشرفين', false);
    const { dataStartIndex, columns } = resolveSupervisorsSheetLayout(data);
    const codeNorm = normalizeSupervisorCode(code);
    let rowIndex = -1;
    let dataIdx = -1;

    const allInSheet: Supervisor[] = [];
    for (let i = dataStartIndex; i < data.length; i++) {
      const row = data[i] || [];
      const parsed = parseSupervisorRowFromSheet(row, columns);
      if (!parsed) continue;
      allInSheet.push(parsed as Supervisor);
      const c = String(parsed.code ?? '').trim();
      if (normalizeSupervisorCode(c) === codeNorm) {
        dataIdx = i;
        rowIndex = i + 1;
      }
    }

    if (rowIndex === -1 || dataIdx < 0) {
      return { success: false, error: 'المشرف غير موجود' };
    }

    const row = data[dataIdx] || [];
    const current = parseSupervisorRowFromSheet(row, columns);
    if (!current) {
      return { success: false, error: 'المشرف غير موجود' };
    }

    const patch = pickSupervisorPatch(updates);
    const merged: Supervisor = {
      ...current,
      ...patch,
      code: (patch.code || current.code).toString().trim(),
    } as Supervisor;

    const index = buildSupervisorCodeIndex(allInSheet);
    if ('parentCode' in patch) {
      const parentRaw = String(patch.parentCode ?? '').trim();
      if (!parentRaw) {
        merged.parentCode = '';
      } else {
        const resolved = resolveSupervisorCodeInSheet(parentRaw, index);
        if (!resolved) {
          return {
            success: false,
            error: `كود المدير المباشر "${parentRaw}" غير موجود في شيت المشرفين`,
          };
        }
        merged.parentCode = resolved;
      }
    }

    const updatedRow = supervisorToRowCells(row, columns, merged);
    const range = sheetRangeForSupervisorDataRow(rowIndex, columns);

    console.log(
      `[UpdateSupervisor] Updating "${merged.code}" row ${rowIndex} range ${range} parent=${merged.parentCode ?? ''} orgRole=${merged.orgRole ?? 'supervisor'}`
    );

    const success = await updateSheetRange('المشرفين', range, [updatedRow]);

    if (success) {
      const { invalidateSupervisorCaches } = await import('./realtimeSync');
      invalidateSupervisorCaches(merged.code);
      cache.clear('admin:supervisors');
      cache.clear(CACHE_KEYS.sheetData('المشرفين'));
      console.log(`[UpdateSupervisor] Successfully updated supervisor "${merged.code}"`);
      return { success: true };
    }

    return { success: false, error: 'فشل تحديث المشرف' };
  } catch (error: any) {
    return { success: false, error: error.message || 'حدث خطأ' };
  }
}

/**
 * Delete supervisor
 */
export async function deleteSupervisor(code: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { getSheetData, deleteSheetRow } = await import('./googleSheets');
    const data = await getSheetData('المشرفين', false);
    const { dataStartIndex, columns } = resolveSupervisorsSheetLayout(data);

    let rowIndex = -1;
    const codeTrimmed = code?.toString().trim();

    for (let i = dataStartIndex; i < data.length; i++) {
      if (data[i]?.[columns.code]?.toString().trim() === codeTrimmed) {
        rowIndex = i + 1;
        break;
      }
    }

    if (rowIndex === -1) {
      return { success: false, error: 'المشرف غير موجود' };
    }

    // Delete the row from Google Sheets
    const deleted = await deleteSheetRow('المشرفين', rowIndex);

    if (deleted) {
      // Clear cache
      cache.clear('admin:supervisors');
      cache.clear(CACHE_KEYS.supervisorRiders(codeTrimmed));
      console.log(`[DeleteSupervisor] Successfully deleted supervisor "${codeTrimmed}"`);
      return { success: true };
    }

    return { success: false, error: 'فشل حذف المشرف' };
  } catch (error: any) {
    console.error(`[DeleteSupervisor] Error deleting supervisor "${code}":`, error);
    return { success: false, error: error.message || 'حدث خطأ' };
  }
}

/**
 * Get all riders
 */
export async function getAllRiders(useCache: boolean = true): Promise<Rider[]> {
  try {
    const data = await getSheetData('المناديب', useCache);
    const riders: Rider[] = [];

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row[0] || row[0].toString().trim() === '') continue;

      riders.push({
        code: row[0].toString().trim(),
        name: row[1] ? row[1].toString().trim() : '',
        region: row[2] ? row[2].toString().trim() : '',
        supervisorCode: row[3] ? row[3].toString().trim() : '',
        supervisorName: row[4] ? row[4].toString().trim() : '',
        phone: row[5] ? row[5].toString().trim() : '',
        joinDate: row[6] ? row[6].toString().trim() : '',
        status: row[7] ? row[7].toString().trim() : 'نشط',
      });
    }

    return riders;
  } catch (error) {
    console.error('Error fetching riders:', error);
    return [];
  }
}

/**
 * Add rider
 */
export async function addRider(rider: Rider): Promise<{ success: boolean; error?: string }> {
  try {
    if (!rider.code || !rider.name || !rider.supervisorCode) {
      return { success: false, error: 'الكود والاسم وكود المشرف مطلوبة' };
    }

    // Check if rider code exists
    const existing = await getAllRiders();
    if (existing.some((r) => r.code === rider.code)) {
      return { success: false, error: 'كود المندوب موجود بالفعل' };
    }

    // Get supervisor name
    const supervisors = await getAllSupervisors();
    const supervisor = supervisors.find((s) => s.code === rider.supervisorCode);

    const row = [
      rider.code,
      rider.name,
      rider.region || '',
      rider.supervisorCode,
      supervisor?.name || '',
      rider.phone || '',
      rider.joinDate || new Date().toISOString().split('T')[0],
      rider.status || 'نشط',
    ];

    const success = await appendToSheet('المناديب', [row]);

    if (success) {
      // Clear cache and notify supervisors
      const { invalidateSupervisorCaches, notifySupervisorsOfChange } = await import('./realtimeSync');
      invalidateSupervisorCaches(rider.supervisorCode);
      notifySupervisorsOfChange('riders');
      return { success: true };
    }

    return { success: false, error: 'فشل إضافة المندوب' };
  } catch (error: any) {
    return { success: false, error: error.message || 'حدث خطأ' };
  }
}

/**
 * Update rider assignment (change supervisor or remove assignment)
 */
export async function updateRider(
  riderCode: string,
  updates: { supervisorCode?: string; name?: string; region?: string; phone?: string; status?: string }
): Promise<{ success: boolean; error?: string }> {
  try {
    const { getSheetData, updateSheetRange } = await import('./googleSheets');
    const ridersSheet = await getSheetData('المناديب', false);

    const riderCodeTrimmed = riderCode?.toString().trim();
    console.log(`[UpdateRider] Looking for rider with code: "${riderCodeTrimmed}"`);

    const match = findRiderInSheet(ridersSheet, riderCodeTrimmed);
    if (!match) {
      console.error(`[UpdateRider] Rider "${riderCodeTrimmed}" not found in sheet`);
      return { success: false, error: `المندوب "${riderCodeTrimmed}" غير موجود` };
    }

    const rowIndex = match.sheetRowIndex;
    console.log(`[UpdateRider] Found rider at row ${rowIndex} (code: ${match.actualCode})`);

    // Get current rider data
    const currentRow = ridersSheet[rowIndex - 1];
    const supervisors = await getAllSupervisors();

    // Get old and new supervisor codes
    const oldSupervisorCode = currentRow[3]?.toString().trim();
    const newSupervisorCode = updates.supervisorCode !== undefined ? updates.supervisorCode.toString().trim() : oldSupervisorCode;
    const newSupervisorName = newSupervisorCode && newSupervisorCode !== ''
      ? (supervisors.find((s) => s.code === newSupervisorCode)?.name || '')
      : '';
    
    // Prepare updated row - use trimmed riderCode
    const updatedRow = [
      match.actualCode, // preserve sheet code (e.g. leading zeros)
      updates.name || currentRow[1] || '', // name
      updates.region !== undefined ? updates.region : (currentRow[2] || ''), // region
      newSupervisorCode, // supervisorCode
      newSupervisorName, // supervisorName
      updates.phone !== undefined ? updates.phone : (currentRow[5] || ''), // phone
      currentRow[6] || new Date().toISOString().split('T')[0], // joinDate
      updates.status !== undefined ? updates.status : (currentRow[7] || 'نشط'), // status
    ];
    
    console.log(`[UpdateRider] Updated row data:`, {
      riderCode: riderCodeTrimmed,
      oldSupervisor: oldSupervisorCode,
      newSupervisor: newSupervisorCode,
      newSupervisorName: newSupervisorName,
    });

    console.log(`[UpdateRider] Updating rider "${riderCodeTrimmed}" at row ${rowIndex}. Old supervisor: "${oldSupervisorCode}", New supervisor: "${newSupervisorCode}"`);
    console.log(`[UpdateRider] Full row data to update:`, updatedRow);
    
    const updateSuccess = await updateSheetRange('المناديب', `A${rowIndex}:H${rowIndex}`, [updatedRow]);
    
    if (!updateSuccess) {
      console.error(`[UpdateRider] Failed to update rider "${riderCodeTrimmed}" in Google Sheets`);
      return { success: false, error: 'فشل تحديث المندوب في Google Sheets' };
    }
    
    console.log(`[UpdateRider] Successfully updated rider "${match.actualCode}" in Google Sheets`);

    await invalidateRiderWorkflowCaches({
      oldSupervisorCode,
      newSupervisorCode,
    });

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'حدث خطأ' };
  }
}

/**
 * Delete rider completely from the system (delete row from Google Sheets)
 */
export async function deleteRider(riderCode: string, deleteCompletely: boolean = false): Promise<{ success: boolean; error?: string }> {
  try {
    if (deleteCompletely) {
      // Delete the rider row completely from Google Sheets
      const { getSheetData, deleteSheetRow } = await import('./googleSheets');
      const ridersData = await getSheetData('المناديب', false);
      const riderCodeTrimmed = riderCode?.toString().trim();
      const match = findRiderInSheet(ridersData, riderCodeTrimmed);

      if (!match) {
        return { success: false, error: 'المندوب غير موجود' };
      }

      const rowIndex = match.sheetRowIndex;
      const oldSupervisorCode = match.row[3]?.toString().trim() || '';

      const deleted = await deleteSheetRow('المناديب', rowIndex);

      if (deleted) {
        await invalidateRiderWorkflowCaches({ oldSupervisorCode });
        console.log(`[DeleteRider] Successfully deleted rider "${match.actualCode}" completely`);
        return { success: true };
      }

      return { success: false, error: 'فشل حذف المندوب' };
    } else {
      // Just remove supervisor assignment (default behavior)
      return await updateRider(riderCode, { supervisorCode: '' });
    }
  } catch (error: any) {
    console.error(`[DeleteRider] Error deleting rider "${riderCode}":`, error);
    return { success: false, error: error.message || 'حدث خطأ' };
  }
}

/**
 * Bulk add riders from Excel data - OPTIMIZED with batch processing
 */
export async function bulkAddRiders(riders: Rider[]): Promise<{
  success: boolean;
  added: number;
  failed: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let added = 0;
  let failed = 0;

  // Get all supervisors for validation
  const supervisors = await getAllSupervisors();
  const supervisorCodes = new Set(supervisors.map((s) => s.code));
  const supervisorMap = new Map(supervisors.map((s) => [s.code, s.name]));

  // Get existing riders to check duplicates
  const existingRiders = await getAllRiders();
  const existingRiderMap = new Map(existingRiders.map((r) => [r.code, r]));
  const existingRiderCodes = new Set(existingRiders.map((r) => r.code));
  
  // Log supervisor codes for debugging
  console.log(`[BulkAdd] Supervisor codes in Set:`, Array.from(supervisorCodes));
  console.log(`[BulkAdd] Sample supervisor codes from file:`, riders.slice(0, 3).map(r => r.supervisorCode));

  // Validate and prepare riders for batch insert
  const validRows: any[][] = [];
  const updateRows: { rowIndex: number; data: any[] }[] = [];
  const seenInBatch = new Set<string>();

  console.log(`[BulkAdd] Processing ${riders.length} riders`);
  console.log(`[BulkAdd] Available supervisors: ${Array.from(supervisorCodes).join(', ')}`);
  console.log(`[BulkAdd] Existing riders count: ${existingRiders.length}`);

  for (const rider of riders) {
    // Trim all codes to avoid whitespace issues
    const riderCodeTrimmed = rider.code?.trim();
    const supervisorCodeTrimmed = rider.supervisorCode?.trim();
    
    // Check if supervisor exists
    if (!supervisorCodes.has(supervisorCodeTrimmed)) {
      failed++;
      errors.push(`المندوب ${riderCodeTrimmed} (${rider.name}): المشرف "${rider.supervisorCode}" غير موجود في النظام`);
      console.log(`[BulkAdd] Supervisor not found: "${rider.supervisorCode}" (trimmed: "${supervisorCodeTrimmed}") for rider ${riderCodeTrimmed}`);
      continue;
    }

    // Check for duplicates in same batch
    if (seenInBatch.has(riderCodeTrimmed)) {
      failed++;
      errors.push(`${riderCodeTrimmed}: كود مكرر في نفس الملف`);
      continue;
    }

    seenInBatch.add(riderCodeTrimmed);

    const riderData = [
      riderCodeTrimmed,
      rider.name,
      rider.region || '',
      supervisorCodeTrimmed,
      supervisorMap.get(supervisorCodeTrimmed) || '',
      rider.phone || '',
      rider.joinDate || new Date().toISOString().split('T')[0],
      rider.status || 'نشط',
    ];

    // Reject duplicate: rider code already exists on system
    if (existingRiderCodes.has(riderCodeTrimmed)) {
      failed++;
      errors.push(`المندوب ${riderCodeTrimmed} موجود بالفعل على النظام`);
      console.log(`[BulkAdd] Rider ${riderCodeTrimmed} already exists on system - rejected (duplicate).`);
      continue;
    }

    // New rider - add to insert list
    console.log(`[BulkAdd] Rider ${riderCodeTrimmed} is new, adding to insert list.`);
    validRows.push(riderData);
  }

  console.log(`[BulkAdd] Summary: ${validRows.length} new riders, ${updateRows.length} updates, ${failed} failed`);

  // Handle updates for existing riders (reassignments or unassigned riders)
  if (updateRows.length > 0) {
    try {
      const { getSheetData, updateSheetRange } = await import('./googleSheets');
      const ridersSheet = await getSheetData('المناديب', false);
      const supervisorCodesToInvalidate = new Set<string>();
      
      for (const update of updateRows) {
        // Find row index for this rider
        let rowIndex = -1;
        let oldSupervisorCode = '';
        for (let i = 1; i < ridersSheet.length; i++) {
          if (ridersSheet[i][0]?.toString().trim() === update.data[0]) {
            rowIndex = i + 1; // Google Sheets is 1-indexed
            oldSupervisorCode = ridersSheet[i][3]?.toString().trim() || '';
            break;
          }
        }
        
        if (rowIndex > 0) {
          // Update the row
          const updateSuccess = await updateSheetRange('المناديب', `A${rowIndex}:H${rowIndex}`, [update.data]);
          if (updateSuccess) {
            added++;
            // Track supervisor codes for cache invalidation
            const newSupervisorCode = update.data[3]?.toString().trim() || '';
            if (oldSupervisorCode && oldSupervisorCode !== '') {
              supervisorCodesToInvalidate.add(oldSupervisorCode);
            }
            if (newSupervisorCode && newSupervisorCode !== '') {
              supervisorCodesToInvalidate.add(newSupervisorCode);
            }
            console.log(`[BulkAdd] Updated rider ${update.data[0]} from supervisor "${oldSupervisorCode}" to "${newSupervisorCode}"`);
          } else {
            failed++;
            errors.push(`${update.data[0]}: فشل تحديث المندوب في Google Sheets`);
          }
        } else {
          failed++;
          errors.push(`${update.data[0]}: لم يتم العثور على المندوب للتحديث`);
        }
      }
      
      // Clear caches for affected supervisors
      if (supervisorCodesToInvalidate.size > 0) {
        const { invalidateSupervisorCaches, notifySupervisorsOfChange } = await import('./realtimeSync');
        const { cache, CACHE_KEYS } = await import('./cache');
        
        supervisorCodesToInvalidate.forEach((code) => {
          invalidateSupervisorCaches(code);
          cache.clear(CACHE_KEYS.supervisorRiders(code));
          cache.clear(CACHE_KEYS.ridersData(code));
        });
        
        // Clear all riders cache
        cache.clear('admin:riders');
        cache.clear(CACHE_KEYS.sheetData('المناديب'));
        
        notifySupervisorsOfChange('riders');
        console.log(`[BulkAdd] Cleared caches for supervisors: ${Array.from(supervisorCodesToInvalidate).join(', ')}`);
      }
    } catch (error: any) {
      failed += updateRows.length;
      errors.push(`خطأ في تحديث المناديب: ${error.message}`);
    }
  }

  // Batch insert valid riders
  if (validRows.length > 0) {
    try {
      const { appendToSheet } = await import('./googleSheets');
      await appendToSheet('المناديب', validRows);
      
      added += validRows.length;
      // Clear relevant caches and notify supervisors
      const { invalidateSupervisorCaches, notifySupervisorsOfChange } = await import('./realtimeSync');
      const uniqueSupervisorCodes = new Set(riders.map((r) => r.supervisorCode));
      uniqueSupervisorCodes.forEach((code) => {
        invalidateSupervisorCaches(code);
      });
      notifySupervisorsOfChange('riders');
    } catch (error: any) {
      failed += validRows.length;
      errors.push(`فشل حفظ البيانات: ${error.message || 'خطأ غير معروف'}`);
    }
  }

  return {
    success: failed === 0,
    added,
    failed,
    errors,
  };
}

/**
 * Get or create debts sheet - with error handling
 */
export async function getDebtsSheet(): Promise<any[][]> {
  try {
    // Try 'الديون' first, then 'المديونية' as fallback
    let data = await getSheetData('الديون', true);
    
    if (!data || data.length === 0) {
      // Try alternative sheet name
      data = await getSheetData('المديونية', true);
    }
    
    return data || [];
  } catch (error) {
    console.warn('Debts sheet not found or error:', error);
    // Return empty array with header row structure
    return [['كود المندوب', 'المبلغ', 'التاريخ', 'ملاحظات']];
  }
}

/**
 * Add debt
 */
export async function addDebt(debt: Debt): Promise<{ success: boolean; error?: string }> {
  try {
    if (!debt.riderCode || debt.amount === undefined) {
      return { success: false, error: 'كود المندوب والمبلغ مطلوبان' };
    }

    const row = [
      debt.riderCode,
      debt.amount,
      debt.date || new Date().toISOString().split('T')[0],
      debt.notes || '',
    ];

    // Try to append to existing sheet, or create new one
    const success = await appendToSheet('الديون', [row]);

    if (success) {
      // Clear cache and notify supervisors
      const { notifySupervisorsOfChange } = await import('./realtimeSync');
      notifySupervisorsOfChange('debts');
      return { success: true };
    }

    return { success: false, error: 'فشل إضافة الدين' };
  } catch (error: any) {
    return { success: false, error: error.message || 'حدث خطأ' };
  }
}

/**
 * Bulk add debts from Excel data - OPTIMIZED with batch processing
 */
export async function bulkAddDebts(debts: Debt[]): Promise<{
  success: boolean;
  added: number;
  failed: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let added = 0;
  let failed = 0;

  // Batch process to avoid timeout
  const BATCH_SIZE = 20;
  const { appendToSheet } = await import('./googleSheets');

  // Group debts by rider code (sum amounts for same rider)
  const debtMap = new Map<string, number>();
  debts.forEach((debt) => {
    const existing = debtMap.get(debt.riderCode) || 0;
    debtMap.set(debt.riderCode, existing + debt.amount);
  });

  // Convert to rows for batch insert
  const rows: any[][] = [];
  debtMap.forEach((amount, riderCode) => {
    rows.push([riderCode, amount, new Date().toISOString().split('T')[0], '']);
  });

  // Batch insert
  if (rows.length > 0) {
    try {
      await appendToSheet('الديون', rows);
      added = rows.length;
      // Clear cache and notify supervisors
      const { notifySupervisorsOfChange } = await import('./realtimeSync');
      notifySupervisorsOfChange('debts');
    } catch (error: any) {
      failed = rows.length;
      errors.push(`فشل حفظ البيانات: ${error.message || 'خطأ غير معروف'}`);
    }
  }

  return {
    success: failed === 0,
    added,
    failed,
    errors,
  };
}

/**
 * Get debts for a specific supervisor's riders - OPTIMIZED
 */
export async function getSupervisorDebts(supervisorCode: string): Promise<Debt[]> {
  try {
    // Use optimized filtering
    const { getSupervisorDebtsFiltered } = await import('./dataFilter');
    return await getSupervisorDebtsFiltered(supervisorCode);
  } catch (error) {
    console.error('Error fetching supervisor debts:', error);
    return [];
  }
}

