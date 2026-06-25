/**
 * Layer 1: Executive Health Summary
 * Computes a composite operational health score and auto-generates
 * a one-line Arabic situation summary.
 */
import type {
  ControlTowerBuildContext,
  OperationalHealthSummary,
  SupervisorIntelligence,
  SupervisorTrendStatus,
} from '@/lib/strategicOps/controlTower/types';
import type { SupervisorOpsRow } from '@/lib/strategicOps/buildReport';
import { supervisorLostTargetDaily } from '@/lib/strategicOps/controlTower/supervisorMetrics';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Composite health score weights (must sum to 100):
 * - Achievement: 40
 * - No-show rate (inverted): 25
 * - Utilization: 20
 * - Supervisor performance: 15
 */
const WEIGHTS = { achievement: 40, noShow: 25, utilization: 20, supervisor: 15 };

function achievementScore(achievementPct: number): number {
  return clamp((achievementPct / 100) * 100, 0, 100);
}
function noShowScore(noShowRate: number): number {
  return clamp((1 - noShowRate) * 100, 0, 100);
}
function utilizationScore(utilizationPct: number): number {
  return clamp((utilizationPct / 100) * 100, 0, 100);
}
function supervisorScore(supervisorRows: SupervisorOpsRow[]): number {
  if (supervisorRows.length === 0) return 50;
  const avg =
    supervisorRows.reduce((s, r) => s + r.achievementPercent, 0) / supervisorRows.length;
  return clamp((avg / 100) * 100, 0, 100);
}

export function buildExecutiveHealthSummary(
  ctx: ControlTowerBuildContext,
  supervisorRows: SupervisorOpsRow[]
): OperationalHealthSummary {
  const { fleetTalabat, operationalPeriodDays } = ctx;
  const days = Math.max(1, operationalPeriodDays);

  const achievPct = fleetTalabat.achievementPercent;
  const noShowRate =
    fleetTalabat.headcount > 0 ? fleetTalabat.noShowRiders / fleetTalabat.headcount : 0;
  const utilizPct = fleetTalabat.utilizationPercent;

  const aScore = achievementScore(achievPct);
  const nScore = noShowScore(noShowRate);
  const uScore = utilizationScore(utilizPct);
  const sScore = supervisorScore(supervisorRows);

  const healthScore = round2(
    (aScore * WEIGHTS.achievement +
      nScore * WEIGHTS.noShow +
      uScore * WEIGHTS.utilization +
      sScore * WEIGHTS.supervisor) /
      100
  );

  const statusLabel: OperationalHealthSummary['statusLabel'] =
    healthScore >= 75 ? 'Healthy' : healthScore >= 50 ? 'Warning' : 'Critical';
  const statusLabelAr: OperationalHealthSummary['statusLabelAr'] =
    healthScore >= 75 ? '✅ وضع جيد' : healthScore >= 50 ? '⚠️ تحذير' : '🔴 حرج';
  const riskLevel: OperationalHealthSummary['riskLevel'] =
    healthScore >= 75 ? 'low' : healthScore >= 60 ? 'medium' : healthScore >= 40 ? 'high' : 'severe';

  const hoursGap = round2(Math.max(0, fleetTalabat.targetHours - fleetTalabat.actualHours));
  const ordersGap = 0;

  const fleetHealthScore = round2((aScore * 0.6 + uScore * 0.4));
  const supervisorHealthScore = round2(sScore);

  // Auto-generate situation summary
  const worstSup = supervisorRows
    .sort((a, b) => supervisorLostTargetDaily(b) - supervisorLostTargetDaily(a))
    .find(() => true);

  const noShowCount = Math.round(fleetTalabat.noShowRiders);
  let situationSummaryAr = '';

  if (statusLabel === 'Healthy') {
    situationSummaryAr = `الوضع التشغيلي جيد. تحقيق ${round2(achievPct)}% مع ${fleetTalabat.activeRiders} طيار نشط. لا توجد تدخلات عاجلة.`;
  } else if (statusLabel === 'Warning') {
    situationSummaryAr =
      `الوضع التشغيلي في تحذير. تحقيق ${round2(achievPct)}%، ${noShowCount} طيار غياب.` +
      (worstSup
        ? ` فريق ${worstSup.name} يفقد ${round2(supervisorLostTargetDaily(worstSup))} ساعة/يوم.`
        : '');
  } else {
    situationSummaryAr =
      `وضع حرج: تحقيق ${round2(achievPct)}%، ${noShowCount} طيار غياب، فجوة ${hoursGap} ساعة.` +
      (worstSup
        ? ` تدخل عاجل مطلوب مع المشرف ${worstSup.name}.`
        : ' مطلوب تدخل فوري على مستوى الأسطول.');
  }

  return {
    healthScore,
    statusLabel,
    statusLabelAr,
    riskLevel,
    achievementPercent: round2(achievPct),
    hoursGap,
    hoursGapDirection: 'below',
    ordersGap,
    supervisorHealthScore,
    fleetHealthScore,
    situationSummaryAr,
  };
}

