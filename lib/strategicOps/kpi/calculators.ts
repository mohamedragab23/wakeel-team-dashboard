/**
 * KPI Calculator Functions
 * 
 * Pure functions for calculating all KPIs from raw data.
 * Implements SRS-003 Section 1-18.
 * 
 * @module KPICalculators
 * @version 1.0
 */

import type { Rider } from '@/lib/adminService';
import { isRiderActiveByRules } from '@/lib/strategicOps/config/businessRules';
import { createKPIValue, type KPI, type KPIValue, type HeadcountKPIs, type HoursKPIs, type OrdersKPIs } from './types';

// ============================================================================
// INPUT DATA TYPES
// ============================================================================

export type DailyPerformanceRecord = {
  date: string | Date;
  riderCode: string;
  hours: number;
  orders: number;
  breakMinutes: number;
  lateMinutes: number;
  absence: boolean;
  supervisorCode: string;
  zone: string;
};

export type KPICalculationInput = {
  /** Daily performance records (filtered) */
  dailyRecords: DailyPerformanceRecord[];
  
  /** Master rider list (filtered) */
  masterRiders: Rider[];
  
  /** Date range */
  dateRange: {
    startDate: string;
    endDate: string;
    uploadedDays: number;
  };
  
  /** Configuration */
  config: {
    expectedDailyHours: number;
    targetDailyHours: number;
  };
  
  /** Previous period data (for comparison) */
  previousPeriod?: {
    dailyRecords: DailyPerformanceRecord[];
    masterRiders: Rider[];
  };
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((sum, val) => sum + val, 0) / arr.length;
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function sum(arr: number[]): number {
  return arr.reduce((total, val) => total + val, 0);
}

function countUnique<T>(arr: T[]): number {
  return new Set(arr).size;
}

function createKPI(
  id: string,
  name: string,
  nameAr: string,
  category: string,
  value: KPIValue,
  format: string,
  formula?: string
): KPI {
  return {
    id,
    name,
    nameAr,
    category: category as any,
    value,
    format: format as any,
    formula,
  };
}

// ============================================================================
// HEADCOUNT KPI CALCULATORS (001-008)
// ============================================================================

/**
 * KPI 001: Registered Riders
 * COUNT(RiderCode) from master riders
 */
export function calculateRegisteredRiders(
  input: KPICalculationInput
): KPI {
  const current = input.masterRiders.length;
  const previous = input.previousPeriod?.masterRiders.length ?? null;
  
  return createKPI(
    'KPI_001',
    'Registered Riders',
    'المناديب المسجلين',
    'headcount',
    createKPIValue(current, previous),
    'number',
    'COUNT(RiderCode)'
  );
}

/**
 * KPI 002: Active Registered Riders
 * Riders with status = "نشط"
 */
export function calculateActiveRegisteredRiders(
  input: KPICalculationInput
): KPI {
  const current = input.masterRiders.filter(r => r.status === 'نشط').length;
  const previous = input.previousPeriod?.masterRiders.filter(r => r.status === 'نشط').length ?? null;
  
  return createKPI(
    'KPI_002',
    'Active Registered Riders',
    'المناديب النشطين المسجلين',
    'headcount',
    createKPIValue(current, previous),
    'number',
    'COUNT WHERE status = "نشط"'
  );
}

/**
 * KPI 003: Inactive Riders
 * Riders with status ≠ "نشط"
 */
export function calculateInactiveRiders(
  input: KPICalculationInput
): KPI {
  const current = input.masterRiders.filter(r => r.status !== 'نشط').length;
  const previous = input.previousPeriod?.masterRiders.filter(r => r.status !== 'نشط').length ?? null;
  
  return createKPI(
    'KPI_003',
    'Inactive Riders',
    'المناديب غير النشطين',
    'headcount',
    createKPIValue(current, previous),
    'number',
    'COUNT WHERE status ≠ "نشط"'
  );
}

/**
 * KPI 004: Working Riders
 * Unique riders with hours > 0 AND orders > 0 in the period
 */
export function calculateWorkingRiders(
  input: KPICalculationInput
): KPI {
  // Aggregate by rider
  const riderAggs = new Map<string, { totalHours: number; totalOrders: number }>();
  
  for (const rec of input.dailyRecords) {
    const agg = riderAggs.get(rec.riderCode) ?? { totalHours: 0, totalOrders: 0 };
    agg.totalHours += rec.hours;
    agg.totalOrders += rec.orders;
    riderAggs.set(rec.riderCode, agg);
  }
  
  const current = Array.from(riderAggs.values()).filter(
    agg => isRiderActiveByRules(agg.totalHours, agg.totalOrders, null)
  ).length;
  
  // Previous period
  let previous: number | null = null;
  if (input.previousPeriod) {
    const prevAggs = new Map<string, { totalHours: number; totalOrders: number }>();
    for (const rec of input.previousPeriod.dailyRecords) {
      const agg = prevAggs.get(rec.riderCode) ?? { totalHours: 0, totalOrders: 0 };
      agg.totalHours += rec.hours;
      agg.totalOrders += rec.orders;
      prevAggs.set(rec.riderCode, agg);
    }
    previous = Array.from(prevAggs.values()).filter(
      agg => isRiderActiveByRules(agg.totalHours, agg.totalOrders, null)
    ).length;
  }
  
  return createKPI(
    'KPI_004',
    'Working Riders',
    'المناديب العاملين',
    'headcount',
    createKPIValue(current, previous),
    'number',
    'COUNT UNIQUE WHERE hours > 0 AND orders > 0'
  );
}

/**
 * KPI 005: Average Daily Working Riders
 * CRITICAL: Average of unique riders per day, NOT unique riders across period
 */
export function calculateAverageDailyWorkingRiders(
  input: KPICalculationInput
): KPI {
  // Group by date
  const dailyRiders = new Map<string, Set<string>>();
  
  for (const rec of input.dailyRecords) {
    const dateStr = typeof rec.date === 'string' ? rec.date : rec.date.toISOString().split('T')[0];
    
    if (!dailyRiders.has(dateStr)) {
      dailyRiders.set(dateStr, new Set());
    }
    
    // Only count if hours > 0 AND orders > 0
    if (rec.hours > 0 && rec.orders > 0) {
      dailyRiders.get(dateStr)!.add(rec.riderCode);
    }
  }
  
  const dailyCounts = Array.from(dailyRiders.values()).map(set => set.size);
  const current = dailyCounts.length > 0 ? avg(dailyCounts) : 0;
  
  // Previous period
  let previous: number | null = null;
  if (input.previousPeriod) {
    const prevDailyRiders = new Map<string, Set<string>>();
    for (const rec of input.previousPeriod.dailyRecords) {
      const dateStr = typeof rec.date === 'string' ? rec.date : rec.date.toISOString().split('T')[0];
      if (!prevDailyRiders.has(dateStr)) {
        prevDailyRiders.set(dateStr, new Set());
      }
      if (rec.hours > 0 && rec.orders > 0) {
        prevDailyRiders.get(dateStr)!.add(rec.riderCode);
      }
    }
    const prevDailyCounts = Array.from(prevDailyRiders.values()).map(set => set.size);
    previous = prevDailyCounts.length > 0 ? avg(prevDailyCounts) : 0;
  }
  
  return createKPI(
    'KPI_005',
    'Average Daily Working Riders',
    'متوسط المناديب العاملين يومياً',
    'headcount',
    createKPIValue(current, previous),
    'decimal',
    'AVG(Unique Riders Per Day)'
  );
}

/**
 * KPI 006: Daily Active Rate
 * Average Daily Working Riders / Registered Riders
 */
export function calculateDailyActiveRate(
  averageDailyWorkingRiders: number,
  registeredRiders: number,
  previousValues?: { averageDailyWorkingRiders: number; registeredRiders: number }
): KPI {
  const current = registeredRiders > 0
    ? (averageDailyWorkingRiders / registeredRiders) * 100
    : 0;
  
  const previous = previousValues && previousValues.registeredRiders > 0
    ? (previousValues.averageDailyWorkingRiders / previousValues.registeredRiders) * 100
    : null;
  
  return createKPI(
    'KPI_006',
    'Daily Active Rate',
    'معدل النشاط اليومي',
    'headcount',
    createKPIValue(current, previous),
    'percent',
    'Average Daily Working Riders / Registered Riders'
  );
}

/**
 * KPI 007: Available Riders
 * Registered - Medical - Vacation - Termination - Long Leave
 * TODO: Requires daily comments integration
 */
export function calculateAvailableRiders(
  input: KPICalculationInput
): KPI {
  // Placeholder: For now, assume all registered riders are available
  // Will be updated when daily comments integration is complete
  const current = input.masterRiders.length;
  const previous = input.previousPeriod?.masterRiders.length ?? null;
  
  return createKPI(
    'KPI_007',
    'Available Riders',
    'المناديب المتاحين',
    'headcount',
    createKPIValue(current, previous),
    'number',
    'Registered - Medical - Vacation - Termination - Long Leave'
  );
}

/**
 * KPI 008: Capacity Utilization
 * Actual Hours / Potential Hours
 * Potential Hours = Available Riders × Expected Daily Hours
 */
export function calculateCapacityUtilization(
  actualHours: number,
  availableRiders: number,
  expectedDailyHours: number,
  uploadedDays: number,
  previousValues?: {
    actualHours: number;
    availableRiders: number;
    uploadedDays: number;
  }
): KPI {
  const potentialHours = availableRiders * expectedDailyHours * uploadedDays;
  const current = potentialHours > 0
    ? (actualHours / potentialHours) * 100
    : 0;
  
  let previous: number | null = null;
  if (previousValues) {
    const prevPotentialHours = previousValues.availableRiders * expectedDailyHours * previousValues.uploadedDays;
    previous = prevPotentialHours > 0
      ? (previousValues.actualHours / prevPotentialHours) * 100
      : null;
  }
  
  return createKPI(
    'KPI_008',
    'Capacity Utilization',
    'معدل استغلال الطاقة',
    'headcount',
    createKPIValue(current, previous),
    'percent',
    'Actual Hours / (Available Riders × Expected Hours)'
  );
}

/**
 * Calculate all Headcount KPIs
 */
export function calculateHeadcountKPIs(
  input: KPICalculationInput
): HeadcountKPIs {
  const registeredRiders = calculateRegisteredRiders(input);
  const activeRegisteredRiders = calculateActiveRegisteredRiders(input);
  const inactiveRiders = calculateInactiveRiders(input);
  const workingRiders = calculateWorkingRiders(input);
  const averageDailyWorkingRiders = calculateAverageDailyWorkingRiders(input);
  const availableRiders = calculateAvailableRiders(input);
  
  const dailyActiveRate = calculateDailyActiveRate(
    averageDailyWorkingRiders.value.current,
    registeredRiders.value.current,
    input.previousPeriod ? {
      averageDailyWorkingRiders: averageDailyWorkingRiders.value.previous ?? 0,
      registeredRiders: registeredRiders.value.previous ?? 0,
    } : undefined
  );
  
  const totalHours = sum(input.dailyRecords.map(r => r.hours));
  const capacityUtilization = calculateCapacityUtilization(
    totalHours,
    availableRiders.value.current,
    input.config.expectedDailyHours,
    input.dateRange.uploadedDays,
    input.previousPeriod ? {
      actualHours: sum(input.previousPeriod.dailyRecords.map(r => r.hours)),
      availableRiders: availableRiders.value.previous ?? 0,
      uploadedDays: input.dateRange.uploadedDays, // TODO: Track previous uploaded days
    } : undefined
  );
  
  return {
    registeredRiders,
    activeRegisteredRiders,
    inactiveRiders,
    workingRiders,
    averageDailyWorkingRiders,
    dailyActiveRate,
    availableRiders,
    capacityUtilization,
  };
}

// ============================================================================
// HOURS KPI CALCULATORS (009-017)
// ============================================================================

/**
 * KPI 009: Total Working Hours
 */
export function calculateTotalWorkingHours(
  input: KPICalculationInput
): KPI {
  const current = sum(input.dailyRecords.map(r => r.hours));
  const previous = input.previousPeriod
    ? sum(input.previousPeriod.dailyRecords.map(r => r.hours))
    : null;
  
  return createKPI(
    'KPI_009',
    'Total Working Hours',
    'إجمالي ساعات العمل',
    'hours',
    createKPIValue(current, previous),
    'hours',
    'SUM(Hours)'
  );
}

/**
 * KPI 010: Average Daily Hours
 * CRITICAL: Total Hours / Uploaded Days (NOT selected days)
 */
export function calculateAverageDailyHours(
  input: KPICalculationInput
): KPI {
  const totalHours = sum(input.dailyRecords.map(r => r.hours));
  const current = input.dateRange.uploadedDays > 0
    ? totalHours / input.dateRange.uploadedDays
    : 0;
  
  let previous: number | null = null;
  if (input.previousPeriod) {
    const prevTotalHours = sum(input.previousPeriod.dailyRecords.map(r => r.hours));
    // TODO: Track previous uploaded days properly
    previous = input.dateRange.uploadedDays > 0
      ? prevTotalHours / input.dateRange.uploadedDays
      : null;
  }
  
  return createKPI(
    'KPI_010',
    'Average Daily Hours',
    'متوسط الساعات اليومي',
    'hours',
    createKPIValue(current, previous),
    'decimal',
    'Total Hours / Uploaded Days'
  );
}

/**
 * KPI 011: Average Hours Per Working Rider
 */
export function calculateAverageHoursPerWorkingRider(
  totalHours: number,
  averageDailyWorkingRiders: number,
  previousValues?: { totalHours: number; averageDailyWorkingRiders: number }
): KPI {
  const current = averageDailyWorkingRiders > 0
    ? totalHours / averageDailyWorkingRiders
    : 0;
  
  const previous = previousValues && previousValues.averageDailyWorkingRiders > 0
    ? previousValues.totalHours / previousValues.averageDailyWorkingRiders
    : null;
  
  return createKPI(
    'KPI_011',
    'Average Hours Per Working Rider',
    'متوسط الساعات لكل مندوب عامل',
    'hours',
    createKPIValue(current, previous),
    'decimal',
    'Total Hours / Average Daily Working Riders'
  );
}

/**
 * KPI 012: Median Working Hours
 */
export function calculateMedianWorkingHours(
  input: KPICalculationInput
): KPI {
  const hours = input.dailyRecords.map(r => r.hours).filter(h => h > 0);
  const current = median(hours);
  
  let previous: number | null = null;
  if (input.previousPeriod) {
    const prevHours = input.previousPeriod.dailyRecords.map(r => r.hours).filter(h => h > 0);
    previous = median(prevHours);
  }
  
  return createKPI(
    'KPI_012',
    'Median Working Hours',
    'الوسيط لساعات العمل',
    'hours',
    createKPIValue(current, previous),
    'decimal',
    'MEDIAN(Hours)'
  );
}

/**
 * KPI 013: Maximum Hours
 */
export function calculateMaximumHours(
  input: KPICalculationInput
): KPI {
  const current = input.dailyRecords.length > 0
    ? Math.max(...input.dailyRecords.map(r => r.hours))
    : 0;
  
  const previous = input.previousPeriod && input.previousPeriod.dailyRecords.length > 0
    ? Math.max(...input.previousPeriod.dailyRecords.map(r => r.hours))
    : null;
  
  return createKPI(
    'KPI_013',
    'Maximum Hours',
    'أقصى ساعات عمل',
    'hours',
    createKPIValue(current, previous),
    'decimal',
    'MAX(Hours)'
  );
}

/**
 * KPI 014: Minimum Hours
 */
export function calculateMinimumHours(
  input: KPICalculationInput
): KPI {
  const hoursAboveZero = input.dailyRecords.map(r => r.hours).filter(h => h > 0);
  const current = hoursAboveZero.length > 0
    ? Math.min(...hoursAboveZero)
    : 0;
  
  let previous: number | null = null;
  if (input.previousPeriod) {
    const prevHoursAboveZero = input.previousPeriod.dailyRecords.map(r => r.hours).filter(h => h > 0);
    previous = prevHoursAboveZero.length > 0
      ? Math.min(...prevHoursAboveZero)
      : null;
  }
  
  return createKPI(
    'KPI_014',
    'Minimum Hours',
    'أدنى ساعات عمل',
    'hours',
    createKPIValue(current, previous),
    'decimal',
    'MIN(Hours WHERE Hours > 0)'
  );
}

/**
 * KPI 015: Potential Hours
 */
export function calculatePotentialHours(
  availableRiders: number,
  expectedDailyHours: number,
  uploadedDays: number,
  previousValues?: { availableRiders: number; uploadedDays: number }
): KPI {
  const current = availableRiders * expectedDailyHours * uploadedDays;
  
  const previous = previousValues
    ? previousValues.availableRiders * expectedDailyHours * previousValues.uploadedDays
    : null;
  
  return createKPI(
    'KPI_015',
    'Potential Hours',
    'الساعات المحتملة',
    'hours',
    createKPIValue(current, previous),
    'hours',
    'Available Riders × Expected Daily Hours × Uploaded Days'
  );
}

/**
 * KPI 016: Hours Gap
 */
export function calculateHoursGap(
  targetHours: number,
  actualHours: number,
  previousValues?: { targetHours: number; actualHours: number }
): KPI {
  const current = targetHours - actualHours;
  
  const previous = previousValues
    ? previousValues.targetHours - previousValues.actualHours
    : null;
  
  return createKPI(
    'KPI_016',
    'Hours Gap',
    'فجوة الساعات',
    'hours',
    createKPIValue(current, previous),
    'hours',
    'Target Hours - Actual Hours'
  );
}

/**
 * KPI 017: Hours Achievement
 */
export function calculateHoursAchievement(
  actualHours: number,
  targetHours: number,
  previousValues?: { actualHours: number; targetHours: number }
): KPI {
  const current = targetHours > 0
    ? (actualHours / targetHours) * 100
    : 0;
  
  const previous = previousValues && previousValues.targetHours > 0
    ? (previousValues.actualHours / previousValues.targetHours) * 100
    : null;
  
  return createKPI(
    'KPI_017',
    'Hours Achievement',
    'نسبة تحقيق الساعات',
    'hours',
    createKPIValue(current, previous),
    'percent',
    'Actual Hours / Target Hours'
  );
}

/**
 * Calculate all Hours KPIs
 */
export function calculateHoursKPIs(
  input: KPICalculationInput,
  headcountKPIs: HeadcountKPIs
): HoursKPIs {
  const totalWorkingHours = calculateTotalWorkingHours(input);
  const averageDailyHours = calculateAverageDailyHours(input);
  const averageHoursPerWorkingRider = calculateAverageHoursPerWorkingRider(
    totalWorkingHours.value.current,
    headcountKPIs.averageDailyWorkingRiders.value.current,
    input.previousPeriod ? {
      totalHours: totalWorkingHours.value.previous ?? 0,
      averageDailyWorkingRiders: headcountKPIs.averageDailyWorkingRiders.value.previous ?? 0,
    } : undefined
  );
  const medianWorkingHours = calculateMedianWorkingHours(input);
  const maximumHours = calculateMaximumHours(input);
  const minimumHours = calculateMinimumHours(input);
  
  const potentialHours = calculatePotentialHours(
    headcountKPIs.availableRiders.value.current,
    input.config.expectedDailyHours,
    input.dateRange.uploadedDays,
    input.previousPeriod ? {
      availableRiders: headcountKPIs.availableRiders.value.previous ?? 0,
      uploadedDays: input.dateRange.uploadedDays,
    } : undefined
  );
  
  const targetHours = input.config.targetDailyHours * input.dateRange.uploadedDays;
  const hoursGap = calculateHoursGap(
    targetHours,
    totalWorkingHours.value.current
  );
  
  const hoursAchievement = calculateHoursAchievement(
    totalWorkingHours.value.current,
    targetHours
  );
  
  return {
    totalWorkingHours,
    averageDailyHours,
    averageHoursPerWorkingRider,
    medianWorkingHours,
    maximumHours,
    minimumHours,
    potentialHours,
    hoursGap,
    hoursAchievement,
  };
}

// ============================================================================
// ORDERS KPI CALCULATORS (018-023)
// ============================================================================

/**
 * KPI 018: Total Orders
 */
export function calculateTotalOrders(
  input: KPICalculationInput
): KPI {
  const current = sum(input.dailyRecords.map(r => r.orders));
  const previous = input.previousPeriod
    ? sum(input.previousPeriod.dailyRecords.map(r => r.orders))
    : null;
  
  return createKPI(
    'KPI_018',
    'Total Orders',
    'إجمالي الأوردرات',
    'orders',
    createKPIValue(current, previous),
    'number',
    'SUM(Orders)'
  );
}

/**
 * KPI 019: Average Daily Orders
 */
export function calculateAverageDailyOrders(
  totalOrders: number,
  uploadedDays: number,
  previousValues?: { totalOrders: number; uploadedDays: number }
): KPI {
  const current = uploadedDays > 0
    ? totalOrders / uploadedDays
    : 0;
  
  const previous = previousValues && previousValues.uploadedDays > 0
    ? previousValues.totalOrders / previousValues.uploadedDays
    : null;
  
  return createKPI(
    'KPI_019',
    'Average Daily Orders',
    'متوسط الأوردرات اليومي',
    'orders',
    createKPIValue(current, previous),
    'decimal',
    'Total Orders / Uploaded Days'
  );
}

/**
 * KPI 020: Orders Per Rider
 */
export function calculateOrdersPerRider(
  totalOrders: number,
  averageDailyWorkingRiders: number,
  previousValues?: { totalOrders: number; averageDailyWorkingRiders: number }
): KPI {
  const current = averageDailyWorkingRiders > 0
    ? totalOrders / averageDailyWorkingRiders
    : 0;
  
  const previous = previousValues && previousValues.averageDailyWorkingRiders > 0
    ? previousValues.totalOrders / previousValues.averageDailyWorkingRiders
    : null;
  
  return createKPI(
    'KPI_020',
    'Orders Per Rider',
    'الأوردرات لكل مندوب',
    'orders',
    createKPIValue(current, previous),
    'decimal',
    'Total Orders / Average Working Riders'
  );
}

/**
 * KPI 021: Orders Per Hour (MOST IMPORTANT!)
 */
export function calculateOrdersPerHour(
  totalOrders: number,
  totalHours: number,
  previousValues?: { totalOrders: number; totalHours: number }
): KPI {
  const current = totalHours > 0
    ? totalOrders / totalHours
    : 0;
  
  const previous = previousValues && previousValues.totalHours > 0
    ? previousValues.totalOrders / previousValues.totalHours
    : null;
  
  return createKPI(
    'KPI_021',
    'Orders Per Hour',
    'الأوردرات لكل ساعة',
    'orders',
    createKPIValue(current, previous),
    'decimal',
    'Total Orders / Total Hours'
  );
}

/**
 * KPI 022: Orders Growth
 */
export function calculateOrdersGrowth(
  current: number,
  previous: number | null
): KPI {
  const growthPercent = previous !== null && previous !== 0
    ? ((current - previous) / Math.abs(previous)) * 100
    : 0;
  
  return createKPI(
    'KPI_022',
    'Orders Growth',
    'نمو الأوردرات',
    'orders',
    createKPIValue(growthPercent, null),
    'percent',
    '((Current - Previous) / Previous) × 100'
  );
}

/**
 * KPI 023: Forecast Orders
 * TODO: Implement rolling average + trend analysis
 */
export function calculateForecastOrders(
  input: KPICalculationInput
): KPI {
  // Placeholder: Simple linear projection
  const current = sum(input.dailyRecords.map(r => r.orders));
  const avgPerDay = input.dateRange.uploadedDays > 0
    ? current / input.dateRange.uploadedDays
    : 0;
  
  // Forecast for next 7 days
  const forecast = avgPerDay * 7;
  
  return createKPI(
    'KPI_023',
    'Forecast Orders (Next 7 Days)',
    'توقعات الأوردرات (7 أيام)',
    'orders',
    createKPIValue(forecast, null),
    'number',
    'Average Daily Orders × 7'
  );
}

/**
 * Calculate all Orders KPIs
 */
export function calculateOrdersKPIs(
  input: KPICalculationInput,
  headcountKPIs: HeadcountKPIs,
  hoursKPIs: HoursKPIs
): OrdersKPIs {
  const totalOrders = calculateTotalOrders(input);
  
  const averageDailyOrders = calculateAverageDailyOrders(
    totalOrders.value.current,
    input.dateRange.uploadedDays,
    input.previousPeriod ? {
      totalOrders: totalOrders.value.previous ?? 0,
      uploadedDays: input.dateRange.uploadedDays,
    } : undefined
  );
  
  const ordersPerRider = calculateOrdersPerRider(
    totalOrders.value.current,
    headcountKPIs.averageDailyWorkingRiders.value.current,
    input.previousPeriod ? {
      totalOrders: totalOrders.value.previous ?? 0,
      averageDailyWorkingRiders: headcountKPIs.averageDailyWorkingRiders.value.previous ?? 0,
    } : undefined
  );
  
  const ordersPerHour = calculateOrdersPerHour(
    totalOrders.value.current,
    hoursKPIs.totalWorkingHours.value.current,
    input.previousPeriod ? {
      totalOrders: totalOrders.value.previous ?? 0,
      totalHours: hoursKPIs.totalWorkingHours.value.previous ?? 0,
    } : undefined
  );
  
  const ordersGrowth = calculateOrdersGrowth(
    totalOrders.value.current,
    totalOrders.value.previous
  );
  
  const forecastOrders = calculateForecastOrders(input);
  
  return {
    totalOrders,
    averageDailyOrders,
    ordersPerRider,
    ordersPerHour,
    ordersGrowth,
    forecastOrders,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  calculateHeadcountKPIs,
  calculateHoursKPIs,
  calculateOrdersKPIs,
};
