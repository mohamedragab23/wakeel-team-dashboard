/**
 * KPI Engine Integration Helper
 * 
 * Bridges existing Strategic Ops Report with new KPI Engine.
 * Maps existing data structures to KPI Engine input format.
 * 
 * @module KPIEngineIntegration
 * @version 1.0
 */

import type { Rider } from '@/lib/adminService';
import type { KPIEngineInput, DailyPerformanceRecord } from './engine';
import { calculateAllKPIs } from './engine';
import { OPERATIONAL_TARGETS } from '../config/businessRules';

type FilteredDailySeries = {
  date: string;
  scheduledRiders: number;
  hours: number;
};

type FilteredSupByRow = {
  included: boolean;
  date: string;
  riderCode: string;
  hours: number;
  orders: number;
  breakMinutes: number;
  lateMinutes: number;
  absence: boolean;
  supervisorCode: string;
  zone: string;
};

// ============================================================================
// DATA MAPPING FUNCTIONS
// ============================================================================

/**
 * Convert existing daily series to KPI Engine format
 */
export function mapDailySeriesToKPIRecords(
  dailySeries: FilteredDailySeries[],
  dailyPerformanceRows: FilteredSupByRow[]
): DailyPerformanceRecord[] {
  const records: DailyPerformanceRecord[] = [];
  
  for (const row of dailyPerformanceRows) {
    if (!row.included) continue;
    
    records.push({
      date: row.date,
      riderCode: row.riderCode,
      hours: row.hours,
      orders: row.orders,
      breakMinutes: row.breakMinutes,
      lateMinutes: row.lateMinutes,
      absence: row.absence,
      supervisorCode: row.supervisorCode,
      zone: row.zone,
    });
  }
  
  return records;
}

/**
 * Calculate uploaded days from daily series
 */
export function calculateUploadedDays(dailySeries: FilteredDailySeries[]): number {
  // Days with any activity
  const operationalDays = dailySeries.filter(
    d => d.scheduledRiders > 0 || d.hours > 0
  );
  
  return operationalDays.length;
}

/**
 * Extract date range from daily series
 */
export function extractDateRange(
  dailySeries: FilteredDailySeries[]
): { startDate: string; endDate: string; uploadedDays: number } {
  if (dailySeries.length === 0) {
    return {
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0],
      uploadedDays: 0,
    };
  }
  
  const dates = dailySeries.map(d => d.date).sort();
  const uploadedDays = calculateUploadedDays(dailySeries);
  
  return {
    startDate: dates[0],
    endDate: dates[dates.length - 1],
    uploadedDays,
  };
}

/**
 * Create KPI Engine input from existing Strategic Ops data
 */
export function createKPIEngineInput(
  dailySeries: FilteredDailySeries[],
  dailyPerformanceRows: FilteredSupByRow[],
  masterRiders: Rider[],
  config?: {
    expectedDailyHours?: number;
    targetDailyHours?: number;
  },
  filters?: {
    city?: string;
    zones?: string[];
    supervisors?: string[];
    contractType?: string;
    riderStatus?: string;
  },
  dataQuality?: {
    coveragePercent: number;
    duplicateRecords: number;
    ghostRidersCount: number;
    qualityScore: number;
  }
): KPIEngineInput {
  const dailyRecords = mapDailySeriesToKPIRecords(dailySeries, dailyPerformanceRows);
  const dateRange = extractDateRange(dailySeries);
  
  return {
    dailyRecords,
    masterRiders,
    dateRange,
    filters,
    config: {
      expectedDailyHours: config?.expectedDailyHours ?? OPERATIONAL_TARGETS.EXPECTED_HOURS_PER_RIDER,
      targetDailyHours: config?.targetDailyHours ?? OPERATIONAL_TARGETS.DAILY_HOURS_TARGET,
    },
    dataQuality,
  };
}

// ============================================================================
// INTEGRATED CALCULATION FUNCTION
// ============================================================================

/**
 * Calculate all KPIs from Strategic Ops Report data
 * 
 * This is the main integration point. Use this function to calculate
 * all KPIs from existing Strategic Ops data structures.
 * 
 * @example
 * ```typescript
 * const kpis = calculateKPIsFromStrategicOpsData(
 *   report.dailySeries,
 *   report.allPerformanceRows,
 *   masterRiders,
 *   { expectedDailyHours: 10, targetDailyHours: 2200 },
 *   { zones: ['A', 'B'] },
 *   { coveragePercent: 95, duplicateRecords: 0, ghostRidersCount: 3, qualityScore: 98 }
 * );
 * 
 * console.log('Total Hours:', kpis.hours.totalWorkingHours.value.current);
 * console.log('Orders Per Hour:', kpis.orders.ordersPerHour.value.current);
 * console.log('Hours Achievement:', kpis.hours.hoursAchievement.value.current);
 * ```
 */
