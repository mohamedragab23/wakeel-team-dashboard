import * as XLSX from 'xlsx';

export interface ProcessedRider {
  riderCode: string;
  riderName: string;
  region: string;
  supervisorCode: string;
  rowIndex: number;
}

export interface ProcessedDebt {
  riderCode: string;
  amount: number;
  rowIndex: number;
}

export interface ProcessedPerformance {
  date: string;
  riderCode: string;
  hours: number;
  break: number;
  delay: number;
  absence: string;
  orders: number;
  acceptance: string;
  debt: number;
  rowIndex: number;
}

export interface ProcessingResult<T> {
  success: boolean;
  data: T[];
  errors: string[];
  warnings: string[];
}

/**
 * Read Excel file and return raw data
 */
export async function readExcelFile(file: File): Promise<any[][]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });

        if (workbook.SheetNames.length === 0) {
          reject(new Error('الملف لا يحتوي على أوراق'));
          return;
        }

        // Get first sheet
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        // Convert to array of arrays (preserving all data)
        const jsonData = XLSX.utils.sheet_to_json(worksheet, {
          header: 1,
          defval: '',
          raw: false,
        }) as any[][];

        resolve(jsonData);
      } catch (error: any) {
        reject(new Error(`خطأ في قراءة الملف: ${error.message}`));
      }
    };

    reader.onerror = () => {
      reject(new Error('فشل قراءة الملف'));
    };

    reader.readAsArrayBuffer(file);
  });
}

/**
 * Process riders Excel file with strict validation
 */
