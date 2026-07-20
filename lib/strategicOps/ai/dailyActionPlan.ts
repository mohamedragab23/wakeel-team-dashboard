/**
 * Daily Action Plan Generator
 * 
 * Generates prioritized, actionable daily plans for executives and supervisors.
 * Combines insights from Root Cause, Opportunities, and Risks.
 * 
 * Implements SRS-004 Section 7: Daily Action Plan Generator.
 * 
 * Answers: "What should I do today to improve operations?"
 * 
 * @module DailyActionPlan
 * @version 1.0
 */

import type { KPIEngineOutput } from '@/lib/strategicOps/kpi';
import type { RootCauseAnalysis } from './rootCauseAnalysis';
import type { OpportunityAnalysis } from './opportunityDetection';
import type { RiskAnalysis } from './riskDetection';
import { RECOMMENDATION_PRIORITIES } from '@/lib/strategicOps/config/businessRules';

// ============================================================================
// TYPES
// ============================================================================

export type ActionTarget = 'executive' | 'supervisor' | 'rider' | 'system';

export type ActionCategory =
  | 'urgent_intervention'
  | 'performance_improvement'
  | 'risk_mitigation'
  | 'opportunity_capture'
  | 'quality_fix'
  | 'capacity_management'
  | 'training'
  | 'policy_enforcement';

export type Action = {
  id: string;
  title: string;
  titleAr: string;
  description: string;
  descriptionAr: string;
  
  // Classification
  category: ActionCategory;
  categoryAr: string;
  target: ActionTarget;
  targetAr: string;
  
  // Priority
  priority: number; // 1-10 (10 = highest)
  urgency: 'immediate' | 'today' | 'this_week' | 'this_month';
  
  // Impact
  expectedHoursImpact: number;
  expectedOrdersImpact: number;
  effort: 'low' | 'medium' | 'high';
  
  // Execution
  steps: string[];
  stepsAr: string[];
  assignedTo?: string; // Supervisor name or role
  deadline?: Date;
  
  // Tracking
  sourceType: 'root_cause' | 'opportunity' | 'risk' | 'kpi_threshold';
  sourceId?: string;
  metric?: string; // KPI to track
  targetValue?: number;
  
  // Context
  affectedRiders?: string[]; // Rider codes
  affectedZone?: string;
};

export type DailyActionPlan = {
  generatedAt: Date;
  dateRange: { from: string; to: string };
  
  // Summary
  totalActions: number;
  urgentActions: number;
  expectedHoursGain: number;
  expectedOrdersGain: number;
  
  // Actions by priority
  actions: Action[];
  
  // Segmented views
  executiveActions: Action[]; // For city head
  supervisorActions: Action[]; // For supervisors
  immediatePriorities: Action[]; // Top 5 urgent
  quickWins: Action[]; // Low effort, high impact
  
  // Daily focus
  topFocus: {
    titleEn: string;
    titleAr: string;
    actions: Action[];
  };
};

// ============================================================================
// ACTION CATEGORY LABELS
// ============================================================================

const ACTION_CATEGORY_LABELS_AR: Record<ActionCategory, string> = {
  urgent_intervention: 'تدخل عاجل',
  performance_improvement: 'تحسين الأداء',
  risk_mitigation: 'تخفيف المخاطر',
  opportunity_capture: 'اغتنام الفرص',
  quality_fix: 'إصلاح الجودة',
  capacity_management: 'إدارة الطاقة',
  training: 'تدريب',
  policy_enforcement: 'تطبيق السياسات',
};

const ACTION_TARGET_LABELS_AR: Record<ActionTarget, string> = {
  executive: 'الإدارة التنفيذية',
  supervisor: 'المشرف',
  rider: 'المندوب',
  system: 'النظام',
};

// ============================================================================
// DAILY ACTION PLAN GENERATOR
// ============================================================================

/**
 * Generate comprehensive daily action plan
 */
