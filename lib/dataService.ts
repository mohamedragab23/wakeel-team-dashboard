import { getSheetData, findDataInSheet, isSameDay } from './googleSheets';
import { cache, CACHE_KEYS } from './cache';

export interface Rider {
  code: string;
  name: string;
  region: string;
  supervisorCode: string;
  supervisorName: string;
  phone: string;
  joinDate: string;
  status: string;
}

export interface RiderData {
  code: string;
  name: string;
  hours: number;
  break: number;
  delay: number;
  absence: string;
  orders: number;
  acceptance: number;
  debt: number;
}

export interface DashboardData {
  totalHours: number;
  totalOrders: number;
  totalAbsences: number;
  totalBreaks: number;
  avgAcceptance: number;
  lastUploadDate: string;
  targetHours: number;
  targetAchievement: number;
  topRiders: Array<{
    name: string;
    orders: number;
    hours: number;
    acceptance: number;
  }>;
}

// Get supervisor's riders with caching
export async function getSupervisorRiders(supervisorCode: string, useCache: boolean = true): Promise<Rider[]> {
  const cacheKey = CACHE_KEYS.supervisorRiders(supervisorCode);
  
  // Check cache first (2 minutes cache - riders don't change often)
  if (useCache) {
    const cached = cache.get<Rider[]>(cacheKey);
    if (cached) {
      return cached;
    }
  }

  try {
    // Always fetch fresh data from sheet (don't use cache for sheet data when useCache is false)
    const ridersData = await getSheetData('المناديب', useCache);
    const riders: Rider[] = [];

    for (let i = 1; i < ridersData.length; i++) {
      const row = ridersData[i];
      if (!row[0] || row[0].toString().trim() === '') continue;

      const riderCode = row[0].toString().trim();
      const riderName = row[1] ? row[1].toString().trim() : '';
      const riderRegion = row[2] ? row[2].toString().trim() : '';
      const riderSupervisorCode = row[3] ? row[3].toString().trim() : '';

      // Only include riders that are assigned to this supervisor (not empty/null)
      // IMPORTANT: Empty string means rider is unassigned, so exclude it
      if (riderSupervisorCode && riderSupervisorCode !== '' && riderSupervisorCode === supervisorCode) {
        riders.push({
          code: riderCode,
          name: riderName,
          region: riderRegion,
          supervisorCode: riderSupervisorCode,
          supervisorName: row[4] ? row[4].toString().trim() : '',
          phone: row[5] ? row[5].toString().trim() : '',
          joinDate: row[6] ? row[6].toString().trim() : '',
          status: row[7] ? row[7].toString().trim() : 'نشط',
        });
      }
    }

    // Cache for 15 minutes (optimized for mobile performance) - only if useCache is true
    if (useCache) {
      cache.set(cacheKey, riders, 15 * 60 * 1000);
    }

    return riders;
  } catch (error) {
    console.error('Error fetching supervisor riders:', error);
    return [];
  }
}

