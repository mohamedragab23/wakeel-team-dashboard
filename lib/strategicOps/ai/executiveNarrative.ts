/**
 * Executive Narrative Engine
 * 
 * Generates natural language executive summaries and narratives.
 * Implements SRS-004 Section 14: Executive Narrative Engine.
 * 
 * Answers: "Give me an executive summary of operations"
 * 
 * @module ExecutiveNarrative
 * @version 1.0
 */

import type { KPIEngineOutput } from '@/lib/strategicOps/kpi';
import type { RootCauseAnalysis } from './rootCauseAnalysis';
import type { OpportunityAnalysis } from './opportunityDetection';
import type { RiskAnalysis } from './riskDetection';
import type { DailyActionPlan } from './dailyActionPlan';
import type { SupervisorIntelligence } from './supervisorIntelligence';
import type { RiderIntelligence } from './riderIntelligence';
import type { ForecastAnalysis } from './advancedForecast';

// ============================================================================
// TYPES
// ============================================================================

export type ExecutiveNarrative = {
  // Main summary
  mainSummary: {
    english: string;
    arabic: string;
  };
  
  // Sections
  sections: {
    operationsOverview: NarrativeSection;
    performance: NarrativeSection;
    keyFindings: NarrativeSection;
    rootCauses: NarrativeSection;
    opportunities: NarrativeSection;
    risks: NarrativeSection;
    actions: NarrativeSection;
    forecast: NarrativeSection;
    recommendations: NarrativeSection;
  };
  
  // Key metrics for dashboard display
  keyMetrics: {
    label: string;
    labelAr: string;
    value: string;
    status: 'excellent' | 'good' | 'warning' | 'critical';
  }[];
  
  // One-liner for quick view
  oneLiner: {
    english: string;
    arabic: string;
  };
};

export type NarrativeSection = {
  title: string;
  titleAr: string;
  content: string;
  contentAr: string;
  bullets: string[];
  bulletsAr: string[];
};

// ============================================================================
// EXECUTIVE NARRATIVE ENGINE
// ============================================================================

/**
 * Generate comprehensive executive narrative
 */
export function generateExecutiveNarrative(
  kpis: KPIEngineOutput,
  rootCauses?: RootCauseAnalysis,
  opportunities?: OpportunityAnalysis,
  risks?: RiskAnalysis,
  actionPlan?: DailyActionPlan,
  supervisors?: SupervisorIntelligence,
  riders?: RiderIntelligence,
  forecast?: ForecastAnalysis
): ExecutiveNarrative {
  
  // Generate all sections
  const operationsOverview = generateOperationsOverview(kpis);
  const performance = generatePerformanceSection(kpis);
  const keyFindings = generateKeyFindings(kpis, rootCauses, opportunities, risks);
  const rootCausesSection = generateRootCausesSection(rootCauses);
  const opportunitiesSection = generateOpportunitiesSection(opportunities);
  const risksSection = generateRisksSection(risks);
  const actionsSection = generateActionsSection(actionPlan);
  const forecastSection = generateForecastSection(forecast);
  const recommendationsSection = generateRecommendationsSection(rootCauses, opportunities, risks, actionPlan);
  
  // Generate main summary
  const mainSummary = generateMainSummary(kpis, rootCauses, opportunities, risks, actionPlan);
  
  // Extract key metrics
  const keyMetrics = extractKeyMetrics(kpis);
  
  // Generate one-liner
  const oneLiner = generateOneLiner(kpis);
  
  return {
    mainSummary,
    sections: {
      operationsOverview,
      performance,
      keyFindings,
      rootCauses: rootCausesSection,
      opportunities: opportunitiesSection,
      risks: risksSection,
      actions: actionsSection,
      forecast: forecastSection,
      recommendations: recommendationsSection,
    },
    keyMetrics,
    oneLiner,
  };
}

// ============================================================================
// SECTION GENERATORS
// ============================================================================