export function processRidersExcel(data: any[][]): ProcessingResult<ProcessedRider> {
  const result: ProcessingResult<ProcessedRider> = {
    success: true,
    data: [],
    errors: [],
    warnings: [],
  };

  if (data.length < 2) {
    result.success = false;
    result.errors.push('الملف يجب أن يحتوي على عنوان وصف واحد على الأقل');
    return result;
  }

  // Detect header row and find column indices
  const headerRow = data[0];
  let codeCol = -1, nameCol = -1, regionCol = -1, supervisorCol = -1;

  // Try to find columns by Arabic names or English (flexible matching)
  headerRow.forEach((cell, index) => {
    // Trim and normalize the cell value
    const cellStr = (cell || '').toString().trim().toLowerCase();
    const originalCell = (cell || '').toString();
    
    // Rider Code - check for "كود المندوب" or similar
    if (cellStr.includes('كود') && cellStr.includes('مندوب')) {
      codeCol = index;
      console.log(`[ExcelProcessor] Found rider code column at index ${index}: "${originalCell}"`);
    } else if (cellStr.includes('riderid') || cellStr.includes('rider id') || cellStr === 'riderid') {
      codeCol = index;
    } else if (codeCol === -1 && (cellStr === 'id' || cellStr === 'code' || cellStr === 'كود')) {
      codeCol = index;
    }
    
    // Rider Name - check for "الاسم" or similar
    if (cellStr === 'الاسم' || cellStr === 'اسم' || cellStr.includes('اسم المندوب')) {
      nameCol = index;
      console.log(`[ExcelProcessor] Found rider name column at index ${index}: "${originalCell}"`);
    } else if (cellStr.includes('name') || cellStr === 'ridername') {
      nameCol = index;
    }
    
    // Region/Zone - check for "المنطقة" or similar
    if (cellStr === 'المنطقة' || cellStr === 'منطقة' || cellStr.includes('zone')) {
      regionCol = index;
      console.log(`[ExcelProcessor] Found region column at index ${index}: "${originalCell}"`);
    } else if (cellStr === 'region' || cellStr === 'area') {
      regionCol = index;
    }
    
    // Supervisor Code - check for "كود المشرف" or similar
    if (cellStr.includes('كود') && cellStr.includes('مشرف')) {
      supervisorCol = index;
      console.log(`[ExcelProcessor] Found supervisor code column at index ${index}: "${originalCell}"`);
    } else if (cellStr.includes('supervisorid') || cellStr.includes('supervisor id') || cellStr === 'supervisorid') {
      supervisorCol = index;
    } else if (supervisorCol === -1 && (cellStr === 'supervisor' || cellStr === 'مشرف' || cellStr.includes('المشرف'))) {
      supervisorCol = index;
    }
  });
  
  console.log(`[ExcelProcessor] Column detection: codeCol=${codeCol}, nameCol=${nameCol}, regionCol=${regionCol}, supervisorCol=${supervisorCol}`);

  // Fallback to positional if header detection failed
  if (codeCol === -1) codeCol = 0;
  if (nameCol === -1) nameCol = 1;
  if (regionCol === -1) regionCol = 2;
  if (supervisorCol === -1) supervisorCol = 3;

  // Skip header row
  const rows = data.slice(1);
  const seenRiderCodes = new Set<string>();
  const seenRiderSupervisorPairs = new Map<string, string>(); // riderCode -> supervisorCode

  rows.forEach((row, index) => {
    const rowNumber = index + 2; // +2 because we skipped header and arrays are 0-indexed

    // Skip completely empty rows
    if (row.every((cell) => !cell || cell.toString().trim() === '')) {
      return;
    }

    // Extract data using detected column indices
    const riderCode = (row[codeCol] || '').toString().trim();
    const riderName = (row[nameCol] || '').toString().trim();
    const region = (row[regionCol] || '').toString().trim();
    const supervisorCode = (row[supervisorCol] || '').toString().trim();

    // Validate required fields
    if (!riderCode) {
      result.warnings.push(`صف ${rowNumber}: كود المندوب فارغ - تم تخطي الصف`);
      return;
    }

    if (!riderName) {
      result.warnings.push(`صف ${rowNumber}: اسم المندوب فارغ - تم تخطي الصف`);
      return;
    }

    if (!supervisorCode) {
      result.warnings.push(`صف ${rowNumber}: كود المشرف فارغ - تم تخطي الصف`);
      return;
    }

    // Check for duplicate rider codes
    if (seenRiderCodes.has(riderCode)) {
      result.warnings.push(`صف ${rowNumber}: كود المندوب "${riderCode}" مكرر - تم تخطي الصف`);
      return;
    }

    // Check if rider is assigned to different supervisor
    const existingSupervisor = seenRiderSupervisorPairs.get(riderCode);
    if (existingSupervisor && existingSupervisor !== supervisorCode) {
      result.errors.push(
        `صف ${rowNumber}: المندوب "${riderCode}" معين لمشرف آخر (${existingSupervisor})`
      );
      result.success = false;
      return;
    }

    seenRiderCodes.add(riderCode);
    seenRiderSupervisorPairs.set(riderCode, supervisorCode);

    result.data.push({
      riderCode,
      riderName,
      region,
      supervisorCode,
      rowIndex: rowNumber,
    });
  });

  console.log(`[ExcelProcessor] Processed ${result.data.length} valid riders from ${rows.length} rows`);
  console.log(`[ExcelProcessor] Errors: ${result.errors.length}, Warnings: ${result.warnings.length}`);
  
  if (result.data.length > 0) {
    console.log(`[ExcelProcessor] Sample first rider:`, {
      code: result.data[0].riderCode,
      name: result.data[0].riderName,
      supervisor: result.data[0].supervisorCode,
    });
  }

  if (result.data.length === 0 && result.errors.length === 0) {
    result.errors.push('لم يتم العثور على بيانات صحيحة في الملف');
    result.success = false;
  }

  return result;
}

/**
 * Process debts Excel file
 */
