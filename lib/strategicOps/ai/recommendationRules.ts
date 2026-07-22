/**
 * Recommendation Rules Engine
 * 
 * Rule-based recommendation system for operational decisions.
 * Implements SRS-004 Section 2: Executive Decision Engine (Recommendation Rules).
 * 
 * Provides structured, actionable recommendations based on business rules.
 * 
 * @module RecommendationRules
 * @version 1.0
 */

import type { KPIEngineOutput } from '@/lib/strategicOps/kpi';

// ============================================================================
// TYPES
// ============================================================================

export type RecommendationCategory = 
  | 'urgent_action'
  | 'capacity_management'
  | 'performance_improvement'
  | 'cost_optimization'
  | 'quality_enhancement'
  | 'strategic_planning';

export type RecommendationPriority = 'critical' | 'high' | 'medium' | 'low';

export type Recommendation = {
  id: string;
  category: RecommendationCategory;
  categoryAr: string;
  priority: RecommendationPriority;
  
  // Trigger condition
  trigger: {
    metric: string;
    metricAr: string;
    condition: string;
    threshold: number;
    actual: number;
  };
  
  // Recommendation
  title: string;
  titleAr: string;
  description: string;
  descriptionAr: string;
  
  // Actions
  actions: {
    action: string;
    actionAr: string;
    owner: 'operations_manager' | 'supervisor' | 'hr' | 'finance';
    ownerAr: string;
    deadline: string;
  }[];
  
  // Expected impact
  impact: {
    metric: string;
    metricAr: string;
    expectedChange: number;
    timeframe: string;
  }[];
  
  // Business rule reference
  rule: string;
  confidence: number;
};

export type RecommendationSet = {
  recommendations: Recommendation[];
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    totalActions: number;
  };
};

// ============================================================================
// BUSINESS RULES
// ============================================================================

/**
 * Business rules configuration (can be moved to DB/config later)
 */
const BUSINESS_RULES = {
  // Critical rules (immediate action required)
  CRITICAL_HOURS_ACHIEVEMENT: {
    threshold: 70,
    priority: 'critical' as const,
    category: 'urgent_action' as const,
  },
  CRITICAL_ATTENDANCE: {
    threshold: 75,
    priority: 'critical' as const,
    category: 'urgent_action' as const,
  },
  CRITICAL_LOST_HOURS: {
    threshold: 25,
    priority: 'critical' as const,
    category: 'urgent_action' as const,
  },
  
  // High priority rules
  LOW_HOURS_ACHIEVEMENT: {
    threshold: 85,
    priority: 'high' as const,
    category: 'capacity_management' as const,
  },
  LOW_ORDERS_PER_HOUR: {
    threshold: 2.0,
    priority: 'high' as const,
    category: 'performance_improvement' as const,
  },
  HIGH_BREAK_PERCENT: {
    threshold: 10,
    priority: 'high' as const,
    category: 'performance_improvement' as const,
  },
  LOW_ATTENDANCE: {
    threshold: 85,
    priority: 'high' as const,
    category: 'quality_enhancement' as const,
  },
  HIGH_LATE_PERCENT: {
    threshold: 15,
    priority: 'high' as const,
    category: 'quality_enhancement' as const,
  },
  
  // Medium priority rules
  MODERATE_HOURS_ACHIEVEMENT: {
    threshold: 90,
    priority: 'medium' as const,
    category: 'capacity_management' as const,
  },
  MODERATE_ORDERS_PER_HOUR: {
    threshold: 2.3,
    priority: 'medium' as const,
    category: 'performance_improvement' as const,
  },
  HIGH_INACTIVE_RIDERS: {
    threshold: 30,
    priority: 'medium' as const,
    category: 'cost_optimization' as const,
  },
  MODERATE_BREAK: {
    threshold: 8,
    priority: 'medium' as const,
    category: 'performance_improvement' as const,
  },
};

// ============================================================================
// RECOMMENDATION ENGINE
// ============================================================================

/**
 * Generate all recommendations based on current data
 */
