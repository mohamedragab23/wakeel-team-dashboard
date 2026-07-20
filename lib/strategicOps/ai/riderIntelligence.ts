/**
 * Rider Intelligence Engine
 * 
 * Automated classification and performance analysis system for riders.
 * Implements SRS-004 Section 7: Rider Intelligence Engine.
 * 
 * Answers: "How should I classify and manage riders?"
 * 
 * @module RiderIntelligence
 * @version 1.0
 */

import type { KPIEngineOutput } from '@/lib/strategicOps/kpi';
import { RIDER_CLASSIFICATION } from '@/lib/strategicOps/config/businessRules';

// ============================================================================
// TYPES
// ============================================================================

export type RiderClassification = 'star' | 'solid' | 'at_risk' | 'critical';

export type RiderPerformanceMetrics = {
  hours: number;
  orders: number;
  ordersPerHour: number;
  attendanceDays: number;
  totalDays: number;
  attendancePercent: number;
  breakPercent: number;
  latePercent: number;
};

export type RiderScore = {
  riderCode: string;
  riderName: string;
  supervisor?: string;
  zone?: string;
  
  // Classification
  classification: RiderClassification;
  score: number; // 0-100
  rank: number;
  
  // Metrics
  metrics: RiderPerformanceMetrics;
  
  // Trend
  trend: 'improving' | 'stable' | 'declining';
  hoursChange?: number; // % change
  
  // Insights
  strengths: string[];
  concerns: string[];
  recommendations: string[];
  
  // Risk indicators
  churnRisk: 'low' | 'medium' | 'high';
  interventionPriority: number; // 1-10 (10 = urgent)
};

export type RiderIntelligence = {
  totalRiders: number;
  
  // Classifications
  classifications: {
    stars: RiderScore[]; // Top 10-15%
    solid: RiderScore[]; // 60-70%
    atRisk: RiderScore[]; // 15-20%
    critical: RiderScore[]; // Bottom 5-10%
  };
  
  // Top/Bottom
  topPerformers: RiderScore[]; // Top 10
  bottomPerformers: RiderScore[]; // Bottom 10
  
  // Analytics
  averageScore: number;
  averageHours: number;
  averageOrdersPerHour: number;
  
  // Risk
  highChurnRisk: RiderScore[];
  needsImmediateIntervention: RiderScore[];
};

// Per-rider data input
export type RiderData = {
  riderCode: string;
  riderName: string;
  supervisor?: string;
  zone?: string;
  
  // Performance
  hours: number;
  orders: number;
  attendanceDays: number;
  totalDays: number;
  breakMinutes: number;
  lateMinutes: number;
  
  // Trend (if available)
  previousHours?: number;
  previousScore?: number;
};

// ============================================================================
// RIDER INTELLIGENCE ENGINE
// ============================================================================

/**
 * Calculate rider intelligence and classification
 */
export function calculateRiderIntelligence(
  ridersData: RiderData[]
): RiderIntelligence {
  // 1. Calculate scores for each rider
  const riderScores = ridersData.map(data => calculateRiderScore(data));
  
  // 2. Sort by score
  riderScores.sort((a, b) => b.score - a.score);
  
  // 3. Assign ranks
  riderScores.forEach((rider, idx) => {
    rider.rank = idx + 1;
  });
  
  // 4. Classify riders
  classifyRiders(riderScores);
  
  // 5. Generate insights
  riderScores.forEach(rider => generateRiderInsights(rider));
  
  // 6. Calculate statistics
  const averageScore = riderScores.reduce((sum, r) => sum + r.score, 0) / riderScores.length;
  const averageHours = riderScores.reduce((sum, r) => sum + r.metrics.hours, 0) / riderScores.length;
  const averageOrdersPerHour = riderScores.reduce((sum, r) => sum + r.metrics.ordersPerHour, 0) / riderScores.length;
  
  // 7. Segment by classification
  const stars = riderScores.filter(r => r.classification === 'star');
  const solid = riderScores.filter(r => r.classification === 'solid');
  const atRisk = riderScores.filter(r => r.classification === 'at_risk');
  const critical = riderScores.filter(r => r.classification === 'critical');
  
  // 8. Identify top/bottom performers
  const topPerformers = riderScores.slice(0, 10);
  const bottomPerformers = riderScores.slice(-10).reverse();
  
  // 9. Identify high risk and intervention needs
  const highChurnRisk = riderScores.filter(r => r.churnRisk === 'high');
  const needsImmediateIntervention = riderScores.filter(r => r.interventionPriority >= 8);
  
  return {
    totalRiders: riderScores.length,
    classifications: { stars, solid, atRisk, critical },
    topPerformers,
    bottomPerformers,
    averageScore,
    averageHours,
    averageOrdersPerHour,
    highChurnRisk,
    needsImmediateIntervention,
  };
}

