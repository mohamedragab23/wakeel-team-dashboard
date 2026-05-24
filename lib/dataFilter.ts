import { getSupervisorRiders } from './dataService';
import { getSheetData } from './googleSheets';

/** Match rider codes across "00123" vs "123" styles (same as performance filter). */
export function normalizeRiderCodeForPerformance(code: any): string {
  const raw = String(code ?? '')
    .replace(/\uFEFF/g, '')
    .trim();
  if (!raw) return '';
  const cleaned = raw
    .replace(/^['’`]+/, '')
    .replace(/^"(.*)"$/, '$1')
    .replace(/\s+/g, '')
    .trim();
  if (!cleaned) return '';

  // Normalize Arabic-Indic digits to western digits (e.g. ١٢٣٤ -> 1234).
  const westernDigits = cleaned
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));

  // Common Excel numeric artifacts for IDs:
  // - "1195581.0"
  // - "1,195,581"
  // - "1.195581E+6"
  const compactNumeric = westernDigits.replace(/,/g, '');
  const decimalLike = compactNumeric.match(/^(\d+)\.0+$/);
  if (decimalLike) {
    return decimalLike[1].replace(/^0+/, '') || '0';
  }
  if (/^\d+(?:\.\d+)?e[+\-]?\d+$/i.test(compactNumeric)) {
    const n = Number(compactNumeric);
    if (Number.isFinite(n)) {
      const asInt = Math.trunc(n).toString();
      return asInt.replace(/^0+/, '') || '0';
    }
  }
  if (/^\d+$/.test(compactNumeric)) {
    return compactNumeric.replace(/^0+/, '') || '0';
  }

  return westernDigits.replace(/^0+/, '') || '0';
}

/** تطبيع كود المشرف لمطابقة شيت طلبات الإقالة مع كود الجلسة */
export function normalizeSupervisorCodeForMatch(code: any): string {
  return String(code ?? '')
    .replace(/\uFEFF/g, '')
    .trim()
    .replace(/^0+(?=\d)/, '');
}

/** تحديد ما إذا كان الصف مُعلّم كغياب (لاستخدامه في عداد الغياب فقط). */
export function isDailyRowMarkedAbsent(absenceRaw: unknown): boolean {
  const a = String(absenceRaw ?? '')
    .trim()
    .toLowerCase();
  return a === 'نعم' || a === '1' || a === 'yes' || a === 'true' || a === 'y';
}

/**
 * مفتاح فريد لكل (يوم + مندوب) بعد تطبيع الكود — لدمج صفوف مكررة في الشيت.
 * آخر صف في ترتيب القراءة يفوز (يُعتمد كأحدث رفع).
 */
export function dailyPerformanceRowKey(dateStr: string, riderCode: string): string {
  return `${dateStr}|${normalizeRiderCodeForPerformance(riderCode)}`;
}

/**
 * Parse date cells from البيانات اليومية (shared: filter + salary aggregation).
 */
