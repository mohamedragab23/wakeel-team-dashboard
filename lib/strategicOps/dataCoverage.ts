/**
 * Data Coverage Calculator
 * 
 * Calculates actual data coverage and identifies missing upload days.
 * Implements SRS-001 Section 7 (Daily Average Logic)
 * 
 * @module DataCoverageCalculator
 * @version 1.0
 */

import { parseDailySheetDate } from '@/lib/dataFilter';

export type DateCoverageReport = {
  selectedPeriod: {
    startDate: string;
    endDate: string;
    totalDays: number;
  };
  actualCoverage: {
    uploadedDays: number;
    missingDays: number;
    coveragePercent: number;
  };
  missingDates: string[];
  uploadedDates: string[];
  summary: string;
};

/**
 * Calculate data coverage for a date range
 * 
 * @param dailyRecords - Array of daily performance records
 * @param startDate - Start date (YYYY-MM-DD)
 * @param endDate - End date (YYYY-MM-DD)
 * @returns Coverage report
 */
export function calculateDataCoverage(
  dailyRecords: Array<{ date: string | Date }>,
  startDate: string,
  endDate: string
): DateCoverageReport {
  // Enumerate all expected calendar dates
  const expectedDates = enumerateDates(startDate, endDate);
  
  // Extract unique uploaded dates
  const uploadedDatesSet = new Set<string>();
  for (const rec of dailyRecords) {
    const dateStr = typeof rec.date === 'string' 
      ? rec.date 
      : rec.date.toISOString().split('T')[0];
    uploadedDatesSet.add(dateStr);
  }
  
  const uploadedDates = Array.from(uploadedDatesSet).sort();
  
  // Identify missing dates
  const missingDates = expectedDates.filter(d => !uploadedDatesSet.has(d));
  
  // Calculate coverage
  const totalDays = expectedDates.length;
  const uploadedDays = uploadedDates.length;
  const missingDays = missingDates.length;
  const coveragePercent = totalDays > 0 
    ? Math.round((uploadedDays / totalDays) * 100) 
    : 0;
  
  // Generate summary
  const summary = generateCoverageSummary({
    totalDays,
    uploadedDays,
    missingDays,
    coveragePercent,
    startDate,
    endDate,
  });
  
  return {
    selectedPeriod: {
      startDate,
      endDate,
      totalDays,
    },
    actualCoverage: {
      uploadedDays,
      missingDays,
      coveragePercent,
    },
    missingDates,
    uploadedDates,
    summary,
  };
}

/**
 * Enumerate all dates in a range (inclusive)
 */
function enumerateDates(start: string, end: string): string[] {
  const dates: string[] = [];
  const current = new Date(start + 'T00:00:00');
  const endDate = new Date(end + 'T00:00:00');
  
  while (current <= endDate) {
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, '0');
    const d = String(current.getDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${d}`);
    current.setDate(current.getDate() + 1);
  }
  
  return dates;
}

/**
 * Generate human-readable coverage summary (Arabic)
 */
function generateCoverageSummary(params: {
  totalDays: number;
  uploadedDays: number;
  missingDays: number;
  coveragePercent: number;
  startDate: string;
  endDate: string;
}): string {
  const { totalDays, uploadedDays, missingDays, coveragePercent, startDate, endDate } = params;
  
  if (coveragePercent === 100) {
    return `✅ تغطية كاملة: تم رفع بيانات جميع الأيام (${uploadedDays}/${totalDays} يوم).`;
  }
  
  if (coveragePercent >= 95) {
    return `⚠️ تغطية جيدة: ${coveragePercent}% - ناقص ${missingDays} يوم فقط.`;
  }
  
  if (coveragePercent >= 80) {
    return `⚠️ تغطية متوسطة: ${coveragePercent}% - ناقص ${missingDays} يوم من ${totalDays} يوم. قد يؤثر على دقة المتوسطات اليومية.`;
  }
  
  return `🔴 تغطية منخفضة: ${coveragePercent}% - ناقص ${missingDays} يوم من ${totalDays} يوم. التحليلات قد تكون غير دقيقة. يُنصح بإكمال رفع البيانات الناقصة.`;
}

/**
 * Get missing days count from raw daily sheet data
 * Helper for quick checks
 */
export function getMissingDaysCount(
  dailySheetRaw: unknown[][],
  startDate: string,
  endDate: string
): number {
  const headerOffset = dailySheetRaw.length > 0 && String(dailySheetRaw[0][0] ?? '').includes('تاريخ') ? 1 : 0;
  
  const dates = new Set<string>();
  for (let i = headerOffset; i < dailySheetRaw.length; i++) {
    const row = dailySheetRaw[i];
    if (!row || !row[0]) continue;
    const parsed = parseDailySheetDate(row[0]);
    if (parsed) {
      dates.add(parsed.toISOString().split('T')[0]);
    }
  }
  
  const expectedDates = enumerateDates(startDate, endDate);
  const missing = expectedDates.filter(d => !dates.has(d));
  
  return missing.length;
}

/**
 * Check if data coverage meets minimum threshold
 */
export function meetsMinimumCoverage(coveragePercent: number, threshold: number = 95): boolean {
  return coveragePercent >= threshold;
}

/**
 * Get the most recent uploaded date
 */
export function getMostRecentUploadDate(uploadedDates: string[]): string | null {
  if (uploadedDates.length === 0) return null;
  return uploadedDates.sort().reverse()[0];
}

/**
 * Get consecutive missing days count (days since last upload)
 */
export function getConsecutiveMissingDays(
  uploadedDates: string[],
  endDate: string
): number {
  const mostRecent = getMostRecentUploadDate(uploadedDates);
  if (!mostRecent) return 0;
  
  const lastUpload = new Date(mostRecent + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  
  const diffMs = end.getTime() - lastUpload.getTime();
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  
  return Math.max(0, diffDays);
}

/**
 * Format missing dates list for display (limit to first N)
 */
export function formatMissingDates(missingDates: string[], maxDisplay: number = 10): string {
  if (missingDates.length === 0) return 'لا توجد أيام ناقصة';
  
  const sorted = [...missingDates].sort();
  const displayed = sorted.slice(0, maxDisplay);
  const remaining = missingDates.length - maxDisplay;
  
  let result = displayed.join(', ');
  if (remaining > 0) {
    result += ` ... و ${remaining} يوم آخر`;
  }
  
  return result;
}
