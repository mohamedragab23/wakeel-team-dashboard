/**
 * Opportunity Detection Engine
 * 
 * Detects untapped opportunities for performance improvement.
 * Implements SRS-004 Section 4: Opportunity Detection Engine.
 * 
 * Answers: "What opportunities exist to improve performance?"
 * 
 * @module OpportunityDetection
 * @version 1.0
 */

import type { KPIEngineOutput } from '@/lib/strategicOps/kpi';
import type { RiderDistributionBucket, SupervisorPerformance } from '@/lib/strategicOps/kpi/types';

// ============================================================================
// TYPES
// ============================================================================

export type OpportunityType =
  | 'high_performer_promotion'
  | 'underutilized_capacity'
  | 'low_performer_improvement'
  | 'break_reduction'
  | 'late_reduction'
  | 'reactivation'
  | 'efficiency_improvement'
  | 'zone_expansion'
  | 'supervisor_training'
  | 'equipment_optimization';

export type Opportunity = {
  type: OpportunityType;
  typeAr: string;
  title: string;
  titleAr: string;
  description: string;
  descriptionAr: string;
  
  // Impact
  potentialHoursGain: number;
  potentialOrdersGain: number;
  potentialRevenueGain: number;
  
  // Effort & Feasibility
  implementationDifficulty: 'easy' | 'medium' | 'hard';
  timeToRealize: 'immediate' | 'short' | 'medium' | 'long'; // immediate, 1 week, 1 month, 3+ months
  cost: 'low' | 'medium' | 'high';
  
  // Priority
  priority: number; // 1-10 (10 = highest)
  score: number; // Impact / Effort ratio
  
  // Action items
  actionSteps: string[];
  actionStepsAr: string[];
  
  // Metrics to track
  successMetrics: string[];
  successMetricsAr: string[];
};

export type OpportunityAnalysis = {
  totalOpportunities: number;
  highPriorityCount: number;
  totalPotentialHoursGain: number;
  totalPotentialOrdersGain: number;
  opportunities: Opportunity[];
  quickWins: Opportunity[]; // Easy + immediate
  strategicInitiatives: Opportunity[]; // High impact + long term
};

// ============================================================================
// OPPORTUNITY LABELS
// ============================================================================

const OPPORTUNITY_TYPE_LABELS_AR: Record<OpportunityType, string> = {
  high_performer_promotion: 'ترقية المتميزين',
  underutilized_capacity: 'طاقة غير مستغلة',
  low_performer_improvement: 'تحسين أداء الضعفاء',
  break_reduction: 'تقليل وقت الاستراحة',
  late_reduction: 'تقليل التأخير',
  reactivation: 'إعادة تفعيل المناديب',
  efficiency_improvement: 'تحسين الكفاءة',
  zone_expansion: 'توسع جغرافي',
  supervisor_training: 'تدريب المشرفين',
  equipment_optimization: 'تحسين المعدات',
};

// ============================================================================
// OPPORTUNITY DETECTION ENGINE
// ============================================================================

/**
 * Detect all opportunities for improvement
 */
export function detectOpportunities(kpis: KPIEngineOutput): OpportunityAnalysis {
  const opportunities: Opportunity[] = [];
  
  // 1. High performer promotion opportunity
  const highPerformerOpp = detectHighPerformerOpportunity(kpis);
  if (highPerformerOpp) opportunities.push(highPerformerOpp);
  
  // 2. Underutilized capacity
  const capacityOpp = detectUnderutilizedCapacity(kpis);
  if (capacityOpp) opportunities.push(capacityOpp);
  
  // 3. Low performer improvement
  const lowPerformerOpp = detectLowPerformerOpportunity(kpis);
  if (lowPerformerOpp) opportunities.push(lowPerformerOpp);
  
  // 4. Break reduction
  const breakOpp = detectBreakReductionOpportunity(kpis);
  if (breakOpp) opportunities.push(breakOpp);
  
  // 5. Late reduction
  const lateOpp = detectLateReductionOpportunity(kpis);
  if (lateOpp) opportunities.push(lateOpp);
  
  // 6. Reactivation opportunity
  const reactivationOpp = detectReactivationOpportunity(kpis);
  if (reactivationOpp) opportunities.push(reactivationOpp);
  
  // 7. Efficiency improvement (orders per hour)
  const efficiencyOpp = detectEfficiencyOpportunity(kpis);
  if (efficiencyOpp) opportunities.push(efficiencyOpp);
  
  // Sort by score (impact/effort ratio)
  opportunities.sort((a, b) => b.score - a.score);
  
  // Assign priorities
  opportunities.forEach((opp, idx) => {
    opp.priority = Math.max(1, 10 - idx);
  });
  
  // Calculate totals
  const totalPotentialHoursGain = opportunities.reduce((sum, opp) => sum + opp.potentialHoursGain, 0);
  const totalPotentialOrdersGain = opportunities.reduce((sum, opp) => sum + opp.potentialOrdersGain, 0);
  
  // Identify quick wins (easy + immediate)
  const quickWins = opportunities.filter(
    opp => opp.implementationDifficulty === 'easy' && opp.timeToRealize === 'immediate'
  );
  
  // Identify strategic initiatives (high impact)
  const strategicInitiatives = opportunities.filter(
    opp => opp.potentialHoursGain > 50 || opp.score > 7
  );
  
  return {
    totalOpportunities: opportunities.length,
    highPriorityCount: opportunities.filter(opp => opp.priority >= 8).length,
    totalPotentialHoursGain,
    totalPotentialOrdersGain,
    opportunities,
    quickWins,
    strategicInitiatives,
  };
}

