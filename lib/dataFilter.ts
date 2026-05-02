import { getSupervisorRiders } from './dataService';
import { getSheetData } from './googleSheets';

/**
 * Rider codes from approved termination requests for this supervisor.
 * يُحسب أداؤهم مع المشرف ما لم يُعاد تعيين المندوب لمشرف آخر (يظل في الإقالة أو غير معيّن).
 */
export async function getApprovedTerminatedRiderCodesForSupervisor(
  supervisorCode: string
): Promise<Set<string>> {
  const codes = new Set<string>();
  const supTrim = (supervisorCode ?? '').toString().trim();
  if (!supTrim) return codes;
  try {
    let assignmentByCode = new Map<string, string>();
    try {
      const ridersSheet = await getSheetData('المناديب');
      for (let i = 1; i < ridersSheet.length; i++) {
        const row = ridersSheet[i];
        if (!row?.[0]) continue;
        const code = row[0].toString().trim();
        const sup = row[3] != null ? row[3].toString().trim() : '';
        if (code) assignmentByCode.set(code, sup);
      }
    } catch {
      assignmentByCode = new Map();
    }

    const data = await getSheetData('طلبات_الإقالة');
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row || row.length < 6) continue;
      if (row[0]?.toString().trim() !== supTrim) continue;
      if (row[5]?.toString().trim().toLowerCase() !== 'approved') continue;
      const rc = row[2]?.toString().trim();
      if (!rc) continue;

      const currentSup = assignmentByCode.has(rc) ? assignmentByCode.get(rc)! : '';
      // مندوب محذوف من الورقة: لا يزال يُحسب للمشرف الأصلي
      if (!assignmentByCode.has(rc)) {
        codes.add(rc);
        continue;
      }
      // غير معيّن بعد الإقالة، أو ما زال تحت نفس المشرف (نادر)
      if (currentSup === '' || currentSup === supTrim) {
        codes.add(rc);
        continue;
      }
      // معيّن لمشرف آخر بعد الموافقة — لا يُدمج في أداء هذا المشرف
    }
  } catch {
    // sheet missing
  }
  return codes;
}

/**
 * Centralized data filtering system for supervisor-specific data
 */
export async function getSupervisorFilteredData<T extends { riderCode: string }>(
  supervisorCode: string,
  sheetName: string,
  dataMapper: (row: any[]) => T | null
): Promise<T[]> {
  try {
    // Get supervisor's riders
    const riders = await getSupervisorRiders(supervisorCode);
    const riderCodes = new Set(riders.map((r) => r.code));

    if (riderCodes.size === 0) {
      return [];
    }

    // Get all data from sheet
    const allData = await getSheetData(sheetName);

    // Filter and map data
    const filteredData: T[] = [];

    for (let i = 1; i < allData.length; i++) {
      const row = allData[i];
      const mapped = dataMapper(row);

      if (mapped && riderCodes.has(mapped.riderCode)) {
        filteredData.push(mapped);
      }
    }

    return filteredData;
  } catch (error) {
    console.error(`Error filtering ${sheetName} for supervisor ${supervisorCode}:`, error);
    return [];
  }
}

/**
 * Get supervisor's debts
 */
export async function getSupervisorDebtsFiltered(supervisorCode: string) {
  return getSupervisorFilteredData(
    supervisorCode,
    'الديون',
    (row) => {
      if (!row[0]) return null;
      return {
        riderCode: row[0].toString().trim(),
        amount: parseFloat(row[1]?.toString() || '0') || 0,
        date: row[2]?.toString().trim() || undefined,
        notes: row[3]?.toString().trim() || undefined,
      };
    }
  );
}

/**
 * Get supervisor's performance data
 */