export function processDebtsExcel(data: any[][]): ProcessingResult<ProcessedDebt> {
  const result: ProcessingResult<ProcessedDebt> = {
    success: true,
    data: [],
    errors: [],
    warnings: [],
  };

  if (data.length < 2) {
    result.success = false;
    result.errors.push('الملف يجب أن يحتوي على عنوان وصف واحد على الأقل');
    return result;
  }

  // Detect header row and find column indices
  const headerRow = data[0];
  let codeCol = -1, amountCol = -1;

  headerRow.forEach((cell, index) => {
    const cellStr = (cell || '').toString().trim().toLowerCase();
    if (cellStr.includes('كود') && cellStr.includes('مندوب')) codeCol = index;
    else if (cellStr.includes('مديونية') || cellStr.includes('مبلغ') || cellStr.includes('دين')) amountCol = index;
  });

  // Fallback to positional if header detection failed
  if (codeCol === -1) codeCol = 0;
  if (amountCol === -1) amountCol = 1;

  const rows = data.slice(1);

  rows.forEach((row, index) => {
    const rowNumber = index + 2;

    // Skip empty rows
    if (row.every((cell) => !cell || cell.toString().trim() === '')) {
      return;
    }

    const riderCode = (row[codeCol] || '').toString().trim();
    const amountStr = (row[amountCol] || '0').toString().trim();
    const amount = parseFloat(amountStr.replace(/[^\d.-]/g, '')) || 0;

    if (!riderCode) {
      result.errors.push(`صف ${rowNumber}: كود المندوب مطلوب`);
      result.success = false;
      return;
    }

    if (isNaN(amount) || amount < 0) {
      result.warnings.push(`صف ${rowNumber}: المبلغ غير صحيح، سيتم اعتباره 0`);
    }

    result.data.push({
      riderCode,
      amount,
      rowIndex: rowNumber,
    });
  });

  if (result.data.length === 0 && result.errors.length === 0) {
    result.errors.push('لم يتم العثور على بيانات صحيحة في الملف');
    result.success = false;
  }

  return result;
}

/**
 * Process performance Excel file
 */
