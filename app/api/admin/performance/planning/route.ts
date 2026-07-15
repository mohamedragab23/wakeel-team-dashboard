import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { assertAdminApiAccess } from '@/lib/adminFeatureAccess';
import { extractBearerToken } from '@/lib/requestAuth';

export const dynamic = 'force-dynamic';

interface TargetCalculationInput {
  targetHoursPerDay: number;
  avgWorkHoursPerRider: number;
  currentActiveRiders?: number;
}

interface GrowthPlanInput {
  targetHoursPerDay: number;
  currentTotalHours: number;
  currentActiveRiders: number;
  avgWorkHoursPerRider: number;
  timeframeMonths: number;
}

interface PerformanceWarningInput {
  avgActiveRiders: number;
  avgWorkHours: number;
  absentRate: number;
  avgBreakHours: number;
  totalRiders: number;
  lessThan4HoursCount: number;
}

export async function POST(request: NextRequest) {
  try {
    const token = extractBearerToken(request);
    if (!token) {
      return NextResponse.json({ 
        success: false, 
        error: 'غير مصرح' 
      }, { status: 401 });
    }

    const decoded = verifyToken(token);
    if (!decoded || decoded.role !== 'admin') {
      return NextResponse.json({ 
        success: false, 
        error: 'غير مصرح' 
      }, { status: 401 });
    }

    const ps = assertAdminApiAccess(decoded, 'performance_upload');
    if (ps) return ps;

    const body = await request.json();
    const { type, data } = body;

    switch (type) {
      case 'target_calculation':
        return NextResponse.json({
          success: true,
          data: calculateTargetRequirement(data as TargetCalculationInput),
        });

      case 'growth_plan':
        return NextResponse.json({
          success: true,
          data: generateGrowthPlan(data as GrowthPlanInput),
        });

      case 'performance_warnings':
        return NextResponse.json({
          success: true,
          data: generatePerformanceWarnings(data as PerformanceWarningInput),
        });

      case 'supervisor_plans':
        return NextResponse.json({
          success: true,
          data: generateSupervisorPlans(data),
        });

      default:
        return NextResponse.json({ 
          success: false, 
          error: 'نوع الطلب غير معروف' 
        }, { status: 400 });
    }
  } catch (error: any) {
    console.error('[Planning API] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message || 'حدث خطأ' 
    }, { status: 500 });
  }
}

function calculateTargetRequirement(input: TargetCalculationInput) {
  const { targetHoursPerDay, avgWorkHoursPerRider, currentActiveRiders } = input;

  const requiredRiders = Math.ceil(targetHoursPerDay / avgWorkHoursPerRider);
  const gap = currentActiveRiders ? requiredRiders - currentActiveRiders : requiredRiders;
  const gapPercentage = currentActiveRiders ? (gap / currentActiveRiders) * 100 : 0;

  return {
    targetHoursPerDay,
    avgWorkHoursPerRider,
    requiredRiders,
    currentActiveRiders: currentActiveRiders || 0,
    gap,
    gapPercentage: Math.round(gapPercentage * 10) / 10,
    recommendations: generateTargetRecommendations(gap, avgWorkHoursPerRider),
  };
}

function generateTargetRecommendations(gap: number, avgWorkHours: number) {
  const recommendations = [];

  if (gap > 0) {
    // Need more riders
    const hiringRate = Math.ceil(gap / 30); // Spread over a month
    recommendations.push({
      priority: 'high',
      action: `تعيين ${gap} مندوب جديد`,
      timeline: '30 يوم',
      details: `معدل التعيين المطلوب: ${hiringRate} مندوب/يوم`,
    });
  }

  if (avgWorkHours < 6) {
    recommendations.push({
      priority: 'high',
      action: 'تحسين متوسط ساعات العمل',
      timeline: '2-4 أسابيع',
      details: `زيادة متوسط الساعات من ${avgWorkHours} إلى 6 ساعات سيقلل الفجوة بنسبة ${Math.round(((6 - avgWorkHours) / avgWorkHours) * 100)}%`,
    });
  }

  if (gap < 0) {
    // Have surplus
    recommendations.push({
      priority: 'low',
      action: 'لديك فائض في المناديب',
      timeline: 'مستمر',
      details: `يمكنك التوسع في مناطق جديدة أو زيادة Target بـ ${Math.abs(gap * avgWorkHours)} ساعة يومياً`,
    });
  }

  return recommendations;
}