/** Pass `null` to include all riders in the sheet (admin / cross-supervisor analytics). */
export async function getSupervisorPerformanceFiltered(
  supervisorCode: string | null,
  startDate?: Date,
  endDate?: Date
) {
  try {
    const allRidersMode = supervisorCode === null;

    // Normalize rider codes to avoid mismatch between "00123" vs "123" etc.
    const normalizeCode = (code: any): string => {
      const s = (code ?? '').toString().trim();
      if (!s) return '';
      // Keep original for exact matches, but also allow matching without leading zeros
      return s.replace(/^0+/, '') || '0';
    };

    let riderCodesExact: Set<string> | null = null;
    let riderCodesNormalized: Set<string> | null = null;

    if (!allRidersMode) {
      const riders = await getSupervisorRiders(supervisorCode);
      const terminatedCodes = await getApprovedTerminatedRiderCodesForSupervisor(supervisorCode);
      riderCodesExact = new Set(riders.map((r) => (r.code ?? '').toString().trim()).filter(Boolean));
      riderCodesNormalized = new Set(riders.map((r) => normalizeCode(r.code)));
      for (const code of terminatedCodes) {
        riderCodesExact.add(code);
        riderCodesNormalized.add(normalizeCode(code));
      }

      if (riderCodesExact.size === 0) {
        return [];
      }
    }

    const allData = await getSheetData('البيانات اليومية');
    const filtered: any[] = [];

    // Helper function to parse date from various formats
    const parseDate = (dateValue: any): Date | null => {
      if (!dateValue) return null;
      
      // If it's already a Date object
      if (dateValue instanceof Date) {
        return isNaN(dateValue.getTime()) ? null : dateValue;
      }
      
      // Try to parse as string
      const dateStr = dateValue.toString().trim();
      if (!dateStr) return null;
      
      // Try different date formats (common formats from Google Sheets)
      // Format 1: ISO format (YYYY-MM-DD) - most common when written from our system
      if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
        const parsed = new Date(dateStr + 'T00:00:00'); // Add time to avoid timezone issues
        if (!isNaN(parsed.getTime())) {
          return parsed;
        }
      }
      
      // Format 1b: ISO format without dashes (YYYYMMDD)
      if (/^\d{8}$/.test(dateStr)) {
        const year = parseInt(dateStr.substring(0, 4));
        const month = parseInt(dateStr.substring(4, 6)) - 1;
        const day = parseInt(dateStr.substring(6, 8));
        const parsed = new Date(year, month, day);
        if (!isNaN(parsed.getTime()) && parsed.getFullYear() === year && parsed.getMonth() === month && parsed.getDate() === day) {
          return parsed;
        }
      }
      
      // Format 2: M/D/YYYY or D/M/YYYY (common in Excel and Google Sheets)
      if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(dateStr)) {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
          const part1 = parseInt(parts[0]);
          const part2 = parseInt(parts[1]);
          const year = parseInt(parts[2]);
          
          // Smart detection: if part1 > 12, it must be day (D/M/YYYY format)
          // If part2 > 12, it must be month (M/D/YYYY format)
          if (part1 > 12) {
            // D/M/YYYY format (day > 12, so first is day)
            const day = part1;
            const month = part2 - 1;
            const parsed = new Date(year, month, day);
            if (!isNaN(parsed.getTime()) && parsed.getDate() === day && parsed.getMonth() === month && parsed.getFullYear() === year) {
              return parsed;
            }
          } else if (part2 > 12) {
            // M/D/YYYY format (month > 12, so first is month)
            const month = part1 - 1;
            const day = part2;
            const parsed = new Date(year, month, day);
            if (!isNaN(parsed.getTime()) && parsed.getDate() === day && parsed.getMonth() === month && parsed.getFullYear() === year) {
              return parsed;
            }
          } else {
            // Ambiguous: try both formats, prefer the one that makes sense
            // Try M/D/YYYY first (US format - common in Excel exports)
            const month = part1 - 1;
            const day = part2;
            const parsed = new Date(year, month, day);
            if (!isNaN(parsed.getTime()) && parsed.getDate() === day && parsed.getMonth() === month && parsed.getFullYear() === year) {
              return parsed;
            }
            // Try D/M/YYYY (European/Arabic format)
            const day2 = part1;
            const month2 = part2 - 1;
            const parsed2 = new Date(year, month2, day2);
            if (!isNaN(parsed2.getTime()) && parsed2.getDate() === day2 && parsed2.getMonth() === month2 && parsed2.getFullYear() === year) {
              return parsed2;
            }
          }
        }
      }
      
      // Format 2b: Handle "20 November 2025" or "November 20, 2025" format
      if (/^\d{1,2}\s+\w+\s+\d{4}/.test(dateStr) || /\w+\s+\d{1,2},?\s+\d{4}/.test(dateStr)) {
        const parsed = new Date(dateStr);
        if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 1900 && parsed.getFullYear() < 2100) {
          return parsed;
        }
      }
      
      // Format 3: Standard Date parsing
      const parsed = new Date(dateStr);
      if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 1900 && parsed.getFullYear() < 2100) {
        return parsed;
      }
      
      // Format 4: Excel serial date format (if it's a number)
      // Google Sheets uses Excel serial date format (days since 1899-12-30)
      // But when we write dates as strings, they might be read as numbers if formatted as dates in Sheets
      if (!isNaN(Number(dateStr)) && !dateStr.includes('/') && !dateStr.includes('-')) {
        const serialNumber = Number(dateStr);
        // Check if it's a reasonable serial date (between 1 and ~50000 for dates 1900-2100)
        if (serialNumber >= 1 && serialNumber < 100000) {
          // Excel/Google Sheets serial date (days since 1899-12-30)
          const excelDate = new Date(1899, 11, 30); // December 30, 1899
          excelDate.setDate(excelDate.getDate() + serialNumber);
          
          if (!isNaN(excelDate.getTime()) && excelDate.getFullYear() > 1900 && excelDate.getFullYear() < 2100) {
            return excelDate;
          }
        }
        // If it's a very large number, it might be a timestamp
        if (serialNumber > 1000000000 && serialNumber < 10000000000000) {
          const timestampDate = new Date(serialNumber);
          if (!isNaN(timestampDate.getTime()) && timestampDate.getFullYear() > 1900 && timestampDate.getFullYear() < 2100) {
            return timestampDate;
          }
        }
      }
      
      return null;
    };

    // Normalize start and end dates for comparison
    const normalizedStartDate = startDate 
      ? new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())
      : null;
    const normalizedEndDate = endDate 
      ? new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate())
      : null;

    for (let i = 1; i < allData.length; i++) {
      const row = allData[i];
      if (!row[0] || !row[1]) continue;

      const riderCode = row[1].toString().trim();
      const riderCodeNorm = normalizeCode(riderCode);
      if (!allRidersMode && riderCodesExact && riderCodesNormalized) {
        if (!riderCodesExact.has(riderCode) && !riderCodesNormalized.has(riderCodeNorm)) continue;
      }

      // Parse date with improved handling
      const rowDate = parseDate(row[0]);
      if (!rowDate || isNaN(rowDate.getTime())) {
        // Skip rows with invalid dates (but log for debugging)
        if (i <= 5) { // Only log first few errors to avoid spam
          console.warn(`Row ${i + 1}: Invalid date value:`, row[0]);
        }
        continue;
      }

      // Normalize dates for comparison (set time to midnight)
      const normalizedRowDate = new Date(rowDate.getFullYear(), rowDate.getMonth(), rowDate.getDate());
      
      // Check date range - use getTime() for accurate comparison
      // Include dates that are >= startDate and <= endDate
      if (normalizedStartDate && normalizedRowDate.getTime() < normalizedStartDate.getTime()) {
        continue;
      }
      if (normalizedEndDate && normalizedRowDate.getTime() > normalizedEndDate.getTime()) {
        continue;
      }
      
      // Additional validation: ensure the date is within reasonable bounds
      if (normalizedRowDate.getFullYear() < 2020 || normalizedRowDate.getFullYear() > 2030) {
        continue; // Skip dates that are clearly wrong
      }

      filtered.push({
        date: normalizedRowDate.toISOString().split('T')[0], // Store as ISO string
        riderCode,
        hours: parseFloat(row[2]?.toString() || '0') || 0,
        break: parseFloat(row[3]?.toString() || '0') || 0,
        delay: parseFloat(row[4]?.toString() || '0') || 0,
        absence: row[5]?.toString().trim() || 'لا',
        orders: parseInt(row[6]?.toString() || '0') || 0,
        acceptance: row[7]?.toString().trim() || '0%',
        debt: parseFloat(row[8]?.toString() || '0') || 0,
      });
    }

    // Enhanced debug logging (always log for troubleshooting)
    console.log(`[Performance Filter] Supervisor: ${allRidersMode ? 'ALL' : supervisorCode}`);
    console.log(`[Performance Filter] Date Range: ${normalizedStartDate?.toISOString().split('T')[0]} to ${normalizedEndDate?.toISOString().split('T')[0]}`);
    console.log(
      `[Performance Filter] Total rows in sheet: ${allData.length - 1}, Mode: ${allRidersMode ? 'all riders' : `assigned (${riderCodesExact?.size ?? 0} codes)`}`
    );
    console.log(`[Performance Filter] Found: ${filtered.length} records`);
    
    if (filtered.length === 0 && allData.length > 1) {
      console.warn(`[Performance Filter] ⚠️ No data found for date range!`);
      if (!allRidersMode && riderCodesExact) {
        console.warn(`[Performance Filter] Supervisor rider codes: ${Array.from(riderCodesExact).slice(0, 10).join(', ')}`);
      }

      // Collect unique dates in the sheet
      const uniqueDates = new Set<string>();
      const assignedRiderDates: { date: string; riderCode: string }[] = [];

      for (let i = 1; i < allData.length; i++) {
        if (allData[i][0] && allData[i][1]) {
          const sampleDate = parseDate(allData[i][0]);
          const riderCodeRow = allData[i][1]?.toString().trim();

          if (sampleDate) {
            const dateStr = sampleDate.toISOString().split('T')[0];
            uniqueDates.add(dateStr);

            if (!allRidersMode && riderCodesExact && riderCodesNormalized) {
              if (
                riderCodesExact.has(riderCodeRow) ||
                riderCodesNormalized.has(normalizeCode(riderCodeRow))
              ) {
                assignedRiderDates.push({ date: dateStr, riderCode: riderCodeRow });
              }
            }
          }
        }
      }

      console.warn(`[Performance Filter] Unique dates in sheet: ${Array.from(uniqueDates).sort().slice(-10).join(', ')}`);
      if (!allRidersMode) {
        console.warn(
          `[Performance Filter] Assigned rider dates (first 10): ${JSON.stringify(assignedRiderDates.slice(0, 10))}`
        );
      }
    } else if (filtered.length > 0) {
      console.log(`[Performance Filter] ✅ Successfully filtered ${filtered.length} records`);
      // Log first few filtered records
      console.log(`[Performance Filter] Sample filtered records:`, filtered.slice(0, 3).map(r => ({
        date: r.date,
        riderCode: r.riderCode,
        orders: r.orders,
        hours: r.hours,
      })));
    }

    return filtered;
  } catch (error) {
    console.error('Error filtering performance data:', error);
    return [];
  }
}

