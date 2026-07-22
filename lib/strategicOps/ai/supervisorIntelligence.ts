/**
 * Supervisor Intelligence Engine
 * 
 * Automated scoring and ranking system for supervisors.
 * Implements SRS-004 Section 6: Supervisor Intelligence Engine.
 * 
 * Answers: "How should I evaluate and rank supervisors?"
 * 
 * @module SupervisorIntelligence
 * @version 1.0
 */

import type { KPIEngineOutput } from '@/lib/strategicOps/kpi';
import { SUPERVISOR_SCORE_WEIGHTS } from '@/lib/strategicOps/config/businessRules';

// ============================================================================
// TYPES
// ============================================================================

export type SupervisorScoreComponents = {
  hoursAchievement: number; // 0-100
  ordersPerHour: number; // 0-100
  attendanceRate: number; // 0-100
  breakCompliance: number; // 0-100
  lateCompliance: number; // 0-100
  teamSize: number; // Raw count
  activeRidersPercent: number; // 0-100
  dataQuality: number; // 0-100
  commentsQuality: number; // 0-100
};

export type SupervisorScore = {
  supervisorId: string;
  supervisorName: string;
  zone?: string;
  
  // Overall score
  totalScore: number; // 0-100 (weighted)
  rank: number;
  
  // Components
  components: SupervisorScoreComponents;
  
  // Performance indicators
  status: 'excellent' | 'good' | 'needs_improvement' | 'critical';
  trend: 'improving' | 'stable' | 'declining';
  
  // Insights
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  
  // Benchmarks
  vsAverage: number; // Difference from average
  percentile: number; // 0-100
};

export type SupervisorIntelligence = {
  supervisors: SupervisorScore[];
  averageScore: number;
  medianScore: number;
  topPerformers: SupervisorScore[]; // Top 3
  needsAttention: SupervisorScore[]; // Bottom 3 or status=critical
  
  // Analytics
  totalSupervisors: number;
  excellentCount: number;
  needsImprovementCount: number;
  criticalCount: number;
};

// Per-supervisor data input (would come from aggregating rider data by supervisor)
export type SupervisorData = {
  supervisorId: string;
  supervisorName: string;
  zone?: string;
  
  // Team metrics
  totalRiders: number;
  activeRiders: number;
  workingRiders: number;
  
  // Hours
  targetHours: number;
  actualHours: number;
  
  // Orders
  totalOrders: number;
  
  // Break & Late
  totalBreakMinutes: number;
  totalLateMinutes: number;
  
  // Attendance
  totalWorkingDays: number;
  totalPossibleDays: number;
  
  // Data Quality
  dataQualityScore: number; // 0-100
  commentsCount: number;
  commentsExpected: number;
  
  // Trend (if available)
  previousScore?: number;
};

// ============================================================================
// SUPERVISOR INTELLIGENCE ENGINE
// ============================================================================

/**
 * Calculate supervisor scores and generate intelligence
 */
export function calculateSupervisorIntelligence(
  supervisorsData: SupervisorData[]
): SupervisorIntelligence {
  // 1. Calculate scores for each supervisor
  const supervisorScores = supervisorsData.map(data => 
    calculateSupervisorScore(data)
  );
  
  // 2. Sort by total score
  supervisorScores.sort((a, b) => b.totalScore - a.totalScore);
  
  // 3. Assign ranks
  supervisorScores.forEach((sup, idx) => {
    sup.rank = idx + 1;
  });
  
  // 4. Calculate percentiles
  supervisorScores.forEach(sup => {
    sup.percentile = ((supervisorScores.length - sup.rank + 1) / supervisorScores.length) * 100;
  });
  
  // 5. Calculate statistics
  const averageScore = supervisorScores.reduce((sum, s) => sum + s.totalScore, 0) / supervisorScores.length;
  const sortedScores = [...supervisorScores].sort((a, b) => a.totalScore - b.totalScore);
  const medianScore = sortedScores[Math.floor(sortedScores.length / 2)]?.totalScore || 0;
  
  // 6. Calculate vs average
  supervisorScores.forEach(sup => {
    sup.vsAverage = sup.totalScore - averageScore;
  });
  
  // 7. Generate insights
  supervisorScores.forEach(sup => {
    generateSupervisorInsights(sup, averageScore);
  });
  
  // 8. Identify top performers and those needing attention
  const topPerformers = supervisorScores.slice(0, 3);
  const needsAttention = supervisorScores
    .filter(s => s.status === 'critical' || s.status === 'needs_improvement')
    .slice(0, 3);
  
  // 9. Count by status
  const excellentCount = supervisorScores.filter(s => s.status === 'excellent').length;
  const needsImprovementCount = supervisorScores.filter(s => s.status === 'needs_improvement').length;
  const criticalCount = supervisorScores.filter(s => s.status === 'critical').length;
  
  return {
    supervisors: supervisorScores,
    averageScore,
    medianScore,
    topPerformers,
    needsAttention,
    totalSupervisors: supervisorScores.length,
    excellentCount,
    needsImprovementCount,
    criticalCount,
  };
}