// ============================================================================
// INDIVIDUAL OPPORTUNITY DETECTORS
// ============================================================================

/**
 * Detect high performers who could take on more work
 */
function detectHighPerformerOpportunity(kpis: KPIEngineOutput): Opportunity | null {
  // Check if there are riders in 10+ hours bucket
  const distribution = kpis.distribution.hoursDistribution;
  const highPerformerBucket = distribution[distribution.length - 1]; // 10+ hours
  
  if (highPerformerBucket && highPerformerBucket.riderCount >= 5) {
    // These riders could potentially work more or help train others
    const avgOrders = highPerformerBucket.averageOrders;
    const potentialGain = highPerformerBucket.riderCount * 2; // 2 extra hours per rider
    
    return {
      type: 'high_performer_promotion',
      typeAr: OPPORTUNITY_TYPE_LABELS_AR.high_performer_promotion,
      title: 'Leverage High Performers',
      titleAr: 'الاستفادة من المتميزين',
      description: `You have ${highPerformerBucket.riderCount} high-performing riders (10+ hours). They can mentor others or take on leadership roles.`,
      descriptionAr: `لديك ${highPerformerBucket.riderCount} مندوب متميز (10+ ساعات). يمكنهم تدريب الآخرين أو القيام بأدوار قيادية.`,
      potentialHoursGain: potentialGain,
      potentialOrdersGain: Math.round(potentialGain * kpis.orders.ordersPerHour.value.current),
      potentialRevenueGain: potentialGain * 50, // Estimate $50/hour
      implementationDifficulty: 'medium',
      timeToRealize: 'short',
      cost: 'low',
      priority: 8,
      score: 7.5,
      actionSteps: [
        'Identify top 10 performers',
        'Create mentor-mentee program',
        'Assign leadership responsibilities',
        'Provide incentives for mentoring',
      ],
      actionStepsAr: [
        'تحديد أفضل 10 مناديب',
        'إنشاء برنامج الإرشاد',
        'تعيين مسؤوليات قيادية',
        'توفير حوافز للإرشاد',
      ],
      successMetrics: [
        'Number of riders trained',
        'Improvement in team average orders',
        'Retention rate of high performers',
      ],
      successMetricsAr: [
        'عدد المناديب المدربين',
        'تحسين متوسط الأوردرات للفريق',
        'معدل الاحتفاظ بالمتميزين',
      ],
    };
  }
  
  return null;
}

/**
 * Detect underutilized capacity
 */
