/**
 * KPI Engine - Main Orchestrator
 * 
 * Central engine for calculating all KPIs from raw data.
 * Implements SRS-003: KPI Definitions & Mathematical Engine.
 * 
 * @module KPIEngine
 * @version 1.0
 */

import type { Rider } from '@/lib/adminService';
import type { 
  KPIEngineOutput, 
  HeadcountKPIs, 
  HoursKPIs, 
  OrdersKPIs,
  BreakKPIs,
  LateKPIs,
  AttendanceKPIs,
  LostHoursKPIs,
  DistributionKPIs,
  SupervisorKPIs,
  RecruitmentKPIs,
  TerminationKPIs,
  ReactivationKPIs,
  DailyCommentsKPIs,
  GrowthKPIs,
  ForecastKPIs,
  DataQualityKPIs,
} from './types';

import {
  calculateHeadcountKPIs,
  calculateHoursKPIs,
  calculateOrdersKPIs,
  type KPICalculationInput,
  type DailyPerformanceRecord,
} from './calculators';

import {
  calculateBreakKPIs,
  calculateLateKPIs,
  calculateAttendanceKPIs,
  calculateLostHoursKPIs,
  calculateRiderDistribution,
} from './calculators-part2';

import { DATA_QUALITY_THRESHOLDS } from '../config/businessRules';

// ============================================================================
// ENGINE INPUT TYPE
// ============================================================================

export type KPIEngineInput = {
  /** Daily performance records (after filters applied) */
  dailyRecords: DailyPerformanceRecord[];
  
  /** Master rider list (after filters applied) */
  masterRiders: Rider[];
  
  /** Date range */
  dateRange: {
    startDate: string;
    endDate: string;
    uploadedDays: number;
  };
  
  /** Applied filters */
  filters?: {
    city?: string;
    zones?: string[];
    supervisors?: string[];
    contractType?: string;
    riderStatus?: string;
  };
  
  /** Configuration */
  config: {
    expectedDailyHours: number;
    targetDailyHours: number;
  };
  
  /** Optional: Previous period data for comparison */
  previousPeriod?: {
    dailyRecords: DailyPerformanceRecord[];
    masterRiders: Rider[];
    dateRange: {
      startDate: string;
      endDate: string;
      uploadedDays: number;
    };
  };
  
  /** Optional: Data quality metrics */
  dataQuality?: {
    coveragePercent: number;
    duplicateRecords: number;
    ghostRidersCount: number;
    qualityScore: number;
  };
};

// ============================================================================
// PLACEHOLDER CALCULATORS FOR MISSING SECTIONS
// ============================================================================

/**
 * Placeholder: Supervisor KPIs
 * TODO: Implement full supervisor scoring system
 */
function calculateSupervisorKPIsPlaceholder(): SupervisorKPIs {
  return {
    supervisors: [],
    topSupervisor: null,
    bottomSupervisor: null,
    averageScore: {
      id: 'KPI_SUPERVISOR_AVG',
      name: 'Average Supervisor Score',
      nameAr: 'متوسط درجة المشرفين',
      category: 'supervisor',
      value: {
        current: 0,
        previous: null,
        difference: null,
        growthPercent: null,
        trend: 'stable',
        trendArrow: '→',
      },
      format: 'score',
    },
  };
}

/**
 * Placeholder: Recruitment KPIs
 * TODO: Implement recruitment tracking
 */
function calculateRecruitmentKPIsPlaceholder(): RecruitmentKPIs {
  return {
    approvedHiring: {
      id: 'KPI_REC_001',
      name: 'Approved Hiring',
      nameAr: 'التوظيف المعتمد',
      category: 'recruitment',
      value: { current: 0, previous: null, difference: null, growthPercent: null, trend: 'stable', trendArrow: '→' },
      format: 'number',
    },
    pendingHiring: {
      id: 'KPI_REC_002',
      name: 'Pending Hiring',
      nameAr: 'التوظيف المعلق',
      category: 'recruitment',
      value: { current: 0, previous: null, difference: null, growthPercent: null, trend: 'stable', trendArrow: '→' },
      format: 'number',
    },
    rejectedHiring: {
      id: 'KPI_REC_003',
      name: 'Rejected Hiring',
      nameAr: 'التوظيف المرفوض',
      category: 'recruitment',
      value: { current: 0, previous: null, difference: null, growthPercent: null, trend: 'stable', trendArrow: '→' },
      format: 'number',
    },
    averageApprovalTime: {
      id: 'KPI_REC_004',
      name: 'Average Approval Time',
      nameAr: 'متوسط وقت الموافقة',
      category: 'recruitment',
      value: { current: 0, previous: null, difference: null, growthPercent: null, trend: 'stable', trendArrow: '→' },
      format: 'days',
    },
    hiringTrend: {
      id: 'KPI_REC_005',
      name: 'Hiring Trend',
      nameAr: 'اتجاه التوظيف',
      category: 'recruitment',
      value: { current: 0, previous: null, difference: null, growthPercent: null, trend: 'stable', trendArrow: '→' },
      format: 'percent',
    },
    hiringSuccessRate: {
      id: 'KPI_REC_006',
      name: 'Hiring Success Rate',
      nameAr: 'معدل نجاح التوظيف',
      category: 'recruitment',
      value: { current: 0, previous: null, difference: null, growthPercent: null, trend: 'stable', trendArrow: '→' },
      format: 'percent',
    },
  };
}

