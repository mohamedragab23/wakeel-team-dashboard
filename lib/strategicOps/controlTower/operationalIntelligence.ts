/**
 * Layer 2: Operational Intelligence Feed
 * Auto-generates ranked operational insights from data, each with a
 * plain-language explanation, quantified impact, recommended action,
 * and expected recovery.
 */
import type {
  ControlTowerBuildContext,
  IntelligenceFeedItem,
  ActionPriority,
} from '@/lib/strategicOps/controlTower/types';
import type { SupervisorOpsRow } from '@/lib/strategicOps/buildReport';
import { supervisorLostTargetDaily } from '@/lib/strategicOps/controlTower/supervisorMetrics';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function priorityRank(p: ActionPriority): number {
  return { critical: 4, high: 3, medium: 2, low: 1 }[p];
}

export function buildOperationalIntelligenceFeed(
  ctx: ControlTowerBuildContext,
  supervisorRows: SupervisorOpsRow[]
): IntelligenceFeedItem[] {
  const items: IntelligenceFeedItem[] = [];
  const {
    fleetTalabat,
    avgHoursPerActiveRider,
    inactiveRiders,
    operationalPeriodDays,
  } = ctx;

  const days = Math.max(1, operationalPeriodDays);
  const fleetAvg = avgHoursPerActiveRider > 0 ? avgHoursPerActiveRider : 0;
  const achievementPct = fleetTalabat.achievementPercent;
  const targetHours = fleetTalabat.targetHours;
  const actualHours = fleetTalabat.actualHours;
  const hoursGap = round2(Math.max(0, targetHours - actualHours));

  // ─── 1. Overall Achievement Alert ─────────────────────────────────────────
  if (achievementPct < 90) {
    const priority: ActionPriority = achievementPct < 60 ? 'critical' : achievementPct < 75 ? 'high' : 'medium';
    items.push({
      id: 'fleet-achievement-gap',
      priority,
      titleAr: `تحقيق ${round2(achievementPct)}% — ${100 - round2(achievementPct)} نقطة تحت الهدف`,
      explanationAr:
        `الأسطول حقق ${round2(actualHours)} ساعة من أصل ${round2(targetHours)} ساعة مستهدفة. ` +
        `الفجوة الإجمالية ${round2(hoursGap)} ساعة تتوزع على ${supervisorRows.length} مشرف.`,
      quantifiedImpact: {
        hoursLost: hoursGap,
        ridersAffected: fleetTalabat.noShowRiders,
        achievementDelta: round2(100 - achievementPct),
      },
      recommendedActionAr: 'مراجعة المشرفين ذوي أدنى تحقيق فوراً',
      expectedRecoveryHours: round2(hoursGap * 0.4),
    });
  }

  // ─── 2. No-Show Spike ─────────────────────────────────────────────────────
  const noShowRate = fleetTalabat.headcount > 0
    ? fleetTalabat.noShowRiders / fleetTalabat.headcount
    : 0;
  if (noShowRate > 0.15) {
    const hoursLost = round2(fleetTalabat.noShowRiders * fleetAvg);
    const priority: ActionPriority = noShowRate > 0.35 ? 'critical' : 'high';
    items.push({
      id: 'fleet-noshow-spike',
      priority,
      titleAr: `${fleetTalabat.noShowRiders} طيار غياب — ${round2(noShowRate * 100)}% من الأسطول`,
      explanationAr:
        `${fleetTalabat.noShowRiders} طيار لم يسجل حضوراً اليوم بما يعادل ${hoursLost} ساعة مفقودة. ` +
        `نسبة الغياب ${round2(noShowRate * 100)}% تؤثر مباشرة على نسبة التحقيق.`,
      quantifiedImpact: {
        hoursLost,
        ridersAffected: Math.round(fleetTalabat.noShowRiders),
      },
      recommendedActionAr: 'تفعيل خطة الحضور الطارئة — متابعة مشرفي الغياب العالي',
      expectedRecoveryHours: round2(hoursLost * 0.5),
    });
  }

  // ─── 3. Inactive Riders Opportunity ───────────────────────────────────────
  if (inactiveRiders >= 5) {
    const recoveryPotential = round2(inactiveRiders * fleetAvg * 0.4);
    const priority: ActionPriority = inactiveRiders >= 20 ? 'high' : 'medium';
    items.push({
      id: 'fleet-inactive-opportunity',
      priority,
      titleAr: `${inactiveRiders} طيار غير نشط — طاقة كامنة غير مستغلة`,
      explanationAr:
        `${inactiveRiders} طيار مسجلون في الأسطول لم يسجلوا ساعات عمل في هذه الفترة. ` +
        `إعادة تفعيل 40% منهم ستضيف ${recoveryPotential} ساعة يومياً.`,
      quantifiedImpact: {
        hoursLost: round2(inactiveRiders * fleetAvg),
        ridersAffected: inactiveRiders,
      },
      recommendedActionAr: 'حملة تفعيل — اتصال مباشر بالطيارين الغير نشطين',
      expectedRecoveryHours: recoveryPotential,
    });
  }

  // ─── 4. Critical Supervisors ──────────────────────────────────────────────
  const critSupervisors = supervisorRows
    .filter((s) => supervisorLostTargetDaily(s) >= 50)
    .sort((a, b) => supervisorLostTargetDaily(b) - supervisorLostTargetDaily(a))
    .slice(0, 3);

  if (critSupervisors.length > 0) {
    const totalLost = round2(critSupervisors.reduce((s, sup) => s + supervisorLostTargetDaily(sup), 0));
    const names = critSupervisors.map((s) => s.name).join('، ');
    items.push({
      id: 'top-supervisor-loss',
      priority: 'high',
      titleAr: `مشرفون رئيسيون يفقدون ${totalLost} ساعة/يوم: ${names}`,
      explanationAr:
        `${critSupervisors.length} مشرفون يتسببون في ${totalLost} ساعة مفقودة من الهدف يومياً. ` +
        critSupervisors
          .map(
            (s) =>
              `${s.name}: ${round2(supervisorLostTargetDaily(s))} ساعة مفقودة (تحقيق ${s.achievementPercent}%)`
          )
          .join(' | '),
      quantifiedImpact: {
        hoursLost: totalLost,
        ridersAffected: critSupervisors.reduce((s, sup) => s + sup.noShowRiders, 0),
      },
      recommendedActionAr: 'مراجعة خطة كل مشرف على حدة اليوم',
      expectedRecoveryHours: round2(totalLost * 0.5),
    });
  }

  // ─── 5. Low Utilization Alert ─────────────────────────────────────────────
  // IMPORTANT: All values are DAILY (not period totals). Never multiply by days here.
  const utilizationPct = fleetTalabat.utilizationPercent;
  if (utilizationPct < 70 && fleetTalabat.activeRiders > 0 && fleetAvg > 0) {
    // Daily gap between what active riders could contribute vs what they do
    const dailyActivePotential = round2(fleetTalabat.activeRiders * fleetAvg);
    const dailyActualFromActive = actualHours; // fleet daily actual
    // A 30% improvement on the utilization gap is a realistic recovery
    const utilizationGap = round2(Math.max(0, dailyActivePotential - dailyActualFromActive) * 0.3);
    if (utilizationGap > 1) {
      items.push({
        id: 'fleet-utilization-low',
        priority: utilizationPct < 50 ? 'high' : 'medium',
        titleAr: `استثمار الأسطول ${round2(utilizationPct)}% — الطيارون النشطون يعملون أقل من طاقتهم`,
        explanationAr:
          `${fleetTalabat.activeRiders} طيار نشط يمكنهم تقديم ${dailyActivePotential} ساعة/يوم ` +
          `لكن الفعلي ${round2(actualHours)} ساعة. ` +
          `تحسين 30% من الفجوة يضيف ${utilizationGap} ساعة يومياً.`,
        quantifiedImpact: {
          hoursLost: round2(dailyActivePotential - dailyActualFromActive),
          ridersAffected: fleetTalabat.activeRiders,
          achievementDelta: round2(80 - utilizationPct),
        },
        recommendedActionAr: 'مراجعة توزيع الشفتات وتحسين جداول الطيارين النشطين',
        expectedRecoveryHours: utilizationGap,
      });
    }
  }

  return items
    .sort((a, b) => {
      const pDiff = priorityRank(b.priority) - priorityRank(a.priority);
      if (pDiff !== 0) return pDiff;
      return b.quantifiedImpact.hoursLost - a.quantifiedImpact.hoursLost;
    })
    .slice(0, 8);
}