export function generateRecommendations(data: KPIEngineOutput): RecommendationSet {
  const recommendations: Recommendation[] = [];
  
  // Check each business rule
  recommendations.push(...checkHoursAchievement(data));
  recommendations.push(...checkAttendance(data));
  recommendations.push(...checkOrdersPerHour(data));
  recommendations.push(...checkBreakTime(data));
  recommendations.push(...checkLatePercent(data));
  recommendations.push(...checkLostHours(data));
  recommendations.push(...checkInactiveRiders(data));
  
  // Sort by priority
  recommendations.sort((a, b) => {
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });
  
  // Generate summary
  const summary = {
    critical: recommendations.filter(r => r.priority === 'critical').length,
    high: recommendations.filter(r => r.priority === 'high').length,
    medium: recommendations.filter(r => r.priority === 'medium').length,
    low: recommendations.filter(r => r.priority === 'low').length,
    totalActions: recommendations.reduce((sum, r) => sum + r.actions.length, 0),
  };
  
  return { recommendations, summary };
}

// ============================================================================
// RULE CHECKERS
// ============================================================================

function checkHoursAchievement(data: KPIEngineOutput): Recommendation[] {
  const recommendations: Recommendation[] = [];
  const achievement = data.hours.hoursAchievement.value.current;
  
  // Critical
  if (achievement < BUSINESS_RULES.CRITICAL_HOURS_ACHIEVEMENT.threshold) {
    recommendations.push({
      id: 'HOURS_CRITICAL',
      category: 'urgent_action',
      categoryAr: 'إجراء عاجل',
      priority: 'critical',
      trigger: {
        metric: 'Hours Achievement',
        metricAr: 'تحقيق الساعات',
        condition: '<',
        threshold: BUSINESS_RULES.CRITICAL_HOURS_ACHIEVEMENT.threshold,
        actual: achievement,
      },
      title: 'CRITICAL: Hours Achievement Below 70%',
      titleAr: 'حرج: تحقيق الساعات أقل من 70%',
      description: 'Hours achievement is critically low. Immediate action required to meet weekly targets.',
      descriptionAr: 'تحقيق الساعات منخفض بشكل حرج. يتطلب إجراءً فورياً لتحقيق الأهداف الأسبوعية.',
      actions: [
        {
          action: 'Hire 10+ new riders urgently',
          actionAr: 'توظيف 10+ مندوب جديد بشكل عاجل',
          owner: 'hr',
          ownerAr: 'الموارد البشرية',
          deadline: 'This week',
        },
        {
          action: 'Activate all available inactive riders',
          actionAr: 'تفعيل جميع المناديب غير النشطين المتاحين',
          owner: 'operations_manager',
          ownerAr: 'مدير العمليات',
          deadline: 'Today',
        },
        {
          action: 'Request overtime from high performers',
          actionAr: 'طلب ساعات إضافية من المناديب ذوي الأداء العالي',
          owner: 'supervisor',
          ownerAr: 'المشرف',
          deadline: 'Today',
        },
      ],
      impact: [
        {
          metric: 'Hours Achievement',
          metricAr: 'تحقيق الساعات',
          expectedChange: 15,
          timeframe: '1 week',
        },
      ],
      rule: 'CRITICAL_HOURS_ACHIEVEMENT',
      confidence: 95,
    });
  }
  // High priority
  else if (achievement < BUSINESS_RULES.LOW_HOURS_ACHIEVEMENT.threshold) {
    recommendations.push({
      id: 'HOURS_HIGH',
      category: 'capacity_management',
      categoryAr: 'إدارة الطاقة',
      priority: 'high',
      trigger: {
        metric: 'Hours Achievement',
        metricAr: 'تحقيق الساعات',
        condition: '<',
        threshold: BUSINESS_RULES.LOW_HOURS_ACHIEVEMENT.threshold,
        actual: achievement,
      },
      title: 'Hours Achievement Below Target',
      titleAr: 'تحقيق الساعات أقل من الهدف',
      description: 'Hours achievement is below 85%. Consider hiring or activating more riders.',
      descriptionAr: 'تحقيق الساعات أقل من 85%. النظر في التوظيف أو تفعيل المزيد من المناديب.',
      actions: [
        {
          action: 'Hire 5-7 new riders',
          actionAr: 'توظيف 5-7 مندوب جديد',
          owner: 'hr',
          ownerAr: 'الموارد البشرية',
          deadline: 'Within 2 weeks',
        },
        {
          action: 'Reactivate inactive riders',
          actionAr: 'إعادة تفعيل المناديب غير النشطين',
          owner: 'operations_manager',
          ownerAr: 'مدير العمليات',
          deadline: 'This week',
        },
      ],
      impact: [
        {
          metric: 'Hours Achievement',
          metricAr: 'تحقيق الساعات',
          expectedChange: 8,
          timeframe: '2 weeks',
        },
      ],
      rule: 'LOW_HOURS_ACHIEVEMENT',
      confidence: 90,
    });
  }
  // Medium priority
  else if (achievement < BUSINESS_RULES.MODERATE_HOURS_ACHIEVEMENT.threshold) {
    recommendations.push({
      id: 'HOURS_MEDIUM',
      category: 'capacity_management',
      categoryAr: 'إدارة الطاقة',
      priority: 'medium',
      trigger: {
        metric: 'Hours Achievement',
        metricAr: 'تحقيق الساعات',
        condition: '<',
        threshold: BUSINESS_RULES.MODERATE_HOURS_ACHIEVEMENT.threshold,
        actual: achievement,
      },
      title: 'Optimize Hours Achievement',
      titleAr: 'تحسين تحقيق الساعات',
      description: 'Hours achievement can be improved to reach 90%+ target.',
      descriptionAr: 'يمكن تحسين تحقيق الساعات للوصول إلى هدف 90%+.',
      actions: [
        {
          action: 'Increase working hours for part-time riders',
          actionAr: 'زيادة ساعات العمل للمناديب بدوام جزئي',
          owner: 'supervisor',
          ownerAr: 'المشرف',
          deadline: 'This week',
        },
      ],
      impact: [
        {
          metric: 'Hours Achievement',
          metricAr: 'تحقيق الساعات',
          expectedChange: 5,
          timeframe: '1 week',
        },
      ],
      rule: 'MODERATE_HOURS_ACHIEVEMENT',
      confidence: 85,
    });
  }
  
  return recommendations;
}

