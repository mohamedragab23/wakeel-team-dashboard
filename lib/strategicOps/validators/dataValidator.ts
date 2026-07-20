/**
 * Strategic Operations Center - Data Validation Engine
 * 
 * Validates all incoming data before KPI calculations.
 * Implements SRS-001 Section 11 (Data Validation)
 * 
 * @module DataValidationEngine
 * @version 1.0
 * @implements SRS-001, SRS-005
 */

import { DATA_QUALITY_THRESHOLDS } from '../config/businessRules';
import { normalizeRiderCodeForPerformance } from '@/lib/dataFilter';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type ValidationSeverity = 'info' | 'warning' | 'error' | 'critical';

export type ValidationIssue = {
  severity: ValidationSeverity;
  category: string;
  message: string;
  affectedRecords: number;
  details?: Record<string, unknown>;
  recommendation?: string;
};

export type ValidationReport = {
  valid: boolean;
  timestamp: string;
  totalRecords: number;
  validRecords: number;
  invalidRecords: number;
  qualityScore: number; // 0-100
  issues: ValidationIssue[];
  summary: {
    duplicates: number;
    ghostRiders: number;
    invalidHours: number;
    invalidOrders: number;
    missingDates: number;
    missingSupervisors: number;
    invalidBreaks: number;
    invalidLate: number;
  };
};

export type DailyPerformanceRecord = {
  date: string;
  riderCode: string;
  hours: number;
  orders: number;
  breakMinutes?: number;
  delayMinutes?: number;
  supervisorCode?: string;
};

export type RiderMasterRecord = {
  code: string;
  name: string;
  supervisorCode?: string;
  supervisorName?: string;
  status?: string;
  city?: string;
  zone?: string;
  joinDate?: string;
};

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION ENGINE
// ═══════════════════════════════════════════════════════════════════════════

export class DataValidationEngine {
  private issues: ValidationIssue[] = [];
  private totalRecords = 0;
  private validRecords = 0;

  /**
   * Validate complete dataset
   */
  validate(
    dailyPerformance: DailyPerformanceRecord[],
    riderMaster: RiderMasterRecord[],
    expectedDateRange: { start: string; end: string }
  ): ValidationReport {
    this.issues = [];
    this.totalRecords = dailyPerformance.length;
    this.validRecords = 0;

    const summary = {
      duplicates: 0,
      ghostRiders: 0,
      invalidHours: 0,
      invalidOrders: 0,
      missingDates: 0,
      missingSupervisors: 0,
      invalidBreaks: 0,
      invalidLate: 0,
    };

    // Step 1: Validate duplicates
    summary.duplicates = this.validateDuplicates(dailyPerformance);

    // Step 2: Validate Ghost Riders
    summary.ghostRiders = this.validateGhostRiders(dailyPerformance, riderMaster);

    // Step 3: Validate hours
    summary.invalidHours = this.validateHours(dailyPerformance);

    // Step 4: Validate orders
    summary.invalidOrders = this.validateOrders(dailyPerformance);

    // Step 5: Validate breaks
    summary.invalidBreaks = this.validateBreaks(dailyPerformance);

    // Step 6: Validate late minutes
    summary.invalidLate = this.validateLateMinutes(dailyPerformance);

    // Step 7: Validate missing dates
    summary.missingDates = this.validateDateCoverage(dailyPerformance, expectedDateRange);

    // Step 8: Validate supervisors
    summary.missingSupervisors = this.validateSupervisors(dailyPerformance, riderMaster);

    // Step 9: Calculate quality score
    const qualityScore = this.calculateQualityScore(summary);

    // Step 10: Determine validity
    const valid = qualityScore >= DATA_QUALITY_THRESHOLDS.MIN_DATA_COVERAGE_PERCENT;

    this.validRecords = this.totalRecords - (
      summary.duplicates +
      summary.invalidHours +
      summary.invalidOrders +
      summary.invalidBreaks +
      summary.invalidLate
    );

    return {
      valid,
      timestamp: new Date().toISOString(),
      totalRecords: this.totalRecords,
      validRecords: this.validRecords,
      invalidRecords: this.totalRecords - this.validRecords,
      qualityScore,
      issues: this.issues.sort((a, b) => this.severityWeight(b.severity) - this.severityWeight(a.severity)),
      summary,
    };
  }

