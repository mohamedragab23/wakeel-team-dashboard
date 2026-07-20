/**
 * KPI Calculators - Part 2
 * Break, Late, Attendance, Lost Hours, Distribution
 * 
 * Implements SRS-003 Sections 5-9
 * 
 * @module KPICalculatorsPart2
 * @version 1.0
 */

import { createKPIValue, createKPI, type KPI, type BreakKPIs, type LateKPIs, type AttendanceKPIs, type LostHoursKPIs, type DistributionKPIs, type RiderDistributionBucket, type LostHoursCategoryBreakdown } from './types';
import type { DailyPerformanceRecord, KPICalculationInput } from './calculators';

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function sum(arr: number[]): number {
  return arr.reduce((total, val) => total + val, 0);
}

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((sum, val) => sum + val, 0) / arr.length;
}

// ============================================================================
// BREAK KPI CALCULATORS (024-028)
// ============================================================================

/**
 * KPI 024: Total Break Minutes
 */
export function calculateTotalBreakMinutes(
  input: KPICalculationInput
): KPI {
  const current = sum(input.dailyRecords.map(r => r.breakMinutes));
  const previous = input.previousPeriod
    ? sum(input.previousPeriod.dailyRecords.map(r => r.breakMinutes))
    : null;
  
  return {
    id: 'KPI_024',
    name: 'Total Break Minutes',
    nameAr: 'إجمالي دقائق الاستراحة',
    category: 'break',
    value: createKPIValue(current, previous),
    format: 'minutes',
    formula: 'SUM(Break Minutes)',
  };
}

/**
 * KPI 025: Average Break
 */
export function calculateAverageBreak(
  totalBreakMinutes: number,
  uploadedDays: number,
  previousValues?: { totalBreakMinutes: number; uploadedDays: number }
): KPI {
  const current = uploadedDays > 0
    ? totalBreakMinutes / uploadedDays
    : 0;
  
  const previous = previousValues && previousValues.uploadedDays > 0
    ? previousValues.totalBreakMinutes / previousValues.uploadedDays
    : null;
  
  return {
    id: 'KPI_025',
    name: 'Average Break',
    nameAr: 'متوسط الاستراحة',
    category: 'break',
    value: createKPIValue(current, previous),
    format: 'minutes',
    formula: 'Total Break Minutes / Uploaded Days',
  };
}

/**
 * KPI 026: Break Per Rider
 */
export function calculateBreakPerRider(
  totalBreakMinutes: number,
  averageDailyWorkingRiders: number,
  previousValues?: { totalBreakMinutes: number; averageDailyWorkingRiders: number }
): KPI {
  const current = averageDailyWorkingRiders > 0
    ? totalBreakMinutes / averageDailyWorkingRiders
    : 0;
  
  const previous = previousValues && previousValues.averageDailyWorkingRiders > 0
    ? previousValues.totalBreakMinutes / previousValues.averageDailyWorkingRiders
    : null;
  
  return {
    id: 'KPI_026',
    name: 'Break Per Rider',
    nameAr: 'الاستراحة لكل مندوب',
    category: 'break',
    value: createKPIValue(current, previous),
    format: 'minutes',
    formula: 'Total Break Minutes / Average Working Riders',
  };
}

/**
 * KPI 027: Break %
 */
export function calculateBreakPercent(
  totalBreakMinutes: number,
  totalWorkingHours: number,
  previousValues?: { totalBreakMinutes: number; totalWorkingHours: number }
): KPI {
  const totalWorkingMinutes = totalWorkingHours * 60;
  const current = totalWorkingMinutes > 0
    ? (totalBreakMinutes / totalWorkingMinutes) * 100
    : 0;
  
  let previous: number | null = null;
  if (previousValues) {
    const prevWorkingMinutes = previousValues.totalWorkingHours * 60;
    previous = prevWorkingMinutes > 0
      ? (previousValues.totalBreakMinutes / prevWorkingMinutes) * 100
      : null;
  }
  
  return {
    id: 'KPI_027',
    name: 'Break %',
    nameAr: 'نسبة الاستراحة',
    category: 'break',
    value: createKPIValue(current, previous),
    format: 'percent',
    formula: 'Break Minutes / Working Minutes',
  };
}

/**
 * KPI 028: Estimated Lost Hours Due to Break
 */