function checkAttendance(data: KPIEngineOutput): Recommendation[] {
  const recommendations: Recommendation[] = [];
  const attendance = data.attendance.attendancePercent.value.current;
  
  if (attendance < BUSINESS_RULES.CRITICAL_ATTENDANCE.threshold) {
    recommendations.push({
      id: 'ATTENDANCE_CRITICAL',
      category: 'urgent_action',
      categoryAr: 'إجراء عاجل',
      priority: 'critical',
      trigger: {
        metric: 'Attendance %',
        metricAr: 'نسبة الحضور',
        condition: '<',
        threshold: BUSINESS_RULES.CRITICAL_ATTENDANCE.threshold,
        actual: attendance,
      },
      title: 'CRITICAL: Attendance Below 75%',
      titleAr: 'حرج: الحضور أقل من 75%',
      description: 'Attendance is critically low. Immediate investigation and action required.',
      descriptionAr: 'الحضور منخفض بشكل حرج. يتطلب تحقيقاً وإجراءً فورياً.',
      actions: [
        {
          action: 'Investigate root cause of low attendance',
          actionAr: 'التحقيق في السبب الجذري لانخفاض الحضور',
          owner: 'operations_manager',
          ownerAr: 'مدير العمليات',
          deadline: 'Today',
        },
        {
          action: 'Implement attendance tracking and follow-up',
          actionAr: 'تطبيق تتبع ومتابعة الحضور',
          owner: 'supervisor',
          ownerAr: 'المشرف',
          deadline: 'Immediate',
        },
      ],
      impact: [
        {
          metric: 'Attendance %',
          metricAr: 'نسبة الحضور',
          expectedChange: 10,
          timeframe: '1 week',
        },
      ],
      rule: 'CRITICAL_ATTENDANCE',
      confidence: 90,
    });
  } else if (attendance < BUSINESS_RULES.LOW_ATTENDANCE.threshold) {
    recommendations.push({
      id: 'ATTENDANCE_HIGH',
      category: 'quality_enhancement',
      categoryAr: 'تحسين الجودة',
      priority: 'high',
      trigger: {
        metric: 'Attendance %',
        metricAr: 'نسبة الحضور',
        condition: '<',
        threshold: BUSINESS_RULES.LOW_ATTENDANCE.threshold,
        actual: attendance,
      },
      title: 'Improve Attendance Rate',
      titleAr: 'تحسين معدل الحضور',
      description: 'Attendance is below target. Implement incentives and follow-up.',
      descriptionAr: 'الحضور أقل من الهدف. تطبيق الحوافز والمتابعة.',
      actions: [
        {
          action: 'Launch attendance incentive program',
          actionAr: 'إطلاق برنامج حوافز الحضور',
          owner: 'operations_manager',
          ownerAr: 'مدير العمليات',
          deadline: 'Within 1 week',
        },
      ],
      impact: [
        {
          metric: 'Attendance %',
          metricAr: 'نسبة الحضور',
          expectedChange: 5,
          timeframe: '2 weeks',
        },
      ],
      rule: 'LOW_ATTENDANCE',
      confidence: 85,
    });
  }
  
  return recommendations;
}

