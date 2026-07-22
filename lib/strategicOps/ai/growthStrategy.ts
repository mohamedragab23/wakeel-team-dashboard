/**
 * Growth Strategy Engine
 * 
 * Generates data-driven growth strategies and expansion plans.
 * Implements SRS-004 Section 10: Growth Strategy Engine.
 * 
 * Answers: "How can we grow?" and "What's the growth plan?"
 * 
 * @module GrowthStrategy
 * @version 1.0
 */

import type { KPIEngineOutput } from '@/lib/strategicOps/kpi';
import type { ForecastResult } from './advancedForecast';

// ============================================================================
// TYPES
// ============================================================================

export type GrowthObjective = 'capacity' | 'efficiency' | 'quality' | 'coverage' | 'retention';

export type GrowthStrategy = {
  objective: GrowthObjective;
  objectiveAr: string;
  priority: 'critical' | 'high' | 'medium';
  
  // Current state
  currentState: {
    metric: string;
    metricAr: string;
    value: number;
    benchmark: number;
    gap: number;
  };
  
  // Target
  target: {
    timeframe: 'week' | 'month' | 'quarter';
    targetValue: number;
    requiredGrowth: number;
    requiredGrowthPercent: number;
  };
  
  // Actions
  actions: {
    action: string;
    actionAr: string;
    type: 'hire' | 'train' | 'optimize' | 'invest' | 'restructure';
    effort: 'low' | 'medium' | 'high';
    impact: 'low' | 'medium' | 'high';
    timeline: string;
  }[];
  
  // Resources required
  resources: {
    riders?: number;
    supervisors?: number;
    budget?: number;
    time?: string;
  };
  
  // Expected impact
  expectedImpact: {
    metric: string;
    metricAr: string;
    increase: number;
    increasePercent: number;
  }[];
  
  // Risk assessment
  risks: string[];
  risksAr: string[];
};

export type GrowthPlan = {
  strategies: GrowthStrategy[];
  
  // Overall targets
  overallTargets: {
    week: { hours: number; orders: number; riders: number };
    month: { hours: number; orders: number; riders: number };
    quarter: { hours: number; orders: number; riders: number };
  };
  
  // Investment required
  totalInvestment: {
    riders: number;
    supervisors: number;
    estimatedCost: number;
  };
  
  // ROI projection
  roiProjection: {
    timeframe: string;
    expectedRevenue: number;
    expectedCost: number;
    roi: number;
  };
  
  // Summary
  summary: {
    english: string;
    arabic: string;
  };
};

// ============================================================================
// GROWTH STRATEGY ENGINE
// ============================================================================

/**
 * Generate comprehensive growth plan
 */
export function generateGrowthPlan(
  currentData: KPIEngineOutput,
  forecast: ForecastResult
): GrowthPlan {
  
  // Identify growth opportunities
  const strategies: GrowthStrategy[] = [];
  
  // 1. Capacity growth (if hours below target)
  if (currentData.hours.hoursAchievement.value.current < 90) {
    strategies.push(generateCapacityStrategy(currentData, forecast));
  }
  
  // 2. Efficiency growth (if orders/hour below benchmark)
  if (currentData.orders.ordersPerHour.value.current < 2.3) {
    strategies.push(generateEfficiencyStrategy(currentData));
  }
  
  // 3. Quality growth (if attendance or break issues)
  if (currentData.attendance.attendancePercent.value.current < 85 || 
      currentData.break.breakPercent.value.current > 8) {
    strategies.push(generateQualityStrategy(currentData));
  }
  
  // 4. Retention strategy (if high inactive riders)
  const activePercent = (currentData.headcount.workingRiders.value.current / 
                        currentData.headcount.registeredRiders.value.current) * 100;
  if (activePercent < 70) {
    strategies.push(generateRetentionStrategy(currentData));
  }
  
  // Calculate overall targets
  const overallTargets = calculateOverallTargets(currentData, forecast);
  
  // Calculate investment
  const totalInvestment = calculateInvestment(strategies);
  
  // Calculate ROI
  const roiProjection = calculateROI(currentData, totalInvestment, overallTargets);
  
  // Generate summary
  const summary = generateGrowthSummary(strategies, overallTargets);
  
  return {
    strategies,
    overallTargets,
    totalInvestment,
    roiProjection,
    summary,
  };
}

