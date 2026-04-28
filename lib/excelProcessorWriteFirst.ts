/**
 * Excel Processor - Write-First Architecture
 * Processes Excel files and stores in system database FIRST
 * Then syncs to Google Sheets in background
 */

import * as XLSX from 'xlsx';
import { systemDB, Rider, PerformanceData } from './database';

export interface ProcessedRider {
  riderId: string;
  riderName: string;
  zone: string;
  supervisorId: string;
  rowIndex: number;
}

export interface ProcessedPerformance {
  date: string;
  riderId: string;
  workHours: number;
  breaks: number;
  delay: number;
  absence: boolean;
  orders: number;
  acceptanceRate: number;
  wallet: number;
  rowIndex: number;
}

export interface ProcessingResult<T> {
  success: boolean;
  data: T[];
  errors: string[];
  warnings: string[];
}

/**
 * Read Excel file from ArrayBuffer
 */
export async function readExcelFromBuffer(buffer: ArrayBuffer): Promise<any[][]> {
  try {
    const data = new Uint8Array(buffer);
    const workbook = XLSX.read(data, { type: 'array', cellDates: true });

    if (workbook.SheetNames.length === 0) {
      throw new Error('الملف لا يحتوي على أوراق');
    }

    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];

    const jsonData = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: '',
      raw: false,
    }) as any[][];

    return jsonData;
  } catch (error: any) {
    throw new Error(`خطأ في قراءة الملف: ${error.message}`);
  }
}

/**
 * Process riders Excel - Write to system database FIRST
 */
export async function processRidersExcelWriteFirst(
  buffer: ArrayBuffer
): Promise<ProcessingResult<ProcessedRider> & { stored: number }> {
  const result: ProcessingResult<ProcessedRider> = {
    success: true,
    data: [],
    errors: [],
    warnings: [],
  };

  try {
    // Step 1: Read Excel
    const rawData = await readExcelFromBuffer(buffer);

    if (rawData.length < 2) {
      result.success = false;
      result.errors.push('الملف يجب أن يحتوي على عنوان وصف واحد على الأقل');
      return { ...result, stored: 0 };
    }

    // Step 2: Detect columns
    const headerRow = rawData[0];
    let codeCol = -1,
      nameCol = -1,
      zoneCol = -1,
      supervisorCol = -1;

    headerRow.forEach((cell, index) => {
      const cellStr = (cell || '').toString().trim().toLowerCase();
      if (cellStr.includes('كود') && cellStr.includes('مندوب')) codeCol = index;
      else if (cellStr.includes('riderid') || cellStr === 'riderid') codeCol = index;
      else if (cellStr.includes('اسم') || cellStr.includes('name') || cellStr === 'ridername') nameCol = index;
      else if (cellStr.includes('منطقة') || cellStr.includes('zone')) zoneCol = index;
      else if ((cellStr.includes('كود') && cellStr.includes('مشرف')) || cellStr.includes('supervisorid')) supervisorCol = index;
    });

    // Fallback to positional
    if (codeCol === -1) codeCol = 0;
    if (nameCol === -1) nameCol = 1;
    if (zoneCol === -1) zoneCol = 2;
    if (supervisorCol === -1) supervisorCol = 3;

    // Step 3: Process rows
    const rows = rawData.slice(1);
    const seenRiderIds = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNumber = i + 2;

      // Skip empty rows
      if (row.every((cell) => !cell || cell.toString().trim() === '')) {
        continue;
      }

      const riderId = (row[codeCol] || '').toString().trim();
      const riderName = (row[nameCol] || '').toString().trim();
      const zone = (row[zoneCol] || '').toString().trim();
      const supervisorId = (row[supervisorCol] || '').toString().trim();

      // Validation
      if (!riderId) {
        result.errors.push(`صف ${rowNumber}: كود المندوب مطلوب`);
        result.success = false;
        continue;
      }

      if (!riderName) {
        result.errors.push(`صف ${rowNumber}: اسم المندوب مطلوب`);
        result.success = false;
        continue;
      }

      if (!supervisorId) {
        result.errors.push(`صف ${rowNumber}: كود المشرف مطلوب`);
        result.success = false;
        continue;
      }

      // Check duplicates in file
      if (seenRiderIds.has(riderId)) {
        result.errors.push(`صف ${rowNumber}: كود المندوب "${riderId}" مكرر في الملف`);
        result.success = false;
        continue;
      }

      seenRiderIds.add(riderId);

      result.data.push({
        riderId,
        riderName,
        zone,
        supervisorId,
        rowIndex: rowNumber,
      });
    }

    if (result.data.length === 0 && result.errors.length === 0) {
      result.errors.push('لم يتم العثور على بيانات صحيحة في الملف');
      result.success = false;
      return { ...result, stored: 0 };
    }

    // Step 4: Store in system database FIRST
    if (result.success && result.data.length > 0) {
      const ridersToStore: Rider[] = result.data.map((r) => ({
        riderId: r.riderId,
        riderName: r.riderName,
        zone: r.zone,
        supervisorId: r.supervisorId,
        assignedDate: new Date().toISOString(),
        status: 'active',
      }));

      const storeResult = await systemDB.addRiders(ridersToStore);
      result.errors.push(...storeResult.errors);

      return {
        ...result,
        stored: storeResult.added,
      };
    }

    return { ...result, stored: 0 };
  } catch (error: any) {
    result.success = false;
    result.errors.push(error.message || 'حدث خطأ غير متوقع');
    return { ...result, stored: 0 };
  }
}

/**
 * Process performance Excel - Write to system database FIRST
 */