function generateGrowthPlan(input: GrowthPlanInput) {
  const { 
    targetHoursPerDay, 
    currentTotalHours, 
    currentActiveRiders, 
    avgWorkHoursPerRider, 
    timeframeMonths 
  } = input;

  const totalGap = targetHoursPerDay - currentTotalHours;
  const monthlyGrowthTarget = totalGap / timeframeMonths;

  const phases = [];
  let cumulativeHours = currentTotalHours;
  let cumulativeRiders = currentActiveRiders;

  for (let month = 1; month <= timeframeMonths; month++) {
    const targetForMonth = currentTotalHours + (monthlyGrowthTarget * month);
    const requiredRiders = Math.ceil(targetForMonth / avgWorkHoursPerRider);
    const newRidersNeeded = requiredRiders - cumulativeRiders;
    
    // Improvement in hours per rider
    const hourImprovement = month === 1 ? 0.2 : 0.1; // 0.2 in first month, then 0.1
    const improvedAvgHours = avgWorkHoursPerRider + (hourImprovement * month);

    phases.push({
      month,
      targetHours: Math.round(targetForMonth),
      requiredRiders,
      newRidersToHire: newRidersNeeded,
      avgHoursGoal: Math.round(improvedAvgHours * 10) / 10,
      milestones: [
        `توظيف ${newRidersNeeded} مندوب جديد`,
        `رفع متوسط الساعات إلى ${Math.round(improvedAvgHours * 10) / 10}`,
        `تحقيق ${Math.round(targetForMonth)} ساعة يومياً`,
      ],
    });

    cumulativeRiders = requiredRiders;
    cumulativeHours = targetForMonth;
  }

  return {
    overview: {
      currentHours: currentTotalHours,
      targetHours: targetHoursPerDay,
      totalGap: Math.round(totalGap),
      timeframeMonths,
      monthlyGrowth: Math.round(monthlyGrowthTarget),
    },
    phases,
    keyActions: [
      '📈 زيادة معدل التعيين تدريجياً',
      '⏰ تحسين متوسط ساعات العمل شهرياً',
      '📊 مراقبة الأداء أسبوعياً وتعديل الخطة',
      '🎯 التركيز على تقليل الغياب والبريك',
    ],
  };
}