export function generateDailyActionPlan(
  kpis: KPIEngineOutput,
  rootCauses: RootCauseAnalysis,
  opportunities: OpportunityAnalysis,
  risks: RiskAnalysis
): DailyActionPlan {
  const actions: Action[] = [];
  let actionIdCounter = 1;
  
  // 1. Generate actions from root causes (problems to fix)
  rootCauses.rootCauses
    .filter(rc => rc.isActionable)
    .forEach(rc => {
      const action = generateRootCauseAction(rc, actionIdCounter++);
      if (action) actions.push(action);
    });
  
  // 2. Generate actions from opportunities (gains to capture)
  opportunities.quickWins.forEach(opp => {
    const action = generateOpportunityAction(opp, actionIdCounter++, 'quick_win');
    if (action) actions.push(action);
  });
  
  opportunities.opportunities
    .filter(opp => !opportunities.quickWins.includes(opp))
    .slice(0, 3) // Top 3 strategic opportunities
    .forEach(opp => {
      const action = generateOpportunityAction(opp, actionIdCounter++, 'strategic');
      if (action) actions.push(action);
    });
  
  // 3. Generate actions from risks (threats to mitigate)
  risks.immediateThreats.forEach(risk => {
    const action = generateRiskAction(risk, actionIdCounter++, true);
    if (action) actions.push(action);
  });
  
  risks.risks
    .filter(r => !risks.immediateThreats.includes(r))
    .filter(r => r.preventable)
    .slice(0, 3)
    .forEach(risk => {
      const action = generateRiskAction(risk, actionIdCounter++, false);
      if (action) actions.push(action);
    });
  
  // 4. Generate actions from KPI thresholds
  const thresholdActions = generateKPIThresholdActions(kpis, actionIdCounter);
  actions.push(...thresholdActions);
  
  // 5. Calculate priorities and sort
  actions.forEach(action => {
    action.priority = calculateActionPriority(action, kpis);
  });
  
  actions.sort((a, b) => b.priority - a.priority);
  
  // 6. Segment actions
  const executiveActions = actions.filter(a => a.target === 'executive' || a.priority >= 8);
  const supervisorActions = actions.filter(a => a.target === 'supervisor' || a.target === 'rider');
  const immediatePriorities = actions.filter(a => a.urgency === 'immediate').slice(0, 5);
  const quickWins = actions.filter(a => a.effort === 'low' && a.expectedHoursImpact > 10);
  
  // 7. Determine top focus for the day
  const topFocus = determineTopFocus(actions, rootCauses, opportunities, risks);
  
  // 8. Calculate expected impacts
  const expectedHoursGain = actions.reduce((sum, a) => sum + a.expectedHoursImpact, 0);
  const expectedOrdersGain = actions.reduce((sum, a) => sum + a.expectedOrdersImpact, 0);
  
  return {
    generatedAt: new Date(),
    dateRange: {
      from: kpis.hours.totalWorkingHours.dateRange?.from || '',
      to: kpis.hours.totalWorkingHours.dateRange?.to || '',
    },
    totalActions: actions.length,
    urgentActions: immediatePriorities.length,
    expectedHoursGain,
    expectedOrdersGain,
    actions,
    executiveActions,
    supervisorActions,
    immediatePriorities,
    quickWins,
    topFocus,
  };
}

// ============================================================================
// ACTION GENERATORS
// ============================================================================

/**
 * Generate action from root cause
 */
function generateRootCauseAction(
  rootCause: any,
  actionId: number
): Action | null {
  if (!rootCause.isActionable || rootCause.contributionHours < 5) return null;
  
  let category: ActionCategory;
  let urgency: Action['urgency'];
  
  if (rootCause.severity === 'critical') {
    category = 'urgent_intervention';
    urgency = 'immediate';
  } else if (rootCause.severity === 'high') {
    category = 'performance_improvement';
    urgency = 'today';
  } else {
    category = 'performance_improvement';
    urgency = 'this_week';
  }
  
  const target: ActionTarget = 
    rootCause.category === 'absence' || rootCause.category === 'late' || rootCause.category === 'break'
      ? 'supervisor'
      : 'executive';
  
  return {
    id: `RC-${actionId}`,
    title: `Fix: ${rootCause.title}`,
    titleAr: `إصلاح: ${rootCause.titleAr}`,
    description: `${rootCause.description} (${rootCause.contributionHours.toFixed(0)} hours impact)`,
    descriptionAr: `${rootCause.descriptionAr} (تأثير ${rootCause.contributionHours.toFixed(0)} ساعة)`,
    category,
    categoryAr: ACTION_CATEGORY_LABELS_AR[category],
    target,
    targetAr: ACTION_TARGET_LABELS_AR[target],
    priority: 0, // Will be calculated
    urgency,
    expectedHoursImpact: rootCause.contributionHours * 0.7, // Assume 70% recovery
    expectedOrdersImpact: 0,
    effort: rootCause.severity === 'critical' ? 'high' : 'medium',
    steps: rootCause.recommendations,
    stepsAr: rootCause.recommendationsAr,
    sourceType: 'root_cause',
    sourceId: rootCause.category,
  };
}