function generateOperationsOverview(kpis: KPIEngineOutput): NarrativeSection {
  const registeredRiders = kpis.headcount.registeredRiders.value.current;
  const workingRiders = kpis.headcount.workingRiders.value.current;
  const totalHours = kpis.hours.totalWorkingHours.value.current;
  const totalOrders = kpis.orders.totalOrders.value.current;
  const ordersPerHour = kpis.orders.ordersPerHour.value.current;
  
  const content = `Operations are running with ${workingRiders} working riders out of ${registeredRiders} registered (${((workingRiders/registeredRiders)*100).toFixed(0)}% activation). Total working hours: ${totalHours.toFixed(0)}h, orders completed: ${totalOrders.toLocaleString()}, productivity: ${ordersPerHour.toFixed(2)} orders/hour.`;
  
  const contentAr = `العمليات تعمل بـ ${workingRiders} مندوب عامل من ${registeredRiders} مسجل (نسبة تفعيل ${((workingRiders/registeredRiders)*100).toFixed(0)}%). إجمالي ساعات العمل: ${totalHours.toFixed(0)} ساعة، الأوردرات المكتملة: ${totalOrders.toLocaleString()}، الإنتاجية: ${ordersPerHour.toFixed(2)} أوردر/ساعة.`;
  
  return {
    title: 'Operations Overview',
    titleAr: 'نظرة عامة على العمليات',
    content,
    contentAr,
    bullets: [
      `${registeredRiders} registered riders`,
      `${workingRiders} actively working`,
      `${totalHours.toFixed(0)} total hours`,
      `${totalOrders.toLocaleString()} orders completed`,
      `${ordersPerHour.toFixed(2)} orders/hour productivity`,
    ],
    bulletsAr: [
      `${registeredRiders} مندوب مسجل`,
      `${workingRiders} مندوب عامل`,
      `${totalHours.toFixed(0)} ساعة عمل`,
      `${totalOrders.toLocaleString()} أوردر مكتمل`,
      `${ordersPerHour.toFixed(2)} أوردر/ساعة إنتاجية`,
    ],
  };
}

function generatePerformanceSection(kpis: KPIEngineOutput): NarrativeSection {
  const hoursAchievement = kpis.hours.hoursAchievement.value.current;
  const hoursGap = kpis.hours.hoursGap.value.current;
  const attendancePercent = kpis.attendance.attendancePercent.value.current;
  const breakPercent = kpis.break.breakPercent.value.current;
  const latePercent = kpis.late.latePercent.value.current;
  
  const status = hoursAchievement >= 95 ? 'excellent' : 
                 hoursAchievement >= 85 ? 'good' : 
                 hoursAchievement >= 70 ? 'below target' : 'critical';
  
  const statusAr = hoursAchievement >= 95 ? 'ممتاز' : 
                   hoursAchievement >= 85 ? 'جيد' : 
                   hoursAchievement >= 70 ? 'تحت الهدف' : 'حرج';
  
  const content = `Performance is ${status} at ${hoursAchievement.toFixed(1)}% of target. Gap to target: ${Math.abs(hoursGap).toFixed(0)} hours. Attendance: ${attendancePercent.toFixed(0)}%, Break: ${breakPercent.toFixed(1)}%, Late: ${latePercent.toFixed(1)}%.`;
  
  const contentAr = `الأداء ${statusAr} عند ${hoursAchievement.toFixed(1)}% من الهدف. الفجوة من الهدف: ${Math.abs(hoursGap).toFixed(0)} ساعة. الحضور: ${attendancePercent.toFixed(0)}%، الاستراحة: ${breakPercent.toFixed(1)}%، التأخير: ${latePercent.toFixed(1)}%.`;
  
  return {
    title: 'Performance Status',
    titleAr: 'حالة الأداء',
    content,
    contentAr,
    bullets: [
      `Hours Achievement: ${hoursAchievement.toFixed(1)}%`,
      `Gap to Target: ${Math.abs(hoursGap).toFixed(0)} hours`,
      `Attendance: ${attendancePercent.toFixed(0)}%`,
      `Break Compliance: ${breakPercent.toFixed(1)}% (target: 8%)`,
      `Late Compliance: ${latePercent.toFixed(1)}% (target: 5%)`,
    ],
    bulletsAr: [
      `تحقيق الساعات: ${hoursAchievement.toFixed(1)}%`,
      `الفجوة من الهدف: ${Math.abs(hoursGap).toFixed(0)} ساعة`,
      `الحضور: ${attendancePercent.toFixed(0)}%`,
      `الالتزام بالاستراحة: ${breakPercent.toFixed(1)}% (الهدف: 8%)`,
      `الالتزام بالمواعيد: ${latePercent.toFixed(1)}% (الهدف: 5%)`,
    ],
  };
}

