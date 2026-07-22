/**
 * Risk Detection Engine
 * 
 * Detects operational risks before they materialize.
 * Implements SRS-004 Section 5: Risk Detection Engine.
 * 
 * Answers: "What risks threaten our performance?"
 * 
 * @module RiskDetection
 * @version 1.0
 */

import type { KPIEngineOutput } from '@/lib/strategicOps/kpi';
import { ALERT_THRESHOLDS } from '@/lib/strategicOps/config/businessRules';

// ============================================================================
// TYPES
// ============================================================================

export type RiskType =
  | 'performance_decline'
  | 'attrition_risk'
  | 'capacity_shortage'
  | 'quality_deterioration'
  | 'supervisor_overload'
  | 'attendance_crisis'
  | 'efficiency_drop'
  | 'target_miss'
  | 'equipment_failure'
  | 'seasonal_demand';

export type RiskSeverity = 'critical' | 'high' | 'medium' | 'low';

export type RiskTimeframe = 'immediate' | 'short' | 'medium' | 'long'; // Now, 1 week, 1 month, 3+ months

export type Risk = {
  type: RiskType;
  typeAr: string;
  title: string;
  titleAr: string;
  description: string;
  descriptionAr: string;
  
  // Severity & Impact
  severity: RiskSeverity;
  likelihood: number; // 0-100%
  impact: number; // 0-100 (potential loss in hours or orders)
  riskScore: number; // likelihood * impact
  
  // Timeframe
  timeframe: RiskTimeframe;
  daysToMaterialize: number;
  
  // Evidence
  indicators: string[];
  indicatorsAr: string[];
  trendDirection: 'worsening' | 'stable' | 'improving';
  
  // Mitigation
  mitigationSteps: string[];
  mitigationStepsAr: string[];
  preventable: boolean;
  
  // Monitoring
  monitoringMetrics: string[];
  monitoringMetricsAr: string[];
};

export type RiskAnalysis = {
  totalRisks: number;
  criticalRisks: number;
  highRisks: number;
  totalRiskScore: number;
  overallRiskLevel: 'critical' | 'high' | 'medium' | 'low';
  risks: Risk[];
  immediateThreats: Risk[]; // Risks that need action today
  preventableRisks: Risk[]; // Risks we can avoid
};

// ============================================================================
// RISK LABELS
// ============================================================================

const RISK_TYPE_LABELS_AR: Record<RiskType, string> = {
  performance_decline: 'تراجع الأداء',
  attrition_risk: 'خطر الاستقالات',
  capacity_shortage: 'نقص الطاقة',
  quality_deterioration: 'تدهور الجودة',
  supervisor_overload: 'ضغط على المشرفين',
  attendance_crisis: 'أزمة حضور',
  efficiency_drop: 'انخفاض الكفاءة',
  target_miss: 'خطر عدم تحقيق الهدف',
  equipment_failure: 'عطل المعدات',
  seasonal_demand: 'طلب موسمي',
};

// ============================================================================
// RISK DETECTION ENGINE
// ============================================================================

/**
 * Detect all operational risks
 */