export function calculateEstimatedLostHoursDueToBreak(
  totalBreakMinutes: number,
  previousTotalBreakMinutes?: number
): KPI {
  const current = totalBreakMinutes / 60;
  const previous = previousTotalBreakMinutes !== undefined
    ? previousTotalBreakMinutes / 60
    : null;
  
  return {
    id: 'KPI_028',
    name: 'Estimated Lost Hours Due to Break',
    nameAr: 'الساعات الضائعة بسبب الاستراحة',
    category: 'break',
    value: createKPIValue(current, previous),
    format: 'hours',
    formula: 'Break Minutes / 60',
  };
}

/**
 * Calculate all Break KPIs
 */
export function calculateBreakKPIs(
  input: KPICalculationInput,
  totalWorkingHours: number,
  averageDailyWorkingRiders: number
): BreakKPIs {
  const totalBreakMinutes = calculateTotalBreakMinutes(input);
  
  const averageBreak = calculateAverageBreak(
    totalBreakMinutes.value.current,
    input.dateRange.uploadedDays,
    input.previousPeriod ? {
      totalBreakMinutes: totalBreakMinutes.value.previous ?? 0,
      uploadedDays: input.dateRange.uploadedDays,
    } : undefined
  );
  
  const breakPerRider = calculateBreakPerRider(
    totalBreakMinutes.value.current,
    averageDailyWorkingRiders,
    input.previousPeriod ? {
      totalBreakMinutes: totalBreakMinutes.value.previous ?? 0,
      averageDailyWorkingRiders,
    } : undefined
  );
  
  const breakPercent = calculateBreakPercent(
    totalBreakMinutes.value.current,
    totalWorkingHours,
    input.previousPeriod ? {
      totalBreakMinutes: totalBreakMinutes.value.previous ?? 0,
      totalWorkingHours,
    } : undefined
  );
  
  const estimatedLostHoursDueToBreak = calculateEstimatedLostHoursDueToBreak(
    totalBreakMinutes.value.current,
    totalBreakMinutes.value.previous ?? undefined
  );
  
  return {
    totalBreakMinutes,
    averageBreak,
    breakPerRider,
    breakPercent,
    estimatedLostHoursDueToBreak,
  };
}

// ============================================================================
// LATE KPI CALCULATORS (029-032)
// ============================================================================

/**
 * KPI 029: Total Late Minutes
 */
export function calculateTotalLateMinutes(
  input: KPICalculationInput
): KPI {
  const current = sum(input.dailyRecords.map(r => r.lateMinutes));
  const previous = input.previousPeriod
    ? sum(input.previousPeriod.dailyRecords.map(r => r.lateMinutes))
    : null;
  
  return {
    id: 'KPI_029',
    name: 'Total Late Minutes',
    nameAr: 'إجمالي دقائق التأخير',
    category: 'late',
    value: createKPIValue(current, previous),
    format: 'minutes',
    formula: 'SUM(Late Minutes)',
  };
}

/**
 * KPI 030: Average Late Minutes
 */
export function calculateAverageLateMinutes(
  totalLateMinutes: number,
  uploadedDays: number,
  previousValues?: { totalLateMinutes: number; uploadedDays: number }
): KPI {
  const current = uploadedDays > 0
    ? totalLateMinutes / uploadedDays
    : 0;
  
  const previous = previousValues && previousValues.uploadedDays > 0
    ? previousValues.totalLateMinutes / previousValues.uploadedDays
    : null;
  
  return {
    id: 'KPI_030',
    name: 'Average Late Minutes',
    nameAr: 'متوسط دقائق التأخير',
    category: 'late',
    value: createKPIValue(current, previous),
    format: 'minutes',
    formula: 'Total Late Minutes / Uploaded Days',
  };
}

/**
 * KPI 031: Late %
 */
export function calculateLatePercent(
  totalLateMinutes: number,
  totalWorkingHours: number,
  previousValues?: { totalLateMinutes: number; totalWorkingHours: number }
): KPI {
  const totalWorkingMinutes = totalWorkingHours * 60;
  const current = totalWorkingMinutes > 0
    ? (totalLateMinutes / totalWorkingMinutes) * 100
    : 0;
  
  let previous: number | null = null;
  if (previousValues) {
    const prevWorkingMinutes = previousValues.totalWorkingHours * 60;
    previous = prevWorkingMinutes > 0
      ? (previousValues.totalLateMinutes / prevWorkingMinutes) * 100
      : null;
  }
  
  return {
    id: 'KPI_031',
    name: 'Late %',
    nameAr: 'نسبة التأخير',
    category: 'late',
    value: createKPIValue(current, previous),
    format: 'percent',
    formula: 'Late Minutes / Working Minutes',
  };
}

/**
 * KPI 032: Estimated Lost Hours Due to Late
 */
