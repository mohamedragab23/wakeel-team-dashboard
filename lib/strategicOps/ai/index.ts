/**
 * AI & Analytics Engines
 * 
 * Central export point for all AI/Analytics capabilities.
 * 
 * @module AI
 * @version 1.0
 */

// Root Cause Analysis
export type {
  RootCauseCategory,
  RootCause,
  GapAnalysis,
  RootCauseAnalysis,
} from './rootCauseAnalysis';

export {
  analyzeRootCauses,
  generateRootCauseSummary,
  generateActionItems,
} from './rootCauseAnalysis';

// Opportunity Detection
export type {
  OpportunityType,
  Opportunity,
  OpportunityAnalysis,
} from './opportunityDetection';

export {
  detectOpportunities,
  generateOpportunitySummary,
} from './opportunityDetection';

// Risk Detection
export type {
  RiskType,
  RiskSeverity,
  RiskTimeframe,
  Risk,
  RiskAnalysis,
} from './riskDetection';

export {
  detectRisks,
  generateRiskSummary,
} from './riskDetection';

// Daily Action Plan
export type {
  ActionTarget,
  ActionCategory,
  Action,
  DailyActionPlan,
} from './dailyActionPlan';

export {
  generateDailyActionPlan,
  generateActionPlanSummary,
} from './dailyActionPlan';

// Supervisor Intelligence
export type {
  SupervisorScoreComponents,
  SupervisorScore,
  SupervisorIntelligence,
  SupervisorData,
} from './supervisorIntelligence';

export {
  calculateSupervisorIntelligence,
  compareSupervisors,
  generateSupervisorIntelligenceSummary,
} from './supervisorIntelligence';

// Rider Intelligence
export type {
  RiderClassification,
  RiderPerformanceMetrics,
  RiderScore,
  RiderIntelligence,
  RiderData,
} from './riderIntelligence';

export {
  calculateRiderIntelligence,
  generateRiderIntelligenceSummary,
  getRidersNeedingIntervention,
} from './riderIntelligence';

// Advanced Forecast
export type {
  ForecastPeriod,
  ForecastMethod,
  Forecast,
  ForecastAnalysis,
  HistoricalDataPoint,
} from './advancedForecast';

export {
  generateForecastAnalysis,
} from './advancedForecast';

// Executive Narrative
export type {
  ExecutiveNarrative,
  NarrativeSection,
} from './executiveNarrative';

export {
  generateExecutiveNarrative,
} from './executiveNarrative';

// Comparative Intelligence
export type {
  ComparisonType,
  ComparisonResult,
  BenchmarkAnalysis,
} from './comparativeIntelligence';

export {
  compareEntities,
  generateBenchmarkAnalysis,
  compareSupervisors,
} from './comparativeIntelligence';

// Growth Strategy
export type {
  GrowthObjective,
  GrowthStrategy,
  GrowthPlan,
} from './growthStrategy';

export {
  generateGrowthPlan,
} from './growthStrategy';

// Recommendation Rules
export type {
  RecommendationCategory,
  RecommendationPriority,
  Recommendation,
  RecommendationSet,
} from './recommendationRules';

export {
  generateRecommendations,
} from './recommendationRules';

// Operational Playbooks
export type {
  PlaybookScenario,
  PlaybookAction,
  Playbook,
} from './operationalPlaybooks';

export {
  getPlaybook,
  getAllPlaybooks,
  recommendPlaybooks,
} from './operationalPlaybooks';

// ============================================================================
// UNIFIED AI ANALYSIS
// ============================================================================

import type { KPIEngineOutput } from '@/lib/strategicOps/kpi';
import { analyzeRootCauses } from './rootCauseAnalysis';
import { detectOpportunities } from './opportunityDetection';
import { detectRisks } from './riskDetection';
import { generateDailyActionPlan } from './dailyActionPlan';

/**
 * Complete AI analysis output
 */