export function detectRisks(kpis: KPIEngineOutput): RiskAnalysis {
  const risks: Risk[] = [];
  
  // 1. Performance decline risk
  const performanceRisk = detectPerformanceDeclineRisk(kpis);
  if (performanceRisk) risks.push(performanceRisk);
  
  // 2. Attrition risk (high inactive riders)
  const attritionRisk = detectAttritionRisk(kpis);
  if (attritionRisk) risks.push(attritionRisk);
  
  // 3. Capacity shortage
  const capacityRisk = detectCapacityShortageRisk(kpis);
  if (capacityRisk) risks.push(capacityRisk);
  
  // 4. Quality deterioration (data quality)
  const qualityRisk = detectQualityDeteriorationRisk(kpis);
  if (qualityRisk) risks.push(qualityRisk);
  
  // 5. Attendance crisis
  const attendanceRisk = detectAttendanceCrisisRisk(kpis);
  if (attendanceRisk) risks.push(attendanceRisk);
  
  // 6. Efficiency drop
  const efficiencyRisk = detectEfficiencyDropRisk(kpis);
  if (efficiencyRisk) risks.push(efficiencyRisk);
  
  // 7. Target miss risk
  const targetRisk = detectTargetMissRisk(kpis);
  if (targetRisk) risks.push(targetRisk);
  
  // Sort by risk score (likelihood * impact)
  risks.sort((a, b) => b.riskScore - a.riskScore);
  
  // Calculate overall risk level
  const criticalRisks = risks.filter(r => r.severity === 'critical').length;
  const highRisks = risks.filter(r => r.severity === 'high').length;
  const totalRiskScore = risks.reduce((sum, r) => sum + r.riskScore, 0);
  
  let overallRiskLevel: 'critical' | 'high' | 'medium' | 'low';
  if (criticalRisks > 0) {
    overallRiskLevel = 'critical';
  } else if (highRisks >= 2 || totalRiskScore > 500) {
    overallRiskLevel = 'high';
  } else if (risks.length >= 3) {
    overallRiskLevel = 'medium';
  } else {
    overallRiskLevel = 'low';
  }
  
  // Identify immediate threats (timeframe = immediate)
  const immediateThreats = risks.filter(r => r.timeframe === 'immediate');
  
  // Identify preventable risks
  const preventableRisks = risks.filter(r => r.preventable);
  
  return {
    totalRisks: risks.length,
    criticalRisks,
    highRisks,
    totalRiskScore,
    overallRiskLevel,
    risks,
    immediateThreats,
    preventableRisks,
  };
}

// ============================================================================
// INDIVIDUAL RISK DETECTORS
// ============================================================================

/**
 * Detect performance decline risk based on trends
 */
function detectPerformanceDeclineRisk(kpis: KPIEngineOutput): Risk | null {
  // Check if hours are declining
  const hoursChange = kpis.hours.totalWorkingHours.value.growthPercent || 0;
  const ordersChange = kpis.orders.totalOrders.value.growthPercent || 0;
  
  if (hoursChange < -10 || ordersChange < -15) {
    const severity: RiskSeverity = hoursChange < -20 ? 'critical' : hoursChange < -15 ? 'high' : 'medium';
    const likelihood = Math.min(100, Math.abs(hoursChange) * 3);
    const impact = Math.abs(hoursChange) * 5;
    
    return {
      type: 'performance_decline',
      typeAr: RISK_TYPE_LABELS_AR.performance_decline,
      title: 'Performance Decline Detected',
      titleAr: 'تراجع في الأداء',
      description: `Working hours declined by ${Math.abs(hoursChange).toFixed(1)}% and orders by ${Math.abs(ordersChange).toFixed(1)}%. Immediate action required.`,
      descriptionAr: `انخفضت ساعات العمل بنسبة ${Math.abs(hoursChange).toFixed(1)}% والأوردرات بنسبة ${Math.abs(ordersChange).toFixed(1)}%. يتطلب إجراء فوري.`,
      severity,
      likelihood,
      impact,
      riskScore: (likelihood * impact) / 100,
      timeframe: 'immediate',
      daysToMaterialize: 0,
      indicators: [
        `Hours decreased by ${Math.abs(hoursChange).toFixed(1)}%`,
        `Orders decreased by ${Math.abs(ordersChange).toFixed(1)}%`,
        'Downward trend detected',
      ],
      indicatorsAr: [
        `انخفاض الساعات بنسبة ${Math.abs(hoursChange).toFixed(1)}%`,
        `انخفاض الأوردرات بنسبة ${Math.abs(ordersChange).toFixed(1)}%`,
        'اتجاه هبوطي مكتشف',
      ],
      trendDirection: 'worsening',
      mitigationSteps: [
        'Investigate root cause immediately',
        'Meet with supervisors to identify issues',
        'Provide additional support to riders',
        'Review recent policy changes',
        'Check for external factors (weather, holidays)',
      ],
      mitigationStepsAr: [
        'التحقيق في السبب الجذري فوراً',
        'الاجتماع مع المشرفين لتحديد المشاكل',
        'تقديم دعم إضافي للمناديب',
        'مراجعة التغييرات الأخيرة في السياسات',
        'التحقق من العوامل الخارجية (الطقس، العطلات)',
      ],
      preventable: true,
      monitoringMetrics: [
        'Daily working hours',
        'Daily orders',
        'Active riders count',
        'Hours achievement %',
      ],
      monitoringMetricsAr: [
        'ساعات العمل اليومية',
        'الأوردرات اليومية',
        'عدد المناديب النشطين',
        'نسبة تحقيق الساعات',
      ],
    };
  }
  
  return null;
}