function generateKeyFindings(
  kpis: KPIEngineOutput,
  rootCauses?: RootCauseAnalysis,
  opportunities?: OpportunityAnalysis,
  risks?: RiskAnalysis
): NarrativeSection {
  const bullets: string[] = [];
  const bulletsAr: string[] = [];
  
  // Hours achievement finding
  const achievement = kpis.hours.hoursAchievement.value.current;
  if (achievement < 90) {
    bullets.push(`Below target by ${(100 - achievement).toFixed(0)}%`);
    bulletsAr.push(`تحت الهدف بنسبة ${(100 - achievement).toFixed(0)}%`);
  }
  
  // Root cause finding
  if (rootCauses && rootCauses.topCause) {
    bullets.push(`Top issue: ${rootCauses.topCause.category} (${rootCauses.topCause.hoursLost.toFixed(0)}h impact)`);
    bulletsAr.push(`المشكلة الرئيسية: ${rootCauses.topCause.categoryAr} (تأثير ${rootCauses.topCause.hoursLost.toFixed(0)} ساعة)`);
  }
  
  // Opportunity finding
  if (opportunities && opportunities.quickWins.length > 0) {
    bullets.push(`${opportunities.quickWins.length} quick wins available`);
    bulletsAr.push(`${opportunities.quickWins.length} فرصة سريعة متاحة`);
  }
  
  // Risk finding
  if (risks && risks.criticalRisks > 0) {
    bullets.push(`${risks.criticalRisks} critical risks detected`);
    bulletsAr.push(`${risks.criticalRisks} خطر حرج مكتشف`);
  }
  
  const content = bullets.join('. ') + '.';
  const contentAr = bulletsAr.join('. ') + '.';
  
  return {
    title: 'Key Findings',
    titleAr: 'النتائج الرئيسية',
    content,
    contentAr,
    bullets,
    bulletsAr,
  };
}

function generateRootCausesSection(rootCauses?: RootCauseAnalysis): NarrativeSection {
  if (!rootCauses) {
    return {
      title: 'Root Causes',
      titleAr: 'الأسباب الجذرية',
      content: 'No root cause analysis available.',
      contentAr: 'لا يوجد تحليل للأسباب الجذرية.',
      bullets: [],
      bulletsAr: [],
    };
  }
  
  const bullets = rootCauses.rootCauses
    .slice(0, 5)
    .map(rc => `${rc.category}: ${rc.hoursLost.toFixed(0)}h (${rc.percentOfGap.toFixed(0)}%)`);
  
  const bulletsAr = rootCauses.rootCauses
    .slice(0, 5)
    .map(rc => `${rc.categoryAr}: ${rc.hoursLost.toFixed(0)} ساعة (${rc.percentOfGap.toFixed(0)}%)`);
  
  const content = `Analysis identified ${rootCauses.rootCauses.length} contributing factors. Top cause: ${rootCauses.topCause?.category || 'N/A'} (${rootCauses.topCause?.hoursLost.toFixed(0) || 0}h impact). ${rootCauses.rootCauses.filter(rc => rc.actionable).length} factors are actionable, representing ${rootCauses.actionableHours.toFixed(0)}h recoverable.`;
  
  const contentAr = `التحليل حدد ${rootCauses.rootCauses.length} عامل مساهم. السبب الرئيسي: ${rootCauses.topCause?.categoryAr || 'غير متاح'} (تأثير ${rootCauses.topCause?.hoursLost.toFixed(0) || 0} ساعة). ${rootCauses.rootCauses.filter(rc => rc.actionable).length} عامل قابل للحل، يمثل ${rootCauses.actionableHours.toFixed(0)} ساعة قابلة للاسترجاع.`;
  
  return {
    title: 'Root Cause Analysis',
    titleAr: 'تحليل الأسباب الجذرية',
    content,
    contentAr,
    bullets,
    bulletsAr,
  };
}