/**
 * Generate action from opportunity
 */
function generateOpportunityAction(
  opportunity: any,
  actionId: number,
  type: 'quick_win' | 'strategic'
): Action | null {
  const category: ActionCategory = 'opportunity_capture';
  const urgency: Action['urgency'] = 
    type === 'quick_win' ? 'today' : 
    opportunity.timeToRealize === 'immediate' ? 'today' : 'this_week';
  
  const target: ActionTarget =
    opportunity.type === 'high_performer_promotion' || 
    opportunity.type === 'break_reduction' ||
    opportunity.type === 'late_reduction'
      ? 'supervisor'
      : 'executive';
  
  return {
    id: `OPP-${actionId}`,
    title: opportunity.title,
    titleAr: opportunity.titleAr,
    description: opportunity.description,
    descriptionAr: opportunity.descriptionAr,
    category,
    categoryAr: ACTION_CATEGORY_LABELS_AR[category],
    target,
    targetAr: ACTION_TARGET_LABELS_AR[target],
    priority: 0,
    urgency,
    expectedHoursImpact: opportunity.potentialHoursGain,
    expectedOrdersImpact: opportunity.potentialOrdersGain,
    effort: opportunity.implementationDifficulty === 'easy' ? 'low' : 
            opportunity.implementationDifficulty === 'medium' ? 'medium' : 'high',
    steps: opportunity.actionSteps,
    stepsAr: opportunity.actionStepsAr,
    sourceType: 'opportunity',
    sourceId: opportunity.type,
  };
}

/**
 * Generate action from risk
 */
function generateRiskAction(
  risk: any,
  actionId: number,
  isImmediate: boolean
): Action | null {
  const category: ActionCategory = 'risk_mitigation';
  const urgency: Action['urgency'] = isImmediate ? 'immediate' : 
    risk.timeframe === 'immediate' ? 'today' : 'this_week';
  
  const target: ActionTarget = 
    risk.type === 'attendance_crisis' || risk.type === 'efficiency_drop'
      ? 'supervisor'
      : 'executive';
  
  return {
    id: `RISK-${actionId}`,
    title: `Mitigate: ${risk.title}`,
    titleAr: `تخفيف: ${risk.titleAr}`,
    description: risk.description,
    descriptionAr: risk.descriptionAr,
    category,
    categoryAr: ACTION_CATEGORY_LABELS_AR[category],
    target,
    targetAr: ACTION_TARGET_LABELS_AR[target],
    priority: 0,
    urgency,
    expectedHoursImpact: risk.impact * 0.5, // Assume 50% risk prevention
    expectedOrdersImpact: 0,
    effort: risk.severity === 'critical' ? 'high' : 'medium',
    steps: risk.mitigationSteps,
    stepsAr: risk.mitigationStepsAr,
    sourceType: 'risk',
    sourceId: risk.type,
  };
}

/**
 * Generate actions from KPI threshold violations
 */
