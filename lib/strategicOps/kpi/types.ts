/**
 * KPI Engine Types & Interfaces
 * 
 * Implements SRS-003: KPI Definitions & Mathematical Engine
 * 
 * @module KPIEngineTypes
 * @version 1.0
 */

// ============================================================================
// CORE KPI TYPES
// ============================================================================

/**
 * Trend direction for KPI comparison
 */
export type TrendDirection = 'up' | 'down' | 'stable';

/**
 * Trend arrow for visual display
 */
export type TrendArrow = '↑' | '↓' | '→' | '⬆️' | '⬇️' | '➡️';

/**
 * Base KPI Value with comparison
 * Every KPI must implement Rule 3 from SRS-003
 */
export type KPIValue = {
  /** Current period value */
  current: number;
  
  /** Previous period value for comparison */
  previous: number | null;
  
  /** Absolute difference (current - previous) */
  difference: number | null;
  
  /** Growth percentage */
  growthPercent: number | null;
  
  /** Trend direction */
  trend: TrendDirection;
  
  /** Trend arrow for display */
  trendArrow: TrendArrow;
};

/**
 * KPI with metadata
 */
export type KPI = {
  /** Unique KPI identifier (e.g., "KPI_001") */
  id: string;
  
  /** KPI name (English) */
  name: string;
  
  /** KPI name (Arabic) */
  nameAr: string;
  
  /** KPI category */
  category: KPICategory;
  
  /** KPI value with comparison */
  value: KPIValue;
  
  /** Display format (number, percent, hours, etc.) */
  format: KPIFormat;
  
  /** Description (optional) */
  description?: string;
  
  /** Formula (optional, for documentation) */
  formula?: string;
};

/**
 * KPI Categories (18 categories from SRS-003)
 */
export type KPICategory =
  | 'headcount'
  | 'hours'
  | 'orders'
  | 'break'
  | 'late'
  | 'attendance'
  | 'lost_hours'
  | 'distribution'
  | 'supervisor'
  | 'recruitment'
  | 'termination'
  | 'reactivation'
  | 'daily_comments'
  | 'growth'
  | 'forecast'
  | 'comparative'
  | 'data_quality';

/**
 * KPI Display Format
 */
export type KPIFormat =
  | 'number'           // 1,234
  | 'decimal'          // 1,234.56
  | 'percent'          // 85.5%
  | 'hours'            // 1,234 hr
  | 'minutes'          // 456 min
  | 'currency'         // $1,234.56
  | 'ratio'            // 2.5:1
  | 'score'            // 85/100
  | 'days';            // 14 days

// ============================================================================
// HEADCOUNT KPIs (001-008)
// ============================================================================

export type HeadcountKPIs = {
  /** KPI 001: Registered Riders */
  registeredRiders: KPI;
  
  /** KPI 002: Active Registered Riders */
  activeRegisteredRiders: KPI;
  
  /** KPI 003: Inactive Riders */
  inactiveRiders: KPI;
  
  /** KPI 004: Working Riders (Hours > 0 AND Orders > 0) */
  workingRiders: KPI;
  
  /** KPI 005: Average Daily Working Riders */
  averageDailyWorkingRiders: KPI;
  
  /** KPI 006: Daily Active Rate */
  dailyActiveRate: KPI;
  
  /** KPI 007: Available Riders */
  availableRiders: KPI;
  
  /** KPI 008: Capacity Utilization */
  capacityUtilization: KPI;
};

// ============================================================================
// HOURS KPIs (009-017)
// ============================================================================

export type HoursKPIs = {
  /** KPI 009: Total Working Hours */
  totalWorkingHours: KPI;
  
  /** KPI 010: Average Daily Hours */
  averageDailyHours: KPI;
  
  /** KPI 011: Average Hours Per Working Rider */
  averageHoursPerWorkingRider: KPI;
  
  /** KPI 012: Median Working Hours */
  medianWorkingHours: KPI;
  
  /** KPI 013: Maximum Hours */
  maximumHours: KPI;
  
  /** KPI 014: Minimum Hours */
  minimumHours: KPI;
  
  /** KPI 015: Potential Hours */
  potentialHours: KPI;
  
  /** KPI 016: Hours Gap */
  hoursGap: KPI;
  
  /** KPI 017: Hours Achievement */
  hoursAchievement: KPI;
};

// ============================================================================
// ORDERS KPIs (018-023)
// ============================================================================