export function parseDailySheetDate(dateValue: any): Date | null {
  if (!dateValue) return null;

  if (dateValue instanceof Date) {
    return isNaN(dateValue.getTime()) ? null : dateValue;
  }

  const dateStr = dateValue.toString().trim();
  if (!dateStr) return null;

  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    const parsed = new Date(dateStr + 'T00:00:00');
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  if (/^\d{8}$/.test(dateStr)) {
    const year = parseInt(dateStr.substring(0, 4));
    const month = parseInt(dateStr.substring(4, 6)) - 1;
    const day = parseInt(dateStr.substring(6, 8));
    const parsed = new Date(year, month, day);
    if (!isNaN(parsed.getTime()) && parsed.getFullYear() === year && parsed.getMonth() === month && parsed.getDate() === day) {
      return parsed;
    }
  }

  if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(dateStr)) {
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      const part1 = parseInt(parts[0]);
      const part2 = parseInt(parts[1]);
      const year = parseInt(parts[2]);

      if (part1 > 12) {
        const day = part1;
        const month = part2 - 1;
        const parsed = new Date(year, month, day);
        if (!isNaN(parsed.getTime()) && parsed.getDate() === day && parsed.getMonth() === month && parsed.getFullYear() === year) {
          return parsed;
        }
      } else if (part2 > 12) {
        const month = part1 - 1;
        const day = part2;
        const parsed = new Date(year, month, day);
        if (!isNaN(parsed.getTime()) && parsed.getDate() === day && parsed.getMonth() === month && parsed.getFullYear() === year) {
          return parsed;
        }
      } else {
        const month = part1 - 1;
        const day = part2;
        const parsed = new Date(year, month, day);
        if (!isNaN(parsed.getTime()) && parsed.getDate() === day && parsed.getMonth() === month && parsed.getFullYear() === year) {
          return parsed;
        }
        const day2 = part1;
        const month2 = part2 - 1;
        const parsed2 = new Date(year, month2, day2);
        if (!isNaN(parsed2.getTime()) && parsed2.getDate() === day2 && parsed2.getMonth() === month2 && parsed2.getFullYear() === year) {
          return parsed2;
        }
      }
    }
  }

  if (/^\d{1,2}\s+\w+\s+\d{4}/.test(dateStr) || /\w+\s+\d{1,2},?\s+\d{4}/.test(dateStr)) {
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 1900 && parsed.getFullYear() < 2100) {
      return parsed;
    }
  }

  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 1900 && parsed.getFullYear() < 2100) {
    return parsed;
  }

  if (!isNaN(Number(dateStr)) && !dateStr.includes('/') && !dateStr.includes('-')) {
    const serialNumber = Number(dateStr);
    if (serialNumber >= 1 && serialNumber < 100000) {
      const excelDate = new Date(1899, 11, 30);
      excelDate.setDate(excelDate.getDate() + serialNumber);

      if (!isNaN(excelDate.getTime()) && excelDate.getFullYear() > 1900 && excelDate.getFullYear() < 2100) {
        return excelDate;
      }
    }
    if (serialNumber > 1000000000 && serialNumber < 10000000000000) {
      const timestampDate = new Date(serialNumber);
      if (!isNaN(timestampDate.getTime()) && timestampDate.getFullYear() > 1900 && timestampDate.getFullYear() < 2100) {
        return timestampDate;
      }
    }
  }

  return null;
}

export type SupervisorDailyAggRecord = {
  date: string;
  riderCode: string;
  hours: number;
  orders: number;
  break: number;
  delay: number;
  absence: string;
  acceptance: string;
  debt: number;
};

export type SupervisorRiderAttribution = {
  riderCodesExact: Set<string>;
  riderCodesNormalized: Set<string>;
  inclusiveEndByRider: Map<string, Date>;
  terminatedCodes: Set<string>;
  riderNamesByCode: Map<string, string>;
  riders: Awaited<ReturnType<typeof getSupervisorRiders>>;
};

/**
 * مناديب يُحتسب أداؤهم (طلبات/ساعات) لمشرف: المعيّنون حالياً + المُقالون بموافقة على طلب إقالة عند هذا المشرف.
 */
export async function buildSupervisorRiderAttribution(
  supervisorCode: string,
  options?: { useCache?: boolean; riders?: Awaited<ReturnType<typeof getSupervisorRiders>> }
): Promise<SupervisorRiderAttribution> {
  const supTrim = (supervisorCode ?? '').toString().trim();
  const useCache = options?.useCache ?? false;
  const riders = options?.riders ?? (await getSupervisorRiders(supTrim, useCache));
  const { codes: terminatedCodes, inclusiveEndByRider, riderNamesByCode } =
    await getApprovedTerminationAttributionForSupervisor(supTrim);

  const riderCodesExact = new Set(riders.map((r) => (r.code ?? '').toString().trim()).filter(Boolean));
  const riderCodesNormalized = new Set(riders.map((r) => normalizeRiderCodeForPerformance(r.code)));
  for (const code of terminatedCodes) {
    riderCodesExact.add(code);
    riderCodesNormalized.add(normalizeRiderCodeForPerformance(code));
  }

  return {
    riderCodesExact,
    riderCodesNormalized,
    inclusiveEndByRider,
    terminatedCodes,
    riderNamesByCode,
    riders,
  };
}

/**
 * Single pass over البيانات اليومية for a supervisor's riders (+ approved terminations).
 * Use for salary calculation to avoid O(riders × rows) sheet scans.
 */