/**
 * Detect attrition risk (riders leaving)
 */
function detectAttritionRisk(kpis: KPIEngineOutput): Risk | null {
  const inactiveRiders = kpis.headcount.inactiveRiders.value.current;
  const registeredRiders = kpis.headcount.registeredRiders.value.current;
  const inactivePercent = (inactiveRiders / registeredRiders) * 100;
  
  if (inactivePercent > 30) {
    const severity: RiskSeverity = inactivePercent > 50 ? 'critical' : inactivePercent > 40 ? 'high' : 'medium';
    const likelihood = Math.min(100, inactivePercent * 1.5);
    const impact = inactiveRiders * 8; // Assume 8 hours per rider
    
    return {
      type: 'attrition_risk',
      typeAr: RISK_TYPE_LABELS_AR.attrition_risk,
      title: 'High Attrition Risk',
      titleAr: 'خطر استقالات عالي',
      description: `${inactivePercent.toFixed(1)}% of riders (${inactiveRiders}) are inactive. Risk of permanent loss.`,
      descriptionAr: `${inactivePercent.toFixed(1)}% من المناديب (${inactiveRiders}) غير نشطين. خطر فقدان دائم.`,
      severity,
      likelihood,
      impact,
      riskScore: (likelihood * impact) / 100,
      timeframe: 'short',
      daysToMaterialize: 7,
      indicators: [
        `${inactiveRiders} inactive riders`,
        `${inactivePercent.toFixed(1)}% inactivity rate`,
        'Potential churn risk',
      ],
      indicatorsAr: [
        `${inactiveRiders} مندوب غير نشط`,
        `نسبة عدم نشاط ${inactivePercent.toFixed(1)}%`,
        'خطر استقالة محتمل',
      ],
      trendDirection: 'worsening',
      mitigationSteps: [
        'Contact inactive riders urgently',
        'Understand reasons for inactivity',
        'Offer reactivation incentives',
        'Improve working conditions',
        'Accelerate recruitment to compensate',
      ],
      mitigationStepsAr: [
        'التواصل مع المناديب غير النشطين بشكل عاجل',
        'فهم أسباب عدم النشاط',
        'تقديم حوافز لإعادة التفعيل',
        'تحسين ظروف العمل',
        'تسريع التوظيف للتعويض',
      ],
      preventable: true,
      monitoringMetrics: [
        'Inactive riders count',
        'Reactivation rate',
        'Termination rate',
        'Rider satisfaction',
      ],
      monitoringMetricsAr: [
        'عدد المناديب غير النشطين',
        'معدل إعادة التفعيل',
        'معدل الإقالة',
        'رضا المناديب',
      ],
    };
  }
  
  return null;
}

/**
 * Detect capacity shortage risk
 */
function detectCapacityShortageRisk(kpis: KPIEngineOutput): Risk | null {
  const capacityUtilization = kpis.headcount.capacityUtilization.value.current;
  
  if (capacityUtilization > 90) {
    const severity: RiskSeverity = capacityUtilization > 95 ? 'critical' : 'high';
    const likelihood = Math.min(100, (capacityUtilization - 80) * 5);
    const impact = 80; // High impact on operations
    
    return {
      type: 'capacity_shortage',
      typeAr: RISK_TYPE_LABELS_AR.capacity_shortage,
      title: 'Capacity At Maximum',
      titleAr: 'الطاقة عند الحد الأقصى',
      description: `Operating at ${capacityUtilization.toFixed(1)}% capacity. No buffer for demand spikes or absences.`,
      descriptionAr: `التشغيل عند ${capacityUtilization.toFixed(1)}% من الطاقة. لا يوجد احتياطي لارتفاع الطلب أو الغياب.`,
      severity,
      likelihood,
      impact,
      riskScore: (likelihood * impact) / 100,
      timeframe: 'immediate',
      daysToMaterialize: 0,
      indicators: [
        `${capacityUtilization.toFixed(1)}% capacity utilization`,
        'No spare capacity',
        'Cannot absorb demand increases',
      ],
      indicatorsAr: [
        `استغلال ${capacityUtilization.toFixed(1)}% من الطاقة`,
        'لا توجد طاقة احتياطية',
        'لا يمكن استيعاب زيادة الطلب',
      ],
      trendDirection: 'worsening',
      mitigationSteps: [
        'Urgent recruitment needed',
        'Activate part-time riders',
        'Increase incentives for extra hours',
        'Negotiate with customers for realistic targets',
        'Prepare contingency plan',
      ],
      mitigationStepsAr: [
        'توظيف عاجل مطلوب',
        'تفعيل المناديب بدوام جزئي',
        'زيادة الحوافز للساعات الإضافية',
        'التفاوض مع العملاء لأهداف واقعية',
        'إعداد خطة طوارئ',
      ],
      preventable: true,
      monitoringMetrics: [
        'Capacity utilization %',
        'Recruitment pipeline',
        'Demand forecast',
        'Overtime hours',
      ],
      monitoringMetricsAr: [
        'نسبة استغلال الطاقة',
        'خط التوظيف',
        'توقعات الطلب',
        'ساعات العمل الإضافية',
      ],
    };
  }
  
  return null;
}

