/**
 * SRS-006 §8 — Executive Timeline (chronological operational events).
 */

export type TimelineEventType =
  | 'upload'
  | 'hire'
  | 'termination'
  | 'reactivation'
  | 'alert'
  | 'kpi_change'
  | 'forecast_change'
  | 'target_change'
  | 'supervisor_change';

export type TimelineEvent = {
  at: string;
  type: TimelineEventType;
  titleAr: string;
  detailAr: string;
  severity: 'info' | 'warning' | 'critical';
};

export function buildExecutiveTimeline(input: {
  presentDates: string[];
  missingDates: string[];
  newHires: number;
  resignations: number;
  criticalAlerts: string[];
  achievement: number;
  previousAchievement?: number;
  targetHours: number;
  previousTargetHours?: number;
  forecastTrend?: string;
  generatedAt: string;
}): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  for (const d of input.presentDates.slice(-14)) {
    events.push({
      at: `${d}T12:00:00.000Z`,
      type: 'upload',
      titleAr: 'رفع بيانات يومية',
      detailAr: `تم رصد بيانات تشغيل ليوم ${d}`,
      severity: 'info',
    });
  }

  for (const d of input.missingDates.slice(0, 10)) {
    events.push({
      at: `${d}T23:59:00.000Z`,
      type: 'alert',
      titleAr: 'يوم ناقص رفع',
      detailAr: `لا توجد بيانات مرفوعة ليوم ${d}`,
      severity: 'warning',
    });
  }

  if (input.newHires > 0) {
    events.push({
      at: input.generatedAt,
      type: 'hire',
      titleAr: 'تعيينات في الفترة',
      detailAr: `${input.newHires} طيار جديد ضمن نطاق التحليل`,
      severity: 'info',
    });
  }

  if (input.resignations > 0) {
    events.push({
      at: input.generatedAt,
      type: 'termination',
      titleAr: 'إنهاءات / استقالات',
      detailAr: `${input.resignations} حالة إنهاء معتمدة في الفترة`,
      severity: 'warning',
    });
  }

  if (
    input.previousAchievement != null &&
    Math.abs(input.achievement - input.previousAchievement) >= 3
  ) {
    const up = input.achievement > input.previousAchievement;
    events.push({
      at: input.generatedAt,
      type: 'kpi_change',
      titleAr: up ? 'تحسن الإنجاز' : 'تراجع الإنجاز',
      detailAr: `الإنجاز ${input.previousAchievement}% → ${input.achievement}%`,
      severity: up ? 'info' : 'critical',
    });
  }

  if (
    input.previousTargetHours != null &&
    input.previousTargetHours !== input.targetHours
  ) {
    events.push({
      at: input.generatedAt,
      type: 'target_change',
      titleAr: 'تغيير الهدف',
      detailAr: `الهدف ${input.previousTargetHours} → ${input.targetHours} ساعة/يوم`,
      severity: 'warning',
    });
  }

  if (input.forecastTrend && input.forecastTrend !== 'stable') {
    events.push({
      at: input.generatedAt,
      type: 'forecast_change',
      titleAr: 'تغير اتجاه التوقعات',
      detailAr: `اتجاه التوقع: ${input.forecastTrend}`,
      severity: input.forecastTrend.includes('decline') ? 'critical' : 'info',
    });
  }

  for (const a of input.criticalAlerts.slice(0, 8)) {
    events.push({
      at: input.generatedAt,
      type: 'alert',
      titleAr: 'تنبيه حرج',
      detailAr: a,
      severity: 'critical',
    });
  }

  return events.sort((a, b) => (a.at < b.at ? 1 : -1));
}
