/**
 * Comparative Intelligence Engine
 * 
 * Compares performance across zones, supervisors, and time periods.
 * Implements SRS-004 Section 13: Comparative Intelligence.
 * 
 * Answers: "How do we compare?" and "What are best practices?"
 * 
 * @module ComparativeIntelligence
 * @version 1.0
 */

import type { KPIEngineOutput } from '@/lib/strategicOps/kpi';
import type { SupervisorScore } from './supervisorIntelligence';
import type { RiderScore } from './riderIntelligence';

// ============================================================================
// TYPES
// ============================================================================

export type ComparisonType = 'zone' | 'supervisor' | 'period' | 'rider_group';

export type ComparisonResult = {
  type: ComparisonType;
  entity1: string;
  entity2: string;
  
  // Metrics comparison
  metrics: {
    name: string;
    nameAr: string;
    value1: number;
    value2: number;
    difference: number;
    percentDifference: number;
    winner: 'entity1' | 'entity2' | 'tie';
  }[];
  
  // Overall winner
  overallWinner: 'entity1' | 'entity2' | 'tie';
  score1: number;
  score2: number;
  
  // Best practices
  bestPractices: {
    practice: string;
    practiceAr: string;
    from: string;
    impact: string;
  }[];
  
  // Recommendations
  recommendations: string[];
  recommendationsAr: string[];
  
  // Summary
  summary: {
    english: string;
    arabic: string;
  };
};

export type BenchmarkAnalysis = {
  topPerformers: {
    zones?: string[];
    supervisors?: string[];
    riderGroups?: string[];
  };
  
  averages: {
    hours: number;
    orders: number;
    ordersPerHour: number;
    attendancePercent: number;
  };
  
  benchmarks: {
    hours: { top25: number; top10: number; median: number };
    ordersPerHour: { top25: number; top10: number; median: number };
  };
  
  insights: {
    topPerformanceDrivers: string[];
    topPerformanceDriversAr: string[];
    improvementOpportunities: string[];
    improvementOpportunitiesAr: string[];
  };
};

// ============================================================================
// COMPARATIVE INTELLIGENCE ENGINE
// ============================================================================

/**
 * Compare two entities (zones, supervisors, time periods)
 */
export function compareEntities(
  entity1Data: KPIEngineOutput,
  entity2Data: KPIEngineOutput,
  entity1Name: string,
  entity2Name: string,
  type: ComparisonType
): ComparisonResult {
  
  // Define metrics to compare
  const metricsToCompare = [
    { name: 'Total Hours', nameAr: 'إجمالي الساعات', key: 'hours.totalWorkingHours' },
    { name: 'Hours Achievement', nameAr: 'تحقيق الساعات', key: 'hours.hoursAchievement' },
    { name: 'Working Riders', nameAr: 'المناديب العاملون', key: 'headcount.workingRiders' },
    { name: 'Total Orders', nameAr: 'إجمالي الأوردرات', key: 'orders.totalOrders' },
    { name: 'Orders/Hour', nameAr: 'أوردر/ساعة', key: 'orders.ordersPerHour' },
    { name: 'Attendance %', nameAr: 'نسبة الحضور', key: 'attendance.attendancePercent' },
    { name: 'Break %', nameAr: 'نسبة الاستراحة', key: 'break.breakPercent' },
    { name: 'Late %', nameAr: 'نسبة التأخير', key: 'late.latePercent' },
  ];
  
  // Compare each metric
  const metrics = metricsToCompare.map(metric => {
    const value1 = getNestedValue(entity1Data, metric.key);
    const value2 = getNestedValue(entity2Data, metric.key);
    const difference = value1 - value2;
    const percentDifference = value2 !== 0 ? (difference / value2) * 100 : 0;
    
    // Determine winner (lower is better for break/late)
    const isLowerBetter = metric.key.includes('break') || metric.key.includes('late');
    let winner: 'entity1' | 'entity2' | 'tie';
    
    if (Math.abs(difference) < 0.01) {
      winner = 'tie';
    } else if (isLowerBetter) {
      winner = value1 < value2 ? 'entity1' : 'entity2';
    } else {
      winner = value1 > value2 ? 'entity1' : 'entity2';
    }
    
    return {
      name: metric.name,
      nameAr: metric.nameAr,
      value1,
      value2,
      difference,
      percentDifference,
      winner,
    };
  });
  
  // Calculate overall winner (count wins)
  const entity1Wins = metrics.filter(m => m.winner === 'entity1').length;
  const entity2Wins = metrics.filter(m => m.winner === 'entity2').length;
  
  const overallWinner: 'entity1' | 'entity2' | 'tie' = 
    entity1Wins > entity2Wins ? 'entity1' : 
    entity2Wins > entity1Wins ? 'entity2' : 'tie';
  
  // Extract best practices
  const bestPractices = extractBestPractices(metrics, entity1Name, entity2Name, overallWinner);
  
  // Generate recommendations
  const recommendations = generateComparisonRecommendations(metrics, entity1Name, entity2Name, overallWinner);
  const recommendationsAr = generateComparisonRecommendationsAr(metrics, entity1Name, entity2Name, overallWinner);
  
  // Generate summary
  const summary = generateComparisonSummary(entity1Name, entity2Name, overallWinner, metrics);
  
  return {
    type,
    entity1: entity1Name,
    entity2: entity2Name,
    metrics,
    overallWinner,
    score1: entity1Wins,
    score2: entity2Wins,
    bestPractices,
    recommendations,
    recommendationsAr,
    summary,
  };
}

