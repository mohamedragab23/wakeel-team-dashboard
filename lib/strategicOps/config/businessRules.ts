/**
 * Strategic Operations Center - Business Rules Configuration
 * 
 * All operational thresholds and business rules are centralized here.
 * Modify these values to adjust system behavior without changing code.
 * 
 * @module BusinessRules
 * @version 1.0
 * @implements SRS-001, SRS-005
 */

// ═══════════════════════════════════════════════════════════════════════════
// ACTIVE RIDER DEFINITION (SRS-001 Section 8)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Unified Active Rider Definition
 * A rider is considered ACTIVE when ALL conditions are met.
 */
export const ACTIVE_RIDER_RULES = {
  /**
   * Minimum working hours to be considered active
   * @default 0 (must be > 0)
   */
  MIN_HOURS: 0,

  /**
   * Minimum orders to be considered active  
   * @default 0 (must be > 0)
   */
  MIN_ORDERS: 0,

  /**
   * Require BOTH hours > 0 AND orders > 0
   * @default true (as per SRS-001)
   */
  REQUIRE_BOTH_CONDITIONS: true,

  /**
   * Excluded statuses (rider cannot be active if status matches)
   */
  EXCLUDED_STATUSES: [
    'Terminated',
    'Inactive',
    'Medical Leave',
    'Long Vacation',
    'Suspended',
  ],
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// DATA QUALITY THRESHOLDS (SRS-003 Section 18)
// ═══════════════════════════════════════════════════════════════════════════

export const DATA_QUALITY_THRESHOLDS = {
  /**
   * Minimum data coverage % to enable strategic KPIs
   * Below this threshold, show warnings
   * @default 95 (as per SRS-004)
   */
  MIN_DATA_COVERAGE_PERCENT: 95,

  /**
   * Maximum acceptable Ghost Rider %
   * Above this threshold, show critical warning
   * @default 2 (as per SRS-004)
   */
  MAX_GHOST_RIDER_PERCENT: 2,

  /**
   * Maximum acceptable duplicate records %
   * @default 1
   */
  MAX_DUPLICATE_PERCENT: 1,

  /**
   * Maximum hours per day (validation)
   * @default 24
   */
  MAX_HOURS_PER_DAY: 24,

  /**
   * Maximum break minutes per day (validation)
   * @default 480 (8 hours)
   */
  MAX_BREAK_MINUTES_PER_DAY: 480,

  /**
   * Maximum late minutes per day (validation)
   * @default 240 (4 hours)
   */
  MAX_LATE_MINUTES_PER_DAY: 240,
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// OPERATIONAL TARGETS (SRS-003)
// ═══════════════════════════════════════════════════════════════════════════

export const OPERATIONAL_TARGETS = {
  /**
   * Fleet daily target hours (default)
   * Can be overridden per city/supervisor
   * @default 2200 (as per SRS-001)
   */
  DAILY_HOURS_TARGET: 2200,

  /**
   * Fleet daily baseline hours
   * @default 1500 (as per SRS-001)
   */
  DAILY_HOURS_BASELINE: 1500,

  /**
   * Expected daily hours per rider (for capacity calculations)
   * @default 10
   */
  EXPECTED_HOURS_PER_RIDER: 10,

  /**
   * Target utilization %
   * @default 75
   */
  TARGET_UTILIZATION_PERCENT: 75,

  /**
   * Target attendance %
   * @default 90
   */
  TARGET_ATTENDANCE_PERCENT: 90,

  /**
   * Minimum acceptable orders per hour
   * @default 0.8
   */
  MIN_ORDERS_PER_HOUR: 0.8,
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// PERFORMANCE THRESHOLDS (SRS-004 Section 18)
// ═══════════════════════════════════════════════════════════════════════════

export const PERFORMANCE_THRESHOLDS = {
  /**
   * Target achievement warning threshold
   * Below this %, show warning
   * @default 90
   */
  TARGET_ACHIEVEMENT_WARNING: 90,

  /**
   * Target achievement critical threshold
   * Below this %, show critical alert
   * @default 80
   */
  TARGET_ACHIEVEMENT_CRITICAL: 80,

  /**
   * Critical absence rate %
   * Above this %, trigger alert
   * @default 8
   */
  CRITICAL_ABSENCE_RATE: 8,

  /**
   * Maximum acceptable break minutes per day
   * @default 35
   */
  MAX_ACCEPTABLE_BREAK_MINUTES: 35,

  /**
   * High late threshold (minutes per day)
   * @default 20
   */
  HIGH_LATE_THRESHOLD_MINUTES: 20,

  /**
   * Minimum average rider hours per day
   * Below this, rider is underutilized
   * @default 6
   */
  MIN_AVERAGE_RIDER_HOURS: 6,

  /**
   * Critical low hours threshold
   * @default 4
   */
  CRITICAL_LOW_HOURS: 4,

  /**
   * Elite performer threshold (hours)
   * @default 8
   */
  ELITE_PERFORMER_HOURS: 8,
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// SUPERVISOR SCORE WEIGHTS (SRS-003 Section 10)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Supervisor Score Components (must sum to 1.0)
 * Configurable without code changes
 */
export const SUPERVISOR_SCORE_WEIGHTS = {
  TARGET_ACHIEVEMENT: 0.25,      // 25%
  UTILIZATION: 0.20,             // 20%
  ATTENDANCE: 0.15,              // 15%
  ORDERS_PER_HOUR: 0.10,         // 10%
  LOST_HOURS: 0.10,              // 10%
  RECRUITMENT: 0.05,             // 5%
  ATTRITION: 0.05,               // 5%
  REACTIVATION: 0.05,            // 5%
  DATA_QUALITY: 0.05,            // 5%
} as const;

// Validate weights sum to 1.0
const weightsSum = Object.values(SUPERVISOR_SCORE_WEIGHTS).reduce((a, b) => a + b, 0);
if (Math.abs(weightsSum - 1.0) > 0.001) {
  console.error(`[CONFIG ERROR] Supervisor score weights sum to ${weightsSum}, expected 1.0`);
}

// ═══════════════════════════════════════════════════════════════════════════
// HEALTH SCORE WEIGHTS (SRS-004 Section 6)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Operations Health Score Components (must sum to 1.0)
 */
export const HEALTH_SCORE_WEIGHTS = {
  TARGET_ACHIEVEMENT: 0.20,      // 20%
  RIDER_UTILIZATION: 0.15,       // 15%
  ACTIVE_RIDER_RATE: 0.15,       // 15%
  LOST_HOURS: 0.10,              // 10%
  ATTENDANCE: 0.10,              // 10%
  RECRUITMENT_HEALTH: 0.10,      // 10%
  ATTRITION: 0.08,               // 8%
  SUPERVISOR_PERFORMANCE: 0.07,  // 7%
  ORDERS_PER_HOUR: 0.03,         // 3%
  DATA_QUALITY: 0.02,            // 2%
} as const;

// Validate weights sum to 1.0
const healthWeightsSum = Object.values(HEALTH_SCORE_WEIGHTS).reduce((a, b) => a + b, 0);
if (Math.abs(healthWeightsSum - 1.0) > 0.001) {
  console.error(`[CONFIG ERROR] Health score weights sum to ${healthWeightsSum}, expected 1.0`);
}

// ═══════════════════════════════════════════════════════════════════════════
// ALERT THRESHOLDS (SRS-004 Section 12)
// ═══════════════════════════════════════════════════════════════════════════

export const ALERT_THRESHOLDS = {
  /**
   * Critical: Missing data upload
   * Show alert if no data for N days
   * @default 1
   */
  MISSING_UPLOAD_ALERT_DAYS: 1,

  /**
   * Warning: Medical leave increase threshold
   * @default 15 (%)
   */
  MEDICAL_LEAVE_INCREASE_WARNING: 15,

  /**
   * Warning: Supervisor consecutive target miss
   * @default 3 (weeks)
   */
  SUPERVISOR_TARGET_MISS_WEEKS: 3,

  /**
   * Opportunity: Break reduction potential (minutes)
   * @default 10
   */
  BREAK_REDUCTION_OPPORTUNITY_MINUTES: 10,

  /**
   * Critical: Absence rate increase
   * @default 18 (%)
   */
  ABSENCE_INCREASE_CRITICAL: 18,
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// FORECAST SETTINGS (SRS-004 Section 11)
// ═══════════════════════════════════════════════════════════════════════════

export const FORECAST_SETTINGS = {
  /**
   * Rolling average window (days)
   * @default 7
   */
  ROLLING_AVERAGE_WINDOW_DAYS: 7,

  /**
   * Minimum data points required for forecast
   * @default 5
   */
  MIN_DATA_POINTS_FOR_FORECAST: 5,

  /**
   * Confidence threshold for reliable forecast
   * @default 0.7 (70%)
   */
  MIN_FORECAST_CONFIDENCE: 0.7,

  /**
   * Forecast horizon (days)
   * @default 30
   */
  MAX_FORECAST_HORIZON_DAYS: 30,
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// RIDER CLASSIFICATION THRESHOLDS (SRS-004 Section 8)
// ═══════════════════════════════════════════════════════════════════════════

export const RIDER_CLASSIFICATION = {
  /**
   * Elite: Top performers
   * Hours >= this threshold
   * @default 8
   */
  ELITE_MIN_HOURS: 8,

  /**
   * Champion: High performers
   * Hours >= this threshold
   * @default 7
   */
  CHAMPION_MIN_HOURS: 7,

  /**
   * Stable: Consistent performers
   * Hours >= this threshold
   * @default 6
   */
  STABLE_MIN_HOURS: 6,

  /**
   * Underutilized: Below target
   * Hours < this threshold
   * @default 6
   */
  UNDERUTILIZED_MAX_HOURS: 6,

  /**
   * High Risk: Very low performance
   * Hours < this threshold
   * @default 4
   */
  HIGH_RISK_MAX_HOURS: 4,

  /**
   * Critical: Near-zero performance
   * Hours < this threshold
   * @default 2
   */
  CRITICAL_MAX_HOURS: 2,

  /**
   * Inactive: No activity
   * Hours = 0 AND Orders = 0
   */
  INACTIVE_HOURS: 0,
  INACTIVE_ORDERS: 0,
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// RECOMMENDATION PRIORITIES (SRS-004 Section 15)
// ═══════════════════════════════════════════════════════════════════════════

export const RECOMMENDATION_PRIORITIES = {
  /**
   * Minimum expected hours recovery for "high priority"
   * @default 50
   */
  HIGH_PRIORITY_HOURS_THRESHOLD: 50,

  /**
   * Minimum affected riders for "high priority"
   * @default 10
   */
  HIGH_PRIORITY_RIDERS_THRESHOLD: 10,

  /**
   * Business impact multiplier for urgent actions
   * @default 2.0
   */
  URGENT_ACTION_MULTIPLIER: 2.0,

  /**
   * Confidence threshold for recommendations
   * @default 0.6 (60%)
   */
  MIN_RECOMMENDATION_CONFIDENCE: 0.6,
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get active rider status
 * Centralized logic for consistent definition across system
 */
export function isRiderActiveByRules(
  hours: number,
  orders: number,
  status?: string
): boolean {
  // Check excluded statuses
  if (status && ACTIVE_RIDER_RULES.EXCLUDED_STATUSES.includes(status)) {
    return false;
  }

  // Check hours and orders conditions
  if (ACTIVE_RIDER_RULES.REQUIRE_BOTH_CONDITIONS) {
    return hours > ACTIVE_RIDER_RULES.MIN_HOURS && orders > ACTIVE_RIDER_RULES.MIN_ORDERS;
  }

  return hours > ACTIVE_RIDER_RULES.MIN_HOURS || orders > ACTIVE_RIDER_RULES.MIN_ORDERS;
}

/**
 * Validate configuration on load
 */
export function validateConfiguration(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate supervisor score weights
  const supWeightsSum = Object.values(SUPERVISOR_SCORE_WEIGHTS).reduce((a, b) => a + b, 0);
  if (Math.abs(supWeightsSum - 1.0) > 0.001) {
    errors.push(`Supervisor score weights sum to ${supWeightsSum}, expected 1.0`);
  }

  // Validate health score weights
  const healthWeightsSum = Object.values(HEALTH_SCORE_WEIGHTS).reduce((a, b) => a + b, 0);
  if (Math.abs(healthWeightsSum - 1.0) > 0.001) {
    errors.push(`Health score weights sum to ${healthWeightsSum}, expected 1.0`);
  }

  // Validate thresholds are positive
  if (DATA_QUALITY_THRESHOLDS.MIN_DATA_COVERAGE_PERCENT < 0 || DATA_QUALITY_THRESHOLDS.MIN_DATA_COVERAGE_PERCENT > 100) {
    errors.push('MIN_DATA_COVERAGE_PERCENT must be between 0 and 100');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// Validate on module load
const validation = validateConfiguration();
if (!validation.valid) {
  console.error('[STRATEGIC OPS CONFIG] Configuration errors detected:', validation.errors);
}