function generateKPIThresholdActions(
  kpis: KPIEngineOutput,
  startId: number
): Action[] {
  const actions: Action[] = [];
  let actionId = startId;
  
  // Break exceeds 8%
  const breakPercent = kpis.break.breakPercent.value.current;
  if (breakPercent > 8) {
    actions.push({
      id: `KPI-${actionId++}`,
      title: 'Enforce Break Policy (8%)',
      titleAr: 'تطبيق سياسة الاستراحة (8%)',
      description: `Break time is ${breakPercent.toFixed(1)}%, exceeding 8% policy. Immediate enforcement required.`,
      descriptionAr: `وقت الاستراحة ${breakPercent.toFixed(1)}%، يتجاوز سياسة 8%. تطبيق فوري مطلوب.`,
      category: 'policy_enforcement',
      categoryAr: ACTION_CATEGORY_LABELS_AR.policy_enforcement,
      target: 'supervisor',
      targetAr: ACTION_TARGET_LABELS_AR.supervisor,
      priority: 9,
      urgency: 'immediate',
      expectedHoursImpact: kpis.break.estimatedLostHoursDueToBreak.value.current - 
        (kpis.hours.totalWorkingHours.value.current * 0.08),
      expectedOrdersImpact: 0,
      effort: 'low',
      steps: [
        'Send break policy reminder to all supervisors',
        'Monitor break times in real-time',
        'Set automatic alerts for >8% breaks',
        'Apply penalties for violations',
      ],
      stepsAr: [
        'إرسال تذكير بسياسة الاستراحة لجميع المشرفين',
        'مراقبة أوقات الاستراحة في الوقت الفعلي',
        'إنشاء تنبيهات تلقائية لاستراحات >8%',
        'تطبيق عقوبات للمخالفات',
      ],
      sourceType: 'kpi_threshold',
      metric: 'break.breakPercent',
      targetValue: 8,
    });
  }
  
  // Late exceeds 5%
  const latePercent = kpis.late.latePercent.value.current;
  if (latePercent > 5) {
    actions.push({
      id: `KPI-${actionId++}`,
      title: 'Reduce Lateness (Target: 5%)',
      titleAr: 'تقليل التأخير (الهدف: 5%)',
      description: `Lateness is ${latePercent.toFixed(1)}%, above 5% target. Punctuality enforcement needed.`,
      descriptionAr: `التأخير ${latePercent.toFixed(1)}%، أعلى من هدف 5%. تطبيق الالتزام بالمواعيد مطلوب.`,
      category: 'policy_enforcement',
      categoryAr: ACTION_CATEGORY_LABELS_AR.policy_enforcement,
      target: 'supervisor',
      targetAr: ACTION_TARGET_LABELS_AR.supervisor,
      priority: 8,
      urgency: 'today',
      expectedHoursImpact: kpis.late.estimatedLostHoursDueToLate.value.current -
        (kpis.hours.totalWorkingHours.value.current * 0.05),
      expectedOrdersImpact: 0,
      effort: 'low',
      steps: [
        'Review late riders list',
        'Send punctuality reminders',
        'Implement late penalties',
        'Reward on-time riders',
      ],
      stepsAr: [
        'مراجعة قائمة المناديب المتأخرين',
        'إرسال تذكيرات الالتزام بالمواعيد',
        'تطبيق عقوبات التأخير',
        'مكافأة المناديب الملتزمين',
      ],
      sourceType: 'kpi_threshold',
      metric: 'late.latePercent',
      targetValue: 5,
    });
  }
  
  // Attendance below 80%
  const attendancePercent = kpis.attendance.attendancePercent.value.current;
  if (attendancePercent < 80) {
    actions.push({
      id: `KPI-${actionId++}`,
      title: 'Boost Attendance (Target: 90%)',
      titleAr: 'تعزيز الحضور (الهدف: 90%)',
      description: `Attendance is only ${attendancePercent.toFixed(1)}%. Critical intervention needed.`,
      descriptionAr: `الحضور فقط ${attendancePercent.toFixed(1)}%. تدخل حرج مطلوب.`,
      category: 'urgent_intervention',
      categoryAr: ACTION_CATEGORY_LABELS_AR.urgent_intervention,
      target: 'executive',
      targetAr: ACTION_TARGET_LABELS_AR.executive,
      priority: 10,
      urgency: 'immediate',
      expectedHoursImpact: (90 - attendancePercent) * 5, // Estimate
      expectedOrdersImpact: 0,
      effort: 'high',
      steps: [
        'Emergency meeting with supervisors',
        'Call absent riders immediately',
        'Investigate reasons for absence',
        'Activate backup riders',
        'Review attendance policies',
      ],
      stepsAr: [
        'اجتماع طوارئ مع المشرفين',
        'الاتصال بالمناديب الغائبين فوراً',
        'التحقيق في أسباب الغياب',
        'تفعيل المناديب الاحتياطيين',
        'مراجعة سياسات الحضور',
      ],
      sourceType: 'kpi_threshold',
      metric: 'attendance.attendancePercent',
      targetValue: 90,
    });
  }
  
  // Hours achievement below 90%
  const hoursAchievement = kpis.hours.hoursAchievement.value.current;
  if (hoursAchievement < 90) {
    actions.push({
      id: `KPI-${actionId++}`,
      title: 'Close Hours Gap (Target: 100%)',
      titleAr: 'سد فجوة الساعات (الهدف: 100%)',
      description: `Only ${hoursAchievement.toFixed(1)}% of target hours achieved. ${kpis.hours.hoursGap.value.current.toFixed(0)} hours short.`,
      descriptionAr: `فقط ${hoursAchievement.toFixed(1)}% من ساعات الهدف محققة. نقص ${kpis.hours.hoursGap.value.current.toFixed(0)} ساعة.`,
      category: 'performance_improvement',
      categoryAr: ACTION_CATEGORY_LABELS_AR.performance_improvement,
      target: 'executive',
      targetAr: ACTION_TARGET_LABELS_AR.executive,
      priority: 9,
      urgency: 'immediate',
      expectedHoursImpact: kpis.hours.hoursGap.value.current,
      expectedOrdersImpact: 0,
      effort: 'high',
      steps: [
        'Analyze why target is not met',
        'Activate more riders',
        'Extend working hours',
        'Reduce lost hours (break, late)',
        'Daily progress monitoring',
      ],
      stepsAr: [
        'تحليل لماذا الهدف غير محقق',
        'تفعيل المزيد من المناديب',
        'تمديد ساعات العمل',
        'تقليل الساعات الضائعة (استراحة، تأخير)',
        'مراقبة التقدم اليومي',
      ],
      sourceType: 'kpi_threshold',
      metric: 'hours.hoursAchievement',
      targetValue: 100,
    });
  }
  
  return actions;
}