// Helper function to parse date from various formats (shared with dataFilter)
function parseDateFromValue(dateValue: any): Date | null {
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
  
  // Format 1c: Handle "20 November 2025" or "November 20, 2025" format
  if (/^\d{1,2}\s+\w+\s+\d{4}/.test(dateStr) || /\w+\s+\d{1,2},?\s+\d{4}/.test(dateStr)) {
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 1900 && parsed.getFullYear() < 2100) {
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
      if (part1 > 12) {
        const day = part1;
        const month = part2 - 1;
        const parsed = new Date(year, month, day);
        if (!isNaN(parsed.getTime()) && parsed.getDate() === day && parsed.getMonth() === month && parsed.getFullYear() === year) {
          return parsed;
        }
      } else if (part2 > 12) {
        // M/D/YYYY format
        const month = part1 - 1;
        const day = part2;
        const parsed = new Date(year, month, day);
        if (!isNaN(parsed.getTime()) && parsed.getDate() === day && parsed.getMonth() === month && parsed.getFullYear() === year) {
          return parsed;
        }
      } else {
        // Try both formats
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
}

// Get latest rider data with date information
export async function getLatestRiderData(riderCode: string): Promise<(RiderData & { date?: string }) | null> {
  try {
    const dailyData = await getSheetData('البيانات اليومية');
    let latestData: (RiderData & { date?: string }) | null = null;
    let latestDate = new Date(0);

    for (let i = 1; i < dailyData.length; i++) {
      const row = dailyData[i];

      if (row.length >= 2 && row[1] && row[1].toString().trim() === riderCode) {
        const rowDate = parseDateFromValue(row[0]);
        if (!rowDate || isNaN(rowDate.getTime())) continue;

        if (rowDate > latestDate) {
          latestDate = rowDate;
          latestData = {
            code: riderCode,
            name: '', // Will be filled from riders data
            hours: parseFloat(row[2]?.toString() || '0') || 0,
            break: parseFloat(row[3]?.toString() || '0') || 0,
            delay: parseFloat(row[4]?.toString() || '0') || 0,
            absence: row[5] ? row[5].toString().trim() : 'لا',
            orders: parseInt(row[6]?.toString() || '0') || 0,
            acceptance: parseFloat(row[7]?.toString() || '0') || 0,
            debt: parseFloat(row[8]?.toString() || '0') || 0,
            date: latestDate.toISOString().split('T')[0], // Include date for display
          };
        }
      }
    }

    return latestData;
  } catch (error) {
    console.error('Error fetching latest rider data:', error);
    return null;
  }
}

// Get dashboard data with caching and optimization
export async function getDashboardData(supervisorCode: string): Promise<DashboardData> {
  const cacheKey = CACHE_KEYS.dashboardData(supervisorCode);
  
  // Check cache first (30 seconds cache for real-time updates)
  const cached = cache.get<DashboardData>(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    // Fetch all data in parallel
    const [riders, dailyData, supervisorsData] = await Promise.all([
      getSupervisorRiders(supervisorCode),
      getSheetData('البيانات اليومية'),
      getSheetData('المشرفين'),
    ]);

    // Find supervisor's target hours
    let targetHours = 0;
    for (let i = 1; i < supervisorsData.length; i++) {
      const row = supervisorsData[i];
      if (row[0] && row[0].toString().trim() === supervisorCode) {
        targetHours = parseFloat(row[8]?.toString() || '0') || 0; // Column I (index 8) is target
        break;
      }
    }

    const riderCodes = new Set(riders.map((r) => r.code));
    
    // Find the LAST UPLOADED DATE first
    let lastUploadDate: Date | null = null;
    for (let i = 1; i < dailyData.length; i++) {
      const row = dailyData[i];
      if (row.length >= 2 && row[1] && riderCodes.has(row[1].toString().trim())) {
        const rowDate = parseDateFromValue(row[0]);
        if (rowDate && (!lastUploadDate || rowDate > lastUploadDate)) {
          lastUploadDate = rowDate;
        }
      }
    }

    // If no data found, return empty
    if (!lastUploadDate) {
      return {
        totalHours: 0,
        totalOrders: 0,
        totalAbsences: 0,
        totalBreaks: 0,
        avgAcceptance: 0,
        lastUploadDate: '',
        targetHours,
        targetAchievement: 0,
        topRiders: [],
      };
    }

    // Now get data ONLY for the last uploaded date
    let totalHours = 0;
    let totalOrders = 0;
    let totalAbsences = 0;
    let totalBreaks = 0;
    let totalAcceptance = 0;
    let acceptanceCount = 0;

    const topRiders: Array<{ name: string; orders: number; hours: number; acceptance: number }> = [];
    const riderDataMap = new Map<string, { hours: number; orders: number; breaks: number; absence: string; acceptance: number }>();

    for (let i = 1; i < dailyData.length; i++) {
      const row = dailyData[i];
      if (row.length >= 2 && row[1]) {
        const riderCode = row[1].toString().trim();
        if (riderCodes.has(riderCode)) {
          const rowDate = parseDateFromValue(row[0]);
          // Only include data from the last uploaded date
          if (rowDate && lastUploadDate && 
              rowDate.getFullYear() === lastUploadDate.getFullYear() &&
              rowDate.getMonth() === lastUploadDate.getMonth() &&
              rowDate.getDate() === lastUploadDate.getDate()) {
            
            const hours = parseFloat(row[2]?.toString() || '0') || 0;
            const breaks = parseFloat(row[3]?.toString() || '0') || 0;
            const absenceRaw = row[5] ? row[5].toString().trim() : 'لا';
            // Check for absence - handle various formats
            const absence = (absenceRaw === 'نعم' || absenceRaw === '1' || absenceRaw === 'yes' || absenceRaw.toLowerCase() === 'yes') ? 'نعم' : 'لا';
            const orders = parseInt(row[6]?.toString() || '0') || 0;
            const acceptanceStr = row[7]?.toString() || '0';
            // Parse acceptance rate - if it's already a percentage (0-100), keep it; if it's a decimal (0-1), multiply by 100
            let acceptance = parseFloat(acceptanceStr.replace('%', '').replace('٪', '')) || 0;
            // If acceptance is between 0 and 1, it's likely a decimal (0.01 = 1%), so multiply by 100
            if (acceptance > 0 && acceptance <= 1) {
              acceptance = acceptance * 100;
            }
            
            console.log(`[Dashboard] Rider ${riderCode}: absence="${absenceRaw}" -> "${absence}", acceptance="${acceptanceStr}" -> ${acceptance}%`);
            
            riderDataMap.set(riderCode, { hours, orders, breaks, absence, acceptance });
          }
        }
      }
    }

    // Process riders for the last uploaded date
    for (const rider of riders) {
      const riderData = riderDataMap.get(rider.code);

      if (riderData) {
        totalHours += riderData.hours;
        totalOrders += riderData.orders;
        totalBreaks += riderData.breaks;

        // Check for absence - handle various formats
        const isAbsent = riderData.absence === 'نعم' || 
                        riderData.absence === '1' || 
                        riderData.absence === 'yes' || 
                        riderData.absence.toLowerCase() === 'yes';
        if (isAbsent) {
          totalAbsences++;
          console.log(`[Dashboard] Found absence for rider ${rider.name} (${rider.code}): "${riderData.absence}"`);
        }

        if (riderData.acceptance > 0) {
          totalAcceptance += riderData.acceptance;
          acceptanceCount++;
        }

        topRiders.push({
          name: rider.name,
          orders: riderData.orders,
          hours: riderData.hours,
          acceptance: riderData.acceptance,
        });
      }
    }

    topRiders.sort((a, b) => b.orders - a.orders);

    // Calculate target achievement percentage
    const targetAchievement = targetHours > 0 ? (totalHours / targetHours) * 100 : 0;

    const result: DashboardData = {
      totalHours,
      totalOrders,
      totalAbsences,
      totalBreaks,
      avgAcceptance: acceptanceCount > 0 ? parseFloat((totalAcceptance / acceptanceCount).toFixed(2)) : 0,
      lastUploadDate: lastUploadDate.toISOString().split('T')[0],
      targetHours,
      targetAchievement: parseFloat(targetAchievement.toFixed(1)),
      topRiders: topRiders.slice(0, 5),
    };

    // Cache for 30 seconds
    cache.set(cacheKey, result, 30000);

    return result;
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    return {
      totalHours: 0,
      totalOrders: 0,
      totalAbsences: 0,
      totalBreaks: 0,
      avgAcceptance: 0,
      lastUploadDate: '',
      targetHours: 0,
      targetAchievement: 0,
      topRiders: [],
    };
  }
}

// Get riders data for display with optimization
export async function getRidersData(supervisorCode: string): Promise<RiderData[]> {
  const cacheKey = CACHE_KEYS.ridersData(supervisorCode);
  
  // Check cache first (1 minute cache)
  const cached = cache.get<RiderData[]>(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    // Fetch all data in parallel
    const [riders, dailyData] = await Promise.all([
      getSupervisorRiders(supervisorCode),
      getSheetData('البيانات اليومية'),
    ]);

    const ridersData: RiderData[] = [];
    const riderCodes = new Set(riders.map((r) => r.code));

    // Process all daily data once to get latest for each rider
    const riderDataMap = new Map<string, { date: Date; data: RiderData }>();

    for (let i = 1; i < dailyData.length; i++) {
      const row = dailyData[i];
      if (row.length >= 2 && row[1]) {
        const riderCode = row[1].toString().trim();
        if (riderCodes.has(riderCode)) {
          const rowDate = new Date(row[0]);
          const existing = riderDataMap.get(riderCode);
          
          // Keep only the latest data
          if (!existing || rowDate > existing.date) {
            riderDataMap.set(riderCode, {
              date: rowDate,
              data: {
                code: riderCode,
                name: '', // Will be filled from riders
                hours: parseFloat(row[2]) || 0,
                break: parseFloat(row[3]) || 0,
                delay: parseFloat(row[4]) || 0,
                absence: row[5] ? row[5].toString().trim() : 'لا',
                orders: parseInt(row[6]) || 0,
                acceptance: parseFloat(row[7]) || 0,
                debt: parseFloat(row[8]) || 0,
              },
            });
          }
        }
      }
    }

    // Combine rider info with latest data
    for (const rider of riders) {
      const latestEntry = riderDataMap.get(rider.code);
      const latestData = latestEntry ? latestEntry.data : null;
      ridersData.push({
        code: rider.code,
        name: rider.name,
        hours: latestData ? latestData.hours : 0,
        break: latestData ? latestData.break : 0,
        delay: latestData ? latestData.delay : 0,
        absence: latestData ? latestData.absence : 'لا',
        orders: latestData ? latestData.orders : 0,
        acceptance: latestData ? latestData.acceptance : 0,
        debt: latestData ? latestData.debt : 0,
      });
    }


    // Cache for 1 minute
    cache.set(cacheKey, ridersData, 15 * 60 * 1000); // 15 minutes

    return ridersData;
  } catch (error) {
    console.error('Error fetching riders data:', error);
    return [];
  }
}

// Get performance data with supervisor filtering
export async function getSupervisorPerformanceData(
  supervisorCode: string,
  startDate?: Date,
  endDate?: Date
) {
  // First get supervisor's riders
  const riders = await getSupervisorRiders(supervisorCode);
  const riderCodes = new Set(riders.map((r) => r.code));

  if (riderCodes.size === 0) {
    return {
      success: true,
      labels: [],
      orders: [],
      hours: [],
    };
  }

  // Get all performance data
  const allPerformanceData = await getPerformanceData(supervisorCode, startDate, endDate);

  if (!allPerformanceData.success) {
    return allPerformanceData;
  }

  // Filter by rider codes - this is already done in getPerformanceData
  // but we ensure it's correct
  return allPerformanceData;
}

// Get performance data with caching
export async function getPerformanceData(
  supervisorCode: string,
  startDate?: Date,
  endDate?: Date
) {
  if (!startDate || !endDate) {
    const today = new Date();
    endDate = new Date(today);
    startDate = new Date(today);
    startDate.setDate(today.getDate() - 6);
  }

  const cacheKey = CACHE_KEYS.performanceData(
    supervisorCode,
    startDate.toISOString(),
    endDate.toISOString()
  );

  // Check cache first (2 minutes cache for better performance)
    const cached = cache.get<{ success: boolean; labels: string[]; orders: number[]; hours: number[] }>(cacheKey);
    if (cached) {
      return cached;
    }

  try {
    // Use optimized filtering
    const { getSupervisorPerformanceFiltered } = await import('./dataFilter');
    const filteredData = await getSupervisorPerformanceFiltered(supervisorCode, startDate, endDate);

    // Group by date and calculate totals
    const dataByDate = new Map<string, { orders: number; hours: number; breaks: number; absences: number }>();
    let totalAcceptanceSum = 0;
    let totalAcceptanceCount = 0;
    let totalAbsences = 0;
    let totalBreaks = 0;

    filteredData.forEach((record) => {
      // Parse date - it might be a string or Date object
      let recordDate: Date;
      if (record.date instanceof Date) {
        recordDate = record.date;
      } else if (typeof record.date === 'string') {
        // Handle ISO string format (YYYY-MM-DD)
        recordDate = new Date(record.date + 'T00:00:00');
      } else {
        recordDate = new Date(record.date);
      }
      
      if (isNaN(recordDate.getTime())) {
        console.warn(`[Performance Data] Invalid date in record:`, record.date);
        return; // Skip invalid dates
      }
      
      // Use consistent date key format with padding for month and day
      const month = String(recordDate.getMonth() + 1).padStart(2, '0');
      const day = String(recordDate.getDate()).padStart(2, '0');
      const dateKey = `${recordDate.getFullYear()}-${month}-${day}`;
      const existing = dataByDate.get(dateKey) || { orders: 0, hours: 0, breaks: 0, absences: 0 };
      
      // Count absences - handle various formats
      const absenceRaw = record.absence?.toString().trim() || 'لا';
      const isAbsent = absenceRaw === 'نعم' || 
                      absenceRaw === '1' || 
                      absenceRaw === 'yes' || 
                      absenceRaw.toLowerCase() === 'yes';
      if (isAbsent) {
        totalAbsences++;
      }
      
      // Sum breaks
      const breakTime = parseFloat(record.break?.toString() || '0') || 0;
      totalBreaks += breakTime;
      
      dataByDate.set(dateKey, {
        orders: existing.orders + (record.orders || 0),
        hours: existing.hours + (record.hours || 0),
        breaks: existing.breaks + breakTime,
        absences: existing.absences + (isAbsent ? 1 : 0),
      });
      
      // Calculate average acceptance rate
      const acceptanceStr = record.acceptance?.toString() || '0';
      let acceptanceNum = parseFloat(acceptanceStr.replace('%', '').replace('٪', '')) || 0;
      // If acceptance is between 0 and 1, it's likely a decimal (0.01 = 1%), so multiply by 100
      if (acceptanceNum > 0 && acceptanceNum <= 1) {
        acceptanceNum = acceptanceNum * 100;
      }
      if (acceptanceNum > 0) {
        totalAcceptanceSum += acceptanceNum;
        totalAcceptanceCount++;
      }
    });

    const labels: string[] = [];
    const ordersData: number[] = [];
    const hoursData: number[] = [];

    // Create date range for labels
    const currentDate = new Date(startDate);
    const endDateCopy = new Date(endDate);
    
    // Normalize to start of day
    currentDate.setHours(0, 0, 0, 0);
    endDateCopy.setHours(23, 59, 59, 999);
    
    while (currentDate <= endDateCopy) {
      const dateString = `${currentDate.getDate()}/${currentDate.getMonth() + 1}`;
      labels.push(dateString);

      // Use consistent date key format with padding (must match the format used above)
      const month = String(currentDate.getMonth() + 1).padStart(2, '0');
      const day = String(currentDate.getDate()).padStart(2, '0');
      const dateKey = `${currentDate.getFullYear()}-${month}-${day}`;
      const dayData = dataByDate.get(dateKey) || { orders: 0, hours: 0 };

      ordersData.push(dayData.orders);
      hoursData.push(dayData.hours);
      
      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    // Log if we have data but no matches (debugging)
    if (filteredData.length > 0 && ordersData.every(v => v === 0)) {
      console.warn(`[Performance Data] ⚠️ Found ${filteredData.length} records but no data in date range!`);
      console.warn(`[Performance Data] Date range: ${startDate.toISOString()} to ${endDate.toISOString()}`);
      console.warn(`[Performance Data] Sample record dates:`, filteredData.slice(0, 3).map(r => r.date));
    }
    
    // Enhanced debug logging
    console.log(`[Performance Data] Supervisor: ${supervisorCode}, Date Range: ${startDate.toISOString()} to ${endDate.toISOString()}`);
    console.log(`[Performance Data] Filtered records: ${filteredData.length}, Labels: ${labels.length}, Data points: ${ordersData.length}`);
    
    if (filteredData.length === 0) {
      console.warn(`[Performance Data] ⚠️ No filtered data found! Check rider assignments and date range.`);
    } else {
      console.log(`[Performance Data] ✅ Successfully processed ${filteredData.length} records into ${labels.length} data points`);
      // Log sample of grouped data
      const sampleGrouped = Array.from(dataByDate.entries()).slice(0, 3);
      console.log(`[Performance Data] Sample grouped data:`, sampleGrouped);
    }

    // Calculate average acceptance rate
    // Values are already in percentage format (0-100), so no need to multiply
    const avgAcceptance = totalAcceptanceCount > 0 
      ? parseFloat((totalAcceptanceSum / totalAcceptanceCount).toFixed(2))
      : 0;
    
    console.log(`[Performance Data] Acceptance calculation: sum=${totalAcceptanceSum}, count=${totalAcceptanceCount}, avg=${avgAcceptance}%`);

    const result = {
      success: true,
      labels,
      orders: ordersData,
      hours: hoursData,
      avgAcceptance,
      totalAbsences,
      totalBreaks,
    };

    // Cache for 2 minutes for better performance
    cache.set(cacheKey, result, 15 * 60 * 1000); // 15 minutes

    return result;
  } catch (error) {
    console.error('Error fetching performance data:', error);
    return {
      success: false,
      error: 'حدث خطأ في جلب بيانات الأداء',
      labels: [],
      orders: [],
      hours: [],
    };
  }
}