// ============================================================================
// SCORE CALCULATION
// ============================================================================

/**
 * Calculate individual supervisor score
 */
function calculateSupervisorScore(data: SupervisorData): SupervisorScore {
  const components: SupervisorScoreComponents = {
    // 1. Hours Achievement (0-100)
    hoursAchievement: calculateHoursAchievementScore(data.actualHours, data.targetHours),
    
    // 2. Orders Per Hour (0-100)
    ordersPerHour: calculateOrdersPerHourScore(data.totalOrders, data.actualHours),
    
    // 3. Attendance Rate (0-100)
    attendanceRate: calculateAttendanceScore(data.totalWorkingDays, data.totalPossibleDays),
    
    // 4. Break Compliance (0-100)
    breakCompliance: calculateBreakComplianceScore(data.totalBreakMinutes, data.actualHours),
    
    // 5. Late Compliance (0-100)
    lateCompliance: calculateLateComplianceScore(data.totalLateMinutes, data.actualHours),
    
    // 6. Team Size (raw count)
    teamSize: data.totalRiders,
    
    // 7. Active Riders Percent (0-100)
    activeRidersPercent: calculateActiveRidersScore(data.activeRiders, data.totalRiders),
    
    // 8. Data Quality (0-100)
    dataQuality: data.dataQualityScore,
    
    // 9. Comments Quality (0-100)
    commentsQuality: calculateCommentsQualityScore(data.commentsCount, data.commentsExpected),
  };
  
  // Calculate weighted total score
  const totalScore = calculateWeightedScore(components);
  
  // Determine status
  const status = determineStatus(totalScore);
  
  // Determine trend
  const trend = determineTrend(totalScore, data.previousScore);
  
  return {
    supervisorId: data.supervisorId,
    supervisorName: data.supervisorName,
    zone: data.zone,
    totalScore,
    rank: 0, // Will be assigned later
    components,
    status,
    trend,
    strengths: [],
    weaknesses: [],
    recommendations: [],
    vsAverage: 0, // Will be calculated later
    percentile: 0, // Will be calculated later
  };
}

/**
 * Calculate weighted total score from components
 */
function calculateWeightedScore(components: SupervisorScoreComponents): number {
  const weights = SUPERVISOR_SCORE_WEIGHTS;
  
  const score = 
    (components.hoursAchievement * weights.TARGET_ACHIEVEMENT) +
    (components.ordersPerHour * weights.ORDERS_PER_HOUR) +
    (components.attendanceRate * weights.ATTENDANCE) +
    (components.breakCompliance * weights.LOST_HOURS) +
    (components.lateCompliance * weights.LOST_HOURS) +
    (components.activeRidersPercent * weights.UTILIZATION) +
    (components.dataQuality * weights.DATA_QUALITY) +
    (components.commentsQuality * weights.DATA_QUALITY);
  
  return Math.max(0, Math.min(100, score));
}

// ============================================================================
// COMPONENT SCORE CALCULATORS
// ============================================================================

function calculateHoursAchievementScore(actual: number, target: number): number {
  if (target === 0) return 0;
  const achievement = (actual / target) * 100;
  return Math.max(0, Math.min(100, achievement));
}

function calculateOrdersPerHourScore(orders: number, hours: number): number {
  if (hours === 0) return 0;
  const ordersPerHour = orders / hours;
  
  // Scoring: 0 orders/h = 0, 2.5+ orders/h = 100
  const score = (ordersPerHour / 2.5) * 100;
  return Math.max(0, Math.min(100, score));
}

function calculateAttendanceScore(workingDays: number, possibleDays: number): number {
  if (possibleDays === 0) return 0;
  return (workingDays / possibleDays) * 100;
}