/**
 * Placeholder: Termination KPIs
 * TODO: Implement termination tracking
 */
function calculateTerminationKPIsPlaceholder(): TerminationKPIs {
  return {
    approvedTerminations: {
      id: 'KPI_TERM_001',
      name: 'Approved Terminations',
      nameAr: 'الإقالات المعتمدة',
      category: 'termination',
      value: { current: 0, previous: null, difference: null, growthPercent: null, trend: 'stable', trendArrow: '→' },
      format: 'number',
    },
    pendingTerminations: {
      id: 'KPI_TERM_002',
      name: 'Pending Terminations',
      nameAr: 'الإقالات المعلقة',
      category: 'termination',
      value: { current: 0, previous: null, difference: null, growthPercent: null, trend: 'stable', trendArrow: '→' },
      format: 'number',
    },
    attritionPercent: {
      id: 'KPI_TERM_003',
      name: 'Attrition %',
      nameAr: 'نسبة الاستنزاف',
      category: 'termination',
      value: { current: 0, previous: null, difference: null, growthPercent: null, trend: 'stable', trendArrow: '→' },
      format: 'percent',
    },
    averageRiderLifetime: {
      id: 'KPI_TERM_004',
      name: 'Average Rider Lifetime',
      nameAr: 'متوسط عمر المندوب',
      category: 'termination',
      value: { current: 0, previous: null, difference: null, growthPercent: null, trend: 'stable', trendArrow: '→' },
      format: 'days',
    },
    terminationReasons: {},
    debtRecovery: {
      id: 'KPI_TERM_005',
      name: 'Debt Recovery',
      nameAr: 'استرداد الديون',
      category: 'termination',
      value: { current: 0, previous: null, difference: null, growthPercent: null, trend: 'stable', trendArrow: '→' },
      format: 'currency',
    },
  };
}

/**
 * Placeholder: Reactivation KPIs
 * TODO: Implement reactivation tracking
 */
function calculateReactivationKPIsPlaceholder(): ReactivationKPIs {
  return {
    reactivatedRiders: {
      id: 'KPI_REACT_001',
      name: 'Reactivated Riders',
      nameAr: 'المناديب المعاد تفعيلهم',
      category: 'reactivation',
      value: { current: 0, previous: null, difference: null, growthPercent: null, trend: 'stable', trendArrow: '→' },
      format: 'number',
    },
    pendingReactivation: {
      id: 'KPI_REACT_002',
      name: 'Pending Reactivation',
      nameAr: 'إعادة التفعيل المعلقة',
      category: 'reactivation',
      value: { current: 0, previous: null, difference: null, growthPercent: null, trend: 'stable', trendArrow: '→' },
      format: 'number',
    },
    averageReactivationTime: {
      id: 'KPI_REACT_003',
      name: 'Average Reactivation Time',
      nameAr: 'متوسط وقت إعادة التفعيل',
      category: 'reactivation',
      value: { current: 0, previous: null, difference: null, growthPercent: null, trend: 'stable', trendArrow: '→' },
      format: 'days',
    },
    reactivationSuccessRate: {
      id: 'KPI_REACT_004',
      name: 'Reactivation Success Rate',
      nameAr: 'معدل نجاح إعادة التفعيل',
      category: 'reactivation',
      value: { current: 0, previous: null, difference: null, growthPercent: null, trend: 'stable', trendArrow: '→' },
      format: 'percent',
    },
  };
}

/**
 * Placeholder: Daily Comments KPIs
 * TODO: Implement daily comments tracking
 */