/**
 * Detect data quality deterioration
 */
function detectQualityDeteriorationRisk(kpis: KPIEngineOutput): Risk | null {
  const qualityScore = kpis.dataQuality?.overallQualityScore?.value.current || 100;
  
  if (qualityScore < 80) {
    const severity: RiskSeverity = qualityScore < 60 ? 'critical' : qualityScore < 70 ? 'high' : 'medium';
    const likelihood = 100 - qualityScore;
    const impact = 70; // Affects decision-making
    
    return {
      type: 'quality_deterioration',
      typeAr: RISK_TYPE_LABELS_AR.quality_deterioration,
      title: 'Data Quality Issues',
      titleAr: 'مشاكل جودة البيانات',
      description: `Data quality score is ${qualityScore.toFixed(0)}%. Decisions may be based on incorrect data.`,
      descriptionAr: `درجة جودة البيانات ${qualityScore.toFixed(0)}%. القرارات قد تكون مبنية على بيانات خاطئة.`,
      severity,
      likelihood,
      impact,
      riskScore: (likelihood * impact) / 100,
      timeframe: 'immediate',
      daysToMaterialize: 0,
      indicators: [
        `Quality score: ${qualityScore.toFixed(0)}%`,
        'Data validation failures',
        'Missing or inconsistent data',
      ],
      indicatorsAr: [
        `درجة الجودة: ${qualityScore.toFixed(0)}%`,
        'فشل التحقق من البيانات',
        'بيانات ناقصة أو غير متسقة',
      ],
      trendDirection: 'worsening',
      mitigationSteps: [
        'Review data collection process',
        'Train supervisors on data entry',
        'Implement data validation rules',
        'Fix data quality issues immediately',
        'Set up automated quality checks',
      ],
      mitigationStepsAr: [
        'مراجعة عملية جمع البيانات',
        'تدريب المشرفين على إدخال البيانات',
        'تطبيق قواعد التحقق من البيانات',
        'إصلاح مشاكل الجودة فوراً',
        'إنشاء فحوصات جودة تلقائية',
      ],
      preventable: true,
      monitoringMetrics: [
        'Data quality score',
        'Validation failures',
        'Missing data count',
        'Duplicate records',
      ],
      monitoringMetricsAr: [
        'درجة جودة البيانات',
        'فشل التحقق',
        'عدد البيانات الناقصة',
        'السجلات المكررة',
      ],
    };
  }
  
  return null;
}

/**
 * Detect attendance crisis
 */