export function calculateKPIsFromStrategicOpsData(
  dailySeries: FilteredDailySeries[],
  dailyPerformanceRows: FilteredSupByRow[],
  masterRiders: Rider[],
  config?: {
    expectedDailyHours?: number;
    targetDailyHours?: number;
  },
  filters?: {
    city?: string;
    zones?: string[];
    supervisors?: string[];
    contractType?: string;
    riderStatus?: string;
  },
  dataQuality?: {
    coveragePercent: number;
    duplicateRecords: number;
    ghostRidersCount: number;
    qualityScore: number;
  }
) {
  const input = createKPIEngineInput(
    dailySeries,
    dailyPerformanceRows,
    masterRiders,
    config,
    filters,
    dataQuality
  );
  
  return calculateAllKPIs(input);
}

// ============================================================================
// QUICK ACCESS HELPERS
// ============================================================================

/**
 * Get top 10 most important KPIs for executive view
 */
export function getTopKPIs(kpis: ReturnType<typeof calculateAllKPIs>) {
  return {
    // Headcount
    registeredRiders: kpis.headcount.registeredRiders,
    workingRiders: kpis.headcount.workingRiders,
    dailyActiveRate: kpis.headcount.dailyActiveRate,
    
    // Hours
    totalWorkingHours: kpis.hours.totalWorkingHours,
    hoursAchievement: kpis.hours.hoursAchievement,
    
    // Orders
    totalOrders: kpis.orders.totalOrders,
    ordersPerHour: kpis.orders.ordersPerHour, // Most important!
    
    // Efficiency
    breakPercent: kpis.break.breakPercent,
    latePercent: kpis.late.latePercent,
    attendancePercent: kpis.attendance.attendancePercent,
  };
}

/**
 * Format KPI for display
 */
export function formatKPIForDisplay(kpi: any) {
  const { value, format } = kpi;
  
  let formattedCurrent = '';
  let formattedPrevious = '';
  
  switch (format) {
    case 'number':
      formattedCurrent = Math.round(value.current).toLocaleString('en-US');
      formattedPrevious = value.previous !== null ? Math.round(value.previous).toLocaleString('en-US') : '-';
      break;
    case 'decimal':
      formattedCurrent = value.current.toFixed(2);
      formattedPrevious = value.previous !== null ? value.previous.toFixed(2) : '-';
      break;
    case 'percent':
      formattedCurrent = `${value.current.toFixed(1)}%`;
      formattedPrevious = value.previous !== null ? `${value.previous.toFixed(1)}%` : '-';
      break;
    case 'hours':
      formattedCurrent = `${Math.round(value.current).toLocaleString('en-US')} hr`;
      formattedPrevious = value.previous !== null ? `${Math.round(value.previous).toLocaleString('en-US')} hr` : '-';
      break;
    case 'minutes':
      formattedCurrent = `${Math.round(value.current).toLocaleString('en-US')} min`;
      formattedPrevious = value.previous !== null ? `${Math.round(value.previous).toLocaleString('en-US')} min` : '-';
      break;
    default:
      formattedCurrent = value.current.toString();
      formattedPrevious = value.previous !== null ? value.previous.toString() : '-';
  }
  
  return {
    current: formattedCurrent,
    previous: formattedPrevious,
    difference: value.difference !== null ? value.difference.toFixed(1) : '-',
    growthPercent: value.growthPercent !== null ? `${value.growthPercent.toFixed(1)}%` : '-',
    trend: value.trend,
    trendArrow: value.trendArrow,
  };
}

/**
 * Check if KPI is healthy based on targets
 */
export function isKPIHealthy(kpiId: string, value: number): boolean {
  switch (kpiId) {
    case 'KPI_006': // Daily Active Rate
      return value >= 85; // Healthy if >= 85%
    case 'KPI_008': // Capacity Utilization
      return value >= 70 && value <= 95; // Healthy between 70-95%
    case 'KPI_017': // Hours Achievement
      return value >= 95; // Healthy if >= 95% of target
    case 'KPI_021': // Orders Per Hour
      return value >= 2.5; // Healthy if >= 2.5 orders/hour
    case 'KPI_027': // Break %
      return value <= 8; // Healthy if <= 8%
    case 'KPI_031': // Late %
      return value <= 5; // Healthy if <= 5%
    case 'KPI_036': // Attendance %
      return value >= 92; // Healthy if >= 92%
    case 'KPI_DQ_OVERALL': // Data Quality Score
      return value >= 95; // Healthy if >= 95
    default:
      return true; // Unknown KPI, assume healthy
  }
}

/**
 * Get KPI health color
 */
export function getKPIHealthColor(kpiId: string, value: number): 'green' | 'yellow' | 'red' {
  const isHealthy = isKPIHealthy(kpiId, value);
  
  // For percentage KPIs, also check if it's critically low
  if (kpiId === 'KPI_006' && value < 70) return 'red'; // Daily Active Rate < 70%
  if (kpiId === 'KPI_017' && value < 85) return 'red'; // Hours Achievement < 85%
  if (kpiId === 'KPI_036' && value < 85) return 'red'; // Attendance < 85%
  if (kpiId === 'KPI_DQ_OVERALL' && value < 85) return 'red'; // Data Quality < 85
  
  return isHealthy ? 'green' : 'yellow';
}

export default calculateKPIsFromStrategicOpsData;
