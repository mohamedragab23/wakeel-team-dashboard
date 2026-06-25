/**
 * Layer 9: Recruitment Intelligence
 * Answers: Do we need new hires or can the gap be solved operationally?
 * Shows a waterfall of recoverable hours before recommending hiring.
 */
import type {
  ControlTowerBuildContext,
  RecruitmentAnalysis,
} from '@/lib/strategicOps/controlTower/types';
import type { SupervisorOpsRow } from '@/lib/strategicOps/buildReport';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Standard daily hours per active rider (configurable via ctx). */
const TARGET_HOURS_PER_RIDER = 8;

export function buildRecruitmentAnalysis(
  ctx: ControlTowerBuildContext,
  supervisorRows: SupervisorOpsRow[]
): RecruitmentAnalysis {
  const { fleetTalabat, inactiveRiders, avgHoursPerActiveRider } = ctx;

  const avgH = avgHoursPerActiveRider > 0 ? avgHoursPerActiveRider : TARGET_HOURS_PER_RIDER;
  const hoursGap = round2(Math.max(0, fleetTalabat.targetHours - fleetTalabat.actualHours));

  if (hoursGap <= 0) {
    return {
      currentHoursGap: 0,
      recoverableByReactivation: 0,
      recoverableByNoShowReduction: 0,
      recoverableByHoursPush: 0,
      recoverableBySupervision: 0,
      remainingGapAfterLevers: 0,
      hiringRequirementRiders: 0,
      hiringRequirementHours: 0,
      recommendHiring: false,
      summaryAr: 'الأسطول يحقق الهدف — لا حاجة لتعيين حالياً.',
    };
  }

  // Lever 1: Reactivate inactive riders (conservative: 40% can be reactivated)
  const reactivationPotential = round2(inactiveRiders * avgH * 0.4);

  // Lever 2: Reduce no-show by 50%
  const noShowReductionPotential = round2(fleetTalabat.noShowRiders * avgH * 0.5);

  // Lever 3: Push working hours for active riders (10% improvement in utilization)
  const hoursPushPotential = round2(
    fleetTalabat.activeRiders * avgH * 0.1
  );

  // Lever 4: Better supervision (underperforming supervisors improve 20%)
  const poorSupCount = supervisorRows.filter((s) => s.achievementPercent < 70).length;
  const supervisionPotential = round2(poorSupCount * avgH * 0.2);

  const totalRecoverable = round2(
    reactivationPotential +
      noShowReductionPotential +
      hoursPushPotential +
      supervisionPotential
  );

  const remainingGap = round2(Math.max(0, hoursGap - totalRecoverable));
  const hiringRequirementHours = remainingGap;
  const hiringRequirementRiders = Math.ceil(remainingGap / avgH);
  const recommendHiring = remainingGap > avgH * 5;

  let summaryAr = '';
  if (!recommendHiring) {
    summaryAr =
      `الفجوة ${round2(hoursGap)} ساعة يمكن تغطيتها عملياً: ` +
      `تفعيل (${reactivationPotential} س) + تقليل الغياب (${noShowReductionPotential} س) + ` +
      `رفع الساعات (${hoursPushPotential} س) + إشراف (${supervisionPotential} س). ` +
      `لا يُنصح بالتعيين حتى يتم استنفاد هذه الرافعات.`;
  } else {
    summaryAr =
      `الفجوة ${round2(hoursGap)} ساعة — بعد كل الرافعات التشغيلية يبقى ${remainingGap} ساعة. ` +
      `مطلوب تعيين ${hiringRequirementRiders} طيار جديد لتغطية الفجوة المتبقية.`;
  }

  return {
    currentHoursGap: hoursGap,
    recoverableByReactivation: reactivationPotential,
    recoverableByNoShowReduction: noShowReductionPotential,
    recoverableByHoursPush: hoursPushPotential,
    recoverableBySupervision: supervisionPotential,
    remainingGapAfterLevers: remainingGap,
    hiringRequirementRiders,
    hiringRequirementHours,
    recommendHiring,
    summaryAr,
  };
}