export type CompleteAIAnalysis = {
  rootCauses: ReturnType<typeof analyzeRootCauses>;
  opportunities: ReturnType<typeof detectOpportunities>;
  risks: ReturnType<typeof detectRisks>;
  actionPlan: ReturnType<typeof generateDailyActionPlan>;
  executiveSummary: {
    summaryEn: string;
    summaryAr: string;
  };
};

/**
 * Run all AI engines in one call
 * 
 * This is the primary entry point for Strategic Operations AI analysis.
 */
export function runCompleteAIAnalysis(kpis: KPIEngineOutput): CompleteAIAnalysis {
  // 1. Root Cause Analysis
  const rootCauses = analyzeRootCauses(kpis);
  
  // 2. Opportunity Detection
  const opportunities = detectOpportunities(kpis);
  
  // 3. Risk Detection
  const risks = detectRisks(kpis);
  
  // 4. Daily Action Plan (combines all above)
  const actionPlan = generateDailyActionPlan(kpis, rootCauses, opportunities, risks);
  
  // 5. Executive Summary
  const executiveSummary = generateExecutiveSummary(
    kpis,
    rootCauses,
    opportunities,
    risks,
    actionPlan
  );
  
  return {
    rootCauses,
    opportunities,
    risks,
    actionPlan,
    executiveSummary,
  };
}

/**
 * Generate high-level executive summary
 */
function generateExecutiveSummary(
  kpis: KPIEngineOutput,
  rootCauses: ReturnType<typeof analyzeRootCauses>,
  opportunities: ReturnType<typeof detectOpportunities>,
  risks: ReturnType<typeof detectRisks>,
  actionPlan: ReturnType<typeof generateDailyActionPlan>
): { summaryEn: string; summaryAr: string } {
  const hoursAchievement = kpis.hours.hoursAchievement.value.current;
  const status = hoursAchievement >= 95 ? '✅ Excellent' : 
                 hoursAchievement >= 85 ? '🟡 Good' : 
                 hoursAchievement >= 70 ? '🟠 Below Target' : '🔴 Critical';
  
  const statusAr = hoursAchievement >= 95 ? '✅ ممتاز' : 
                   hoursAchievement >= 85 ? '🟡 جيد' : 
                   hoursAchievement >= 70 ? '🟠 تحت الهدف' : '🔴 حرج';
  
  const summaryEn = `
**Operations Status:** ${status} (${hoursAchievement.toFixed(1)}% of target)

**Key Findings:**
- ${rootCauses.actionableRootCauses} actionable issues identified (${rootCauses.actionableHours.toFixed(0)} hours recoverable)
- ${opportunities.totalOpportunities} opportunities (${opportunities.totalPotentialHoursGain.toFixed(0)} hours potential)
- ${risks.totalRisks} risks detected (${risks.criticalRisks} critical)

**Today's Focus:** ${actionPlan.topFocus.titleEn}
**Urgent Actions:** ${actionPlan.urgentActions} require immediate attention

**Expected Impact:** ${actionPlan.expectedHoursGain.toFixed(0)} hours, ${actionPlan.expectedOrdersGain.toLocaleString()} orders
  `.trim();
  
  const summaryAr = `
**حالة العمليات:** ${statusAr} (${hoursAchievement.toFixed(1)}% من الهدف)

**النتائج الرئيسية:**
- ${rootCauses.actionableRootCauses} مشكلة قابلة للحل (${rootCauses.actionableHours.toFixed(0)} ساعة قابلة للاسترجاع)
- ${opportunities.totalOpportunities} فرصة (${opportunities.totalPotentialHoursGain.toFixed(0)} ساعة محتملة)
- ${risks.totalRisks} خطر مكتشف (${risks.criticalRisks} حرج)

**التركيز اليوم:** ${actionPlan.topFocus.titleAr}
**الإجراءات العاجلة:** ${actionPlan.urgentActions} تتطلب اهتمام فوري

**التأثير المتوقع:** ${actionPlan.expectedHoursGain.toFixed(0)} ساعة، ${actionPlan.expectedOrdersGain.toLocaleString()} أوردر
  `.trim();
  
  return { summaryEn, summaryAr };
}
