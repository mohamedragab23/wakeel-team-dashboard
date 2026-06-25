/**
 * Layer 9: Recruitment Intelligence
 * Answers: Do we need new hires or can the gap be solved operationally?
 *
 * IMPORTANT: All values are DAILY hours (not period totals).
 * Each recovery lever is CAPPED so the cumulative sum never exceeds the total gap.
 * This prevents the impossible "2663 hours recovered" scenario.
 */
import type {
  ControlTowerBuildContext,
  RecoveryLever,
  RecruitmentAnalysis,
} from '@/lib/strategicOps/controlTower/types';
import { resolveRiderExpected } from '@/lib/strategicOps/controlTower/riderHistory';
import type { SupervisorOpsRow } from '@/lib/strategicOps/buildReport';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function pctOfGap(amount: number, gap: number): number {
  if (gap <= 0) return 0;
  return Math.round((amount / gap) * 100);
}

const FALLBACK_HOURS_PER_RIDER = 8;

/**
 * Maximum recovery fraction of totalGap per lever.
 * These caps prevent any single lever from over-consuming the gap and ensure
 * the model can produce a non-zero remaining gap even when potentials are large.
 *
 * Calibration values (experiment — revisit with actual intervention response data):
 *   Reactivation: max 20% of gap (some inactive riders may be unreachable)
 *   No-show: max 30% of gap (50% response rate on ~60% of no-shows = ~30%)
 *   Hours push: max 25% of gap (active riders can only improve so much per shift)
 *   Supervision: max 15% of gap (management improvement is slow)
 *   Total ceiling: 90% → at least 10% of gap requires hiring if fully operationally managed
 */
const MAX_REACTIVATION_FRACTION = 0.20;
const MAX_NOSHOW_FRACTION = 0.30;
const MAX_HOURSPUSH_FRACTION = 0.25;
const MAX_SUPERVISION_FRACTION = 0.15;