function calculateDailyCommentsKPIsPlaceholder(): DailyCommentsKPIs {
  return {
    categoryStats: [],
    totalOpenCases: {
      id: 'KPI_DC_001',
      name: 'Total Open Cases',
      nameAr: 'إجمالي الحالات المفتوحة',
      category: 'daily_comments',
      value: { current: 0, previous: null, difference: null, growthPercent: null, trend: 'stable', trendArrow: '→' },
      format: 'number',
    },
    totalOverdueCases: {
      id: 'KPI_DC_002',
      name: 'Total Overdue Cases',
      nameAr: 'إجمالي الحالات المتأخرة',
      category: 'daily_comments',
      value: { current: 0, previous: null, difference: null, growthPercent: null, trend: 'stable', trendArrow: '→' },
      format: 'number',
    },
  };
}

/**
 * Placeholder: Growth KPIs
 * TODO: Implement growth tracking
 */
function calculateGrowthKPIsPlaceholder(): GrowthKPIs {
  return {
    dailyGrowth: {
      id: 'KPI_GRW_001',
      name: 'Daily Growth',
      nameAr: 'النمو اليومي',
      category: 'growth',
      value: { current: 0, previous: null, difference: null, growthPercent: null, trend: 'stable', trendArrow: '→' },
      format: 'percent',
    },
    weeklyGrowth: {
      id: 'KPI_GRW_002',
      name: 'Weekly Growth',
      nameAr: 'النمو الأسبوعي',
      category: 'growth',
      value: { current: 0, previous: null, difference: null, growthPercent: null, trend: 'stable', trendArrow: '→' },
      format: 'percent',
    },
    monthlyGrowth: {
      id: 'KPI_GRW_003',
      name: 'Monthly Growth',
      nameAr: 'النمو الشهري',
      category: 'growth',
      value: { current: 0, previous: null, difference: null, growthPercent: null, trend: 'stable', trendArrow: '→' },
      format: 'percent',
    },
    netHeadcountGrowth: {
      id: 'KPI_GRW_004',
      name: 'Net Headcount Growth',
      nameAr: 'صافي نمو العدد',
      category: 'growth',
      value: { current: 0, previous: null, difference: null, growthPercent: null, trend: 'stable', trendArrow: '→' },
      format: 'number',
    },
    hoursGrowth: {
      id: 'KPI_GRW_005',
      name: 'Hours Growth',
      nameAr: 'نمو الساعات',
      category: 'growth',
      value: { current: 0, previous: null, difference: null, growthPercent: null, trend: 'stable', trendArrow: '→' },
      format: 'percent',
    },
    ordersGrowth: {
      id: 'KPI_GRW_006',
      name: 'Orders Growth',
      nameAr: 'نمو الأوردرات',
      category: 'growth',
      value: { current: 0, previous: null, difference: null, growthPercent: null, trend: 'stable', trendArrow: '→' },
      format: 'percent',
    },
    productivityGrowth: {
      id: 'KPI_GRW_007',
      name: 'Productivity Growth',
      nameAr: 'نمو الإنتاجية',
      category: 'growth',
      value: { current: 0, previous: null, difference: null, growthPercent: null, trend: 'stable', trendArrow: '→' },
      format: 'percent',
    },
    utilizationGrowth: {
      id: 'KPI_GRW_008',
      name: 'Utilization Growth',
      nameAr: 'نمو الاستغلال',
      category: 'growth',
      value: { current: 0, previous: null, difference: null, growthPercent: null, trend: 'stable', trendArrow: '→' },
      format: 'percent',
    },
  };
}

/**
 * Placeholder: Forecast KPIs
 * TODO: Implement forecasting engine
 */