  /**
   * Validate duplicate daily records
   */
  private validateDuplicates(records: DailyPerformanceRecord[]): number {
    const seen = new Set<string>();
    let duplicates = 0;
    const duplicateKeys: string[] = [];

    for (const rec of records) {
      const norm = normalizeRiderCodeForPerformance(rec.riderCode);
      const key = `${rec.date}|${norm}`;
      
      if (seen.has(key)) {
        duplicates++;
        if (duplicateKeys.length < 10) {
          duplicateKeys.push(key);
        }
      } else {
        seen.add(key);
      }
    }

    if (duplicates > 0) {
      const percent = (duplicates / this.totalRecords) * 100;
      this.issues.push({
        severity: percent > DATA_QUALITY_THRESHOLDS.MAX_DUPLICATE_PERCENT ? 'error' : 'warning',
        category: 'Duplicate Records',
        message: `Found ${duplicates} duplicate daily records (${percent.toFixed(2)}%)`,
        affectedRecords: duplicates,
        details: { examples: duplicateKeys.slice(0, 5) },
        recommendation: 'Remove duplicate records from البيانات اليومية sheet. Same rider cannot have multiple records for the same date.',
      });
    }

    return duplicates;
  }

  /**
   * Validate Ghost Riders (in daily performance but not in rider master)
   */
  private validateGhostRiders(
    performance: DailyPerformanceRecord[],
    master: RiderMasterRecord[]
  ): number {
    const masterCodes = new Set(
      master.map(r => normalizeRiderCodeForPerformance(r.code)).filter(Boolean)
    );

    const ghostRiders = new Set<string>();
    const examples: string[] = [];

    for (const rec of performance) {
      const norm = normalizeRiderCodeForPerformance(rec.riderCode);
      if (norm && !masterCodes.has(norm)) {
        ghostRiders.add(rec.riderCode);
        if (examples.length < 10) {
          examples.push(rec.riderCode);
        }
      }
    }

    const ghostCount = ghostRiders.size;

    if (ghostCount > 0) {
      const percent = (ghostCount / master.length) * 100;
      this.issues.push({
        severity: percent > DATA_QUALITY_THRESHOLDS.MAX_GHOST_RIDER_PERCENT ? 'critical' : 'warning',
        category: 'Ghost Riders',
        message: `Found ${ghostCount} ghost riders (${percent.toFixed(2)}% of master roster)`,
        affectedRecords: ghostCount,
        details: { examples: examples.slice(0, 5) },
        recommendation: 'Add missing riders to المناديب sheet or remove their records from البيانات اليومية.',
      });
    }

    return ghostCount;
  }

  /**
   * Validate working hours
   */
  private validateHours(records: DailyPerformanceRecord[]): number {
    let invalid = 0;
    const examples: string[] = [];

    for (const rec of records) {
      if (rec.hours < 0 || rec.hours > DATA_QUALITY_THRESHOLDS.MAX_HOURS_PER_DAY) {
        invalid++;
        if (examples.length < 5) {
          examples.push(`${rec.riderCode} on ${rec.date}: ${rec.hours}h`);
        }
      }
    }

    if (invalid > 0) {
      this.issues.push({
        severity: 'error',
        category: 'Invalid Hours',
        message: `Found ${invalid} records with invalid hours (< 0 or > ${DATA_QUALITY_THRESHOLDS.MAX_HOURS_PER_DAY})`,
        affectedRecords: invalid,
        details: { examples },
        recommendation: 'Correct hours values in البيانات اليومية. Hours must be between 0 and 24.',
      });
    }

    return invalid;
  }

  /**
   * Validate orders
   */
  private validateOrders(records: DailyPerformanceRecord[]): number {
    let invalid = 0;
    const examples: string[] = [];

    for (const rec of records) {
      if (rec.orders < 0) {
        invalid++;
        if (examples.length < 5) {
          examples.push(`${rec.riderCode} on ${rec.date}: ${rec.orders} orders`);
        }
      }
    }

    if (invalid > 0) {
      this.issues.push({
        severity: 'error',
        category: 'Invalid Orders',
        message: `Found ${invalid} records with negative orders`,
        affectedRecords: invalid,
        details: { examples },
        recommendation: 'Correct orders values in البيانات اليومية. Orders cannot be negative.',
      });
    }

    return invalid;
  }

  /**
   * Validate break minutes
   */
  private validateBreaks(records: DailyPerformanceRecord[]): number {
    let invalid = 0;
    const examples: string[] = [];

    for (const rec of records) {
      if (rec.breakMinutes !== undefined) {
        if (rec.breakMinutes < 0 || rec.breakMinutes > DATA_QUALITY_THRESHOLDS.MAX_BREAK_MINUTES_PER_DAY) {
          invalid++;
          if (examples.length < 5) {
            examples.push(`${rec.riderCode} on ${rec.date}: ${rec.breakMinutes}min`);
          }
        }
      }
    }

    if (invalid > 0) {
      this.issues.push({
        severity: 'warning',
        category: 'Invalid Break Minutes',
        message: `Found ${invalid} records with invalid break minutes`,
        affectedRecords: invalid,
        details: { examples },
        recommendation: `Correct break values. Break minutes must be between 0 and ${DATA_QUALITY_THRESHOLDS.MAX_BREAK_MINUTES_PER_DAY}.`,
      });
    }

    return invalid;
  }