// ============================================================================
// SCORE CALCULATION
// ============================================================================

/**
 * Calculate individual rider score
 */
function calculateRiderScore(data: RiderData): RiderScore {
  // Calculate metrics
  const metrics: RiderPerformanceMetrics = {
    hours: data.hours,
    orders: data.orders,
    ordersPerHour: data.hours > 0 ? data.orders / data.hours : 0,
    attendanceDays: data.attendanceDays,
    totalDays: data.totalDays,
    attendancePercent: data.totalDays > 0 ? (data.attendanceDays / data.totalDays) * 100 : 0,
    breakPercent: data.hours > 0 ? (data.breakMinutes / (data.hours * 60)) * 100 : 0,
    latePercent: data.hours > 0 ? (data.lateMinutes / (data.hours * 60)) * 100 : 0,
  };
  
  // Calculate score components
  const hoursScore = calculateHoursScore(metrics.hours);
  const ordersScore = calculateOrdersScore(metrics.orders);
  const productivityScore = calculateProductivityScore(metrics.ordersPerHour);
  const attendanceScore = metrics.attendancePercent;
  const breakScore = calculateBreakScore(metrics.breakPercent);
  const lateScore = calculateLateScore(metrics.latePercent);
  
  // Weighted total score
  const score = 
    hoursScore * 0.30 +           // 30% - Hours worked
    ordersScore * 0.20 +          // 20% - Orders completed
    productivityScore * 0.20 +    // 20% - Efficiency
    attendanceScore * 0.15 +      // 15% - Attendance
    breakScore * 0.075 +          // 7.5% - Break compliance
    lateScore * 0.075;            // 7.5% - Punctuality
  
  // Determine trend
  const trend = determineTrend(
    data.hours, 
    data.previousHours, 
    score, 
    data.previousScore
  );
  
  const hoursChange = data.previousHours 
    ? ((data.hours - data.previousHours) / data.previousHours) * 100
    : undefined;
  
  // Determine churn risk
  const churnRisk = determineChurnRisk(metrics);
  
  // Calculate intervention priority
  const interventionPriority = calculateInterventionPriority(metrics, score);
  
  return {
    riderCode: data.riderCode,
    riderName: data.riderName,
    supervisor: data.supervisor,
    zone: data.zone,
    classification: 'solid', // Will be assigned later
    score: Math.max(0, Math.min(100, score)),
    rank: 0, // Will be assigned later
    metrics,
    trend,
    hoursChange,
    strengths: [],
    concerns: [],
    recommendations: [],
    churnRisk,
    interventionPriority,
  };
}

// ============================================================================
// COMPONENT SCORE CALCULATORS
// ============================================================================

function calculateHoursScore(hours: number): number {
  // Scoring: 0h = 0, 40h+ = 100
  return Math.min(100, (hours / 40) * 100);
}

function calculateOrdersScore(orders: number): number {
  // Scoring: 0 = 0, 100+ = 100
  return Math.min(100, (orders / 100) * 100);
}

function calculateProductivityScore(ordersPerHour: number): number {
  // Scoring: 0 = 0, 2.5+ = 100
  return Math.min(100, (ordersPerHour / 2.5) * 100);
}

function calculateBreakScore(breakPercent: number): number {
  // Scoring: ≤8% = 100, >15% = 0
  if (breakPercent <= 8) return 100;
  if (breakPercent >= 15) return 0;
  return 100 - ((breakPercent - 8) / 7) * 100;
}

function calculateLateScore(latePercent: number): number {
  // Scoring: ≤5% = 100, >10% = 0
  if (latePercent <= 5) return 100;
  if (latePercent >= 10) return 0;
  return 100 - ((latePercent - 5) / 5) * 100;
}

// ============================================================================
// CLASSIFICATION
// ============================================================================

/**
 * Classify riders into 4 tiers
 */