function checkOrdersPerHour(data: KPIEngineOutput): Recommendation[] {
  const recommendations: Recommendation[] = [];
  const oph = data.orders.ordersPerHour.value.current;
  
  if (oph < BUSINESS_RULES.LOW_ORDERS_PER_HOUR.threshold) {
    recommendations.push({
      id: 'OPH_HIGH',
      category: 'performance_improvement',
      categoryAr: 'تحسين الأداء',
      priority: 'high',
      trigger: {
        metric: 'Orders per Hour',
        metricAr: 'أوردر/ساعة',
        condition: '<',
        threshold: BUSINESS_RULES.LOW_ORDERS_PER_HOUR.threshold,
        actual: oph,
      },
      title: 'Low Productivity (Orders/Hour)',
      titleAr: 'إنتاجية منخفضة (أوردر/ساعة)',
      description: 'Orders per hour is below 2.0. Training and optimization needed.',
      descriptionAr: 'الأوردرات/ساعة أقل من 2.0. يتطلب تدريب وتحسين.',
      actions: [
        {
          action: 'Provide productivity training',
          actionAr: 'تقديم تدريب على الإنتاجية',
          owner: 'supervisor',
          ownerAr: 'المشرف',
          deadline: 'Within 2 weeks',
        },
        {
          action: 'Optimize zone assignments',
          actionAr: 'تحسين توزيع المناطق',
          owner: 'operations_manager',
          ownerAr: 'مدير العمليات',
          deadline: 'This week',
        },
      ],
      impact: [
        {
          metric: 'Orders per Hour',
          metricAr: 'أوردر/ساعة',
          expectedChange: 0.5,
          timeframe: '2-3 weeks',
        },
      ],
      rule: 'LOW_ORDERS_PER_HOUR',
      confidence: 80,
    });
  } else if (oph < BUSINESS_RULES.MODERATE_ORDERS_PER_HOUR.threshold) {
    recommendations.push({
      id: 'OPH_MEDIUM',
      category: 'performance_improvement',
      categoryAr: 'تحسين الأداء',
      priority: 'medium',
      trigger: {
        metric: 'Orders per Hour',
        metricAr: 'أوردر/ساعة',
        condition: '<',
        threshold: BUSINESS_RULES.MODERATE_ORDERS_PER_HOUR.threshold,
        actual: oph,
      },
      title: 'Optimize Productivity',
      titleAr: 'تحسين الإنتاجية',
      description: 'Orders per hour can be improved to reach 2.3+ target.',
      descriptionAr: 'يمكن تحسين الأوردرات/ساعة للوصول إلى هدف 2.3+.',
      actions: [
        {
          action: 'Share best practices from top performers',
          actionAr: 'مشاركة أفضل الممارسات من المناديب الأفضل',
          owner: 'supervisor',
          ownerAr: 'المشرف',
          deadline: 'This week',
        },
      ],
      impact: [
        {
          metric: 'Orders per Hour',
          metricAr: 'أوردر/ساعة',
          expectedChange: 0.2,
          timeframe: '1-2 weeks',
        },
      ],
      rule: 'MODERATE_ORDERS_PER_HOUR',
      confidence: 75,
    });
  }
  
  return recommendations;
}

