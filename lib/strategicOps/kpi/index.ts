/**
 * KPI Engine Module
 * 
 * Complete KPI calculation engine for Strategic Operations Center.
 * Implements SRS-003: KPI Definitions & Mathematical Engine.
 * 
 * @module KPIEngine
 * @version 1.0
 * 
 * @example Basic Usage
 * ```typescript
 * import { calculateKPIsFromStrategicOpsData } from '@/lib/strategicOps/kpi';
 * 
 * const kpis = calculateKPIsFromStrategicOpsData(
 *   dailySeries,
 *   dailyPerformanceRows,
 *   masterRiders,
 *   { expectedDailyHours: 10, targetDailyHours: 2200 },
 *   { zones: ['A', 'B'] },
 *   { coveragePercent: 95, qualityScore: 98 }
 * );
 * 
 * console.log('Total Hours:', kpis.hours.totalWorkingHours.value.current);
 * console.log('Orders/Hour:', kpis.orders.ordersPerHour.value.current);
 * ```
 * 
 * @example Advanced Usage
 * ```typescript
 * import { calculateAllKPIs, createKPIEngineInput } from '@/lib/strategicOps/kpi';
 * 
 * const input = createKPIEngineInput(
 *   dailySeries,
 *   dailyPerformanceRows,
 *   masterRiders,
 *   config,
 *   filters,
 *   dataQuality
 * );
 * 
 * const kpis = calculateAllKPIs(input);
 * ```
 * 
 * @example Top KPIs
 * ```typescript
 * import { getTopKPIs } from '@/lib/strategicOps/kpi';
 * 
 * const kpis = calculateKPIsFromStrategicOpsData(...);
 * const topKPIs = getTopKPIs(kpis);
 * 
 * // Access top 10 most important KPIs
 * console.log(topKPIs.ordersPerHour); // Most important!
 * ```
 */

// ============================================================================
// MAIN EXPORTS
// ============================================================================

// Main integration function (recommended entry point)
export { 
  default as calculateKPIsFromStrategicOpsData,
  calculateKPIsFromStrategicOpsData as calculateKPIs,
} from './integration';

// Core engine
export {
  calculateAllKPIs,
  type KPIEngineInput,
  type DailyPerformanceRecord,
} from './engine';

// Integration helpers
export {
  createKPIEngineInput,
  mapDailySeriesToKPIRecords,
  calculateUploadedDays,
  extractDateRange,
  getTopKPIs,
  formatKPIForDisplay,
  isKPIHealthy,
  getKPIHealthColor,
} from './integration';

// Types
export type {
  KPI,
  KPIValue,
  KPICategory,
  KPIFormat,
  KPIEngineOutput,
  HeadcountKPIs,
  HoursKPIs,
  OrdersKPIs,
  BreakKPIs,
  LateKPIs,
  AttendanceKPIs,
  LostHoursKPIs,
  LostHoursCategory,
  LostHoursCategoryBreakdown,
  DistributionKPIs,
  RiderDistributionBucket,
  SupervisorKPIs,
  SupervisorPerformance,
  SupervisorScoreComponents,
  RecruitmentKPIs,
  TerminationKPIs,
  ReactivationKPIs,
  DailyCommentsKPIs,
  DailyCommentsCategoryStats,
  GrowthKPIs,
  ForecastKPIs,
  DataQualityKPIs,
  TrendDirection,
  TrendArrow,
} from './types';

// Calculators (for advanced usage)
export {
  calculateHeadcountKPIs,
  calculateHoursKPIs,
  calculateOrdersKPIs,
  type KPICalculationInput,
} from './calculators';

export {
  calculateBreakKPIs,
  calculateLateKPIs,
  calculateAttendanceKPIs,
  calculateLostHoursKPIs,
  calculateRiderDistribution,
} from './calculators-part2';

// ============================================================================
// MODULE INFO
// ============================================================================

export const KPI_ENGINE_VERSION = '1.0.0';

export const KPI_ENGINE_INFO = {
  version: '1.0.0',
  implementsSpec: 'SRS-003',
  totalKPIs: 60,
  categories: 17,
  status: 'Production Ready (Core KPIs)',
  notes: [
    'Core KPIs (001-040) fully implemented',
    'Supervisor, Recruitment, Termination, Reactivation, Daily Comments, Growth, Forecast KPIs are placeholders',
    'Data Quality KPIs integrated with Phase 1 validation engine',
    'All calculations follow SRS-003 rules (division by uploaded days, not selected days)',
  ],
};

/**
 * Get KPI Engine status and implemented features
 */
export function getKPIEngineStatus() {
  return KPI_ENGINE_INFO;
}