function generateOpportunitiesSection(opportunities?: OpportunityAnalysis): NarrativeSection {
  if (!opportunities) {
    return {
      title: 'Opportunities',
      titleAr: 'الفرص',
      content: 'No opportunity analysis available.',
      contentAr: 'لا يوجد تحليل للفرص.',
      bullets: [],
      bulletsAr: [],
    };
  }
  
  const bullets = opportunities.opportunities
    .slice(0, 5)
    .map(opp => `${opp.title}: +${opp.potentialHoursGain.toFixed(0)}h`);
  
  const bulletsAr = opportunities.opportunities
    .slice(0, 5)
    .map(opp => `${opp.titleAr}: +${opp.potentialHoursGain.toFixed(0)} ساعة`);
  
  const content = `${opportunities.totalOpportunities} opportunities identified with potential to gain ${opportunities.totalPotentialHoursGain.toFixed(0)} hours and ${opportunities.totalPotentialOrdersGain.toLocaleString()} orders. ${opportunities.quickWins.length} are quick wins (easy + immediate).`;
  
  const contentAr = `تم تحديد ${opportunities.totalOpportunities} فرصة بإمكانية كسب ${opportunities.totalPotentialHoursGain.toFixed(0)} ساعة و ${opportunities.totalPotentialOrdersGain.toLocaleString()} أوردر. ${opportunities.quickWins.length} فرصة سريعة (سهلة + فورية).`;
  
  return {
    title: 'Opportunities',
    titleAr: 'الفرص المتاحة',
    content,
    contentAr,
    bullets,
    bulletsAr,
  };
}

function generateRisksSection(risks?: RiskAnalysis): NarrativeSection {
  if (!risks) {
    return {
      title: 'Risks',
      titleAr: 'المخاطر',
      content: 'No risk analysis available.',
      contentAr: 'لا يوجد تحليل للمخاطر.',
      bullets: [],
      bulletsAr: [],
    };
  }
  
  const bullets = risks.risks
    .slice(0, 5)
    .map(risk => `${risk.title} (${risk.severity})`);
  
  const bulletsAr = risks.risks
    .slice(0, 5)
    .map(risk => `${risk.titleAr} (${risk.severity})`);
  
  const content = `Overall risk level: ${risks.overallRiskLevel.toUpperCase()}. ${risks.totalRisks} risks detected (${risks.criticalRisks} critical, ${risks.highRisks} high). ${risks.immediateThreats.length} require immediate action.`;
  
  const contentAr = `مستوى الخطر الإجمالي: ${risks.overallRiskLevel}. تم اكتشاف ${risks.totalRisks} خطر (${risks.criticalRisks} حرج، ${risks.highRisks} عالي). ${risks.immediateThreats.length} يتطلب إجراء فوري.`;
  
  return {
    title: 'Risk Assessment',
    titleAr: 'تقييم المخاطر',
    content,
    contentAr,
    bullets,
    bulletsAr,
  };
}