// ============================================================================
// PRIORITY CALCULATION
// ============================================================================

/**
 * Calculate action priority (1-10)
 */
function calculateActionPriority(action: Action, kpis: KPIEngineOutput): number {
  let score = 5; // Base score
  
  // 1. Urgency weight
  if (action.urgency === 'immediate') score += 3;
  else if (action.urgency === 'today') score += 2;
  else if (action.urgency === 'this_week') score += 1;
  
  // 2. Impact weight
  const impactScore = (action.expectedHoursImpact / 50) * 2; // Normalize to 0-2
  score += Math.min(2, impactScore);
  
  // 3. Effort weight (inverse - lower effort = higher priority)
  if (action.effort === 'low') score += 1;
  else if (action.effort === 'high') score -= 1;
  
  // 4. Category weight
  if (action.category === 'urgent_intervention') score += 2;
  else if (action.category === 'risk_mitigation') score += 1;
  
  // 5. Source weight
  if (action.sourceType === 'kpi_threshold') score += 1;
  
  return Math.min(10, Math.max(1, Math.round(score)));
}

// ============================================================================
// TOP FOCUS DETERMINATION
// ============================================================================

/**
 * Determine today's top focus based on all analyses
 */
function determineTopFocus(
  actions: Action[],
  rootCauses: RootCauseAnalysis,
  opportunities: OpportunityAnalysis,
  risks: RiskAnalysis
): { titleEn: string; titleAr: string; actions: Action[] } {
  // If critical risks exist, that's the focus
  if (risks.criticalRisks > 0) {
    return {
      titleEn: '🚨 Critical Risk Mitigation',
      titleAr: '🚨 تخفيف المخاطر الحرجة',
      actions: actions.filter(a => a.category === 'risk_mitigation').slice(0, 3),
    };
  }
  
  // If major gap exists, focus on closing it
  if (rootCauses.gap < -100) {
    return {
      titleEn: '📉 Close Performance Gap',
      titleAr: '📉 سد فجوة الأداء',
      actions: actions.filter(a => a.sourceType === 'root_cause').slice(0, 3),
    };
  }
  
  // If attendance is critical, focus there
  if (actions.some(a => a.metric === 'attendance.attendancePercent' && a.priority >= 9)) {
    return {
      titleEn: '👥 Attendance Crisis Resolution',
      titleAr: '👥 حل أزمة الحضور',
      actions: actions.filter(a => a.category === 'urgent_intervention').slice(0, 3),
    };
  }
  
  // Otherwise, focus on quick wins
  if (opportunities.quickWins.length > 0) {
    return {
      titleEn: '⚡ Capture Quick Wins',
      titleAr: '⚡ اغتنام الفرص السريعة',
      actions: actions.filter(a => a.sourceType === 'opportunity' && a.effort === 'low').slice(0, 3),
    };
  }
  
  // Default: top priorities
  return {
    titleEn: '🎯 Top Priorities',
    titleAr: '🎯 الأولويات الرئيسية',
    actions: actions.slice(0, 3),
  };
}

/**
 * Generate executive summary
 */
export function generateActionPlanSummary(plan: DailyActionPlan): {
  summaryEn: string;
  summaryAr: string;
} {
  return {
    summaryEn: `📋 ${plan.totalActions} actions identified (${plan.urgentActions} urgent). Focus: ${plan.topFocus.titleEn}. Expected gain: ${plan.expectedHoursGain.toFixed(0)} hours, ${plan.expectedOrdersGain.toLocaleString()} orders.`,
    summaryAr: `📋 تم تحديد ${plan.totalActions} إجراء (${plan.urgentActions} عاجل). التركيز: ${plan.topFocus.titleAr}. المكاسب المتوقعة: ${plan.expectedHoursGain.toFixed(0)} ساعة، ${plan.expectedOrdersGain.toLocaleString()} أوردر.`,
  };
}