function calculateForecastKPIsPlaceholder(): ForecastKPIs {
  return {
    endOfWeekHours: {
      id: 'KPI_FC_001',
      name: 'End of Week Hours',
      nameAr: 'توقع ساعات نهاية الأسبوع',
      category: 'forecast',
      value: { current: 0, previous: null, difference: null, growthPercent: null, trend: 'stable', trendArrow: '→' },
      format: 'hours',
    },
    endOfMonthHours: {
      id: 'KPI_FC_002',
      name: 'End of Month Hours',
      nameAr: 'توقع ساعات نهاية الشهر',
      category: 'forecast',
      value: { current: 0, previous: null, difference: null, growthPercent: null, trend: 'stable', trendArrow: '→' },
      format: 'hours',
    },
    endOfMonthOrders: {
      id: 'KPI_FC_003',
      name: 'End of Month Orders',
      nameAr: 'توقع أوردرات نهاية الشهر',
      category: 'forecast',
      value: { current: 0, previous: null, difference: null, growthPercent: null, trend: 'stable', trendArrow: '→' },
      format: 'number',
    },
    endOfMonthActiveRiders: {
      id: 'KPI_FC_004',
      name: 'End of Month Active Riders',
      nameAr: 'توقع المناديب النشطين نهاية الشهر',
      category: 'forecast',
      value: { current: 0, previous: null, difference: null, growthPercent: null, trend: 'stable', trendArrow: '→' },
      format: 'number',
    },
    expectedTargetAchievement: {
      id: 'KPI_FC_005',
      name: 'Expected Target Achievement',
      nameAr: 'نسبة تحقيق الهدف المتوقعة',
      category: 'forecast',
      value: { current: 0, previous: null, difference: null, growthPercent: null, trend: 'stable', trendArrow: '→' },
      format: 'percent',
    },
    requiredAdditionalRiders: {
      id: 'KPI_FC_006',
      name: 'Required Additional Riders',
      nameAr: 'المناديب الإضافيين المطلوبين',
      category: 'forecast',
      value: { current: 0, previous: null, difference: null, growthPercent: null, trend: 'stable', trendArrow: '→' },
      format: 'number',
    },
    requiredAdditionalHours: {
      id: 'KPI_FC_007',
      name: 'Required Additional Hours',
      nameAr: 'الساعات الإضافية المطلوبة',
      category: 'forecast',
      value: { current: 0, previous: null, difference: null, growthPercent: null, trend: 'stable', trendArrow: '→' },
      format: 'hours',
    },
  };
}

/**
 * Calculate Data Quality KPIs
 */
function calculateDataQualityKPIs(
  input: KPIEngineInput
): DataQualityKPIs {
  const dq = input.dataQuality;
  
  return {
    dataCoveragePercent: {
      id: 'KPI_DQ_001',
      name: 'Data Coverage %',
      nameAr: 'نسبة تغطية البيانات',
      category: 'data_quality',
      value: { 
        current: dq?.coveragePercent ?? 0, 
        previous: null, 
        difference: null, 
        growthPercent: null, 
        trend: 'stable', 
        trendArrow: '→' 
      },
      format: 'percent',
    },
    missingDays: {
      id: 'KPI_DQ_002',
      name: 'Missing Days',
      nameAr: 'الأيام الناقصة',
      category: 'data_quality',
      value: { current: 0, previous: null, difference: null, growthPercent: null, trend: 'stable', trendArrow: '→' },
      format: 'number',
    },
    duplicateRecords: {
      id: 'KPI_DQ_003',
      name: 'Duplicate Records',
      nameAr: 'السجلات المكررة',
      category: 'data_quality',
      value: { 
        current: dq?.duplicateRecords ?? 0, 
        previous: null, 
        difference: null, 
        growthPercent: null, 
        trend: 'stable', 
        trendArrow: '→' 
      },
      format: 'number',
    },
    ghostRidersCount: {
      id: 'KPI_DQ_004',
      name: 'Ghost Riders Count',
      nameAr: 'عدد الطيارين الأشباح',
      category: 'data_quality',
      value: { 
        current: dq?.ghostRidersCount ?? 0, 
        previous: null, 
        difference: null, 
        growthPercent: null, 
        trend: 'stable', 
        trendArrow: '→' 
      },
      format: 'number',
    },
    unknownSupervisors: {
      id: 'KPI_DQ_005',
      name: 'Unknown Supervisors',
      nameAr: 'المشرفين المجهولين',
      category: 'data_quality',
      value: { current: 0, previous: null, difference: null, growthPercent: null, trend: 'stable', trendArrow: '→' },
      format: 'number',
    },
    invalidRiderCodes: {
      id: 'KPI_DQ_006',
      name: 'Invalid Rider Codes',
      nameAr: 'أكواد المناديب غير الصحيحة',
      category: 'data_quality',
      value: { current: 0, previous: null, difference: null, growthPercent: null, trend: 'stable', trendArrow: '→' },
      format: 'number',
    },
    invalidHours: {
      id: 'KPI_DQ_007',
      name: 'Invalid Hours (>24)',
      nameAr: 'ساعات غير صحيحة (>24)',
      category: 'data_quality',
      value: { current: 0, previous: null, difference: null, growthPercent: null, trend: 'stable', trendArrow: '→' },
      format: 'number',
    },
    invalidBreakMinutes: {
      id: 'KPI_DQ_008',
      name: 'Invalid Break Minutes',
      nameAr: 'دقائق استراحة غير صحيحة',
      category: 'data_quality',
      value: { current: 0, previous: null, difference: null, growthPercent: null, trend: 'stable', trendArrow: '→' },
      format: 'number',
    },
    invalidLateMinutes: {
      id: 'KPI_DQ_009',
      name: 'Invalid Late Minutes',
      nameAr: 'دقائق تأخير غير صحيحة',
      category: 'data_quality',
      value: { current: 0, previous: null, difference: null, growthPercent: null, trend: 'stable', trendArrow: '→' },
      format: 'number',
    },
    orphanDailyRecords: {
      id: 'KPI_DQ_010',
      name: 'Orphan Daily Records',
      nameAr: 'السجلات اليومية اليتيمة',
      category: 'data_quality',
      value: { current: 0, previous: null, difference: null, growthPercent: null, trend: 'stable', trendArrow: '→' },
      format: 'number',
    },
    overallQualityScore: {
      id: 'KPI_DQ_OVERALL',
      name: 'Overall Data Quality Score',
      nameAr: 'درجة جودة البيانات الإجمالية',
      category: 'data_quality',
      value: { 
        current: dq?.qualityScore ?? 0, 
        previous: null, 
        difference: null, 
        growthPercent: null, 
        trend: 'stable', 
        trendArrow: '→' 
      },
      format: 'score',
    },
  };
}