export function processPerformanceExcel(
  data: any[][],
  options?: { forcedDate?: string }
): ProcessingResult<ProcessedPerformance> {
  const result: ProcessingResult<ProcessedPerformance> = {
    success: true,
    data: [],
    errors: [],
    warnings: [],
  };

  if (data.length < 2) {
    result.success = false;
    result.errors.push('الملف يجب أن يحتوي على عنوان وصف واحد على الأقل');
    return result;
  }

  // Detect header row and find column indices
  const headerRow = data[0];
  let dateCol = -1, codeCol = -1, hoursCol = -1, breakCol = -1, delayCol = -1;
  let absenceCol = -1, ordersCol = -1, acceptanceCol = -1, debtCol = -1;

  headerRow.forEach((cell, index) => {
    const cellStr = (cell || '').toString().trim().toLowerCase();
    if (cellStr.includes('تاريخ')) dateCol = index;
    else if (cellStr.includes('كود') && cellStr.includes('مندوب')) codeCol = index;
    else if (cellStr.includes('ساعات') || cellStr.includes('عمل')) hoursCol = index;
    else if (cellStr.includes('بريك')) breakCol = index;
    else if (cellStr.includes('تأخير')) delayCol = index;
    else if (cellStr.includes('غياب')) absenceCol = index;
    else if (cellStr.includes('طلبات') || cellStr.includes('طلب')) ordersCol = index;
    else if (cellStr.includes('قبول') || cellStr.includes('معدل')) acceptanceCol = index;
    else if (cellStr.includes('محفظة') || cellStr.includes('مديونية')) debtCol = index;
  });

  // Fallback to positional if header detection failed
  if (dateCol === -1) dateCol = 0;
  if (codeCol === -1) codeCol = 1;
  if (hoursCol === -1) hoursCol = 2;
  if (breakCol === -1) breakCol = 3;
  if (delayCol === -1) delayCol = 4;
  if (absenceCol === -1) absenceCol = 5;
  if (ordersCol === -1) ordersCol = 6;
  if (acceptanceCol === -1) acceptanceCol = 7;
  if (debtCol === -1) debtCol = 8;

  const rows = data.slice(1);
  const forcedDate = options?.forcedDate?.toString().trim();
  const forcedDateYmd =
    forcedDate && /^\d{4}-\d{2}-\d{2}$/.test(forcedDate) ? forcedDate : undefined;
  let lastValidDate = forcedDateYmd || new Date().toISOString().split('T')[0]; // Default to today (or forced)

  // Convert Excel/Sheets serial date to YYYY-MM-DD (safe, timezone-independent)
  const serialToYmd = (serial: number): string | null => {
    if (!Number.isFinite(serial)) return null;
    // Prefer XLSX's parser (handles the 1900 leap-year bug consistently)
    const parsed = XLSX.SSF.parse_date_code(serial);
    if (parsed && parsed.y && parsed.m && parsed.d) {
      const y = parsed.y;
      const m = String(parsed.m).padStart(2, '0');
      const d = String(parsed.d).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    // Fallback: Excel epoch 1899-12-30
    const base = new Date(Date.UTC(1899, 11, 30));
    const dt = new Date(base.getTime() + serial * 24 * 60 * 60 * 1000);
    if (isNaN(dt.getTime())) return null;
    const y = dt.getUTCFullYear();
    const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const d = String(dt.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  rows.forEach((row, index) => {
    const rowNumber = index + 2;

    // Skip empty rows
    if (row.every((cell) => !cell || cell.toString().trim() === '')) {
      return;
    }

    // Extract data - handle date conversion
    // If date is empty, use the last valid date (Excel merged cells)
    // If admin selected a date, force it for all rows and skip date validation entirely.
    let date: string;
    try {
      if (forcedDateYmd) {
        date = forcedDateYmd;
      } else {
      const dateValue = row[dateCol];
      
      // Helper function to format date as YYYY-MM-DD without timezone issues
      const formatDate = (d: Date): string => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };
      
      if (dateValue instanceof Date) {
        date = formatDate(dateValue);
        lastValidDate = date;
      } else if (typeof dateValue === 'number' && Number.isFinite(dateValue)) {
        // Excel serial date (very common when reading raw cell values)
        const ymd = serialToYmd(dateValue);
        if (ymd) {
          date = ymd;
          lastValidDate = date;
        } else {
          date = lastValidDate;
          result.warnings.push(`صف ${rowNumber}: تاريخ غير صحيح (${dateValue})`);
        }
      } else if (dateValue && dateValue.toString().trim() !== '') {
        const dateStr = dateValue.toString().trim();
        
        // Numeric string (Excel/Google Sheets serial date)
        if (/^\d{4,6}$/.test(dateStr) && !dateStr.includes('/') && !dateStr.includes('-')) {
          const serialNum = Number(dateStr);
          const ymd = serialToYmd(serialNum);
          if (ymd) {
            date = ymd;
            lastValidDate = date;
          } else {
            date = lastValidDate;
            result.warnings.push(`صف ${rowNumber}: تاريخ غير صحيح (${dateStr})`);
          }
        }
        // If already in YYYY-MM-DD format (from excelProcessorServer), use directly
        else if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
          date = dateStr;
          lastValidDate = date;
        }
        // Try M/D/YYYY or D/M/YYYY format
        else if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(dateStr)) {
          const parts = dateStr.split('/');
          if (parts.length === 3) {
            // Try M/D/YYYY first (US format - common in Excel)
            const month = parseInt(parts[0]);
            const day = parseInt(parts[1]);
            const year = parseInt(parts[2]);
            
            // Validate month and day
            if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
              date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              lastValidDate = date;
            } else {
              date = lastValidDate;
              result.warnings.push(`صف ${rowNumber}: تاريخ غير صحيح (${dateStr})`);
            }
          } else {
            date = lastValidDate;
          }
        }
        // Standard Date parsing as fallback
        else {
          const parsedDate = new Date(dateStr);
          if (!isNaN(parsedDate.getTime()) && parsedDate.getFullYear() >= 1900 && parsedDate.getFullYear() <= 2100) {
            date = formatDate(parsedDate);
            lastValidDate = date;
          } else {
            date = lastValidDate;
            result.warnings.push(`صف ${rowNumber}: تاريخ غير صحيح (${dateStr})`);
          }
        }
      } else {
        // Empty date - use last valid date (common in Excel merged cells)
        date = lastValidDate;
      }
      }
    } catch (e) {
      date = lastValidDate;
      // Only warn if we are not forcing the date
      if (!forcedDateYmd) {
        result.warnings.push(`صف ${rowNumber}: تاريخ غير صحيح`);
      }
    }

    const riderCode = (row[codeCol] || '').toString().trim();
    const hours = parseFloat((row[hoursCol] || '0').toString()) || 0;
    const breakTime = parseFloat((row[breakCol] || '0').toString()) || 0;
    const delay = parseFloat((row[delayCol] || '0').toString()) || 0;
    const absence = (row[absenceCol] || 'لا').toString().trim();
    const orders = parseInt((row[ordersCol] || '0').toString()) || 0;
    const acceptance = (row[acceptanceCol] || '0%').toString().trim();
    const debt = parseFloat((row[debtCol] || '0').toString()) || 0;

    if (!riderCode) {
      result.errors.push(`صف ${rowNumber}: كود المندوب مطلوب`);
      result.success = false;
      return;
    }

    result.data.push({
      date,
      riderCode,
      hours,
      break: breakTime,
      delay,
      absence,
      orders,
      acceptance,
      debt,
      rowIndex: rowNumber,
    });
  });

  if (result.data.length === 0 && result.errors.length === 0) {
    result.errors.push('لم يتم العثور على بيانات صحيحة في الملف');
    result.success = false;
  }

  return result;
}