/**
 * Generate benchmark analysis from multiple entities
 */
export function generateBenchmarkAnalysis(
  entities: { name: string; data: KPIEngineOutput }[]
): BenchmarkAnalysis {
  
  // Extract all hours and ordersPerHour values
  const hoursValues = entities.map(e => e.data.hours.totalWorkingHours.value.current);
  const ordersPerHourValues = entities.map(e => e.data.orders.ordersPerHour.value.current);
  
  // Sort and calculate percentiles
  const sortedHours = [...hoursValues].sort((a, b) => b - a);
  const sortedOPH = [...ordersPerHourValues].sort((a, b) => b - a);
  
  const hoursTop25 = sortedHours[Math.floor(sortedHours.length * 0.25)] || 0;
  const hoursTop10 = sortedHours[Math.floor(sortedHours.length * 0.10)] || 0;
  const hoursMedian = sortedHours[Math.floor(sortedHours.length * 0.50)] || 0;
  
  const ophTop25 = sortedOPH[Math.floor(sortedOPH.length * 0.25)] || 0;
  const ophTop10 = sortedOPH[Math.floor(sortedOPH.length * 0.10)] || 0;
  const ophMedian = sortedOPH[Math.floor(sortedOPH.length * 0.50)] || 0;
  
  // Calculate averages
  const avgHours = hoursValues.reduce((s, v) => s + v, 0) / hoursValues.length;
  const avgOrders = entities.reduce((s, e) => s + e.data.orders.totalOrders.value.current, 0) / entities.length;
  const avgOPH = ordersPerHourValues.reduce((s, v) => s + v, 0) / ordersPerHourValues.length;
  const avgAttendance = entities.reduce((s, e) => s + e.data.attendance.attendancePercent.value.current, 0) / entities.length;
  
  // Identify top performers
  const topZones = entities
    .sort((a, b) => b.data.hours.hoursAchievement.value.current - a.data.hours.hoursAchievement.value.current)
    .slice(0, 3)
    .map(e => e.name);
  
  // Extract insights
  const topPerformanceDrivers = [
    'High attendance rate (>90%)',
    'Low break time (<7%)',
    'High productivity (>2.5 orders/hour)',
    'Effective supervisor management',
    'Active rider engagement',
  ];
  
  const topPerformanceDriversAr = [
    'معدل حضور عالي (>90%)',
    'وقت استراحة منخفض (<7%)',
    'إنتاجية عالية (>2.5 أوردر/ساعة)',
    'إدارة فعالة من المشرفين',
    'تفاعل نشط من المناديب',
  ];
  
  const improvementOpportunities = [
    'Reduce break time to <8%',
    'Improve attendance to >85%',
    'Increase orders/hour to >2.3',
    'Activate more riders',
    'Reduce late arrivals',
  ];
  
  const improvementOpportunitiesAr = [
    'تقليل وقت الاستراحة لـ <8%',
    'تحسين الحضور لـ >85%',
    'زيادة الأوردرات/ساعة لـ >2.3',
    'تفعيل المزيد من المناديب',
    'تقليل التأخير',
  ];
  
  return {
    topPerformers: {
      zones: topZones,
    },
    averages: {
      hours: avgHours,
      orders: avgOrders,
      ordersPerHour: avgOPH,
      attendancePercent: avgAttendance,
    },
    benchmarks: {
      hours: {
        top25: hoursTop25,
        top10: hoursTop10,
        median: hoursMedian,
      },
      ordersPerHour: {
        top25: ophTop25,
        top10: ophTop10,
        median: ophMedian,
      },
    },
    insights: {
      topPerformanceDrivers,
      topPerformanceDriversAr,
      improvementOpportunities,
      improvementOpportunitiesAr,
    },
  };
}