export type OrdersKPIs = {
  /** KPI 018: Total Orders */
  totalOrders: KPI;
  
  /** KPI 019: Average Daily Orders */
  averageDailyOrders: KPI;
  
  /** KPI 020: Orders Per Rider */
  ordersPerRider: KPI;
  
  /** KPI 021: Orders Per Hour (Most Important!) */
  ordersPerHour: KPI;
  
  /** KPI 022: Orders Growth */
  ordersGrowth: KPI;
  
  /** KPI 023: Forecast Orders */
  forecastOrders: KPI;
};

// ============================================================================
// BREAK KPIs (024-028)
// ============================================================================

export type BreakKPIs = {
  /** KPI 024: Total Break Minutes */
  totalBreakMinutes: KPI;
  
  /** KPI 025: Average Break */
  averageBreak: KPI;
  
  /** KPI 026: Break Per Rider */
  breakPerRider: KPI;
  
  /** KPI 027: Break % */
  breakPercent: KPI;
  
  /** KPI 028: Estimated Lost Hours Due to Break */
  estimatedLostHoursDueToBreak: KPI;
};

// ============================================================================
// LATE KPIs (029-032)
// ============================================================================

export type LateKPIs = {
  /** KPI 029: Total Late Minutes */
  totalLateMinutes: KPI;
  
  /** KPI 030: Average Late Minutes */
  averageLateMinutes: KPI;
  
  /** KPI 031: Late % */
  latePercent: KPI;
  
  /** KPI 032: Estimated Lost Hours Due to Late */
  estimatedLostHoursDueToLate: KPI;
};

// ============================================================================
// ATTENDANCE KPIs (033-037)
// ============================================================================

export type AttendanceKPIs = {
  /** KPI 033: Total Absence */
  totalAbsence: KPI;
  
  /** KPI 034: Absence % */
  absencePercent: KPI;
  
  /** KPI 035: Working Days */
  workingDays: KPI;
  
  /** KPI 036: Attendance % */
  attendancePercent: KPI;
  
  /** KPI 037: Average Attendance */
  averageAttendance: KPI;
};

// ============================================================================
// LOST HOURS KPIs (038-039 + breakdown)
// ============================================================================

export type LostHoursCategory =
  | 'absence'
  | 'late'
  | 'break'
  | 'medical'
  | 'equipment'
  | 'vacation'
  | 'accident'
  | 'poor_performance'
  | 'other'
  | 'no_shift'
  | 'unknown';

export type LostHoursCategoryBreakdown = {
  category: LostHoursCategory;
  categoryAr: string;
  hours: number;
  percent: number;
  trend: TrendDirection;
  financialLoss: number;
  ordersLost: number;
};

export type LostHoursKPIs = {
  /** KPI 038: Total Lost Hours */
  totalLostHours: KPI;
  
  /** KPI 039: Lost % */
  lostPercent: KPI;
  
  /** Detailed breakdown by category */
  categoryBreakdown: LostHoursCategoryBreakdown[];
};

// ============================================================================
// DISTRIBUTION KPIs (040)
// ============================================================================

export type RiderDistributionBucket = {
  label: string;
  labelAr: string;
  minHours: number;
  maxHours: number | null;
  riderCount: number;
  riderPercent: number;
  averageOrders: number;
  averageLateMinutes: number;
  averageBreakMinutes: number;
  topSupervisor: string | null;
};

export type DistributionKPIs = {
  /** Hours distribution buckets */
  hoursDistribution: RiderDistributionBucket[];
};

// ============================================================================
// SUPERVISOR KPIs (041-044)
// ============================================================================

export type SupervisorScoreComponents = {
  targetAchievement: number;
  utilization: number;
  attendance: number;
  ordersPerHour: number;
  lostHours: number;
  recruitment: number;
  attrition: number;
  reactivation: number;
  dataQuality: number;
};

export type SupervisorPerformance = {
  supervisorCode: string;
  supervisorName: string;
  
  /** Overall score (0-100) */
  score: number;
  
  /** Score components */
  scoreComponents: SupervisorScoreComponents;
  
  /** Team metrics */
  teamSize: number;
  workingRiders: number;
  dailyActiveRate: number;
  
  /** Performance metrics */
  totalHours: number;
  totalOrders: number;
  ordersPerHour: number;
  averageHoursPerRider: number;
  
  /** Issues */
  breakMinutes: number;
  lateMinutes: number;
  absences: number;
  medicalCases: number;
  equipmentIssues: number;
  
  /** HR metrics */
  attritionCount: number;
  recruitmentCount: number;
  
  /** Trend */
  growthPercent: number;
  trend: TrendDirection;
  
  /** Rank among all supervisors */
  rank: number;
};