export function calculateEstimatedLostHoursDueToLate(
  totalLateMinutes: number,
  previousTotalLateMinutes?: number
): KPI {
  const current = totalLateMinutes / 60;
  const previous = previousTotalLateMinutes !== undefined
    ? previousTotalLateMinutes / 60
    : null;
  
  return {
    id: 'KPI_032',
    name: 'Estimated Lost Hours Due to Late',
    nameAr: 'الساعات الضائعة بسبب التأخير',
    category: 'late',
    value: createKPIValue(current, previous),
    format: 'hours',
    formula: 'Late Minutes / 60',
  };
}

/**
 * Calculate all Late KPIs
 */
export function calculateLateKPIs(
  input: KPICalculationInput,
  totalWorkingHours: number
): LateKPIs {
  const totalLateMinutes = calculateTotalLateMinutes(input);
  
  const averageLateMinutes = calculateAverageLateMinutes(
    totalLateMinutes.value.current,
    input.dateRange.uploadedDays,
    input.previousPeriod ? {
      totalLateMinutes: totalLateMinutes.value.previous ?? 0,
      uploadedDays: input.dateRange.uploadedDays,
    } : undefined
  );
  
  const latePercent = calculateLatePercent(
    totalLateMinutes.value.current,
    totalWorkingHours,
    input.previousPeriod ? {
      totalLateMinutes: totalLateMinutes.value.previous ?? 0,
      totalWorkingHours,
    } : undefined
  );
  
  const estimatedLostHoursDueToLate = calculateEstimatedLostHoursDueToLate(
    totalLateMinutes.value.current,
    totalLateMinutes.value.previous ?? undefined
  );
  
  return {
    totalLateMinutes,
    averageLateMinutes,
    latePercent,
    estimatedLostHoursDueToLate,
  };
}

// ============================================================================
// ATTENDANCE KPI CALCULATORS (033-037)
// ============================================================================

/**
 * KPI 033: Total Absence
 */
export function calculateTotalAbsence(
  input: KPICalculationInput
): KPI {
  const current = input.dailyRecords.filter(r => r.absence).length;
  const previous = input.previousPeriod
    ? input.previousPeriod.dailyRecords.filter(r => r.absence).length
    : null;
  
  return {
    id: 'KPI_033',
    name: 'Total Absence',
    nameAr: 'إجمالي الغياب',
    category: 'attendance',
    value: createKPIValue(current, previous),
    format: 'number',
    formula: 'COUNT WHERE absence = true',
  };
}

/**
 * KPI 034: Absence %
 */
export function calculateAbsencePercent(
  totalAbsence: number,
  totalRecords: number,
  previousValues?: { totalAbsence: number; totalRecords: number }
): KPI {
  const current = totalRecords > 0
    ? (totalAbsence / totalRecords) * 100
    : 0;
  
  const previous = previousValues && previousValues.totalRecords > 0
    ? (previousValues.totalAbsence / previousValues.totalRecords) * 100
    : null;
  
  return {
    id: 'KPI_034',
    name: 'Absence %',
    nameAr: 'نسبة الغياب',
    category: 'attendance',
    value: createKPIValue(current, previous),
    format: 'percent',
    formula: 'Total Absence / Total Records',
  };
}

/**
 * KPI 035: Working Days
 */
export function calculateWorkingDays(
  input: KPICalculationInput
): KPI {
  const current = input.dateRange.uploadedDays;
  const previous = input.previousPeriod
    ? input.dateRange.uploadedDays // TODO: Track previous uploaded days
    : null;
  
  return {
    id: 'KPI_035',
    name: 'Working Days',
    nameAr: 'أيام العمل',
    category: 'attendance',
    value: createKPIValue(current, previous),
    format: 'days',
    formula: 'Uploaded Days',
  };
}

/**
 * KPI 036: Attendance %
 */
export function calculateAttendancePercent(
  totalRecords: number,
  totalAbsence: number,
  previousValues?: { totalRecords: number; totalAbsence: number }
): KPI {
  const workingRecords = totalRecords - totalAbsence;
  const current = totalRecords > 0
    ? (workingRecords / totalRecords) * 100
    : 0;
  
  let previous: number | null = null;
  if (previousValues) {
    const prevWorkingRecords = previousValues.totalRecords - previousValues.totalAbsence;
    previous = previousValues.totalRecords > 0
      ? (prevWorkingRecords / previousValues.totalRecords) * 100
      : null;
  }
  
  return {
    id: 'KPI_036',
    name: 'Attendance %',
    nameAr: 'نسبة الحضور',
    category: 'attendance',
    value: createKPIValue(current, previous),
    format: 'percent',
    formula: '(Total Records - Total Absence) / Total Records',
  };
}