// ─── Layer 6 + 7: Supervisor Intelligence & Accountability ──────────────────

function supervisorTrend(s: SupervisorOpsRow): SupervisorTrendStatus {
  const ach = s.achievementPercent;
  if (ach >= 85) return 'improving';
  if (ach >= 70) return 'stable';
  if (ach >= 50) return 'declining';
  return 'critical';
}

function supervisorRootCause(s: SupervisorOpsRow): string {
  const lost = supervisorLostTargetDaily(s);
  const noShowRate = s.headcount > 0 ? s.noShowRiders / s.headcount : 0;
  const inactiveRate = s.headcount > 0 ? s.inactiveRiders / s.headcount : 0;
  const util = s.utilizationPercent;

  if (noShowRate > 0.35)
    return `المشكلة الرئيسية: غياب مرتفع (${Math.round(noShowRate * 100)}% من الفريق). يُقدَّر الأثر: ${round2(lost)} ساعة/يوم`;
  if (inactiveRate > 0.4)
    return `المشكلة الرئيسية: ${s.inactiveRiders} طيار غير نشط (${Math.round(inactiveRate * 100)}%). طاقة كامنة غير مستغلة.`;
  if (util < 50)
    return `المشكلة الرئيسية: استثمار منخفض ${round2(util)}% — الطيارون النشطون يعملون بأقل من المتوقع.`;
  if (s.resignations >= 3)
    return `مشكلة احتفاظ: ${s.resignations} إقالة معتمدة — خطر تآكل الفريق.`;
  return `فجوة تشغيلية ${round2(lost)} ساعة/يوم — تحقيق ${s.achievementPercent}%`;
}

export function buildSupervisorIntelligence(
  supervisorRows: SupervisorOpsRow[]
): SupervisorIntelligence[] {
  return supervisorRows
    .map((s, idx) => {
      const lostTarget = supervisorLostTargetDaily(s);
      const retentionRate = s.headcount > 0
        ? round2(((s.headcount - s.resignations) / s.headcount) * 100)
        : 100;

      return {
        code: s.code,
        name: s.name,
        region: s.region || '',
        headcount: s.headcount,
        activeRiders: s.activeRiders,
        noShowCount: Math.round(s.noShowRiders),
        actualHours: round2(s.dailyHours),
        targetHours: round2(s.dailyHours / Math.max(0.01, s.achievementPercent / 100)),
        achievementPercent: round2(s.achievementPercent),
        utilizationPercent: round2(s.utilizationPercent),
        lostTargetHours: round2(lostTarget),
        retentionRate,
        newHires: 0,
        reactivations: 0,
        trendStatus: supervisorTrend(s),
        rootCauseAr: supervisorRootCause(s),
        priorityRank: idx + 1,
      };
    })
    .sort((a, b) => b.lostTargetHours - a.lostTargetHours);
}