function classifyRiders(riders: RiderScore[]): void {
  const total = riders.length;
  
  // Get thresholds from config
  const starThreshold = RIDER_CLASSIFICATION.star.minScore;
  const solidThreshold = RIDER_CLASSIFICATION.solid.minScore;
  const atRiskThreshold = RIDER_CLASSIFICATION.atRisk.minScore;
  
  // Alternative: Use percentile-based classification
  const starPercentile = RIDER_CLASSIFICATION.star.percentile;
  const solidPercentile = RIDER_CLASSIFICATION.solid.percentile;
  const atRiskPercentile = RIDER_CLASSIFICATION.atRisk.percentile;
  
  const starCutoff = Math.floor(total * (1 - starPercentile / 100));
  const solidCutoff = Math.floor(total * (1 - solidPercentile / 100));
  const atRiskCutoff = Math.floor(total * (1 - atRiskPercentile / 100));
  
  riders.forEach((rider, idx) => {
    // Use both score and percentile
    if (rider.score >= starThreshold && idx < starCutoff) {
      rider.classification = 'star';
    } else if (rider.score >= solidThreshold && idx < solidCutoff) {
      rider.classification = 'solid';
    } else if (rider.score >= atRiskThreshold && idx < atRiskCutoff) {
      rider.classification = 'at_risk';
    } else {
      rider.classification = 'critical';
    }
  });
}

// ============================================================================
// TREND & RISK
// ============================================================================

function determineTrend(
  currentHours: number,
  previousHours: number | undefined,
  currentScore: number,
  previousScore: number | undefined
): RiderScore['trend'] {
  if (!previousHours && !previousScore) return 'stable';
  
  // Check hours trend
  if (previousHours) {
    const hoursChange = ((currentHours - previousHours) / previousHours) * 100;
    if (hoursChange > 10) return 'improving';
    if (hoursChange < -10) return 'declining';
  }
  
  // Check score trend
  if (previousScore) {
    const scoreChange = currentScore - previousScore;
    if (scoreChange > 5) return 'improving';
    if (scoreChange < -5) return 'declining';
  }
  
  return 'stable';
}

function determineChurnRisk(metrics: RiderPerformanceMetrics): 'low' | 'medium' | 'high' {
  let riskScore = 0;
  
  // Low hours = risk
  if (metrics.hours < 10) riskScore += 3;
  else if (metrics.hours < 20) riskScore += 1;
  
  // Low attendance = risk
  if (metrics.attendancePercent < 50) riskScore += 3;
  else if (metrics.attendancePercent < 70) riskScore += 2;
  
  // Low productivity = risk
  if (metrics.ordersPerHour < 1.5) riskScore += 2;
  
  if (riskScore >= 5) return 'high';
  if (riskScore >= 3) return 'medium';
  return 'low';
}

function calculateInterventionPriority(
  metrics: RiderPerformanceMetrics,
  score: number
): number {
  let priority = 5; // Base
  
  // Very low score = urgent
  if (score < 30) priority += 4;
  else if (score < 50) priority += 2;
  
  // Very low hours = urgent
  if (metrics.hours < 5) priority += 3;
  else if (metrics.hours < 10) priority += 1;
  
  // Poor attendance = urgent
  if (metrics.attendancePercent < 50) priority += 2;
  
  return Math.min(10, priority);
}

// ============================================================================
// INSIGHTS GENERATION
// ============================================================================