function generateActionsSection(actionPlan?: DailyActionPlan): NarrativeSection {
  if (!actionPlan) {
    return {
      title: 'Recommended Actions',
      titleAr: 'الإجراءات الموصى بها',
      content: 'No action plan available.',
      contentAr: 'لا توجد خطة عمل.',
      bullets: [],
      bulletsAr: [],
    };
  }
  
  const bullets = actionPlan.immediatePriorities
    .slice(0, 5)
    .map(action => `[P${action.priority}] ${action.title}`);
  
  const bulletsAr = actionPlan.immediatePriorities
    .slice(0, 5)
    .map(action => `[${action.priority}] ${action.titleAr}`);
  
  const content = `${actionPlan.totalActions} actions identified (${actionPlan.urgentActions} urgent). Today's focus: ${actionPlan.topFocus.titleEn}. Expected impact: ${actionPlan.expectedHoursGain.toFixed(0)} hours, ${actionPlan.expectedOrdersGain.toLocaleString()} orders.`;
  
  const contentAr = `تم تحديد ${actionPlan.totalActions} إجراء (${actionPlan.urgentActions} عاجل). التركيز اليوم: ${actionPlan.topFocus.titleAr}. التأثير المتوقع: ${actionPlan.expectedHoursGain.toFixed(0)} ساعة، ${actionPlan.expectedOrdersGain.toLocaleString()} أوردر.`;
  
  return {
    title: 'Action Plan',
    titleAr: 'خطة العمل',
    content,
    contentAr,
    bullets,
    bulletsAr,
  };
}

function generateForecastSection(forecast?: ForecastAnalysis): NarrativeSection {
  if (!forecast) {
    return {
      title: 'Forecast',
      titleAr: 'التوقعات',
      content: 'No forecast available.',
      contentAr: 'لا توجد توقعات.',
      bullets: [],
      bulletsAr: [],
    };
  }
  
  const bullets = [
    `Next week: ${forecast.nextWeek.hours.toFixed(0)}h, ${forecast.nextWeek.orders} orders`,
    `Next month: ${forecast.nextMonth.hours.toFixed(0)}h (${forecast.nextMonth.hoursAchievement.toFixed(0)}% achievement)`,
    `Trend: ${forecast.overallTrend}`,
    `Confidence: ${forecast.confidenceLevel}`,
  ];
  
  const bulletsAr = [
    `الأسبوع القادم: ${forecast.nextWeek.hours.toFixed(0)} ساعة، ${forecast.nextWeek.orders} أوردر`,
    `الشهر القادم: ${forecast.nextMonth.hours.toFixed(0)} ساعة (${forecast.nextMonth.hoursAchievement.toFixed(0)}% تحقيق)`,
    `الاتجاه: ${forecast.overallTrend}`,
    `الثقة: ${forecast.confidenceLevel}`,
  ];
  
  const content = forecast.summary.summaryEn;
  const contentAr = forecast.summary.summaryAr;
  
  return {
    title: 'Performance Forecast',
    titleAr: 'توقعات الأداء',
    content,
    contentAr,
    bullets,
    bulletsAr,
  };
}

function generateRecommendationsSection(
  rootCauses?: RootCauseAnalysis,
  opportunities?: OpportunityAnalysis,
  risks?: RiskAnalysis,
  actionPlan?: DailyActionPlan
): NarrativeSection {
  const bullets: string[] = [];
  const bulletsAr: string[] = [];
  
  // From action plan
  if (actionPlan && actionPlan.topFocus) {
    bullets.push(`Priority: ${actionPlan.topFocus.titleEn}`);
    bulletsAr.push(`الأولوية: ${actionPlan.topFocus.titleAr}`);
  }
  
  // From root causes
  if (rootCauses?.topCause) {
    bullets.push(rootCauses.topCause.recommendation);
    bulletsAr.push(rootCauses.topCause.recommendationAr);
  }
  
  // From opportunities
  if (opportunities && opportunities.quickWins.length > 0) {
    bullets.push(`Capture quick win: ${opportunities.quickWins[0].title}`);
    bulletsAr.push(`اغتنم الفرصة السريعة: ${opportunities.quickWins[0].titleAr}`);
  }
  
  // From risks
  if (risks && risks.immediateThreats.length > 0) {
    bullets.push(`Mitigate: ${risks.immediateThreats[0].title}`);
    bulletsAr.push(`خفف: ${risks.immediateThreats[0].titleAr}`);
  }
  
  const content = bullets.join('. ') + '.';
  const contentAr = bulletsAr.join('. ') + '.';
  
  return {
    title: 'Executive Recommendations',
    titleAr: 'التوصيات التنفيذية',
    content,
    contentAr,
    bullets,
    bulletsAr,
  };
}