export type SupervisorKPIs = {
  /** All supervisors performance */
  supervisors: SupervisorPerformance[];
  
  /** Top performer */
  topSupervisor: SupervisorPerformance | null;
  
  /** Bottom performer */
  bottomSupervisor: SupervisorPerformance | null;
  
  /** Average supervisor score */
  averageScore: KPI;
};

// ============================================================================
// RECRUITMENT KPIs (045-047)
// ============================================================================

export type RecruitmentKPIs = {
  /** Approved Hiring */
  approvedHiring: KPI;
  
  /** Pending Hiring */
  pendingHiring: KPI;
  
  /** Rejected Hiring */
  rejectedHiring: KPI;
  
  /** Average Approval Time (days) */
  averageApprovalTime: KPI;
  
  /** Hiring Trend */
  hiringTrend: KPI;
  
  /** Hiring Success Rate */
  hiringSuccessRate: KPI;
};

// ============================================================================
// TERMINATION KPIs (048-050)
// ============================================================================

export type TerminationKPIs = {
  /** Approved Terminations */
  approvedTerminations: KPI;
  
  /** Pending Terminations */
  pendingTerminations: KPI;
  
  /** Attrition % */
  attritionPercent: KPI;
  
  /** Average Rider Lifetime (days) */
  averageRiderLifetime: KPI;
  
  /** Termination reasons breakdown */
  terminationReasons: Record<string, number>;
  
  /** Debt Recovery */
  debtRecovery: KPI;
};

// ============================================================================
// REACTIVATION KPIs (051-053)
// ============================================================================

export type ReactivationKPIs = {
  /** Reactivated Riders */
  reactivatedRiders: KPI;
  
  /** Pending Reactivation */
  pendingReactivation: KPI;
  
  /** Average Reactivation Time (days) */
  averageReactivationTime: KPI;
  
  /** Reactivation Success Rate */
  reactivationSuccessRate: KPI;
};

// ============================================================================
// DAILY COMMENTS KPIs (054)
// ============================================================================

export type DailyCommentsCategoryStats = {
  category: string;
  categoryAr: string;
  openCases: number;
  newCases: number;
  closedCases: number;
  overdueCases: number;
  averageDuration: number;
  topSupervisor: string | null;
};

export type DailyCommentsKPIs = {
  /** Stats by category */
  categoryStats: DailyCommentsCategoryStats[];
  
  /** Total open cases */
  totalOpenCases: KPI;
  
  /** Total overdue cases */
  totalOverdueCases: KPI;
};

// ============================================================================
// GROWTH KPIs (055-058)
// ============================================================================

export type GrowthKPIs = {
  /** Daily Growth */
  dailyGrowth: KPI;
  
  /** Weekly Growth */
  weeklyGrowth: KPI;
  
  /** Monthly Growth */
  monthlyGrowth: KPI;
  
  /** Net Headcount Growth */
  netHeadcountGrowth: KPI;
  
  /** Hours Growth */
  hoursGrowth: KPI;
  
  /** Orders Growth */
  ordersGrowth: KPI;
  
  /** Productivity Growth */
  productivityGrowth: KPI;
  
  /** Utilization Growth */
  utilizationGrowth: KPI;
};

// ============================================================================
// FORECAST KPIs (059-062)
// ============================================================================

export type ForecastKPIs = {
  /** End of Week Hours */
  endOfWeekHours: KPI;
  
  /** End of Month Hours */
  endOfMonthHours: KPI;
  
  /** End of Month Orders */
  endOfMonthOrders: KPI;
  
  /** End of Month Active Riders */
  endOfMonthActiveRiders: KPI;
  
  /** Expected Target Achievement */
  expectedTargetAchievement: KPI;
  
  /** Required Additional Riders */
  requiredAdditionalRiders: KPI;
  
  /** Required Additional Hours */
  requiredAdditionalHours: KPI;
};

// ============================================================================
// DATA QUALITY KPIs (063-070)
// ============================================================================

