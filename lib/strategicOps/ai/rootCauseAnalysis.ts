/**
 * Root Cause Analysis Engine
 * 
 * Analyzes performance gaps and attributes them to specific causes.
 * Implements SRS-004 Section 3: Root Cause Analysis Engine.
 * 
 * Answers the question: "Why are we below/above target?"
 * 
 * @module RootCauseAnalysis
 * @version 1.0
 */

import type { KPIEngineOutput } from '@/lib/strategicOps/kpi';

// ============================================================================
// TYPES
// ============================================================================

export type RootCauseCategory =
  | 'absence'
  | 'late'
  | 'break'
  | 'medical'
  | 'equipment'
  | 'vacation'
  | 'low_productivity'
  | 'insufficient_riders'
  | 'poor_attendance'
  | 'early_departure'
  | 'unknown';

export type RootCause = {
  category: RootCauseCategory;
  categoryAr: string;
  hoursLost: number;
  percentOfGap: number;
  ordersLost: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  actionable: boolean;
  recommendation: string;
  recommendationAr: string;
};

export type GapAnalysis = {
  targetHours: number;
  actualHours: number;
  gap: number;
  gapPercent: number;
  gapStatus: 'surplus' | 'deficit' | 'on_track';
  
  // Primary causes
  rootCauses: RootCause[];
  
  // Summary
  topCause: RootCause | null;
  actionableHours: number;
  nonActionableHours: number;
};

// ============================================================================
// CATEGORY LABELS
// ============================================================================

const CATEGORY_LABELS_AR: Record<RootCauseCategory, string> = {
  absence: 'غياب',
  late: 'تأخير',
  break: 'استراحة زائدة',
  medical: 'إجازة مرضية',
  equipment: 'مشاكل معدات',
  vacation: 'إجازة',
  low_productivity: 'إنتاجية منخفضة',
  insufficient_riders: 'نقص المناديب',
  poor_attendance: 'ضعف الحضور',
  early_departure: 'مغادرة مبكرة',
  unknown: 'غير معروف',
};

// ============================================================================
// ROOT CAUSE ANALYSIS CALCULATOR
// ============================================================================

/**
 * Analyze why performance is below/above target
 * 
 * Attribution logic:
 * 1. Calculate total gap (target - actual)
 * 2. Attribute gap to specific causes (absence, late, break, etc.)
 * 3. Rank causes by impact
 * 4. Generate recommendations
 */