function generateMainSummary(
  kpis: KPIEngineOutput,
  rootCauses?: RootCauseAnalysis,
  opportunities?: OpportunityAnalysis,
  risks?: RiskAnalysis,
  actionPlan?: DailyActionPlan
): { english: string; arabic: string } {
  const achievement = kpis.hours.hoursAchievement.value.current;
  const status = achievement >= 90 ? '✅ ON TRACK' : achievement >= 70 ? '⚠️ BELOW TARGET' : '🔴 CRITICAL';
  const statusAr = achievement >= 90 ? '✅ على المسار' : achievement >= 70 ? '⚠️ تحت الهدف' : '🔴 حرج';
  
  const english = `${status} at ${achievement.toFixed(1)}% of target. ${kpis.headcount.workingRiders.value.current} riders working, ${kpis.hours.totalWorkingHours.value.current.toFixed(0)}h completed, ${kpis.orders.totalOrders.value.current.toLocaleString()} orders. ${rootCauses?.rootCauses.filter(rc => rc.actionable).length || 0} actionable issues, ${opportunities?.quickWins.length || 0} quick wins, ${risks?.criticalRisks || 0} critical risks. ${actionPlan?.urgentActions || 0} urgent actions today.`;
  
  const arabic = `${statusAr} عند ${achievement.toFixed(1)}% من الهدف. ${kpis.headcount.workingRiders.value.current} مندوب عامل، ${kpis.hours.totalWorkingHours.value.current.toFixed(0)} ساعة مكتملة، ${kpis.orders.totalOrders.value.current.toLocaleString()} أوردر. ${rootCauses?.rootCauses.filter(rc => rc.actionable).length || 0} مشكلة قابلة للحل، ${opportunities?.quickWins.length || 0} فرصة سريعة، ${risks?.criticalRisks || 0} خطر حرج. ${actionPlan?.urgentActions || 0} إجراء عاجل اليوم.`;
  
  return { english, arabic };
}

function extractKeyMetrics(kpis: KPIEngineOutput): ExecutiveNarrative['keyMetrics'] {
  const achievement = kpis.hours.hoursAchievement.value.current;
  const status: 'excellent' | 'good' | 'warning' | 'critical' = 
    achievement >= 95 ? 'excellent' : 
    achievement >= 85 ? 'good' : 
    achievement >= 70 ? 'warning' : 'critical';
  
  return [
    {
      label: 'Hours Achievement',
      labelAr: 'تحقيق الساعات',
      value: `${achievement.toFixed(1)}%`,
      status,
    },
    {
      label: 'Working Riders',
      labelAr: 'المناديب العاملون',
      value: kpis.headcount.workingRiders.value.current.toString(),
      status: 'good',
    },
    {
      label: 'Orders/Hour',
      labelAr: 'أوردر/ساعة',
      value: kpis.orders.ordersPerHour.value.current.toFixed(2),
      status: kpis.orders.ordersPerHour.value.current >= 2.5 ? 'excellent' : 'good',
    },
    {
      label: 'Attendance',
      labelAr: 'الحضور',
      value: `${kpis.attendance.attendancePercent.value.current.toFixed(0)}%`,
      status: kpis.attendance.attendancePercent.value.current >= 85 ? 'good' : 'warning',
    },
  ];
}

function generateOneLiner(kpis: KPIEngineOutput): { english: string; arabic: string } {
  const achievement = kpis.hours.hoursAchievement.value.current;
  const riders = kpis.headcount.workingRiders.value.current;
  const hours = kpis.hours.totalWorkingHours.value.current;
  
  return {
    english: `${riders} riders • ${hours.toFixed(0)}h • ${achievement.toFixed(0)}% target`,
    arabic: `${riders} مندوب • ${hours.toFixed(0)} ساعة • ${achievement.toFixed(0)}% من الهدف`,
  };
}