function checkBreakTime(data: KPIEngineOutput): Recommendation[] {
  const recommendations: Recommendation[] = [];
  const breakPercent = data.break.breakPercent.value.current;
  
  if (breakPercent > BUSINESS_RULES.HIGH_BREAK_PERCENT.threshold) {
    recommendations.push({
      id: 'BREAK_HIGH',
      category: 'performance_improvement',
      categoryAr: 'تحسين الأداء',
      priority: 'high',
      trigger: {
        metric: 'Break %',
        metricAr: 'نسبة الاستراحة',
        condition: '>',
        threshold: BUSINESS_RULES.HIGH_BREAK_PERCENT.threshold,
        actual: breakPercent,
      },
      title: 'Excessive Break Time',
      titleAr: 'وقت استراحة مفرط',
      description: 'Break time exceeds 10%. Implement break time management.',
      descriptionAr: 'وقت الاستراحة يتجاوز 10%. تطبيق إدارة وقت الاستراحة.',
      actions: [
        {
          action: 'Enforce break time policy',
          actionAr: 'تطبيق سياسة وقت الاستراحة',
          owner: 'supervisor',
          ownerAr: 'المشرف',
          deadline: 'Immediate',
        },
      ],
      impact: [
        {
          metric: 'Break %',
          metricAr: 'نسبة الاستراحة',
          expectedChange: -3,
          timeframe: '1 week',
        },
      ],
      rule: 'HIGH_BREAK_PERCENT',
      confidence: 85,
    });
  } else if (breakPercent > BUSINESS_RULES.MODERATE_BREAK.threshold) {
    recommendations.push({
      id: 'BREAK_MEDIUM',
      category: 'performance_improvement',
      categoryAr: 'تحسين الأداء',
      priority: 'medium',
      trigger: {
        metric: 'Break %',
        metricAr: 'نسبة الاستراحة',
        condition: '>',
        threshold: BUSINESS_RULES.MODERATE_BREAK.threshold,
        actual: breakPercent,
      },
      title: 'Optimize Break Time',
      titleAr: 'تحسين وقت الاستراحة',
      description: 'Break time can be reduced to <8% target.',
      descriptionAr: 'يمكن تقليل وقت الاستراحة لهدف <8%.',
      actions: [
        {
          action: 'Monitor and coach riders on break management',
          actionAr: 'مراقبة وتوجيه المناديب في إدارة الاستراحة',
          owner: 'supervisor',
          ownerAr: 'المشرف',
          deadline: 'This week',
        },
      ],
      impact: [
        {
          metric: 'Break %',
          metricAr: 'نسبة الاستراحة',
          expectedChange: -1.5,
          timeframe: '1-2 weeks',
        },
      ],
      rule: 'MODERATE_BREAK',
      confidence: 75,
    });
  }
  
  return recommendations;
}

function checkLatePercent(data: KPIEngineOutput): Recommendation[] {
  const recommendations: Recommendation[] = [];
  const latePercent = data.late.latePercent.value.current;
  
  if (latePercent > BUSINESS_RULES.HIGH_LATE_PERCENT.threshold) {
    recommendations.push({
      id: 'LATE_HIGH',
      category: 'quality_enhancement',
      categoryAr: 'تحسين الجودة',
      priority: 'high',
      trigger: {
        metric: 'Late %',
        metricAr: 'نسبة التأخير',
        condition: '>',
        threshold: BUSINESS_RULES.HIGH_LATE_PERCENT.threshold,
        actual: latePercent,
      },
      title: 'High Late Arrival Rate',
      titleAr: 'معدل تأخير عالي',
      description: 'Late arrivals exceed 15%. Implement punctuality measures.',
      descriptionAr: 'التأخير يتجاوز 15%. تطبيق إجراءات الالتزام بالمواعيد.',
      actions: [
        {
          action: 'Implement punctuality tracking and consequences',
          actionAr: 'تطبيق تتبع الالتزام بالمواعيد والعواقب',
          owner: 'operations_manager',
          ownerAr: 'مدير العمليات',
          deadline: 'Within 1 week',
        },
      ],
      impact: [
        {
          metric: 'Late %',
          metricAr: 'نسبة التأخير',
          expectedChange: -5,
          timeframe: '2 weeks',
        },
      ],
      rule: 'HIGH_LATE_PERCENT',
      confidence: 80,
    });
  }
  
  return recommendations;
}