// ============================================================================
// MAIN KPI ENGINE
// ============================================================================

/**
 * Calculate ALL KPIs from raw data
 * 
 * This is the main entry point for the KPI Engine.
 * It orchestrates all calculator functions and returns a complete KPI report.
 * 
 * @param input - Engine input with daily records, master riders, config, etc.
 * @returns Complete KPI engine output with 60+ KPIs
 */
export function calculateAllKPIs(input: KPIEngineInput): KPIEngineOutput {
  // Prepare calculation input
  const calcInput: KPICalculationInput = {
    dailyRecords: input.dailyRecords,
    masterRiders: input.masterRiders,
    dateRange: input.dateRange,
    config: input.config,
    previousPeriod: input.previousPeriod,
  };
  
  // Calculate Headcount KPIs (001-008)
  const headcount = calculateHeadcountKPIs(calcInput);
  
  // Calculate Hours KPIs (009-017)
  const hours = calculateHoursKPIs(calcInput, headcount);
  
  // Calculate Orders KPIs (018-023)
  const orders = calculateOrdersKPIs(calcInput, headcount, hours);
  
  // Calculate Break KPIs (024-028)
  const breakKPIs = calculateBreakKPIs(
    calcInput,
    hours.totalWorkingHours.value.current,
    headcount.averageDailyWorkingRiders.value.current
  );
  
  // Calculate Late KPIs (029-032)
  const late = calculateLateKPIs(
    calcInput,
    hours.totalWorkingHours.value.current
  );
  
  // Calculate Attendance KPIs (033-037)
  const attendance = calculateAttendanceKPIs(calcInput);
  
  // Calculate Lost Hours KPIs (038-039)
  const lostHours = calculateLostHoursKPIs(
    calcInput,
    hours.potentialHours.value.current
  );
  
  // Calculate Distribution KPIs (040)
  const distribution = calculateRiderDistribution(calcInput);
  
  // Calculate remaining KPIs (placeholders for now)
  const supervisors = calculateSupervisorKPIsPlaceholder();
  const recruitment = calculateRecruitmentKPIsPlaceholder();
  const termination = calculateTerminationKPIsPlaceholder();
  const reactivation = calculateReactivationKPIsPlaceholder();
  const dailyComments = calculateDailyCommentsKPIsPlaceholder();
  const growth = calculateGrowthKPIsPlaceholder();
  const forecast = calculateForecastKPIsPlaceholder();
  const dataQuality = calculateDataQualityKPIs(input);
  
  // Return complete output
  return {
    calculatedAt: new Date(),
    dateRange: input.dateRange,
    filters: input.filters ?? {},
    headcount,
    hours,
    orders,
    break: breakKPIs,
    late,
    attendance,
    lostHours,
    distribution,
    supervisors,
    recruitment,
    termination,
    reactivation,
    dailyComments,
    growth,
    forecast,
    dataQuality,
  };
}

// ============================================================================
// UTILITY EXPORTS
// ============================================================================

export type { KPIEngineInput, DailyPerformanceRecord };
export { calculateAllKPIs as default };
