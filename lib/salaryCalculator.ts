/**
 * Salary Calculator Engine
 * Calculates supervisor salaries based on performance data
 * Supports fixed salary and commission-based calculations
 */

import { systemDB, SupervisorConfig, PerformanceData } from './database';

interface SalaryCalculation {
  supervisorId: string;
  period: {
    startDate: string;
    endDate: string;
  };
  salaryMethod: 'fixed' | 'commission';
  baseAmount: number;
  commission?: {
    totalOrders: number;
    totalHours: number;
    commissionRate: number;
    hoursMultipliers: { hours: number; multiplier: number }[];
    calculatedCommission: number;
  };
  deductions: {
    advances: number;
    deductions: number;
    equipment: number;
    security: number;
    total: number;
  };
  netSalary: number;
  breakdown: {
    date: string;
    orders: number;
    hours: number;
    multiplier: number;
    dailyCommission: number;
  }[];
}

/**
 * Get hours multiplier based on daily hours
 */
function getHoursMultiplier(
  hours: number,
  multipliers?: { minHours: number; maxHours: number; multiplier: number }[]
): number {
  if (!multipliers || multipliers.length === 0) {
    // Default multipliers
    if (hours >= 8) return 1.5;
    if (hours >= 6) return 1.2;
    if (hours >= 4) return 1.0;
    return 0.8;
  }

  // Use custom multipliers
  for (const range of multipliers) {
    if (hours >= range.minHours && hours < range.maxHours) {
      return range.multiplier;
    }
  }

  // Default for hours >= max
  return multipliers[multipliers.length - 1].multiplier;
}

/**
 * Calculate supervisor salary
 */
export async function calculateSupervisorSalary(
  supervisorId: string,
  startDate: string,
  endDate: string
): Promise<SalaryCalculation> {
  // Get supervisor config
  const config = await systemDB.getSupervisorConfig(supervisorId);

  if (!config) {
    throw new Error('إعدادات المشرف غير موجودة');
  }

  // Get supervisor's riders
  const riders = await systemDB.getRiders(supervisorId);
  const riderIds = riders.map((r) => r.riderId);

  // Get performance data for period
  const performanceData = await systemDB.getPerformanceData(supervisorId, startDate, endDate);

  // Filter by rider IDs (double check)
  const filteredPerformance = performanceData.filter((p) => riderIds.includes(p.riderId));

  // Calculate based on salary method
  if (config.salaryMethod === 'fixed') {
    return calculateFixedSalary(supervisorId, config, startDate, endDate);
  } else {
    return calculateCommissionSalary(
      supervisorId,
      config,
      filteredPerformance,
      startDate,
      endDate
    );
  }
}

/**
 * Calculate fixed salary
 */
async function calculateFixedSalary(
  supervisorId: string,
  config: SupervisorConfig,
  startDate: string,
  endDate: string
): Promise<SalaryCalculation> {
  const baseAmount = config.fixedSalary || 0;

  // Get deductions from Google Sheets
  const deductions = await getDeductionsFromSheets(supervisorId);

  const netSalary = baseAmount - deductions.total;

  return {
    supervisorId,
    period: { startDate, endDate },
    salaryMethod: 'fixed',
    baseAmount,
    deductions,
    netSalary: Math.max(0, netSalary),
    breakdown: [],
  };
}

/**
 * Calculate commission-based salary
 */
async function calculateCommissionSalary(
  supervisorId: string,
  config: SupervisorConfig,
  performanceData: PerformanceData[],
  startDate: string,
  endDate: string
): Promise<SalaryCalculation> {
  const commissionRate = config.commissionRate || 0;
  const multipliers = config.hoursMultipliers || [];

  // Group by date for daily breakdown
  const dailyData = new Map<string, { orders: number; hours: number }>();

  for (const perf of performanceData) {
    const date = perf.date;
    const existing = dailyData.get(date) || { orders: 0, hours: 0 };
    dailyData.set(date, {
      orders: existing.orders + perf.orders,
      hours: existing.hours + perf.workHours,
    });
  }

  // Calculate daily commissions
  const breakdown: SalaryCalculation['breakdown'] = [];
  let totalOrders = 0;
  let totalHours = 0;
  let totalCommission = 0;

  for (const [date, data] of dailyData.entries()) {
    const hours = data.hours;
    const orders = data.orders;
    const multiplier = getHoursMultiplier(hours, multipliers);
    const dailyCommission = orders * commissionRate * multiplier;

    breakdown.push({
      date,
      orders,
      hours,
      multiplier,
      dailyCommission,
    });

    totalOrders += orders;
    totalHours += hours;
    totalCommission += dailyCommission;
  }

  // Get deductions
  const deductions = await getDeductionsFromSheets(supervisorId);

  const netSalary = totalCommission - deductions.total;

  return {
    supervisorId,
    period: { startDate, endDate },
    salaryMethod: 'commission',
    baseAmount: totalCommission,
    commission: {
      totalOrders,
      totalHours,
      commissionRate,
      hoursMultipliers: breakdown.map((b) => ({
        hours: b.hours,
        multiplier: b.multiplier,
      })),
      calculatedCommission: totalCommission,
    },
    deductions,
    netSalary: Math.max(0, netSalary),
    breakdown,
  };
}

/**
 * Get deductions from Google Sheets
 */
async function getDeductionsFromSheets(supervisorId: string): Promise<SalaryCalculation['deductions']> {
  try {
    // Get deductions from sheets (preserve existing formulas)
    const { getSheetData } = await import('@/lib/googleSheets');
    const [advancesData, deductionsData, equipmentData, securityData] = await Promise.all([
      getSheetData('السلف', false).catch(() => []),
      getSheetData('الخصومات', false).catch(() => []),
      getSheetData('المعدات', false).catch(() => []),
      getSheetData('استعلام أمني', false).catch(() => []),
    ]);

    // Calculate totals (assuming supervisor code is in first column)
    const calculateTotal = (data: any[][], supervisorCode: string): number => {
      if (!data || data.length <= 1) return 0;

      let total = 0;
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (row[0]?.toString().trim() === supervisorCode) {
          // Sum all numeric columns (skip first column which is supervisor code)
          for (let j = 1; j < row.length; j++) {
            const value = parseFloat(row[j]?.toString() || '0');
            if (!isNaN(value)) {
              total += value;
            }
          }
        }
      }
      return total;
    };

    const advances = calculateTotal(advancesData, supervisorId);
    const deductions = calculateTotal(deductionsData, supervisorId);
    const equipment = calculateTotal(equipmentData, supervisorId);
    const security = calculateTotal(securityData, supervisorId);

    return {
      advances,
      deductions,
      equipment,
      security,
      total: advances + deductions + equipment + security,
    };
  } catch (error) {
    console.error('Error getting deductions:', error);
    return {
      advances: 0,
      deductions: 0,
      equipment: 0,
      security: 0,
      total: 0,
    };
  }
}

/**
 * Get supervisor salary overview
 */
export async function getSupervisorSalaryOverview(supervisorId: string): Promise<{
  currentMonth: SalaryCalculation;
  lastMonth: SalaryCalculation;
}> {
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];

  const [currentMonth, lastMonth] = await Promise.all([
    calculateSupervisorSalary(supervisorId, currentMonthStart, currentMonthEnd),
    calculateSupervisorSalary(supervisorId, lastMonthStart, lastMonthEnd),
  ]);

  return {
    currentMonth,
    lastMonth,
  };
}