function checkLostHours(data: KPIEngineOutput): Recommendation[] {
  const recommendations: Recommendation[] = [];
  const lostHours = data.lostHours.lostPercent.value.current;
  
  if (lostHours > BUSINESS_RULES.CRITICAL_LOST_HOURS.threshold) {
    recommendations.push({
      id: 'LOST_HOURS_CRITICAL',
      category: 'urgent_action',
      categoryAr: 'إجراء عاجل',
      priority: 'critical',
      trigger: {
        metric: 'Lost Hours %',
        metricAr: 'نسبة الساعات الضائعة',
        condition: '>',
        threshold: BUSINESS_RULES.CRITICAL_LOST_HOURS.threshold,
        actual: lostHours,
      },
      title: 'CRITICAL: Excessive Lost Hours',
      titleAr: 'حرج: ساعات ضائعة مفرطة',
      description: 'Lost hours exceed 25%. Urgent action to reduce waste.',
      descriptionAr: 'الساعات الضائعة تتجاوز 25%. إجراء عاجل لتقليل الهدر.',
      actions: [
        {
          action: 'Analyze lost hours breakdown by category',
          actionAr: 'تحليل تفصيل الساعات الضائعة حسب الفئة',
          owner: 'operations_manager',
          ownerAr: 'مدير العمليات',
          deadline: 'Today',
        },
        {
          action: 'Address attendance and break issues immediately',
          actionAr: 'معالجة مشاكل الحضور والاستراحة فوراً',
          owner: 'supervisor',
          ownerAr: 'المشرف',
          deadline: 'Immediate',
        },
      ],
      impact: [
        {
          metric: 'Lost Hours %',
          metricAr: 'نسبة الساعات الضائعة',
          expectedChange: -8,
          timeframe: '1 week',
        },
      ],
      rule: 'CRITICAL_LOST_HOURS',
      confidence: 90,
    });
  }
  
  return recommendations;
}

function checkInactiveRiders(data: KPIEngineOutput): Recommendation[] {
  const recommendations: Recommendation[] = [];
  const totalRiders = data.headcount.registeredRiders.value.current;
  const workingRiders = data.headcount.workingRiders.value.current;
  const inactivePercent = ((totalRiders - workingRiders) / totalRiders) * 100;
  
  if (inactivePercent > BUSINESS_RULES.HIGH_INACTIVE_RIDERS.threshold) {
    recommendations.push({
      id: 'INACTIVE_RIDERS',
      category: 'cost_optimization',
      categoryAr: 'تحسين التكاليف',
      priority: 'medium',
      trigger: {
        metric: 'Inactive Riders %',
        metricAr: 'نسبة المناديب غير النشطين',
        condition: '>',
        threshold: BUSINESS_RULES.HIGH_INACTIVE_RIDERS.threshold,
        actual: inactivePercent,
      },
      title: 'High Inactive Rider Ratio',
      titleAr: 'نسبة عالية من المناديب غير النشطين',
      description: 'Over 30% of riders are inactive. Consider reactivation or cleanup.',
      descriptionAr: 'أكثر من 30% من المناديب غير نشطين. النظر في إعادة التفعيل أو التنظيف.',
      actions: [
        {
          action: 'Launch rider reactivation campaign',
          actionAr: 'إطلاق حملة إعادة تفعيل المناديب',
          owner: 'operations_manager',
          ownerAr: 'مدير العمليات',
          deadline: 'Within 2 weeks',
        },
        {
          action: 'Clean up permanently inactive riders from system',
          actionAr: 'تنظيف المناديب غير النشطين بشكل دائم من النظام',
          owner: 'hr',
          ownerAr: 'الموارد البشرية',
          deadline: 'Within 1 month',
        },
      ],
      impact: [
        {
          metric: 'Active Riders %',
          metricAr: 'نسبة المناديب النشطين',
          expectedChange: 10,
          timeframe: '3-4 weeks',
        },
      ],
      rule: 'HIGH_INACTIVE_RIDERS',
      confidence: 75,
    });
  }
  
  return recommendations;
}