/**
 * KPI 037: Average Attendance
 */
export function calculateAverageAttendance(
  totalRecords: number,
  totalAbsence: number,
  uploadedDays: number,
  previousValues?: { totalRecords: number; totalAbsence: number; uploadedDays: number }
): KPI {
  const workingRecords = totalRecords - totalAbsence;
  const current = uploadedDays > 0
    ? workingRecords / uploadedDays
    : 0;
  
  let previous: number | null = null;
  if (previousValues && previousValues.uploadedDays > 0) {
    const prevWorkingRecords = previousValues.totalRecords - previousValues.totalAbsence;
    previous = prevWorkingRecords / previousValues.uploadedDays;
  }
  
  return {
    id: 'KPI_037',
    name: 'Average Attendance',
    nameAr: 'متوسط الحضور',
    category: 'attendance',
    value: createKPIValue(current, previous),
    format: 'decimal',
    formula: '(Total Records - Total Absence) / Uploaded Days',
  };
}

/**
 * Calculate all Attendance KPIs
 */
export function calculateAttendanceKPIs(
  input: KPICalculationInput
): AttendanceKPIs {
  const totalAbsence = calculateTotalAbsence(input);
  const totalRecords = input.dailyRecords.length;
  
  const absencePercent = calculateAbsencePercent(
    totalAbsence.value.current,
    totalRecords,
    input.previousPeriod ? {
      totalAbsence: totalAbsence.value.previous ?? 0,
      totalRecords: input.previousPeriod.dailyRecords.length,
    } : undefined
  );
  
  const workingDays = calculateWorkingDays(input);
  
  const attendancePercent = calculateAttendancePercent(
    totalRecords,
    totalAbsence.value.current,
    input.previousPeriod ? {
      totalRecords: input.previousPeriod.dailyRecords.length,
      totalAbsence: totalAbsence.value.previous ?? 0,
    } : undefined
  );
  
  const averageAttendance = calculateAverageAttendance(
    totalRecords,
    totalAbsence.value.current,
    input.dateRange.uploadedDays,
    input.previousPeriod ? {
      totalRecords: input.previousPeriod.dailyRecords.length,
      totalAbsence: totalAbsence.value.previous ?? 0,
      uploadedDays: input.dateRange.uploadedDays,
    } : undefined
  );
  
  return {
    totalAbsence,
    absencePercent,
    workingDays,
    attendancePercent,
    averageAttendance,
  };
}

// ============================================================================
// LOST HOURS KPI CALCULATORS (038-039 + breakdown)
// ============================================================================

/**
 * Calculate Lost Hours Category Breakdown
 * TODO: Requires daily comments integration
 */
export function calculateLostHoursCategoryBreakdown(
  input: KPICalculationInput
): LostHoursCategoryBreakdown[] {
  // Placeholder: Will be implemented with daily comments integration
  const breakLostHours = sum(input.dailyRecords.map(r => r.breakMinutes)) / 60;
  const lateLostHours = sum(input.dailyRecords.map(r => r.lateMinutes)) / 60;
  
  return [
    {
      category: 'break',
      categoryAr: 'استراحة',
      hours: breakLostHours,
      percent: 0, // TODO: Calculate
      trend: 'stable',
      financialLoss: 0, // TODO: Calculate
      ordersLost: 0, // TODO: Calculate
    },
    {
      category: 'late',
      categoryAr: 'تأخير',
      hours: lateLostHours,
      percent: 0, // TODO: Calculate
      trend: 'stable',
      financialLoss: 0, // TODO: Calculate
      ordersLost: 0, // TODO: Calculate
    },
  ];
}

/**
 * KPI 038: Total Lost Hours
 */
export function calculateTotalLostHours(
  categoryBreakdown: LostHoursCategoryBreakdown[]
): KPI {
  const current = sum(categoryBreakdown.map(c => c.hours));
  
  return {
    id: 'KPI_038',
    name: 'Total Lost Hours',
    nameAr: 'إجمالي الساعات الضائعة',
    category: 'lost_hours',
    value: createKPIValue(current, null),
    format: 'hours',
    formula: 'SUM(All Lost Hours Categories)',
  };
}

/**
 * KPI 039: Lost %
 */