export async function aggregateSupervisorDailyPerformance(
  supervisorCode: string,
  startDate: Date,
  endDate: Date,
  options?: { useCache?: boolean; riders?: Awaited<ReturnType<typeof getSupervisorRiders>> }
): Promise<{
  records: SupervisorDailyAggRecord[];
  totalOrders: number;
  totalHours: number;
  byRider: Map<string, { orders: number; hours: number }>;
  byDate: Map<string, { orders: number; hours: number }>;
  /** مناديب لهم طلبات/ساعات في الفترة (نشطون + مُقالون ضمن نطاق الإقالة) */
  attributedRiderCount: number;
  /** معيّنون حالياً في شيت المناديب */
  activeAssignedCount: number;
  /** أكواد إقالة معتمدة غير موجودة بين المعيّنين الحاليين */
  terminatedOnlyCount: number;
  riderNamesByCode: Map<string, string>;
}> {
  const supTrim = (supervisorCode ?? '').toString().trim();
  const useCache = options?.useCache ?? false;
  const {
    riderCodesExact,
    riderCodesNormalized,
    inclusiveEndByRider,
    terminatedCodes,
    riders,
    riderNamesByCode,
  } = await buildSupervisorRiderAttribution(supTrim, { useCache, riders: options?.riders });

  let terminatedOnlyCount = 0;
  const activeNorm = new Set(riders.map((r) => normalizeRiderCodeForPerformance(r.code)));
  for (const code of terminatedCodes) {
    if (!activeNorm.has(normalizeRiderCodeForPerformance(code))) terminatedOnlyCount++;
  }

  const records: SupervisorDailyAggRecord[] = [];
  const byRider = new Map<string, { orders: number; hours: number }>();
  const byDate = new Map<string, { orders: number; hours: number }>();
  let totalOrders = 0;
  let totalHours = 0;

  if (riderCodesExact.size === 0) {
    return {
      records,
      totalOrders: 0,
      totalHours: 0,
      byRider,
      byDate,
      attributedRiderCount: 0,
      activeAssignedCount: riders.length,
      terminatedOnlyCount: 0,
      riderNamesByCode,
    };
  }

  const allData = await getSheetData('البيانات اليومية', useCache);
  const normalizedStartDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const normalizedEndDate = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());

  /** صف واحد لكل (تاريخ، مندوب): آخر ظهور في الشيت يفوز على التكرار */
  const deduped = new Map<string, SupervisorDailyAggRecord>();

  for (let i = 1; i < allData.length; i++) {
    const row = allData[i];
    if (!row[0] || !row[1]) continue;

    const riderCode = row[1].toString().trim();
    const riderCodeNorm = normalizeRiderCodeForPerformance(riderCode);
    if (!riderCodesExact.has(riderCode) && !riderCodesNormalized.has(riderCodeNorm)) continue;

    const rowDate = parseDailySheetDate(row[0]);
    if (!rowDate || isNaN(rowDate.getTime())) continue;

    const normalizedRowDate = new Date(rowDate.getFullYear(), rowDate.getMonth(), rowDate.getDate());
    if (normalizedRowDate.getTime() < normalizedStartDate.getTime()) continue;
    if (normalizedRowDate.getTime() > normalizedEndDate.getTime()) continue;
    if (normalizedRowDate.getFullYear() < 2020 || normalizedRowDate.getFullYear() > 2030) continue;

    const cutoff =
      inclusiveEndByRider.get(riderCode) ?? inclusiveEndByRider.get(riderCodeNorm);
    if (cutoff && normalizedRowDate.getTime() > cutoff.getTime()) continue;

    const absenceRaw = row[5]?.toString().trim() || 'لا';
    const hoursRaw = parseFloat(row[2]?.toString() || '0') || 0;
    // Keep actual worked hours even when absence flag exists.
    const hours = hoursRaw;
    const orders = parseInt(row[6]?.toString() || '0') || 0;
    const dateStr = normalizedRowDate.toISOString().split('T')[0];

    const rec: SupervisorDailyAggRecord = {
      date: dateStr,
      riderCode,
      hours,
      orders,
      break: parseFloat(row[3]?.toString() || '0') || 0,
      delay: parseFloat(row[4]?.toString() || '0') || 0,
      absence: absenceRaw,
      acceptance: row[7]?.toString().trim() || '0%',
      debt: parseFloat(row[8]?.toString() || '0') || 0,
    };

    deduped.set(dailyPerformanceRowKey(dateStr, riderCode), rec);
  }

  for (const rec of deduped.values()) {
    records.push(rec);
    totalOrders += rec.orders;
    totalHours += rec.hours;

    const rk = normalizeRiderCodeForPerformance(rec.riderCode);
    const aggR = byRider.get(rk) || { orders: 0, hours: 0 };
    aggR.orders += rec.orders;
    aggR.hours += rec.hours;
    byRider.set(rk, aggR);

    const aggD = byDate.get(rec.date) || { orders: 0, hours: 0 };
    aggD.orders += rec.orders;
    aggD.hours += rec.hours;
    byDate.set(rec.date, aggD);
  }

  return {
    records,
    totalOrders,
    totalHours,
    byRider,
    byDate,
    attributedRiderCount: byRider.size,
    activeAssignedCount: riders.length,
    terminatedOnlyCount,
    riderNamesByCode,
  };
}