// ============================================================================
// STRATEGY GENERATORS
// ============================================================================

function generateCapacityStrategy(data: KPIEngineOutput, forecast: ForecastResult): GrowthStrategy {
  const currentHours = data.hours.totalWorkingHours.value.current;
  const targetHours = data.hours.potentialHours.value.current;
  const gap = targetHours - currentHours;
  const gapPercent = (gap / targetHours) * 100;
  
  // Calculate required riders (assuming 8 hours/rider/day average)
  const requiredRiders = Math.ceil(gap / (8 * 7)); // Weekly gap
  
  return {
    objective: 'capacity',
    objectiveAr: 'زيادة الطاقة الإنتاجية',
    priority: gapPercent > 20 ? 'critical' : gapPercent > 10 ? 'high' : 'medium',
    
    currentState: {
      metric: 'Total Hours',
      metricAr: 'إجمالي الساعات',
      value: currentHours,
      benchmark: targetHours,
      gap: gap,
    },
    
    target: {
      timeframe: 'month',
      targetValue: targetHours,
      requiredGrowth: gap,
      requiredGrowthPercent: gapPercent,
    },
    
    actions: [
      {
        action: `Hire ${requiredRiders} new riders`,
        actionAr: `توظيف ${requiredRiders} مندوب جديد`,
        type: 'hire',
        effort: 'high',
        impact: 'high',
        timeline: '2-3 weeks',
      },
      {
        action: 'Activate existing inactive riders',
        actionAr: 'تفعيل المناديب غير النشطين',
        type: 'optimize',
        effort: 'medium',
        impact: 'high',
        timeline: '1 week',
      },
      {
        action: 'Increase working hours for part-time riders',
        actionAr: 'زيادة ساعات العمل للمناديب بدوام جزئي',
        type: 'optimize',
        effort: 'low',
        impact: 'medium',
        timeline: 'Immediate',
      },
    ],
    
    resources: {
      riders: requiredRiders,
      time: '3-4 weeks',
    },
    
    expectedImpact: [
      {
        metric: 'Total Hours',
        metricAr: 'إجمالي الساعات',
        increase: gap,
        increasePercent: gapPercent,
      },
      {
        metric: 'Total Orders',
        metricAr: 'إجمالي الأوردرات',
        increase: gap * 2.3, // Assuming 2.3 orders/hour
        increasePercent: gapPercent,
      },
    ],
    
    risks: [
      'Training new riders takes 2-3 weeks',
      'Market demand may not support additional capacity',
      'Recruiting challenges in certain zones',
    ],
    risksAr: [
      'تدريب المناديب الجدد يستغرق 2-3 أسابيع',
      'الطلب في السوق قد لا يدعم الطاقة الإضافية',
      'تحديات التوظيف في بعض المناطق',
    ],
  };
}

function generateEfficiencyStrategy(data: KPIEngineOutput): GrowthStrategy {
  const currentOPH = data.orders.ordersPerHour.value.current;
  const targetOPH = 2.5;
  const gap = targetOPH - currentOPH;
  const gapPercent = (gap / targetOPH) * 100;
  
  return {
    objective: 'efficiency',
    objectiveAr: 'زيادة الكفاءة',
    priority: gapPercent > 15 ? 'high' : 'medium',
    
    currentState: {
      metric: 'Orders per Hour',
      metricAr: 'أوردر/ساعة',
      value: currentOPH,
      benchmark: targetOPH,
      gap: gap,
    },
    
    target: {
      timeframe: 'month',
      targetValue: targetOPH,
      requiredGrowth: gap,
      requiredGrowthPercent: gapPercent,
    },
    
    actions: [
      {
        action: 'Provide productivity training to bottom 20% performers',
        actionAr: 'تدريب على الإنتاجية لأقل 20% أداءً',
        type: 'train',
        effort: 'medium',
        impact: 'high',
        timeline: '2 weeks',
      },
      {
        action: 'Optimize zone assignments and routing',
        actionAr: 'تحسين توزيع المناطق والمسارات',
        type: 'optimize',
        effort: 'medium',
        impact: 'medium',
        timeline: '1 week',
      },
      {
        action: 'Reduce break time to <8%',
        actionAr: 'تقليل وقت الاستراحة لـ <8%',
        type: 'optimize',
        effort: 'low',
        impact: 'medium',
        timeline: 'Immediate',
      },
    ],
    
    resources: {
      time: '3-4 weeks',
    },
    
    expectedImpact: [
      {
        metric: 'Orders per Hour',
        metricAr: 'أوردر/ساعة',
        increase: gap,
        increasePercent: gapPercent,
      },
      {
        metric: 'Total Orders',
        metricAr: 'إجمالي الأوردرات',
        increase: gap * data.hours.totalWorkingHours.value.current,
        increasePercent: gapPercent,
      },
    ],
    
    risks: [
      'Rider resistance to changes',
      'Training effectiveness varies',
    ],
    risksAr: [
      'مقاومة المناديب للتغييرات',
      'فعالية التدريب تختلف',
    ],
  };
}