function detectUnderutilizedCapacity(kpis: KPIEngineOutput): Opportunity | null {
  const capacityUtilization = kpis.headcount.capacityUtilization.value.current;
  
  if (capacityUtilization < 70) {
    const potentialHours = kpis.hours.potentialHours.value.current;
    const actualHours = kpis.hours.totalWorkingHours.value.current;
    const unutilizedHours = potentialHours - actualHours;
    
    return {
      type: 'underutilized_capacity',
      typeAr: OPPORTUNITY_TYPE_LABELS_AR.underutilized_capacity,
      title: 'Underutilized Capacity',
      titleAr: 'طاقة غير مستغلة',
      description: `Only ${capacityUtilization.toFixed(1)}% of capacity is utilized. ${unutilizedHours.toFixed(0)} hours are untapped.`,
      descriptionAr: `فقط ${capacityUtilization.toFixed(1)}% من الطاقة مستغلة. ${unutilizedHours.toFixed(0)} ساعة غير مستغلة.`,
      potentialHoursGain: unutilizedHours * 0.5, // Assume we can capture 50%
      potentialOrdersGain: Math.round(unutilizedHours * 0.5 * kpis.orders.ordersPerHour.value.current),
      potentialRevenueGain: unutilizedHours * 0.5 * 50,
      implementationDifficulty: 'medium',
      timeToRealize: 'medium',
      cost: 'medium',
      priority: 9,
      score: 8.5,
      actionSteps: [
        'Analyze why riders are not working full capacity',
        'Improve shift scheduling',
        'Increase order availability',
        'Provide incentives for extra hours',
      ],
      actionStepsAr: [
        'تحليل لماذا المناديب لا يعملون بكامل الطاقة',
        'تحسين جدولة الورديات',
        'زيادة توفر الأوردرات',
        'توفير حوافز للساعات الإضافية',
      ],
      successMetrics: [
        'Capacity utilization %',
        'Average hours per rider',
        'Total working hours',
      ],
      successMetricsAr: [
        'نسبة استغلال الطاقة',
        'متوسط الساعات لكل مندوب',
        'إجمالي ساعات العمل',
      ],
    };
  }
  
  return null;
}

/**
 * Detect low performers who can be improved
 */
function detectLowPerformerOpportunity(kpis: KPIEngineOutput): Opportunity | null {
  // Check riders with 0-2 hours
  const distribution = kpis.distribution.hoursDistribution;
  const lowPerformerBucket = distribution.find(b => b.minHours === 0 && b.maxHours === 2);
  
  if (lowPerformerBucket && lowPerformerBucket.riderCount >= 10) {
    const potentialGain = lowPerformerBucket.riderCount * 5; // If each works 5 more hours
    
    return {
      type: 'low_performer_improvement',
      typeAr: OPPORTUNITY_TYPE_LABELS_AR.low_performer_improvement,
      title: 'Low Performer Improvement',
      titleAr: 'تحسين أداء الضعفاء',
      description: `${lowPerformerBucket.riderCount} riders are working < 2 hours. Significant improvement potential.`,
      descriptionAr: `${lowPerformerBucket.riderCount} مندوب يعملون < 2 ساعة. إمكانية تحسين كبيرة.`,
      potentialHoursGain: potentialGain,
      potentialOrdersGain: Math.round(potentialGain * kpis.orders.ordersPerHour.value.current),
      potentialRevenueGain: potentialGain * 50,
      implementationDifficulty: 'hard',
      timeToRealize: 'medium',
      cost: 'medium',
      priority: 7,
      score: 6.0,
      actionSteps: [
        'Identify reasons for low performance',
        'Provide training and support',
        'Set performance improvement plans',
        'Consider termination for non-improvement',
      ],
      actionStepsAr: [
        'تحديد أسباب الأداء المنخفض',
        'توفير التدريب والدعم',
        'وضع خطط تحسين الأداء',
        'النظر في الإقالة في حالة عدم التحسن',
      ],
      successMetrics: [
        'Number of riders moving to higher buckets',
        'Average hours improvement',
        'Reduction in 0-2 hour bucket',
      ],
      successMetricsAr: [
        'عدد المناديب الذين انتقلوا لفئات أعلى',
        'تحسين متوسط الساعات',
        'انخفاض فئة 0-2 ساعة',
      ],
    };
  }
  
  return null;
}

/**
 * Detect break reduction opportunity
 */