function detectAttendanceCrisisRisk(kpis: KPIEngineOutput): Risk | null {
  const attendancePercent = kpis.attendance.attendancePercent.value.current;
  
  if (attendancePercent < 70) {
    const severity: RiskSeverity = attendancePercent < 50 ? 'critical' : attendancePercent < 60 ? 'high' : 'medium';
    const likelihood = 100 - attendancePercent;
    const impact = 90; // Very high impact
    
    return {
      type: 'attendance_crisis',
      typeAr: RISK_TYPE_LABELS_AR.attendance_crisis,
      title: 'Attendance Crisis',
      titleAr: 'أزمة حضور',
      description: `Only ${attendancePercent.toFixed(1)}% attendance. Operations severely impacted.`,
      descriptionAr: `فقط ${attendancePercent.toFixed(1)}% حضور. العمليات متأثرة بشدة.`,
      severity,
      likelihood,
      impact,
      riskScore: (likelihood * impact) / 100,
      timeframe: 'immediate',
      daysToMaterialize: 0,
      indicators: [
        `${attendancePercent.toFixed(1)}% attendance`,
        'High absence rate',
        'Operations understaffed',
      ],
      indicatorsAr: [
        `${attendancePercent.toFixed(1)}% حضور`,
        'معدل غياب مرتفع',
        'نقص في الطاقم التشغيلي',
      ],
      trendDirection: 'worsening',
      mitigationSteps: [
        'Urgent investigation required',
        'Contact absent riders',
        'Implement attendance penalties',
        'Provide attendance incentives',
        'Activate backup riders',
      ],
      mitigationStepsAr: [
        'تحقيق عاجل مطلوب',
        'التواصل مع المناديب الغائبين',
        'تطبيق عقوبات الغياب',
        'تقديم حوافز الحضور',
        'تفعيل المناديب الاحتياطيين',
      ],
      preventable: true,
      monitoringMetrics: [
        'Daily attendance %',
        'Absence reasons',
        'Attendance trend',
        'Rider availability',
      ],
      monitoringMetricsAr: [
        'نسبة الحضور اليومية',
        'أسباب الغياب',
        'اتجاه الحضور',
        'توفر المناديب',
      ],
    };
  }
  
  return null;
}

/**
 * Detect efficiency drop risk
 */
function detectEfficiencyDropRisk(kpis: KPIEngineOutput): Risk | null {
  const ordersPerHour = kpis.orders.ordersPerHour.value.current;
  const ordersChange = kpis.orders.ordersPerHour.value.growthPercent || 0;
  
  if (ordersPerHour < 2.0 && ordersChange < -10) {
    const severity: RiskSeverity = ordersPerHour < 1.5 ? 'critical' : 'high';
    const likelihood = Math.min(100, Math.abs(ordersChange) * 4);
    const impact = 75;
    
    return {
      type: 'efficiency_drop',
      typeAr: RISK_TYPE_LABELS_AR.efficiency_drop,
      title: 'Efficiency Declining',
      titleAr: 'انخفاض الكفاءة',
      description: `Orders per hour dropped to ${ordersPerHour.toFixed(2)} (${ordersChange.toFixed(1)}% decline). Productivity at risk.`,
      descriptionAr: `الأوردرات لكل ساعة انخفضت إلى ${ordersPerHour.toFixed(2)} (انخفاض ${Math.abs(ordersChange).toFixed(1)}%). الإنتاجية في خطر.`,
      severity,
      likelihood,
      impact,
      riskScore: (likelihood * impact) / 100,
      timeframe: 'short',
      daysToMaterialize: 3,
      indicators: [
        `Orders/hour: ${ordersPerHour.toFixed(2)}`,
        `${Math.abs(ordersChange).toFixed(1)}% decline`,
        'Productivity dropping',
      ],
      indicatorsAr: [
        `أوردر/ساعة: ${ordersPerHour.toFixed(2)}`,
        `انخفاض ${Math.abs(ordersChange).toFixed(1)}%`,
        'الإنتاجية تتراجع',
      ],
      trendDirection: 'worsening',
      mitigationSteps: [
        'Analyze delivery routes',
        'Provide navigation training',
        'Check for system issues',
        'Improve rider support',
        'Review order allocation logic',
      ],
      mitigationStepsAr: [
        'تحليل مسارات التوصيل',
        'توفير تدريب الملاحة',
        'التحقق من مشاكل النظام',
        'تحسين دعم المناديب',
        'مراجعة منطق توزيع الأوردرات',
      ],
      preventable: true,
      monitoringMetrics: [
        'Orders per hour',
        'Average delivery time',
        'Failed deliveries',
        'Rider feedback',
      ],
      monitoringMetricsAr: [
        'أوردرات لكل ساعة',
        'متوسط وقت التوصيل',
        'التوصيلات الفاشلة',
        'ملاحظات المناديب',
      ],
    };
  }
  
  return null;
}