  /**
   * Validate late minutes
   */
  private validateLateMinutes(records: DailyPerformanceRecord[]): number {
    let invalid = 0;
    const examples: string[] = [];

    for (const rec of records) {
      if (rec.delayMinutes !== undefined) {
        if (rec.delayMinutes < 0 || rec.delayMinutes > DATA_QUALITY_THRESHOLDS.MAX_LATE_MINUTES_PER_DAY) {
          invalid++;
          if (examples.length < 5) {
            examples.push(`${rec.riderCode} on ${rec.date}: ${rec.delayMinutes}min`);
          }
        }
      }
    }

    if (invalid > 0) {
      this.issues.push({
        severity: 'warning',
        category: 'Invalid Late Minutes',
        message: `Found ${invalid} records with invalid late minutes`,
        affectedRecords: invalid,
        details: { examples },
        recommendation: `Correct late values. Late minutes must be between 0 and ${DATA_QUALITY_THRESHOLDS.MAX_LATE_MINUTES_PER_DAY}.`,
      });
    }

    return invalid;
  }

  /**
   * Validate date coverage
   */
  private validateDateCoverage(
    records: DailyPerformanceRecord[],
    expectedRange: { start: string; end: string }
  ): number {
    const dates = new Set(records.map(r => r.date));
    const expectedDates = this.enumerateDates(expectedRange.start, expectedRange.end);
    const missing = expectedDates.filter(d => !dates.has(d));

    if (missing.length > 0) {
      const coveragePercent = ((expectedDates.length - missing.length) / expectedDates.length) * 100;
      this.issues.push({
        severity: missing.length > expectedDates.length * 0.1 ? 'critical' : 'warning',
        category: 'Missing Dates',
        message: `Missing data for ${missing.length} days (${coveragePercent.toFixed(1)}% coverage)`,
        affectedRecords: missing.length,
        details: { missingDates: missing.slice(0, 10) },
        recommendation: 'Upload missing daily performance data to البيانات اليومية sheet.',
      });
    }

    return missing.length;
  }

  /**
   * Validate supervisor assignments
   */
  private validateSupervisors(
    performance: DailyPerformanceRecord[],
    master: RiderMasterRecord[]
  ): number {
    const masterMap = new Map(
      master.map(r => [normalizeRiderCodeForPerformance(r.code), r])
    );

    let missing = 0;
    const examples: string[] = [];

    for (const rec of performance) {
      const norm = normalizeRiderCodeForPerformance(rec.riderCode);
      const rider = norm ? masterMap.get(norm) : undefined;
      
      if (rider && !rider.supervisorCode) {
        missing++;
        if (examples.length < 10) {
          examples.push(rec.riderCode);
        }
      }
    }

    if (missing > 0) {
      this.issues.push({
        severity: 'warning',
        category: 'Missing Supervisors',
        message: `Found ${missing} riders without supervisor assignment`,
        affectedRecords: missing,
        details: { examples: examples.slice(0, 5) },
        recommendation: 'Assign supervisors to all riders in المناديب sheet.',
      });
    }

    return missing;
  }

  /**
   * Calculate overall quality score
   */
  private calculateQualityScore(summary: ValidationReport['summary']): number {
    const totalIssues = 
      summary.duplicates * 2 +      // Duplicates are serious
      summary.ghostRiders * 3 +      // Ghost riders are very serious
      summary.invalidHours * 2 +     // Invalid hours are serious
      summary.invalidOrders * 2 +    // Invalid orders are serious
      summary.missingDates * 1 +     // Missing dates affect accuracy
      summary.missingSupervisors * 0.5 + // Missing supervisors are less critical
      summary.invalidBreaks * 0.5 +  // Invalid breaks are less critical
      summary.invalidLate * 0.5;     // Invalid late are less critical

    const maxPossibleIssues = this.totalRecords * 2; // Assume worst case
    const score = Math.max(0, Math.min(100, 100 - (totalIssues / maxPossibleIssues) * 100));

    return Math.round(score);
  }

  /**
   * Enumerate all dates in range
   */
  private enumerateDates(start: string, end: string): string[] {
    const dates: string[] = [];
    const current = new Date(start + 'T00:00:00');
    const endDate = new Date(end + 'T00:00:00');

    while (current <= endDate) {
      dates.push(current.toISOString().split('T')[0]);
      current.setDate(current.getDate() + 1);
    }

    return dates;
  }

  /**
   * Get severity weight for sorting
   */
  private severityWeight(severity: ValidationSeverity): number {
    switch (severity) {
      case 'critical': return 4;
      case 'error': return 3;
      case 'warning': return 2;
      case 'info': return 1;
      default: return 0;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT SINGLETON
// ═══════════════════════════════════════════════════════════════════════════

export const validationEngine = new DataValidationEngine();