function detectBreakReductionOpportunity(kpis: KPIEngineOutput): Opportunity | null {
  const breakPercent = kpis.break.breakPercent.value.current;
  
  if (breakPercent > 8) {
    const excessBreak = kpis.break.totalBreakMinutes.value.current - (kpis.hours.totalWorkingHours.value.current * 60 * 0.08);
    const potentialGain = excessBreak / 60;
    
    return {
      type: 'break_reduction',
      typeAr: OPPORTUNITY_TYPE_LABELS_AR.break_reduction,
      title: 'Reduce Excessive Break Time',
      titleAr: 'تقليل وقت الاستراحة الزائد',
      description: `Break time is ${breakPercent.toFixed(1)}% (target: 8%). ${potentialGain.toFixed(0)} hours can be recovered.`,
      descriptionAr: `وقت الاستراحة ${breakPercent.toFixed(1)}% (الهدف: 8%). يمكن استرجاع ${potentialGain.toFixed(0)} ساعة.`,
      potentialHoursGain: potentialGain,
      potentialOrdersGain: Math.round(potentialGain * kpis.orders.ordersPerHour.value.current),
      potentialRevenueGain: potentialGain * 50,
      implementationDifficulty: 'easy',
      timeToRealize: 'immediate',
      cost: 'low',
      priority: 9,
      score: 9.5, // High impact, easy to implement
      actionSteps: [
        'Enforce 8% break policy',
        'Monitor break times daily',
        'Set alerts for excessive breaks',
        'Provide feedback to supervisors',
      ],
      actionStepsAr: [
        'تطبيق سياسة 8% استراحة',
        'مراقبة أوقات الاستراحة يومياً',
        'إنشاء تنبيهات للاستراحات الزائدة',
        'تقديم ملاحظات للمشرفين',
      ],
      successMetrics: [
        'Break % reduction',
        'Total break minutes',
        'Hours recovered',
      ],
      successMetricsAr: [
        'انخفاض نسبة الاستراحة',
        'إجمالي دقائق الاستراحة',
        'الساعات المستردة',
      ],
    };
  }
  
  return null;
}

/**
 * Detect late reduction opportunity
 */
function detectLateReductionOpportunity(kpis: KPIEngineOutput): Opportunity | null {
  const latePercent = kpis.late.latePercent.value.current;
  
  if (latePercent > 5) {
    const excessLate = kpis.late.totalLateMinutes.value.current - (kpis.hours.totalWorkingHours.value.current * 60 * 0.05);
    const potentialGain = excessLate / 60;
    
    return {
      type: 'late_reduction',
      typeAr: OPPORTUNITY_TYPE_LABELS_AR.late_reduction,
      title: 'Reduce Lateness',
      titleAr: 'تقليل التأخير',
      description: `Lateness is ${latePercent.toFixed(1)}% (target: 5%). ${potentialGain.toFixed(0)} hours can be recovered.`,
      descriptionAr: `التأخير ${latePercent.toFixed(1)}% (الهدف: 5%). يمكن استرجاع ${potentialGain.toFixed(0)} ساعة.`,
      potentialHoursGain: potentialGain,
      potentialOrdersGain: Math.round(potentialGain * kpis.orders.ordersPerHour.value.current),
      potentialRevenueGain: potentialGain * 50,
      implementationDifficulty: 'easy',
      timeToRealize: 'immediate',
      cost: 'low',
      priority: 8,
      score: 8.5,
      actionSteps: [
        'Implement stricter punctuality policies',
        'Set penalties for repeated lateness',
        'Reward on-time riders',
        'Monitor daily attendance',
      ],
      actionStepsAr: [
        'تطبيق سياسات التزام أكثر صرامة',
        'وضع عقوبات للتأخير المتكرر',
        'مكافأة المناديب الملتزمين',
        'مراقبة الحضور اليومي',
      ],
      successMetrics: [
        'Late % reduction',
        'On-time arrival rate',
        'Hours recovered',
      ],
      successMetricsAr: [
        'انخفاض نسبة التأخير',
        'معدل الوصول في الوقت المحدد',
        'الساعات المستردة',
      ],
    };
  }
  
  return null;
}

/**
 * Detect reactivation opportunity
 */