export function analyzeRootCauses(kpis: KPIEngineOutput): GapAnalysis {
  const targetHours = kpis.hours.hoursAchievement.value.current >= 100 
    ? kpis.hours.totalWorkingHours.value.current // If above target, use actual
    : kpis.hours.totalWorkingHours.value.current / (kpis.hours.hoursAchievement.value.current / 100);
  
  const actualHours = kpis.hours.totalWorkingHours.value.current;
  const gap = targetHours - actualHours;
  const gapPercent = targetHours > 0 ? (gap / targetHours) * 100 : 0;
  
  // Determine gap status
  let gapStatus: 'surplus' | 'deficit' | 'on_track' = 'on_track';
  if (Math.abs(gapPercent) < 5) {
    gapStatus = 'on_track';
  } else if (gap > 0) {
    gapStatus = 'deficit';
  } else {
    gapStatus = 'surplus';
  }
  
  // Calculate root causes
  const rootCauses: RootCause[] = [];
  
  // 1. Lost hours from break
  const breakLostHours = kpis.break.estimatedLostHoursDueToBreak.value.current;
  if (breakLostHours > 0) {
    rootCauses.push({
      category: 'break',
      categoryAr: CATEGORY_LABELS_AR.break,
      hoursLost: breakLostHours,
      percentOfGap: Math.abs(gap) > 0 ? (breakLostHours / Math.abs(gap)) * 100 : 0,
      ordersLost: Math.round(breakLostHours * kpis.orders.ordersPerHour.value.current),
      severity: getSeverity(breakLostHours, Math.abs(gap)),
      actionable: true,
      recommendation: 'Enforce break policies and monitor break times',
      recommendationAr: 'تطبيق سياسات الاستراحة ومراقبة أوقات الاستراحة',
    });
  }
  
  // 2. Lost hours from late
  const lateLostHours = kpis.late.estimatedLostHoursDueToLate.value.current;
  if (lateLostHours > 0) {
    rootCauses.push({
      category: 'late',
      categoryAr: CATEGORY_LABELS_AR.late,
      hoursLost: lateLostHours,
      percentOfGap: Math.abs(gap) > 0 ? (lateLostHours / Math.abs(gap)) * 100 : 0,
      ordersLost: Math.round(lateLostHours * kpis.orders.ordersPerHour.value.current),
      severity: getSeverity(lateLostHours, Math.abs(gap)),
      actionable: true,
      recommendation: 'Implement stricter shift start policies and penalties',
      recommendationAr: 'تطبيق سياسات أكثر صرامة لبداية الورديات والعقوبات',
    });
  }
  
  // 3. Poor attendance (absence)
  const attendancePercent = kpis.attendance.attendancePercent.value.current;
  if (attendancePercent < 92) {
    const absenceLostHours = kpis.hours.potentialHours.value.current * ((100 - attendancePercent) / 100);
    rootCauses.push({
      category: 'absence',
      categoryAr: CATEGORY_LABELS_AR.absence,
      hoursLost: absenceLostHours,
      percentOfGap: Math.abs(gap) > 0 ? (absenceLostHours / Math.abs(gap)) * 100 : 0,
      ordersLost: Math.round(absenceLostHours * kpis.orders.ordersPerHour.value.current),
      severity: getSeverity(absenceLostHours, Math.abs(gap)),
      actionable: true,
      recommendation: 'Investigate absence reasons and implement attendance incentives',
      recommendationAr: 'التحقيق في أسباب الغياب وتطبيق حوافز الحضور',
    });
  }
  
  // 4. Low daily active rate (insufficient working riders)
  const dailyActiveRate = kpis.headcount.dailyActiveRate.value.current;
  if (dailyActiveRate < 85) {
    const inactiveRiders = kpis.headcount.registeredRiders.value.current - kpis.headcount.averageDailyWorkingRiders.value.current;
    const inactiveLostHours = inactiveRiders * 8; // Assume 8 hours per rider
    rootCauses.push({
      category: 'insufficient_riders',
      categoryAr: CATEGORY_LABELS_AR.insufficient_riders,
      hoursLost: inactiveLostHours,
      percentOfGap: Math.abs(gap) > 0 ? (inactiveLostHours / Math.abs(gap)) * 100 : 0,
      ordersLost: Math.round(inactiveLostHours * kpis.orders.ordersPerHour.value.current),
      severity: getSeverity(inactiveLostHours, Math.abs(gap)),
      actionable: true,
      recommendation: 'Reactivate inactive riders or recruit new riders',
      recommendationAr: 'إعادة تفعيل المناديب غير النشطين أو توظيف مناديب جدد',
    });
  }
  
  // 5. Low productivity (orders per hour)
  const ordersPerHour = kpis.orders.ordersPerHour.value.current;
  if (ordersPerHour < 2.5) {
    rootCauses.push({
      category: 'low_productivity',
      categoryAr: CATEGORY_LABELS_AR.low_productivity,
      hoursLost: 0, // Productivity issue, not hours lost
      percentOfGap: 15, // Estimate
      ordersLost: Math.round((2.5 - ordersPerHour) * actualHours),
      severity: 'high',
      actionable: true,
      recommendation: 'Provide training, optimize routes, and improve rider support',
      recommendationAr: 'توفير التدريب وتحسين المسارات ودعم المناديب',
    });
  }
  
  // 6. Lost hours from other categories (if detailed breakdown available)
  for (const lostCat of kpis.lostHours.categoryBreakdown) {
    if (lostCat.category === 'medical' && lostCat.hours > 10) {
      rootCauses.push({
        category: 'medical',
        categoryAr: CATEGORY_LABELS_AR.medical,
        hoursLost: lostCat.hours,
        percentOfGap: Math.abs(gap) > 0 ? (lostCat.hours / Math.abs(gap)) * 100 : 0,
        ordersLost: lostCat.ordersLost,
        severity: getSeverity(lostCat.hours, Math.abs(gap)),
        actionable: false, // Medical leave is not actionable
        recommendation: 'Medical leaves are unavoidable, focus on backup planning',
        recommendationAr: 'الإجازات المرضية لا يمكن تجنبها، ركز على التخطيط البديل',
      });
    }
    
    if (lostCat.category === 'equipment' && lostCat.hours > 5) {
      rootCauses.push({
        category: 'equipment',
        categoryAr: CATEGORY_LABELS_AR.equipment,
        hoursLost: lostCat.hours,
        percentOfGap: Math.abs(gap) > 0 ? (lostCat.hours / Math.abs(gap)) * 100 : 0,
        ordersLost: lostCat.ordersLost,
        severity: getSeverity(lostCat.hours, Math.abs(gap)),
        actionable: true,
        recommendation: 'Improve equipment maintenance and provide backup equipment',
        recommendationAr: 'تحسين صيانة المعدات وتوفير معدات احتياطية',
      });
    }
    
    if (lostCat.category === 'vacation' && lostCat.hours > 10) {
      rootCauses.push({
        category: 'vacation',
        categoryAr: CATEGORY_LABELS_AR.vacation,
        hoursLost: lostCat.hours,
        percentOfGap: Math.abs(gap) > 0 ? (lostCat.hours / Math.abs(gap)) * 100 : 0,
        ordersLost: lostCat.ordersLost,
        severity: getSeverity(lostCat.hours, Math.abs(gap)),
        actionable: false, // Vacation is planned, not actionable
        recommendation: 'Vacations are planned, ensure adequate staffing during vacation periods',
        recommendationAr: 'الإجازات مخططة، تأكد من وجود عدد كافٍ من الموظفين خلال فترات الإجازة',
      });
    }
  }
  
  // Sort by impact (hours lost)
  rootCauses.sort((a, b) => b.hoursLost - a.hoursLost);
  
  // Calculate actionable vs non-actionable
  const actionableHours = rootCauses.filter(rc => rc.actionable).reduce((sum, rc) => sum + rc.hoursLost, 0);
  const nonActionableHours = rootCauses.filter(rc => !rc.actionable).reduce((sum, rc) => sum + rc.hoursLost, 0);
  
  return {
    targetHours,
    actualHours,
    gap,
    gapPercent,
    gapStatus,
    rootCauses,
    topCause: rootCauses.length > 0 ? rootCauses[0] : null,
    actionableHours,
    nonActionableHours,
  };
}