function generateRiderInsights(rider: RiderScore): void {
  const { metrics } = rider;
  
  // Identify strengths
  if (metrics.hours > 35) {
    rider.strengths.push('ساعات عمل عالية');
  }
  if (metrics.ordersPerHour > 2.5) {
    rider.strengths.push('إنتاجية ممتازة');
  }
  if (metrics.attendancePercent > 90) {
    rider.strengths.push('حضور منتظم');
  }
  if (metrics.breakPercent < 6) {
    rider.strengths.push('التزام بالاستراحة');
  }
  if (metrics.latePercent < 3) {
    rider.strengths.push('التزام بالمواعيد');
  }
  
  // Identify concerns
  if (metrics.hours < 10) {
    rider.concerns.push('ساعات عمل منخفضة جداً');
  } else if (metrics.hours < 20) {
    rider.concerns.push('ساعات عمل منخفضة');
  }
  
  if (metrics.ordersPerHour < 1.5) {
    rider.concerns.push('إنتاجية منخفضة');
  }
  
  if (metrics.attendancePercent < 50) {
    rider.concerns.push('غياب متكرر');
  } else if (metrics.attendancePercent < 70) {
    rider.concerns.push('حضور ضعيف');
  }
  
  if (metrics.breakPercent > 12) {
    rider.concerns.push('استراحة زائدة');
  }
  
  if (metrics.latePercent > 8) {
    rider.concerns.push('تأخير متكرر');
  }
  
  // Generate recommendations based on classification
  if (rider.classification === 'star') {
    rider.recommendations.push('الاستمرار في الأداء الممتاز');
    rider.recommendations.push('مكافأة وحوافز إضافية');
    if (metrics.hours > 40) {
      rider.recommendations.push('يمكن تكليفه بمهام تدريبية');
    }
  } else if (rider.classification === 'critical') {
    rider.recommendations.push('تدخل عاجل مطلوب');
    
    if (metrics.hours < 10) {
      rider.recommendations.push('التحقيق في أسباب انخفاض الساعات');
      rider.recommendations.push('تقديم دعم فني أو معدات');
    }
    
    if (metrics.attendancePercent < 50) {
      rider.recommendations.push('اجتماع شخصي لفهم المشاكل');
      rider.recommendations.push('النظر في الإقالة إذا لم يتحسن');
    }
    
    if (metrics.ordersPerHour < 1.5) {
      rider.recommendations.push('تدريب على تحسين الكفاءة');
      rider.recommendations.push('مراجعة مسارات التوصيل');
    }
  } else if (rider.classification === 'at_risk') {
    rider.recommendations.push('مراقبة يومية');
    rider.recommendations.push('تقديم دعم ومتابعة');
    
    if (rider.concerns.length > 0) {
      rider.recommendations.push(`معالجة: ${rider.concerns[0]}`);
    }
  } else {
    // Solid
    rider.recommendations.push('الاستمرار في الأداء الجيد');
    
    if (metrics.hours < 30) {
      rider.recommendations.push('محاولة زيادة ساعات العمل');
    }
  }
}

// ============================================================================
// ANALYTICS
// ============================================================================

/**
 * Generate summary for rider intelligence
 */
export function generateRiderIntelligenceSummary(
  intelligence: RiderIntelligence
): { summaryEn: string; summaryAr: string } {
  const starsCount = intelligence.classifications.stars.length;
  const criticalCount = intelligence.classifications.critical.length;
  const topRider = intelligence.topPerformers[0];
  
  return {
    summaryEn: `${intelligence.totalRiders} riders analyzed. ${starsCount} stars (${((starsCount/intelligence.totalRiders)*100).toFixed(0)}%), ${criticalCount} critical (${((criticalCount/intelligence.totalRiders)*100).toFixed(0)}%). Top performer: ${topRider?.riderName || 'N/A'} (${topRider?.metrics.hours.toFixed(1)}h, ${topRider?.metrics.orders} orders). ${intelligence.highChurnRisk.length} at high churn risk.`,
    summaryAr: `تم تحليل ${intelligence.totalRiders} مندوب. ${starsCount} نجم (${((starsCount/intelligence.totalRiders)*100).toFixed(0)}%)، ${criticalCount} حرج (${((criticalCount/intelligence.totalRiders)*100).toFixed(0)}%). الأفضل: ${topRider?.riderName || 'لا يوجد'} (${topRider?.metrics.hours.toFixed(1)} ساعة، ${topRider?.metrics.orders} أوردر). ${intelligence.highChurnRisk.length} في خطر استقالة عالي.`,
  };
}

/**
 * Get riders needing specific intervention type
 */
export function getRidersNeedingIntervention(
  intelligence: RiderIntelligence,
  type: 'hours' | 'attendance' | 'productivity' | 'churn'
): RiderScore[] {
  switch (type) {
    case 'hours':
      return intelligence.classifications.critical
        .concat(intelligence.classifications.atRisk)
        .filter(r => r.metrics.hours < 20)
        .sort((a, b) => a.metrics.hours - b.metrics.hours)
        .slice(0, 10);
    
    case 'attendance':
      return intelligence.classifications.critical
        .concat(intelligence.classifications.atRisk)
        .filter(r => r.metrics.attendancePercent < 70)
        .sort((a, b) => a.metrics.attendancePercent - b.metrics.attendancePercent)
        .slice(0, 10);
    
    case 'productivity':
      return intelligence.classifications.critical
        .concat(intelligence.classifications.atRisk)
        .filter(r => r.metrics.ordersPerHour < 2)
        .sort((a, b) => a.metrics.ordersPerHour - b.metrics.ordersPerHour)
        .slice(0, 10);
    
    case 'churn':
      return intelligence.highChurnRisk.slice(0, 10);
    
    default:
      return [];
  }
}