export function buildRecruitmentAnalysis(
  ctx: ControlTowerBuildContext,
  supervisorRows: SupervisorOpsRow[]
): RecruitmentAnalysis {
  const { fleetTalabat, inactiveRiders, avgHoursPerActiveRider, riders, riderHistoricalBaselines } = ctx;
  const baselines = riderHistoricalBaselines ?? new Map();

  const avgH = avgHoursPerActiveRider > 0 ? avgHoursPerActiveRider : FALLBACK_HOURS_PER_RIDER;
  const totalGap = round2(Math.max(0, fleetTalabat.targetHours - fleetTalabat.actualHours));

  if (totalGap <= 0) {
    return {
      currentHoursGap: 0,
      levers: [],
      recoverableByReactivation: 0,
      recoverableByNoShowReduction: 0,
      recoverableByHoursPush: 0,
      recoverableBySupervision: 0,
      remainingGapAfterLevers: 0,
      hiringRequirementRiders: 0,
      hiringRequirementHours: 0,
      recommendHiring: false,
      summaryAr: 'الأسطول يحقق الهدف — لا حاجة لتعيين حالياً.',
      validationPassed: true,
    };
  }

  let remainingGap = totalGap;
  const levers: RecoveryLever[] = [];

  // ── Lever 1: Reactivate inactive riders ────────────────────────────────────
  // Use riders' own historical average (not fleet avg) where available.
  // Apply 40% realism factor AND cap at MAX_REACTIVATION_FRACTION of totalGap.
  let reactivationTotal = 0;
  for (const r of riders) {
    if (r.totalHours === 0) {
      const { hours: expectedH } = resolveRiderExpected(r.code, baselines, avgH, 0);
      reactivationTotal += expectedH;
    }
  }
  const reactivationMax = round2(totalGap * MAX_REACTIVATION_FRACTION);
  const reactivation = round2(Math.min(remainingGap, Math.min(reactivationTotal * 0.4, reactivationMax)));
  remainingGap = round2(Math.max(0, remainingGap - reactivation));
  levers.push({
    label: 'Reactivate inactive riders',
    labelAr: 'تفعيل المناديب الغير نشطين',
    recoveryHours: reactivation,
    pctOfGap: pctOfGap(reactivation, totalGap),
    realismNote: `40% استجابة — حد أقصى ${Math.round(MAX_REACTIVATION_FRACTION * 100)}% من الفجوة`,
  });

  // ── Lever 2: Reduce no-show by 50% ────────────────────────────────────────
  // 50% realism: not all no-shows will respond to daily intervention.
  // Cap at MAX_NOSHOW_FRACTION of totalGap.
  const noShowMax = round2(totalGap * MAX_NOSHOW_FRACTION);
  const noShowPotential = round2(fleetTalabat.noShowRiders * avgH * 0.5);
  const noShowReduction = round2(Math.min(remainingGap, Math.min(noShowPotential, noShowMax)));
  remainingGap = round2(Math.max(0, remainingGap - noShowReduction));
  levers.push({
    label: 'Reduce no-show (50% response)',
    labelAr: 'تقليل الغياب (50% استجابة)',
    recoveryHours: noShowReduction,
    pctOfGap: pctOfGap(noShowReduction, totalGap),
    realismNote: `50% استجابة — حد أقصى ${Math.round(MAX_NOSHOW_FRACTION * 100)}% من الفجوة`,
  });

  // ── Lever 3: Push hours for active riders below their historical average ───
  // For riders who worked but below their own baseline: sum (expectedH - actualH).
  // Apply 60% realism factor AND cap at MAX_HOURSPUSH_FRACTION of totalGap.
  const days = Math.max(1, ctx.operationalPeriodDays);
  let lowHoursGap = 0;
  for (const r of riders) {
    if (r.totalHours > 0) {
      const { hours: expectedH } = resolveRiderExpected(r.code, baselines, avgH, 0);
      const actualHDaily = r.totalHours / days;
      if (actualHDaily < expectedH) {
        lowHoursGap += expectedH - actualHDaily;
      }
    }
  }
  const hoursPushMax = round2(totalGap * MAX_HOURSPUSH_FRACTION);
  const hoursPushPotential = round2(lowHoursGap * 0.6);
  const hoursPush = round2(Math.min(remainingGap, Math.min(hoursPushPotential, hoursPushMax)));
  remainingGap = round2(Math.max(0, remainingGap - hoursPush));
  levers.push({
    label: 'Push active-rider hours to historical avg',
    labelAr: 'رفع ساعات النشطين للمتوسط التاريخي',
    recoveryHours: hoursPush,
    pctOfGap: pctOfGap(hoursPush, totalGap),
    realismNote: `60% تحسين واقعي — حد أقصى ${Math.round(MAX_HOURSPUSH_FRACTION * 100)}% من الفجوة`,
  });

  // ── Lever 4: Supervision improvement (bottom-quartile teams +30%) ──────────
  // Cap at MAX_SUPERVISION_FRACTION of totalGap.
  const supervisionMax = round2(totalGap * MAX_SUPERVISION_FRACTION);
  const bottomSups = supervisorRows
    .filter((s) => s.achievementPercent < 70)
    .slice(0, Math.ceil(supervisorRows.length * 0.25));
  const supervisionPotential = round2(
    bottomSups.reduce((sum, s) => sum + Math.max(0, (s.dailyHours / (s.achievementPercent / 100) - s.dailyHours) * 0.3), 0)
  );
  const supervision = round2(Math.min(remainingGap, Math.min(supervisionPotential, supervisionMax)));
  remainingGap = round2(Math.max(0, remainingGap - supervision));
  levers.push({
    label: 'Supervisor improvement (bottom quartile +30%)',
    labelAr: 'تحسين إشراف الفرق ضعيفة الأداء',
    recoveryHours: supervision,
    pctOfGap: pctOfGap(supervision, totalGap),
    realismNote: 'بناءً على 30% تحسين محتمل',
  });

  // ── Validation ─────────────────────────────────────────────────────────────
  const totalRecovered = round2(reactivation + noShowReduction + hoursPush + supervision);
  const validationPassed = totalRecovered <= totalGap + 0.01;

  if (!validationPassed) {
    console.error(
      `[RecruitmentAnalysis] VALIDATION FAILED: totalRecovered=${totalRecovered} > totalGap=${totalGap}. ` +
      `Levers: reactivation=${reactivation}, noShow=${noShowReduction}, hours=${hoursPush}, supervision=${supervision}`
    );
  }

  const hiringRequirementHours = remainingGap;
  const hiringRequirementRiders = Math.ceil(remainingGap / avgH);
  // Recommend hiring if any gap remains after all operational levers.
  // With fractional caps, this will typically be true (operational max ≈ 90% of gap).
  const recommendHiring = remainingGap > 0;

  const assumptionNote =
    'الأرقام مبنية على افتراضات معدل الاستجابة: تفعيل 40% | غياب 50% | ساعات 60% | إشراف 30%.';

  let summaryAr = '';
  if (!recommendHiring) {
    summaryAr =
      `الفجوة اليومية ${totalGap} ساعة قابلة للإغلاق تشغيلياً. ` +
      `تفعيل: ${reactivation}س + غياب: ${noShowReduction}س + ساعات: ${hoursPush}س + إشراف: ${supervision}س. ` +
      `لا يوجد احتياج فوري للتعيين — الفجوة قابلة للإغلاق تشغيلياً. ` +
      assumptionNote;
  } else {
    summaryAr =
      `بعد كل الرافعات التشغيلية تبقى ${remainingGap} ساعة يومياً غير مغطاة. ` +
      `مطلوب تعيين ${hiringRequirementRiders} طيار جديد للإغلاق الكامل. ` +
      assumptionNote;
  }

  return {
    currentHoursGap: totalGap,
    levers,
    recoverableByReactivation: reactivation,
    recoverableByNoShowReduction: noShowReduction,
    recoverableByHoursPush: hoursPush,
    recoverableBySupervision: supervision,
    remainingGapAfterLevers: remainingGap,
    hiringRequirementRiders,
    hiringRequirementHours,
    recommendHiring,
    summaryAr,
    validationPassed,
  };
}