/**
 * Check if supervisor code is valid (not empty and not "unassigned" text)
 */
function isValidSupervisorCode(code: string | undefined | null): boolean {
  if (!code) return false;
  const trimmed = code.toString().trim();
  if (trimmed === '') return false;
  // Check for common "unassigned" texts
  const unassignedTexts = ['لم يتم التعيين', 'غير معروف', 'غير معين', 'لا يوجد', 'unassigned', 'not assigned', 'none'];
  return !unassignedTexts.some(text => trimmed.toLowerCase().includes(text.toLowerCase()));
}

/**
 * Check for duplicate riders across all supervisors
 */
export async function checkDuplicateRiders(
  newRiders: ProcessedRider[],
  existingRiders: any[]
): Promise<{ hasDuplicates: boolean; duplicates: string[]; conflicts: string[] }> {
  const existingRiderCodes = new Set(existingRiders.map((r: any) => r.code?.toString().trim()));
  const newRiderCodes = new Set(newRiders.map((r) => r.riderCode));
  const duplicates: string[] = [];
  const conflicts: string[] = [];

  // Check for duplicates in new data
  const seenInNew = new Set<string>();
  newRiders.forEach((rider) => {
    if (seenInNew.has(rider.riderCode)) {
      duplicates.push(rider.riderCode);
    } else {
      seenInNew.add(rider.riderCode);
    }
  });

  // Check for conflicts with existing riders
  // Only consider riders that are actually assigned to a supervisor
  newRiders.forEach((rider) => {
    if (existingRiderCodes.has(rider.riderCode)) {
      const existingRider = existingRiders.find((r: any) => r.code?.toString().trim() === rider.riderCode);
      
      // If rider exists but has no valid supervisor assigned, allow update (no conflict)
      if (existingRider && !isValidSupervisorCode(existingRider.supervisorCode)) {
        // Allow reassignment - this is not a conflict
        return;
      }
      
      // Only consider it a conflict if the existing rider has a different valid supervisor assigned
      if (existingRider && isValidSupervisorCode(existingRider.supervisorCode) && existingRider.supervisorCode !== rider.supervisorCode) {
        conflicts.push(
          `المندوب ${rider.riderCode} معين بالفعل للمشرف ${existingRider.supervisorCode}`
        );
      }
      // If same supervisor, no conflict (will be skipped in bulkAddRiders)
    }
  });

  return {
    hasDuplicates: duplicates.length > 0 || conflicts.length > 0,
    duplicates,
    conflicts,
  };
}