function generateQualityStrategy(data: KPIEngineOutput): GrowthStrategy {
  const currentAttendance = data.attendance.attendancePercent.value.current;
  const targetAttendance = 90;
  const gap = targetAttendance - currentAttendance;
  const gapPercent = (gap / targetAttendance) * 100;
  
  return {
    objective: 'quality',
    objectiveAr: 'تحسين الجودة',
    priority: gapPercent > 10 ? 'high' : 'medium',
    
    currentState: {
      metric: 'Attendance Rate',
      metricAr: 'معدل الحضور',
      value: currentAttendance,
      benchmark: targetAttendance,
      gap: gap,
    },
    
    target: {
      timeframe: 'month',
      targetValue: targetAttendance,
      requiredGrowth: gap,
      requiredGrowthPercent: gapPercent,
    },
    
    actions: [
      {
        action: 'Implement attendance incentive program',
        actionAr: 'تطبيق برنامج حوافز الحضور',
        type: 'invest',
        effort: 'medium',
        impact: 'high',
        timeline: '2 weeks',
      },
      {
        action: 'Daily attendance follow-up by supervisors',
        actionAr: 'متابعة يومية للحضور من المشرفين',
        type: 'train',
        effort: 'low',
        impact: 'medium',
        timeline: 'Immediate',
      },
      {
        action: 'Investigate chronic absenteeism',
        actionAr: 'التحقيق في التغيب المزمن',
        type: 'optimize',
        effort: 'medium',
        impact: 'medium',
        timeline: '1 week',
      },
    ],
    
    resources: {
      time: '3-4 weeks',
    },
    
    expectedImpact: [
      {
        metric: 'Attendance Rate',
        metricAr: 'معدل الحضور',
        increase: gap,
        increasePercent: gapPercent,
      },
      {
        metric: 'Total Hours',
        metricAr: 'إجمالي الساعات',
        increase: (gap / 100) * data.hours.totalWorkingHours.value.current,
        increasePercent: gapPercent,
      },
    ],
    
    risks: [
      'Incentive program cost',
      'External factors (health, transportation)',
    ],
    risksAr: [
      'تكلفة برنامج الحوافز',
      'عوامل خارجية (صحة، مواصلات)',
    ],
  };
}