export type DataQualityKPIs = {
  /** Data Coverage % */
  dataCoveragePercent: KPI;
  
  /** Missing Days */
  missingDays: KPI;
  
  /** Duplicate Records */
  duplicateRecords: KPI;
  
  /** Ghost Riders Count */
  ghostRidersCount: KPI;
  
  /** Unknown Supervisors */
  unknownSupervisors: KPI;
  
  /** Invalid Rider Codes */
  invalidRiderCodes: KPI;
  
  /** Invalid Hours (>24) */
  invalidHours: KPI;
  
  /** Invalid Break Minutes */
  invalidBreakMinutes: KPI;
  
  /** Invalid Late Minutes */
  invalidLateMinutes: KPI;
  
  /** Orphan Daily Records */
  orphanDailyRecords: KPI;
  
  /** Overall Data Quality Score */
  overallQualityScore: KPI;
};

// ============================================================================
// COMPLETE KPI ENGINE OUTPUT
// ============================================================================

/**
 * Complete KPI Engine Output
 * Contains all 60+ KPIs organized by category
 */
export type KPIEngineOutput = {
  /** Calculation timestamp */
  calculatedAt: Date;
  
  /** Date range used */
  dateRange: {
    startDate: string;
    endDate: string;
    uploadedDays: number;
  };
  
  /** Applied filters */
  filters: {
    city?: string;
    zones?: string[];
    supervisors?: string[];
    contractType?: string;
    riderStatus?: string;
  };
  
  /** Headcount KPIs (001-008) */
  headcount: HeadcountKPIs;
  
  /** Hours KPIs (009-017) */
  hours: HoursKPIs;
  
  /** Orders KPIs (018-023) */
  orders: OrdersKPIs;
  
  /** Break KPIs (024-028) */
  break: BreakKPIs;
  
  /** Late KPIs (029-032) */
  late: LateKPIs;
  
  /** Attendance KPIs (033-037) */
  attendance: AttendanceKPIs;
  
  /** Lost Hours KPIs (038-039 + breakdown) */
  lostHours: LostHoursKPIs;
  
  /** Distribution KPIs (040) */
  distribution: DistributionKPIs;
  
  /** Supervisor KPIs (041-044) */
  supervisors: SupervisorKPIs;
  
  /** Recruitment KPIs (045-047) */
  recruitment: RecruitmentKPIs;
  
  /** Termination KPIs (048-050) */
  termination: TerminationKPIs;
  
  /** Reactivation KPIs (051-053) */
  reactivation: ReactivationKPIs;
  
  /** Daily Comments KPIs (054) */
  dailyComments: DailyCommentsKPIs;
  
  /** Growth KPIs (055-058) */
  growth: GrowthKPIs;
  
  /** Forecast KPIs (059-062) */
  forecast: ForecastKPIs;
  
  /** Data Quality KPIs (063-070) */
  dataQuality: DataQualityKPIs;
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create a KPI value with comparison
 */
export function createKPIValue(
  current: number,
  previous: number | null = null
): KPIValue {
  const difference = previous !== null ? current - previous : null;
  const growthPercent =
    previous !== null && previous !== 0
      ? ((current - previous) / Math.abs(previous)) * 100
      : null;
  
  let trend: TrendDirection = 'stable';
  let trendArrow: TrendArrow = '→';
  
  if (growthPercent !== null) {
    if (Math.abs(growthPercent) < 1) {
      trend = 'stable';
      trendArrow = '→';
    } else if (growthPercent > 0) {
      trend = 'up';
      trendArrow = '↑';
    } else {
      trend = 'down';
      trendArrow = '↓';
    }
  }
  
  return {
    current,
    previous,
    difference,
    growthPercent,
    trend,
    trendArrow,
  };
}

/**
 * Format KPI value for display
 */
export function formatKPIValue(value: number, format: KPIFormat): string {
  switch (format) {
    case 'number':
      return Math.round(value).toLocaleString('en-US');
    case 'decimal':
      return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    case 'percent':
      return `${value.toFixed(1)}%`;
    case 'hours':
      return `${Math.round(value).toLocaleString('en-US')} hr`;
    case 'minutes':
      return `${Math.round(value).toLocaleString('en-US')} min`;
    case 'currency':
      return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    case 'ratio':
      return `${value.toFixed(2)}:1`;
    case 'score':
      return `${Math.round(value)}/100`;
    case 'days':
      return `${Math.round(value)} days`;
    default:
      return value.toString();
  }
}