function generatePerformanceWarnings(input: PerformanceWarningInput) {
  const {
    avgActiveRiders,
    avgWorkHours,
    absentRate,
    avgBreakHours,
    totalRiders,
    lessThan4HoursCount,
  } = input;

  const warnings = [];

  // Active rate warning
  const activeRate = totalRiders > 0 ? (avgActiveRiders / totalRiders) * 100 : 0;
  if (activeRate < 85) {
    warnings.push({
      severity: activeRate < 70 ? 'critical' : 'high',
      category: 'نسبة النشطين',
      issue: `نسبة المناديب النشطين ${Math.round(activeRate)}% فقط (المستهدف: 85%+)`,
      impact: `خسارة ${Math.round((85 - activeRate) / 100 * totalRiders * avgWorkHours)} ساعة عمل يومياً`,
      solutions: [
        'مراجعة أسباب انخفاض النشاط مع المشرفين',
        'تحسين نظام توزيع الأوردرات',
        'زيادة الحوافز للمناديب النشطين',
        'حل المشاكل الإدارية والتشغيلية',
      ],
      timeline: 'فوري - أسبوعين',
    });
  }

  // Work hours warning
  if (avgWorkHours < 5) {
    warnings.push({
      severity: 'critical',
      category: 'متوسط ساعات العمل',
      issue: `متوسط ساعات العمل ${avgWorkHours} ساعة (المستهدف: 6-8 ساعات)`,
      impact: 'انخفاض حاد في الإنتاجية والكفاءة',
      solutions: [
        'تحليل أوقات الذروة وتحسين الجدولة',
        'زيادة الطلب من خلال حملات تسويقية',
        'مراجعة كفاءة توزيع الأوردرات',
        'تدريب المشرفين على تحسين الأداء',
      ],
      timeline: '1-2 شهر',
    });
  } else if (avgWorkHours < 6) {
    warnings.push({
      severity: 'medium',
      category: 'متوسط ساعات العمل',
      issue: `متوسط ساعات العمل ${avgWorkHours} ساعة (يمكن تحسينه)`,
      impact: `زيادة محتملة بـ ${Math.round((6 - avgWorkHours) * avgActiveRiders)} ساعة يومياً`,
      solutions: [
        'تحسين كفاءة المناديب الحاليين',
        'تقليل فترات الانتظار',
        'تحسين توزيع الشفتات',
      ],
      timeline: '2-4 أسابيع',
    });
  }

  // Low performers warning
  const lowPerformersRate = totalRiders > 0 ? (lessThan4HoursCount / totalRiders) * 100 : 0;
  if (lowPerformersRate > 15) {
    warnings.push({
      severity: 'high',
      category: 'المناديب ضعيفي الأداء',
      issue: `${lessThan4HoursCount} مندوب (${Math.round(lowPerformersRate)}%) يعملون أقل من 4 ساعات`,
      impact: 'هدر في الموارد وانخفاض ROI',
      solutions: [
        'مقابلات فردية لفهم المشاكل',
        'وضع خطط تحسين فردية',
        'إعادة تقييم المناسبين للعمل',
        'نقل بعضهم لمناطق أكثر طلباً',
      ],
      timeline: 'أسبوعين',
    });
  }

  // Break hours warning
  if (avgBreakHours > 1.5) {
    warnings.push({
      severity: 'medium',
      category: 'ساعات الاستراحة',
      issue: `متوسط ساعات الاستراحة ${avgBreakHours} ساعة (مرتفع)`,
      impact: `خسارة ${Math.round(avgBreakHours * avgActiveRiders)} ساعة إنتاجية يومياً`,
      solutions: [
        'تشديد المتابعة على أوقات البريك',
        'تحسين توفر الأوردرات',
        'مراجعة سياسة الاستراحات',
      ],
      timeline: 'أسبوع',
    });
  }

  // Absent rate warning
  if (absentRate > 10) {
    warnings.push({
      severity: absentRate > 20 ? 'critical' : 'high',
      category: 'معدل الغياب',
      issue: `معدل الغياب ${Math.round(absentRate)}% (المستهدف: أقل من 10%)`,
      impact: 'عدم استقرار القوى العاملة',
      solutions: [
        'تحسين بيئة العمل ورضا المناديب',
        'حل المشاكل الإدارية',
        'مراجعة نظام الحوافز والعقوبات',
        'بناء ثقافة التزام أقوى',
      ],
      timeline: '1-3 أشهر',
    });
  }

  // Sort by severity
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  warnings.sort((a, b) => severityOrder[a.severity as keyof typeof severityOrder] - severityOrder[b.severity as keyof typeof severityOrder]);

  return {
    totalWarnings: warnings.length,
    criticalCount: warnings.filter(w => w.severity === 'critical').length,
    warnings,
    overallHealth: warnings.filter(w => w.severity === 'critical').length > 0 
      ? 'حرج - يحتاج تدخل فوري' 
      : warnings.filter(w => w.severity === 'high').length > 0 
        ? 'يحتاج تحسين'
        : 'مقبول',
  };
}

function generateSupervisorPlans(supervisorStats: any[]) {
  return supervisorStats.map(sup => {
    const plans = [];
    
    // Work hours improvement
    if (sup.avgWorkHours < 6) {
      plans.push({
        goal: 'رفع متوسط ساعات العمل',
        currentValue: sup.avgWorkHours,
        targetValue: 6.5,
        actions: [
          'تحسين جدولة المناديب',
          'متابعة أوقات البريك',
          'تحفيز المناديب على ساعات إضافية',
        ],
        timeline: '1 شهر',
      });
    }

    // Active rate improvement
    if (sup.activeRate < 85) {
      plans.push({
        goal: 'زيادة نسبة المناديب النشطين',
        currentValue: sup.activeRate,
        targetValue: 90,
        actions: [
          'حل مشاكل المناديب الغائبين',
          'تحسين توزيع الأوردرات',
          'متابعة يومية مع المناديب',
        ],
        timeline: '2-3 أسابيع',
      });
    }

    // Absent rate reduction
    if (sup.absentRate > 10) {
      plans.push({
        goal: 'تقليل معدل الغياب',
        currentValue: sup.absentRate,
        targetValue: 8,
        actions: [
          'مقابلات مع المناديب الغائبين',
          'تحسين الحوافز',
          'حل المشاكل التشغيلية',
        ],
        timeline: '1 شهر',
      });
    }

    return {
      supervisor: sup.supervisor,
      currentPerformance: {
        avgWorkHours: sup.avgWorkHours,
        activeRate: sup.activeRate,
        absentRate: sup.absentRate,
      },
      plans,
      priorityActions: plans.length > 0 ? plans[0].actions : ['الحفاظ على الأداء الحالي'],
    };
  });
}