export async function processPerformanceExcelWriteFirst(
  buffer: ArrayBuffer
): Promise<ProcessingResult<ProcessedPerformance> & { stored: number }> {
  const result: ProcessingResult<ProcessedPerformance> = {
    success: true,
    data: [],
    errors: [],
    warnings: [],
  };

  try {
    // Step 1: Read Excel
    const rawData = await readExcelFromBuffer(buffer);

    if (rawData.length < 2) {
      result.success = false;
      result.errors.push('الملف يجب أن يحتوي على عنوان وصف واحد على الأقل');
      return { ...result, stored: 0 };
    }

    // Step 2: Detect columns
    const headerRow = rawData[0];
    let dateCol = -1,
      codeCol = -1,
      hoursCol = -1,
      breakCol = -1,
      delayCol = -1,
      absenceCol = -1,
      ordersCol = -1,
      acceptanceCol = -1,
      walletCol = -1;

    headerRow.forEach((cell, index) => {
      const cellStr = (cell || '').toString().trim().toLowerCase();
      if (cellStr.includes('تاريخ') || cellStr.includes('date')) dateCol = index;
      else if (cellStr.includes('كود') && cellStr.includes('مندوب')) codeCol = index;
      else if (cellStr.includes('riderid')) codeCol = index;
      else if (cellStr.includes('ساعات') || cellStr.includes('hours')) hoursCol = index;
      else if (cellStr.includes('بريك') || cellStr.includes('break')) breakCol = index;
      else if (cellStr.includes('تأخير') || cellStr.includes('delay')) delayCol = index;
      else if (cellStr.includes('غياب') || cellStr.includes('absence')) absenceCol = index;
      else if (cellStr.includes('طلبات') || cellStr.includes('orders')) ordersCol = index;
      else if (cellStr.includes('قبول') || cellStr.includes('acceptance')) acceptanceCol = index;
      else if (cellStr.includes('محفظة') || cellStr.includes('wallet') || cellStr.includes('debt')) walletCol = index;
    });

    // Fallback to positional
    if (dateCol === -1) dateCol = 0;
    if (codeCol === -1) codeCol = 1;
    if (hoursCol === -1) hoursCol = 2;
    if (breakCol === -1) breakCol = 3;
    if (delayCol === -1) delayCol = 4;
    if (absenceCol === -1) absenceCol = 5;
    if (ordersCol === -1) ordersCol = 6;
    if (acceptanceCol === -1) acceptanceCol = 7;
    if (walletCol === -1) walletCol = 8;

    // Step 3: Process rows
    const rows = rawData.slice(1);

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNumber = i + 2;

      // Skip empty rows
      if (row.every((cell) => !cell || cell.toString().trim() === '')) {
        continue;
      }

      // Parse date
      let date: string;
      try {
        const dateValue = row[dateCol];
        if (dateValue instanceof Date) {
          date = dateValue.toISOString().split('T')[0];
        } else if (dateValue) {
          date = new Date(dateValue).toISOString().split('T')[0];
        } else {
          date = new Date().toISOString().split('T')[0];
          result.warnings.push(`صف ${rowNumber}: تاريخ غير موجود، تم استخدام تاريخ اليوم`);
        }
      } catch (e) {
        date = new Date().toISOString().split('T')[0];
        result.warnings.push(`صف ${rowNumber}: تاريخ غير صحيح، تم استخدام تاريخ اليوم`);
      }

      const riderId = (row[codeCol] || '').toString().trim();
      const workHours = parseFloat((row[hoursCol] || '0').toString()) || 0;
      const breaks = parseFloat((row[breakCol] || '0').toString()) || 0;
      const delay = parseFloat((row[delayCol] || '0').toString()) || 0;
      const absenceStr = (row[absenceCol] || 'لا').toString().trim().toLowerCase();
      const absence = absenceStr === 'نعم' || absenceStr === 'yes' || absenceStr === 'true';
      const orders = parseInt((row[ordersCol] || '0').toString()) || 0;
      const acceptanceStr = (row[acceptanceCol] || '0%').toString().trim();
      const acceptanceRate = parseFloat(acceptanceStr.replace('%', '')) || 0;
      const wallet = parseFloat((row[walletCol] || '0').toString()) || 0;

      if (!riderId) {
        result.errors.push(`صف ${rowNumber}: كود المندوب مطلوب`);
        result.success = false;
        continue;
      }

      result.data.push({
        date,
        riderId,
        workHours,
        breaks,
        delay,
        absence,
        orders,
        acceptanceRate,
        wallet,
        rowIndex: rowNumber,
      });
    }

    if (result.data.length === 0 && result.errors.length === 0) {
      result.errors.push('لم يتم العثور على بيانات صحيحة في الملف');
      result.success = false;
      return { ...result, stored: 0 };
    }

    // Step 4: Store in system database FIRST
    if (result.data.length > 0) {
      const performanceToStore: Omit<PerformanceData, 'id' | 'createdAt'>[] = result.data.map((p) => ({
        date: p.date,
        riderId: p.riderId,
        workHours: p.workHours,
        breaks: p.breaks,
        delay: p.delay,
        absence: p.absence,
        orders: p.orders,
        acceptanceRate: p.acceptanceRate,
        wallet: p.wallet,
      }));

      const stored = await systemDB.addPerformanceData(performanceToStore);

      return {
        ...result,
        stored,
      };
    }

    return { ...result, stored: 0 };
  } catch (error: any) {
    result.success = false;
    result.errors.push(error.message || 'حدث خطأ غير متوقع');
    return { ...result, stored: 0 };
  }
}

