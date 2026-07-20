import { hiringNeededForGap } from './hiringSimulation';
import type { DigitalTwinState, OptimizationHint, ScenarioLevers } from './types';

export function buildOptimizationHints(
  baseline: DigitalTwinState,
  projected: DigitalTwinState,
  levers: ScenarioLevers
): OptimizationHint[] {
  const hints: OptimizationHint[] = [];
  const gap = Math.max(0, projected.fleet.targetHours - projected.fleet.actualHours);
  const hireNeed = hiringNeededForGap(gap, projected.fleet.avgHours || 5);

  if (gap > 50 && (levers.hireRiders ?? 0) === 0) {
    hints.push({
      category: 'hiring',
      actionAr: `عيّن حوالي ${hireNeed} طيار لسد فجوة ${gap} ساعة/يوم`,
      expectedGainAr: `~${gap} ساعة/يوم`,
      priority: gap > 200 ? 'critical' : 'high',
    });
  }

  if (baseline.fleet.noShowRiders > 10 && (levers.absenteeismReductionPercent ?? 0) < 10) {
    hints.push({
      category: 'retention',
      actionAr: 'خفّض الغياب بنسبة 15–20% قبل التعيين الكبير',
      expectedGainAr: 'استرداد ساعات بدون تكلفة تعيين',
      priority: 'high',
    });
  }

  if (baseline.recoveryCeilings && baseline.recoveryCeilings.maxRecoveryByBreak > 20) {
    hints.push({
      category: 'scheduling',
      actionAr: 'قلّل الاستراحات الزائدة وفق سقف الاسترداد الحالي',
      expectedGainAr: `حتى ${baseline.recoveryCeilings.maxRecoveryByBreak} ساعة/يوم`,
      priority: 'medium',
    });
  }

  const worst = [...baseline.supervisors].sort((a, b) => a.achievement - b.achievement)[0];
  const best = [...baseline.supervisors].sort((a, b) => b.achievement - a.achievement)[0];
  if (worst && best && best.achievement - worst.achievement > 15) {
    hints.push({
      category: 'supervisor',
      actionAr: `راجع أداء ${worst.name} أو أعد توزيع الطيارين نحو ${best.name}`,
      expectedGainAr: 'تحسين إنجاز الفرق الضعيفة',
      priority: 'medium',
    });
  }

  if ((levers.hireRiders ?? 0) > 30) {
    hints.push({
      category: 'recruitment',
      actionAr: 'قسّم التعيين على موجات (20 ثم 20) لتقليل مخاطر الاستيعاب',
      expectedGainAr: 'خفض مخاطر التعيين وتحسين جودة الانضمام',
      priority: 'medium',
    });
  }

  if (hints.length === 0) {
    hints.push({
      category: 'scheduling',
      actionAr: 'حافظ على المستوى الحالي وراقب الإنجاز أسبوعياً',
      expectedGainAr: 'استقرار تشغيلي',
      priority: 'low',
    });
  }

  return hints.slice(0, 6);
}