function calculateBreakComplianceScore(breakMinutes: number, hours: number): number {
  if (hours === 0) return 100;
  const breakPercent = (breakMinutes / (hours * 60)) * 100;
  
  // Scoring: ≤8% = 100, >8% = penalty
  if (breakPercent <= 8) return 100;
  
  // Linear penalty: 8% → 100, 20% → 0
  const excess = breakPercent - 8;
  const penalty = (excess / 12) * 100; // 12% range
  return Math.max(0, 100 - penalty);
}

function calculateLateComplianceScore(lateMinutes: number, hours: number): number {
  if (hours === 0) return 100;
  const latePercent = (lateMinutes / (hours * 60)) * 100;
  
  // Scoring: ≤5% = 100, >5% = penalty
  if (latePercent <= 5) return 100;
  
  // Linear penalty: 5% → 100, 15% → 0
  const excess = latePercent - 5;
  const penalty = (excess / 10) * 100; // 10% range
  return Math.max(0, 100 - penalty);
}

function calculateActiveRidersScore(active: number, total: number): number {
  if (total === 0) return 0;
  return (active / total) * 100;
}

function calculateCommentsQualityScore(actual: number, expected: number): number {
  if (expected === 0) return 100;
  const coverage = (actual / expected) * 100;
  return Math.min(100, coverage);
}

// ============================================================================
// STATUS & TREND
// ============================================================================

function determineStatus(score: number): SupervisorScore['status'] {
  if (score >= 85) return 'excellent';
  if (score >= 70) return 'good';
  if (score >= 50) return 'needs_improvement';
  return 'critical';
}

function determineTrend(
  currentScore: number, 
  previousScore?: number
): SupervisorScore['trend'] {
  if (!previousScore) return 'stable';
  
  const change = currentScore - previousScore;
  if (change > 3) return 'improving';
  if (change < -3) return 'declining';
  return 'stable';
}

// ============================================================================
// INSIGHTS GENERATION
// ============================================================================

function generateSupervisorInsights(
  supervisor: SupervisorScore,
  averageScore: number
): void {
  const { components } = supervisor;
  
  // Identify strengths (components > 85)
  if (components.hoursAchievement > 85) {
    supervisor.strengths.push('تحقيق ساعات ممتاز');
  }
  if (components.ordersPerHour > 85) {
    supervisor.strengths.push('إنتاجية عالية');
  }
  if (components.attendanceRate > 85) {
    supervisor.strengths.push('حضور منتظم');
  }
  if (components.breakCompliance > 90) {
    supervisor.strengths.push('التزام بسياسة الاستراحة');
  }
  if (components.lateCompliance > 90) {
    supervisor.strengths.push('التزام بالمواعيد');
  }
  if (components.activeRidersPercent > 85) {
    supervisor.strengths.push('تفعيل جيد للفريق');
  }
  
  // Identify weaknesses (components < 60)
  if (components.hoursAchievement < 60) {
    supervisor.weaknesses.push('ساعات أقل من الهدف');
  }
  if (components.ordersPerHour < 60) {
    supervisor.weaknesses.push('إنتاجية منخفضة');
  }
  if (components.attendanceRate < 70) {
    supervisor.weaknesses.push('غياب مرتفع');
  }
  if (components.breakCompliance < 60) {
    supervisor.weaknesses.push('استراحة زائدة');
  }
  if (components.lateCompliance < 60) {
    supervisor.weaknesses.push('تأخير متكرر');
  }
  if (components.activeRidersPercent < 60) {
    supervisor.weaknesses.push('مناديب غير نشطين');
  }
  if (components.dataQuality < 70) {
    supervisor.weaknesses.push('جودة بيانات ضعيفة');
  }
  if (components.commentsQuality < 70) {
    supervisor.weaknesses.push('تغطية تعليقات منخفضة');
  }
  
  // Generate recommendations
  if (supervisor.status === 'excellent') {
    supervisor.recommendations.push('الاستمرار في الأداء الممتاز');
    supervisor.recommendations.push('مشاركة أفضل الممارسات مع الآخرين');
    if (components.hoursAchievement > 95) {
      supervisor.recommendations.push('يمكن توليه مسؤوليات إضافية');
    }
  } else if (supervisor.status === 'critical') {
    supervisor.recommendations.push('تدخل عاجل مطلوب');
    supervisor.recommendations.push('اجتماع يومي للمتابعة');
    supervisor.recommendations.push('تحديد خطة تحسين خلال 48 ساعة');
    
    // Specific recommendations based on weakest component
    const weakestComponent = getWeakestComponent(components);
    if (weakestComponent === 'hoursAchievement') {
      supervisor.recommendations.push('التركيز على زيادة ساعات العمل');
    } else if (weakestComponent === 'attendanceRate') {
      supervisor.recommendations.push('معالجة مشاكل الغياب بشكل فوري');
    }
  } else {
    // Good or needs improvement
    if (supervisor.weaknesses.length > 0) {
      supervisor.recommendations.push(`التركيز على تحسين: ${supervisor.weaknesses[0]}`);
    }
    
    if (components.dataQuality < 80) {
      supervisor.recommendations.push('تحسين جودة إدخال البيانات');
    }
    
    if (components.commentsQuality < 80) {
      supervisor.recommendations.push('زيادة تغطية التعليقات اليومية');
    }
  }
}