/** آخر يوم (منتصف الليل المحلي) يُحتسب فيه أداء المندوب لهذا المشرف بعد إقالة معتمدة. */
function mergeInclusiveEndDay(existing: Date | undefined, candidate: Date): Date {
  const c = new Date(candidate.getFullYear(), candidate.getMonth(), candidate.getDate());
  if (!existing) return c;
  const e = new Date(existing.getFullYear(), existing.getMonth(), existing.getDate());
  return c.getTime() > e.getTime() ? c : e;
}

/**
 * مناديب لهم إقالة معتمدة عند هذا المشرف — تُحسب طلباتهم/ساعاتهم ضمن فترة التقرير حتى آخر يوم إقالة (شامل).
 * بعد تاريخ الموافقة/الطلب لا تُحسب لصالح هذا المشرف (حتى لو نُقل المندوب لمشرف آخر).
 * أعمدة طلبات_الإقالة: 0 كود المشرف، 2 كود المندوب، 3 اسم المندوب، 5 الحالة، 6 تاريخ الطلب، 7 تاريخ الموافقة.
 */
export async function getApprovedTerminationAttributionForSupervisor(supervisorCode: string): Promise<{
  codes: Set<string>;
  /** مفتاح: كود المندوب كما في الشيت أو بعد التطبيع؛ القيمة: آخر يوم (شامل) يُحتسب للمشرف */
  inclusiveEndByRider: Map<string, Date>;
  riderNamesByCode: Map<string, string>;
}> {
  const codes = new Set<string>();
  const inclusiveEndByRider = new Map<string, Date>();
  const riderNamesByCode = new Map<string, string>();
  const supTrim = (supervisorCode ?? '').toString().trim();
  const supNorm = normalizeSupervisorCodeForMatch(supTrim);
  if (!supTrim) return { codes, inclusiveEndByRider, riderNamesByCode };

  try {
    const data = await getSheetData('طلبات_الإقالة');
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row || row.length < 6) continue;
      const rowSup = row[0]?.toString().trim() ?? '';
      if (normalizeSupervisorCodeForMatch(rowSup) !== supNorm) continue;
      if (row[5]?.toString().trim().toLowerCase() !== 'approved') continue;
      const rc = row[2]?.toString().trim();
      if (!rc) continue;

      codes.add(rc);
      const norm = normalizeRiderCodeForPerformance(rc);

      const riderName = row[3]?.toString().trim();
      if (riderName) {
        riderNamesByCode.set(rc, riderName);
        riderNamesByCode.set(norm, riderName);
      }

      const parsedApproval = parseDailySheetDate(row[7]);
      const parsedRequest = parseDailySheetDate(row[6]);
      const parsed =
        parsedApproval && !isNaN(parsedApproval.getTime())
          ? parsedApproval
          : parsedRequest && !isNaN(parsedRequest.getTime())
            ? parsedRequest
            : null;
      if (parsed) {
        const endDay = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
        inclusiveEndByRider.set(rc, mergeInclusiveEndDay(inclusiveEndByRider.get(rc), endDay));
        inclusiveEndByRider.set(norm, mergeInclusiveEndDay(inclusiveEndByRider.get(norm), endDay));
      }
    }
  } catch {
    // sheet missing
  }
  return { codes, inclusiveEndByRider, riderNamesByCode };
}