/**
 * Compare supervisors
 */
export function compareSupervisors(
  supervisor1: SupervisorScore,
  supervisor2: SupervisorScore
): ComparisonResult {
  const metrics = [
    { name: 'Total Score', nameAr: 'الدرجة الكلية', value1: supervisor1.totalScore, value2: supervisor2.totalScore },
    { name: 'Hours Achievement', nameAr: 'تحقيق الساعات', value1: supervisor1.components.hoursAchievement, value2: supervisor2.components.hoursAchievement },
    { name: 'Orders/Hour', nameAr: 'أوردر/ساعة', value1: supervisor1.components.ordersPerHour, value2: supervisor2.components.ordersPerHour },
    { name: 'Attendance', nameAr: 'الحضور', value1: supervisor1.components.attendanceRate, value2: supervisor2.components.attendanceRate },
    { name: 'Team Size', nameAr: 'حجم الفريق', value1: supervisor1.components.teamSize, value2: supervisor2.components.teamSize },
  ].map(m => ({
    ...m,
    difference: m.value1 - m.value2,
    percentDifference: m.value2 !== 0 ? ((m.value1 - m.value2) / m.value2) * 100 : 0,
    winner: (m.value1 > m.value2 ? 'entity1' : m.value1 < m.value2 ? 'entity2' : 'tie') as 'entity1' | 'entity2' | 'tie',
  }));
  
  const entity1Wins = metrics.filter(m => m.winner === 'entity1').length;
  const overallWinner = entity1Wins > metrics.length / 2 ? 'entity1' : 'entity2';
  
  return {
    type: 'supervisor',
    entity1: supervisor1.supervisorName,
    entity2: supervisor2.supervisorName,
    metrics,
    overallWinner,
    score1: entity1Wins,
    score2: metrics.length - entity1Wins,
    bestPractices: [],
    recommendations: [
      `${overallWinner === 'entity2' ? supervisor1.supervisorName : supervisor2.supervisorName} should learn from ${overallWinner === 'entity1' ? supervisor1.supervisorName : supervisor2.supervisorName}`,
    ],
    recommendationsAr: [
      `يجب على ${overallWinner === 'entity2' ? supervisor1.supervisorName : supervisor2.supervisorName} التعلم من ${overallWinner === 'entity1' ? supervisor1.supervisorName : supervisor2.supervisorName}`,
    ],
    summary: {
      english: `${supervisor1.supervisorName} vs ${supervisor2.supervisorName}: ${overallWinner === 'entity1' ? supervisor1.supervisorName : supervisor2.supervisorName} performs better overall.`,
      arabic: `${supervisor1.supervisorName} مقابل ${supervisor2.supervisorName}: ${overallWinner === 'entity1' ? supervisor1.supervisorName : supervisor2.supervisorName} الأفضل بشكل عام.`,
    },
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getNestedValue(obj: any, path: string): number {
  return path.split('.').reduce((current, key) => current?.[key]?.value?.current ?? 0, obj);
}

function extractBestPractices(
  metrics: ComparisonResult['metrics'],
  entity1: string,
  entity2: string,
  winner: 'entity1' | 'entity2' | 'tie'
): ComparisonResult['bestPractices'] {
  const practices: ComparisonResult['bestPractices'] = [];
  
  if (winner === 'tie') return practices;
  
  const winnerName = winner === 'entity1' ? entity1 : entity2;
  
  // Find metrics where winner excels significantly
  metrics.forEach(metric => {
    if (metric.winner === winner && Math.abs(metric.percentDifference) > 10) {
      practices.push({
        practice: `${winnerName} excels in ${metric.name} (${Math.abs(metric.percentDifference).toFixed(0)}% better)`,
        practiceAr: `${winnerName} متميز في ${metric.nameAr} (أفضل بـ ${Math.abs(metric.percentDifference).toFixed(0)}%)`,
        from: winnerName,
        impact: 'High',
      });
    }
  });
  
  return practices.slice(0, 3); // Top 3
}

function generateComparisonRecommendations(
  metrics: ComparisonResult['metrics'],
  entity1: string,
  entity2: string,
  winner: 'entity1' | 'entity2' | 'tie'
): string[] {
  const recommendations: string[] = [];
  
  if (winner === 'tie') {
    recommendations.push('Both entities perform similarly');
    return recommendations;
  }
  
  const loser = winner === 'entity1' ? 'entity2' : 'entity1';
  const loserName = loser === 'entity1' ? entity1 : entity2;
  const winnerName = winner === 'entity1' ? entity1 : entity2;
  
  // Find areas where loser needs improvement
  metrics.forEach(metric => {
    if (metric.winner === winner && Math.abs(metric.percentDifference) > 15) {
      recommendations.push(`${loserName} should improve ${metric.name} (currently ${Math.abs(metric.percentDifference).toFixed(0)}% behind)`);
    }
  });
  
  if (recommendations.length === 0) {
    recommendations.push(`${loserName} should learn best practices from ${winnerName}`);
  }
  
  return recommendations.slice(0, 5);
}

function generateComparisonRecommendationsAr(
  metrics: ComparisonResult['metrics'],
  entity1: string,
  entity2: string,
  winner: 'entity1' | 'entity2' | 'tie'
): string[] {
  const recommendations: string[] = [];
  
  if (winner === 'tie') {
    recommendations.push('كلا الطرفين يؤديان بشكل متشابه');
    return recommendations;
  }
  
  const loser = winner === 'entity1' ? 'entity2' : 'entity1';
  const loserName = loser === 'entity1' ? entity1 : entity2;
  const winnerName = winner === 'entity1' ? entity1 : entity2;
  
  metrics.forEach(metric => {
    if (metric.winner === winner && Math.abs(metric.percentDifference) > 15) {
      recommendations.push(`يجب على ${loserName} تحسين ${metric.nameAr} (حالياً متأخر بـ ${Math.abs(metric.percentDifference).toFixed(0)}%)`);
    }
  });
  
  if (recommendations.length === 0) {
    recommendations.push(`يجب على ${loserName} التعلم من أفضل ممارسات ${winnerName}`);
  }
  
  return recommendations.slice(0, 5);
}

function generateComparisonSummary(
  entity1: string,
  entity2: string,
  winner: 'entity1' | 'entity2' | 'tie',
  metrics: ComparisonResult['metrics']
): { english: string; arabic: string } {
  const winnerName = winner === 'entity1' ? entity1 : winner === 'entity2' ? entity2 : 'Both';
  const entity1Wins = metrics.filter(m => m.winner === 'entity1').length;
  const entity2Wins = metrics.filter(m => m.winner === 'entity2').length;
  
  const english = winner === 'tie' 
    ? `${entity1} and ${entity2} perform equally well across all metrics.`
    : `${winnerName} outperforms in ${winner === 'entity1' ? entity1Wins : entity2Wins} out of ${metrics.length} metrics.`;
  
  const arabic = winner === 'tie'
    ? `${entity1} و ${entity2} يؤديان بشكل متساوٍ في جميع المقاييس.`
    : `${winnerName} متفوق في ${winner === 'entity1' ? entity1Wins : entity2Wins} من ${metrics.length} مقياس.`;
  
  return { english, arabic };
}