/**
 * Determine severity based on impact
 */
function getSeverity(hoursLost: number, totalGap: number): 'critical' | 'high' | 'medium' | 'low' {
  const percentOfGap = totalGap > 0 ? (hoursLost / totalGap) * 100 : 0;
  
  if (percentOfGap > 40) return 'critical';
  if (percentOfGap > 25) return 'high';
  if (percentOfGap > 10) return 'medium';
  return 'low';
}

/**
 * Generate executive summary of root causes
 */
export function generateRootCauseSummary(analysis: GapAnalysis): {
  summaryEn: string;
  summaryAr: string;
} {
  if (analysis.gapStatus === 'on_track') {
    return {
      summaryEn: `Performance is on track (${analysis.gapPercent.toFixed(1)}% from target). Continue current operations.`,
      summaryAr: `الأداء على المسار الصحيح (${analysis.gapPercent.toFixed(1)}% من الهدف). استمر في العمليات الحالية.`,
    };
  }
  
  if (analysis.gapStatus === 'surplus') {
    return {
      summaryEn: `Performance exceeds target by ${Math.abs(analysis.gap).toFixed(0)} hours (${Math.abs(analysis.gapPercent).toFixed(1)}%). Excellent work!`,
      summaryAr: `الأداء يتجاوز الهدف بـ ${Math.abs(analysis.gap).toFixed(0)} ساعة (${Math.abs(analysis.gapPercent).toFixed(1)}%). عمل ممتاز!`,
    };
  }
  
  // Deficit case
  const topCauses = analysis.rootCauses.slice(0, 3);
  const causesList = topCauses.map(rc => `${rc.categoryAr} (${rc.hoursLost.toFixed(0)} ساعة)`).join('، ');
  
  return {
    summaryEn: `Performance is ${analysis.gap.toFixed(0)} hours below target (${analysis.gapPercent.toFixed(1)}%). Top causes: ${topCauses.map(rc => `${rc.category} (${rc.hoursLost.toFixed(0)}h)`).join(', ')}. ${analysis.actionableHours.toFixed(0)} hours are actionable.`,
    summaryAr: `الأداء أقل من الهدف بـ ${analysis.gap.toFixed(0)} ساعة (${analysis.gapPercent.toFixed(1)}%). الأسباب الرئيسية: ${causesList}. ${analysis.actionableHours.toFixed(0)} ساعة قابلة للتحسين.`,
  };
}

/**
 * Generate action items based on root causes
 */
export function generateActionItems(analysis: GapAnalysis): Array<{
  priority: number;
  action: string;
  actionAr: string;
  expectedImpact: string;
  expectedImpactAr: string;
}> {
  const actions: Array<{
    priority: number;
    action: string;
    actionAr: string;
    expectedImpact: string;
    expectedImpactAr: string;
  }> = [];
  
  // Generate actions from top actionable root causes
  const actionableCauses = analysis.rootCauses.filter(rc => rc.actionable).slice(0, 5);
  
  actionableCauses.forEach((cause, idx) => {
    actions.push({
      priority: idx + 1,
      action: cause.recommendation,
      actionAr: cause.recommendationAr,
      expectedImpact: `Recover ${cause.hoursLost.toFixed(0)} hours, ${cause.ordersLost} orders`,
      expectedImpactAr: `استرجاع ${cause.hoursLost.toFixed(0)} ساعة، ${cause.ordersLost} أوردر`,
    });
  });
  
  return actions;
}