/**
 * @deprecated Prefer getApprovedTerminationAttributionForSupervisor for cutoff-aware aggregation.
 */
export async function getApprovedTerminatedRiderCodesForSupervisor(
  supervisorCode: string
): Promise<Set<string>> {
  const { codes } = await getApprovedTerminationAttributionForSupervisor(supervisorCode);
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
  endDate?: Date,
  options?: { useCache?: boolean }
) {
  try {
    const useCache = options?.useCache ?? true;
    const allRidersMode = supervisorCode === null;

    let riderCodesExact: Set<string> | null = null;
    let riderCodesNormalized: Set<string> | null = null;

    let inclusiveEndByRider: Map<string, Date> = new Map();

    if (!allRidersMode) {
      const supCode = (supervisorCode ?? '').toString().trim();
      const attr = await buildSupervisorRiderAttribution(supCode);
      inclusiveEndByRider = attr.inclusiveEndByRider;
      riderCodesExact = attr.riderCodesExact;
      riderCodesNormalized = attr.riderCodesNormalized;

      if (riderCodesExact.size === 0) {
        return [];
      }
    }

    const allData = await getSheetData('البيانات اليومية', useCache);
    /** دمج تكرار (نفس اليوم + نفس المندوب): آخر صف في الشيت يفوز */
    const mergedByDayRider = new Map<string, any>();

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
      const riderCodeNorm = normalizeRiderCodeForPerformance(riderCode);
      if (!allRidersMode && riderCodesExact && riderCodesNormalized) {
        if (!riderCodesExact.has(riderCode) && !riderCodesNormalized.has(riderCodeNorm)) continue;
      }

      // Parse date with improved handling
      const rowDate = parseDailySheetDate(row[0]);
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

      if (!allRidersMode) {
        const cutoff =
          inclusiveEndByRider.get(riderCode) ?? inclusiveEndByRider.get(riderCodeNorm);
        if (cutoff && normalizedRowDate.getTime() > cutoff.getTime()) {
          continue;
        }
      }

      const dateStr = normalizedRowDate.toISOString().split('T')[0];
      const absenceRaw = row[5]?.toString().trim() || 'لا';
      const hoursRaw = parseFloat(row[2]?.toString() || '0') || 0;
      // Keep actual worked hours even when absence flag exists.
      const hours = hoursRaw;

      mergedByDayRider.set(dailyPerformanceRowKey(dateStr, riderCode), {
        date: dateStr,
        riderCode,
        hours,
        break: parseFloat(row[3]?.toString() || '0') || 0,
        delay: parseFloat(row[4]?.toString() || '0') || 0,
        absence: absenceRaw,
        orders: parseInt(row[6]?.toString() || '0') || 0,
        acceptance: row[7]?.toString().trim() || '0%',
        debt: parseFloat(row[8]?.toString() || '0') || 0,
      });
    }

    const filtered = Array.from(mergedByDayRider.values());

    // Enhanced debug logging (always log for troubleshooting)
    console.log(`[Performance Filter] Supervisor: ${allRidersMode ? 'ALL' : supervisorCode}`);
    console.log(`[Performance Filter] Date Range: ${normalizedStartDate?.toISOString().split('T')[0]} to ${normalizedEndDate?.toISOString().split('T')[0]}`);
    console.log(
      `[Performance Filter] Total rows in sheet: ${allData.length - 1}, Mode: ${allRidersMode ? 'all riders' : `assigned (${riderCodesExact?.size ?? 0} codes)`}`
    );
    console.log(`[Performance Filter] Found: ${filtered.length} records (deduped by day+rider)`);
    
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
          const sampleDate = parseDailySheetDate(allData[i][0]);
          const riderCodeRow = allData[i][1]?.toString().trim();

          if (sampleDate) {
            const dateStr = sampleDate.toISOString().split('T')[0];
            uniqueDates.add(dateStr);

            if (!allRidersMode && riderCodesExact && riderCodesNormalized) {
              if (
                riderCodesExact.has(riderCodeRow) ||
                riderCodesNormalized.has(normalizeRiderCodeForPerformance(riderCodeRow))
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