function generateRetentionStrategy(data: KPIEngineOutput): GrowthStrategy {
  const totalRiders = data.headcount.registeredRiders.value.current;
  const workingRiders = data.headcount.workingRiders.value.current;
  const inactiveRiders = totalRiders - workingRiders;
  const activePercent = (workingRiders / totalRiders) * 100;
  const targetActivePercent = 80;
  const gap = targetActivePercent - activePercent;
  
  return {
    objective: 'retention',
    objectiveAr: 'الاحتفاظ بالمناديب',
    priority: gap > 15 ? 'high' : 'medium',
    
    currentState: {
      metric: 'Active Rider %',
      metricAr: 'نسبة المناديب النشطين',
      value: activePercent,
      benchmark: targetActivePercent,
      gap: gap,
    },
    
    target: {
      timeframe: 'month',
      targetValue: targetActivePercent,
      requiredGrowth: gap,
      requiredGrowthPercent: (gap / targetActivePercent) * 100,
    },
    
    actions: [
      {
        action: `Reactivate ${Math.ceil(inactiveRiders * 0.5)} inactive riders`,
        actionAr: `إعادة تفعيل ${Math.ceil(inactiveRiders * 0.5)} مندوب غير نشط`,
        type: 'optimize',
        effort: 'high',
        impact: 'high',
        timeline: '2-3 weeks',
      },
      {
        action: 'Exit interview program to understand churn',
        actionAr: 'برنامج مقابلات المغادرة لفهم أسباب التسرب',
        type: 'optimize',
        effort: 'medium',
        impact: 'medium',
        timeline: '1 week',
      },
      {
        action: 'Improve rider engagement and satisfaction',
        actionAr: 'تحسين تفاعل ورضا المناديب',
        type: 'invest',
        effort: 'medium',
        impact: 'high',
        timeline: '2-4 weeks',
      },
    ],
    
    resources: {
      time: '4-6 weeks',
    },
    
    expectedImpact: [
      {
        metric: 'Active Riders',
        metricAr: 'المناديب النشطون',
        increase: Math.ceil(inactiveRiders * 0.5),
        increasePercent: (Math.ceil(inactiveRiders * 0.5) / workingRiders) * 100,
      },
    ],
    
    risks: [
      'Inactive riders may have left permanently',
      'Root causes may be external',
    ],
    risksAr: [
      'المناديب غير النشطين قد يكونوا غادروا نهائياً',
      'الأسباب الجذرية قد تكون خارجية',
    ],
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function calculateOverallTargets(data: KPIEngineOutput, forecast: ForecastResult) {
  return {
    week: {
      hours: forecast.nextWeek.hours,
      orders: forecast.nextWeek.orders,
      riders: data.headcount.workingRiders.value.current * 1.05,
    },
    month: {
      hours: forecast.nextMonth.hours,
      orders: forecast.nextMonth.orders,
      riders: data.headcount.workingRiders.value.current * 1.15,
    },
    quarter: {
      hours: forecast.nextQuarter.hours,
      orders: forecast.nextQuarter.orders,
      riders: data.headcount.workingRiders.value.current * 1.30,
    },
  };
}

function calculateInvestment(strategies: GrowthStrategy[]) {
  const riders = strategies.reduce((sum, s) => sum + (s.resources.riders || 0), 0);
  const supervisors = Math.ceil(riders / 20); // 1 supervisor per 20 riders
  const estimatedCost = (riders * 5000) + (supervisors * 8000); // Rough estimates
  
  return { riders, supervisors, estimatedCost };
}

function calculateROI(
  data: KPIEngineOutput,
  investment: { riders: number; estimatedCost: number },
  targets: GrowthPlan['overallTargets']
) {
  const currentMonthlyRevenue = data.orders.totalOrders.value.current * 4 * 15; // 4 weeks, 15 SAR/order
  const targetMonthlyRevenue = targets.month.orders * 15;
  const revenueIncrease = targetMonthlyRevenue - currentMonthlyRevenue;
  const roi = ((revenueIncrease - investment.estimatedCost) / investment.estimatedCost) * 100;
  
  return {
    timeframe: '1 month',
    expectedRevenue: revenueIncrease,
    expectedCost: investment.estimatedCost,
    roi: roi,
  };
}

function generateGrowthSummary(strategies: GrowthStrategy[], targets: GrowthPlan['overallTargets']) {
  const priorityCount = strategies.filter(s => s.priority === 'critical' || s.priority === 'high').length;
  
  const english = `${strategies.length} growth strategies identified. ${priorityCount} high-priority initiatives. Target: ${targets.month.hours.toFixed(0)} hours/month.`;
  const arabic = `تم تحديد ${strategies.length} استراتيجية نمو. ${priorityCount} مبادرات عالية الأولوية. الهدف: ${targets.month.hours.toFixed(0)} ساعة/شهر.`;
  
  return { english, arabic };
}