function getWeakestComponent(components: SupervisorScoreComponents): keyof SupervisorScoreComponents {
  const scores: Array<[keyof SupervisorScoreComponents, number]> = [
    ['hoursAchievement', components.hoursAchievement],
    ['ordersPerHour', components.ordersPerHour],
    ['attendanceRate', components.attendanceRate],
    ['breakCompliance', components.breakCompliance],
    ['lateCompliance', components.lateCompliance],
    ['activeRidersPercent', components.activeRidersPercent],
    ['dataQuality', components.dataQuality],
    ['commentsQuality', components.commentsQuality],
  ];
  
  scores.sort((a, b) => a[1] - b[1]);
  return scores[0][0];
}

// ============================================================================
// COMPARATIVE ANALYSIS
// ============================================================================

/**
 * Compare two supervisors
 */
export function compareSupervisors(
  supervisor1: SupervisorScore,
  supervisor2: SupervisorScore
): {
  scoreDifference: number;
  betterIn: string[];
  worseIn: string[];
  summary: string;
  summaryAr: string;
} {
  const diff = supervisor1.totalScore - supervisor2.totalScore;
  
  const betterIn: string[] = [];
  const worseIn: string[] = [];
  
  const componentNames: Record<keyof SupervisorScoreComponents, string> = {
    hoursAchievement: 'تحقيق الساعات',
    ordersPerHour: 'الإنتاجية',
    attendanceRate: 'الحضور',
    breakCompliance: 'الاستراحة',
    lateCompliance: 'المواعيد',
    teamSize: 'حجم الفريق',
    activeRidersPercent: 'التفعيل',
    dataQuality: 'جودة البيانات',
    commentsQuality: 'التعليقات',
  };
  
  Object.keys(componentNames).forEach(key => {
    const k = key as keyof SupervisorScoreComponents;
    if (supervisor1.components[k] > supervisor2.components[k]) {
      betterIn.push(componentNames[k]);
    } else if (supervisor1.components[k] < supervisor2.components[k]) {
      worseIn.push(componentNames[k]);
    }
  });
  
  const summary = diff > 0 
    ? `${supervisor1.supervisorName} outperforms ${supervisor2.supervisorName} by ${diff.toFixed(1)} points`
    : `${supervisor2.supervisorName} outperforms ${supervisor1.supervisorName} by ${Math.abs(diff).toFixed(1)} points`;
  
  const summaryAr = diff > 0
    ? `${supervisor1.supervisorName} أفضل من ${supervisor2.supervisorName} بـ ${diff.toFixed(1)} نقطة`
    : `${supervisor2.supervisorName} أفضل من ${supervisor1.supervisorName} بـ ${Math.abs(diff).toFixed(1)} نقطة`;
  
  return {
    scoreDifference: diff,
    betterIn,
    worseIn,
    summary,
    summaryAr,
  };
}

/**
 * Generate summary for supervisor intelligence
 */
export function generateSupervisorIntelligenceSummary(
  intelligence: SupervisorIntelligence
): { summaryEn: string; summaryAr: string } {
  const topSup = intelligence.topPerformers[0];
  
  return {
    summaryEn: `${intelligence.totalSupervisors} supervisors evaluated. Average score: ${intelligence.averageScore.toFixed(1)}. Top performer: ${topSup?.supervisorName || 'N/A'} (${topSup?.totalScore.toFixed(1)}). ${intelligence.criticalCount} need urgent attention.`,
    summaryAr: `تم تقييم ${intelligence.totalSupervisors} مشرف. متوسط الدرجة: ${intelligence.averageScore.toFixed(1)}. الأفضل: ${topSup?.supervisorName || 'لا يوجد'} (${topSup?.totalScore.toFixed(1)}). ${intelligence.criticalCount} يحتاجون اهتمام عاجل.`,
  };
}