export function calculateLostPercent(
  totalLostHours: number,
  potentialHours: number
): KPI {
  const current = potentialHours > 0
    ? (totalLostHours / potentialHours) * 100
    : 0;
  
  return {
    id: 'KPI_039',
    name: 'Lost %',
    nameAr: 'نسبة الساعات الضائعة',
    category: 'lost_hours',
    value: createKPIValue(current, null),
    format: 'percent',
    formula: 'Lost Hours / Potential Hours',
  };
}

/**
 * Calculate all Lost Hours KPIs
 */
export function calculateLostHoursKPIs(
  input: KPICalculationInput,
  potentialHours: number
): LostHoursKPIs {
  const categoryBreakdown = calculateLostHoursCategoryBreakdown(input);
  const totalLostHours = calculateTotalLostHours(categoryBreakdown);
  const lostPercent = calculateLostPercent(
    totalLostHours.value.current,
    potentialHours
  );
  
  return {
    totalLostHours,
    lostPercent,
    categoryBreakdown,
  };
}

// ============================================================================
// DISTRIBUTION KPI CALCULATORS (040)
// ============================================================================

/**
 * Calculate Rider Distribution by Hours
 */
export function calculateRiderDistribution(
  input: KPICalculationInput
): DistributionKPIs {
  // Define buckets
  const buckets: Array<{ min: number; max: number | null; label: string; labelAr: string }> = [
    { min: 0, max: 0, label: '0 Hours', labelAr: '0 ساعة' },
    { min: 0, max: 2, label: '0-2 Hours', labelAr: '0-2 ساعة' },
    { min: 2, max: 4, label: '2-4 Hours', labelAr: '2-4 ساعة' },
    { min: 4, max: 6, label: '4-6 Hours', labelAr: '4-6 ساعة' },
    { min: 6, max: 8, label: '6-8 Hours', labelAr: '6-8 ساعة' },
    { min: 8, max: 10, label: '8-10 Hours', labelAr: '8-10 ساعة' },
    { min: 10, max: null, label: '10+ Hours', labelAr: '10+ ساعة' },
  ];
  
  // Aggregate by rider
  const riderAggs = new Map<string, { hours: number; orders: number; break: number; late: number; supervisor: string }>();
  
  for (const rec of input.dailyRecords) {
    const agg = riderAggs.get(rec.riderCode) ?? {
      hours: 0,
      orders: 0,
      break: 0,
      late: 0,
      supervisor: rec.supervisorCode,
    };
    agg.hours += rec.hours;
    agg.orders += rec.orders;
    agg.break += rec.breakMinutes;
    agg.late += rec.lateMinutes;
    riderAggs.set(rec.riderCode, agg);
  }
  
  const totalRiders = riderAggs.size;
  
  // Distribute riders into buckets
  const distribution: RiderDistributionBucket[] = buckets.map(bucket => {
    const ridersInBucket = Array.from(riderAggs.entries()).filter(([_, agg]) => {
      if (bucket.max === null) {
        return agg.hours >= bucket.min;
      } else if (bucket.min === 0 && bucket.max === 0) {
        return agg.hours === 0;
      } else {
        return agg.hours > bucket.min && agg.hours <= bucket.max;
      }
    });
    
    const count = ridersInBucket.length;
    const avgOrders = count > 0
      ? avg(ridersInBucket.map(([_, agg]) => agg.orders))
      : 0;
    const avgLate = count > 0
      ? avg(ridersInBucket.map(([_, agg]) => agg.late))
      : 0;
    const avgBreak = count > 0
      ? avg(ridersInBucket.map(([_, agg]) => agg.break))
      : 0;
    
    // Find top supervisor
    const supervisorCounts = new Map<string, number>();
    for (const [_, agg] of ridersInBucket) {
      supervisorCounts.set(agg.supervisor, (supervisorCounts.get(agg.supervisor) ?? 0) + 1);
    }
    const topSupervisor = supervisorCounts.size > 0
      ? Array.from(supervisorCounts.entries()).sort((a, b) => b[1] - a[1])[0][0]
      : null;
    
    return {
      label: bucket.label,
      labelAr: bucket.labelAr,
      minHours: bucket.min,
      maxHours: bucket.max,
      riderCount: count,
      riderPercent: totalRiders > 0 ? (count / totalRiders) * 100 : 0,
      averageOrders: avgOrders,
      averageLateMinutes: avgLate,
      averageBreakMinutes: avgBreak,
      topSupervisor,
    };
  });
  
  return {
    hoursDistribution: distribution,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  calculateBreakKPIs,
  calculateLateKPIs,
  calculateAttendanceKPIs,
  calculateLostHoursKPIs,
  calculateRiderDistribution,
};