function detectReactivationOpportunity(kpis: KPIEngineOutput): Opportunity | null {
  const inactiveRiders = kpis.headcount.inactiveRiders.value.current;
  
  if (inactiveRiders >= 20) {
    const potentialGain = inactiveRiders * 0.3 * 8; // 30% can be reactivated, 8 hours each
    
    return {
      type: 'reactivation',
      typeAr: OPPORTUNITY_TYPE_LABELS_AR.reactivation,
      title: 'Reactivate Inactive Riders',
      titleAr: 'إعادة تفعيل المناديب غير النشطين',
      description: `${inactiveRiders} riders are inactive. Reactivating 30% could add significant capacity.`,
      descriptionAr: `${inactiveRiders} مندوب غير نشط. إعادة تفعيل 30% يمكن أن يضيف طاقة كبيرة.`,
      potentialHoursGain: potentialGain,
      potentialOrdersGain: Math.round(potentialGain * kpis.orders.ordersPerHour.value.current),
      potentialRevenueGain: potentialGain * 50,
      implementationDifficulty: 'medium',
      timeToRealize: 'short',
      cost: 'low',
      priority: 8,
      score: 7.5,
      actionSteps: [
        'Contact inactive riders',
        'Understand reasons for inactivity',
        'Offer incentives for reactivation',
        'Provide retraining if needed',
      ],
      actionStepsAr: [
        'التواصل مع المناديب غير النشطين',
        'فهم أسباب عدم النشاط',
        'تقديم حوافز لإعادة التفعيل',
        'توفير إعادة تدريب إذا لزم الأمر',
      ],
      successMetrics: [
        'Number of reactivated riders',
        'Reactivation rate',
        'Hours added',
      ],
      successMetricsAr: [
        'عدد المناديب المعاد تفعيلهم',
        'معدل إعادة التفعيل',
        'الساعات المضافة',
      ],
    };
  }
  
  return null;
}

/**
 * Detect efficiency improvement opportunity
 */
function detectEfficiencyOpportunity(kpis: KPIEngineOutput): Opportunity | null {
  const ordersPerHour = kpis.orders.ordersPerHour.value.current;
  
  if (ordersPerHour < 2.5) {
    const potentialImprovement = 2.5 - ordersPerHour;
    const potentialOrdersGain = Math.round(potentialImprovement * kpis.hours.totalWorkingHours.value.current);
    
    return {
      type: 'efficiency_improvement',
      typeAr: OPPORTUNITY_TYPE_LABELS_AR.efficiency_improvement,
      title: 'Improve Productivity (Orders/Hour)',
      titleAr: 'تحسين الإنتاجية (أوردر/ساعة)',
      description: `Current productivity is ${ordersPerHour.toFixed(2)} orders/hour (target: 2.5). ${potentialOrdersGain} more orders possible.`,
      descriptionAr: `الإنتاجية الحالية ${ordersPerHour.toFixed(2)} أوردر/ساعة (الهدف: 2.5). ${potentialOrdersGain} أوردر إضافية ممكنة.`,
      potentialHoursGain: 0, // Efficiency improvement, not hours
      potentialOrdersGain,
      potentialRevenueGain: potentialOrdersGain * 10, // $10 per order
      implementationDifficulty: 'medium',
      timeToRealize: 'medium',
      cost: 'medium',
      priority: 9,
      score: 8.0,
      actionSteps: [
        'Optimize delivery routes',
        'Provide navigation training',
        'Improve rider support',
        'Reduce administrative time',
      ],
      actionStepsAr: [
        'تحسين مسارات التوصيل',
        'توفير تدريب على الملاحة',
        'تحسين دعم المناديب',
        'تقليل الوقت الإداري',
      ],
      successMetrics: [
        'Orders per hour increase',
        'Average delivery time reduction',
        'Customer satisfaction',
      ],
      successMetricsAr: [
        'زيادة الأوردرات لكل ساعة',
        'انخفاض متوسط وقت التوصيل',
        'رضا العملاء',
      ],
    };
  }
  
  return null;
}

/**
 * Generate opportunity summary
 */
export function generateOpportunitySummary(analysis: OpportunityAnalysis): {
  summaryEn: string;
  summaryAr: string;
} {
  if (analysis.totalOpportunities === 0) {
    return {
      summaryEn: 'No significant opportunities detected. Continue current operations.',
      summaryAr: 'لا توجد فرص كبيرة. استمر في العمليات الحالية.',
    };
  }
  
  const topOpp = analysis.opportunities[0];
  
  return {
    summaryEn: `${analysis.totalOpportunities} opportunities detected with potential to gain ${analysis.totalPotentialHoursGain.toFixed(0)} hours and ${analysis.totalPotentialOrdersGain.toLocaleString()} orders. Top opportunity: ${topOpp.title} (${topOpp.potentialHoursGain.toFixed(0)} hours gain).`,
    summaryAr: `تم اكتشاف ${analysis.totalOpportunities} فرصة بإمكانية كسب ${analysis.totalPotentialHoursGain.toFixed(0)} ساعة و ${analysis.totalPotentialOrdersGain.toLocaleString()} أوردر. أفضل فرصة: ${topOpp.titleAr} (${topOpp.potentialHoursGain.toFixed(0)} ساعة).`,
  };
}