/**
 * Detect target miss risk
 */
function detectTargetMissRisk(kpis: KPIEngineOutput): Risk | null {
  const hoursAchievement = kpis.hours.hoursAchievement.value.current;
  
  if (hoursAchievement < 85) {
    const severity: RiskSeverity = hoursAchievement < 70 ? 'critical' : hoursAchievement < 80 ? 'high' : 'medium';
    const gap = 100 - hoursAchievement;
    const likelihood = Math.min(100, gap * 2);
    const impact = gap * 10;
    
    return {
      type: 'target_miss',
      typeAr: RISK_TYPE_LABELS_AR.target_miss,
      title: 'Target Miss Risk',
      titleAr: 'خطر عدم تحقيق الهدف',
      description: `Only ${hoursAchievement.toFixed(1)}% of target achieved. Risk of missing monthly goals.`,
      descriptionAr: `فقط ${hoursAchievement.toFixed(1)}% من الهدف محقق. خطر عدم تحقيق الأهداف الشهرية.`,
      severity,
      likelihood,
      impact,
      riskScore: (likelihood * impact) / 100,
      timeframe: 'short',
      daysToMaterialize: 7,
      indicators: [
        `${hoursAchievement.toFixed(1)}% of target`,
        `${gap.toFixed(1)}% gap to target`,
        'Below target threshold',
      ],
      indicatorsAr: [
        `${hoursAchievement.toFixed(1)}% من الهدف`,
        `فجوة ${gap.toFixed(1)}% من الهدف`,
        'أقل من عتبة الهدف',
      ],
      trendDirection: 'worsening',
      mitigationSteps: [
        'Increase working hours urgently',
        'Activate more riders',
        'Reduce break and late times',
        'Focus on high performers',
        'Daily monitoring and intervention',
      ],
      mitigationStepsAr: [
        'زيادة ساعات العمل بشكل عاجل',
        'تفعيل المزيد من المناديب',
        'تقليل أوقات الاستراحة والتأخير',
        'التركيز على المتميزين',
        'مراقبة يومية وتدخل',
      ],
      preventable: true,
      monitoringMetrics: [
        'Hours achievement %',
        'Daily hours vs target',
        'Gap to target',
        'Working riders',
      ],
      monitoringMetricsAr: [
        'نسبة تحقيق الساعات',
        'الساعات اليومية مقابل الهدف',
        'الفجوة من الهدف',
        'المناديب العاملون',
      ],
    };
  }
  
  return null;
}

/**
 * Generate risk summary
 */
export function generateRiskSummary(analysis: RiskAnalysis): {
  summaryEn: string;
  summaryAr: string;
} {
  if (analysis.totalRisks === 0) {
    return {
      summaryEn: 'No significant risks detected. Operations stable.',
      summaryAr: 'لا توجد مخاطر كبيرة. العمليات مستقرة.',
    };
  }
  
  const riskLevel = analysis.overallRiskLevel;
  const topRisk = analysis.risks[0];
  
  let statusEn = '';
  let statusAr = '';
  
  if (riskLevel === 'critical') {
    statusEn = '⚠️ CRITICAL RISK';
    statusAr = '⚠️ خطر حرج';
  } else if (riskLevel === 'high') {
    statusEn = '⚠️ HIGH RISK';
    statusAr = '⚠️ خطر عالي';
  } else if (riskLevel === 'medium') {
    statusEn = '⚠️ MODERATE RISK';
    statusAr = '⚠️ خطر متوسط';
  } else {
    statusEn = '✅ LOW RISK';
    statusAr = '✅ خطر منخفض';
  }
  
  return {
    summaryEn: `${statusEn} - ${analysis.totalRisks} risks detected (${analysis.criticalRisks} critical). Top threat: ${topRisk.title}. ${analysis.immediateThreats.length} require immediate action.`,
    summaryAr: `${statusAr} - تم اكتشاف ${analysis.totalRisks} خطر (${analysis.criticalRisks} حرج). أكبر تهديد: ${topRisk.titleAr}. ${analysis.immediateThreats.length} يتطلب إجراء فوري.`,
  };
}
