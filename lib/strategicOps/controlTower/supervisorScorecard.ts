import type { SupervisorOpsRow } from '@/lib/strategicOps/buildReport';
import { round2, supervisorLostTargetDaily } from '@/lib/strategicOps/controlTower/supervisorMetrics';
import type {
  BottomPerformerDiagnosis,
  ControlTowerBuildContext,
  KpiRootCause,
  ManagementAction,
  NegativeImpactRider,
  SupervisorCoachingItem,
  SupervisorScorecard,
  SupervisorScorecardDrillDown,
  SupervisorScorecardsReport,
} from '@/lib/strategicOps/controlTower/types';

export function computeSupervisorNoShowPercent(s: SupervisorOpsRow): number {
  if (s.headcount <= 0) return 0;
  return round2((s.noShowRiders / s.headcount) * 100);
}

/** Expected team hours if all assigned riders met fleet active-rider average. */
export function computeSupervisorLostHoursDaily(
  s: SupervisorOpsRow,
  expectedHoursPerRider: number
): number {
  const expectedTeamHours = s.headcount * expectedHoursPerRider;
  return round2(Math.max(0, expectedTeamHours - s.dailyHours));
}

export function computeCompositeScore(
  s: SupervisorOpsRow,
  lostTargetDaily: number,
  maxLostTarget: number
): number {
  const noShowPct = computeSupervisorNoShowPercent(s);
  const noShowPenalty = Math.min(100, noShowPct * 2.5);
  const lostTargetPenalty = maxLostTarget > 0 ? Math.min(100, (lostTargetDaily / maxLostTarget) * 100) : 0;
  return round2(
    s.achievementPercent * 0.35 +
      s.utilizationPercent * 0.25 +
      (100 - noShowPenalty) * 0.2 +
      (100 - lostTargetPenalty) * 0.2
  );
}

export function buildBottomPerformerDiagnosis(
  s: SupervisorOpsRow,
  lostHoursDaily: number,
  lostTargetDaily: number
): BottomPerformerDiagnosis {
  const noShowPct = computeSupervisorNoShowPercent(s);
  const missingHoursDaily = round2(lostHoursDaily + lostTargetDaily);

  if (noShowPct > 15) {
    return {
      whyAr: 'معدل No Show مرتفع — جزء كبير من الفريق لا يحضر يومياً',
      missingHoursDaily,
      missingHoursLabelAr: `${missingHoursDaily} س/يوم مفقودة (${lostHoursDaily} ساعات فريق + ${lostTargetDaily} من الهدف)`,
      mainIssueAr: `${s.noShowRiders} طيار no-show يومياً (${noShowPct}% من الفريق)`,
      recommendedActionAr: 'تفعيل خطة حضور يومية + متابعة هاتفية للغائبين',
    };
  }

  if (s.utilizationPercent < 60) {
    return {
      whyAr: 'استغلال منخفض للفريق — نسبة الطيارين النشطين دون المستهدف',
      missingHoursDaily,
      missingHoursLabelAr: `${missingHoursDaily} س/يوم مفقودة`,
      mainIssueAr: `${s.inactiveRiders} طيار غير نشط · ${s.activeRiders}/${s.headcount} نشط (${s.utilizationPercent}%)`,
      recommendedActionAr: 'تفعيل الطيارين غير النشطين + مراجعة توزيع الشفتات',
    };
  }

  if (s.achievementPercent < 60) {
    return {
      whyAr: 'تحقيق الهدف دون المستوى المطلوب',
      missingHoursDaily,
      missingHoursLabelAr: `${lostTargetDaily} س/يوم تحت الهدف · ${lostHoursDaily} س/يوم فقد تشغيلي`,
      mainIssueAr: `تحقيق ${s.achievementPercent}% · ${s.dailyHours} س/يوم فعلية`,
      recommendedActionAr: 'مراجعة توزيع الطيارين ورفع ساعات الفريق اليومية',
    };
  }

  if (lostTargetDaily >= 20) {
    return {
      whyAr: 'فجوة كبيرة بين الساعات الفعلية والهدف اليومي',
      missingHoursDaily,
      missingHoursLabelAr: `${lostTargetDaily} س/يوم تحت الهدف`,
      mainIssueAr: `فقد ${lostTargetDaily} س/يوم من هدف المشرف`,
      recommendedActionAr: 'اجتماع تشغيلي فوري — خطة استرداد ساعات خلال 48 ساعة',
    };
  }

  if (s.inactiveRiders >= 5) {
    return {
      whyAr: 'عدد مرتفع من الطيارين غير النشطين',
      missingHoursDaily,
      missingHoursLabelAr: `${missingHoursDaily} س/يوم مفقودة`,
      mainIssueAr: `${s.inactiveRiders} طيار بدون نشاط تشغيلي في الفترة`,
      recommendedActionAr: `تفعيل ${s.inactiveRiders} طيار — متابعة يومية`,
    };
  }

  if (s.resignations >= 3) {
    return {
      whyAr: 'معدل إقالات مرتفع يضغط على استقرار الفريق',
      missingHoursDaily,
      missingHoursLabelAr: `${missingHoursDaily} س/يوم مفقودة`,
      mainIssueAr: `${s.resignations} إقالة معتمدة في الفترة`,
      recommendedActionAr: 'تدخل احتفاظ — مقابلة الطيارين المتبقين',
    };
  }

  return {
    whyAr: 'أداء تشغيلي دون المتوسط المركّب للأسطول',
    missingHoursDaily,
    missingHoursLabelAr: `${missingHoursDaily} س/يوم مفقودة`,
    mainIssueAr: `تحقيق ${s.achievementPercent}% · استغلال ${s.utilizationPercent}%`,
    recommendedActionAr: 'مراجعة أسبوعية للأداء + متابعة أسوأ 5 طيارين',
  };
}

function buildCoachingItems(
  s: SupervisorOpsRow,
  fleetNoShowPct: number,
  fleetAvgBreak: number,
  fleetAvgDelay: number
): SupervisorCoachingItem[] {
  const items: SupervisorCoachingItem[] = [];
  const noShowPct = computeSupervisorNoShowPercent(s);

  if (noShowPct > fleetNoShowPct + 5) {
    const excessRiders = Math.max(1, Math.round((noShowPct - fleetNoShowPct) / 100 * s.headcount));
    items.push({
      priority: 1,
      actionAr: 'تواصل مع الطيارين الغائبين قبل بداية الشيفت',
      evidenceAr: `${noShowPct.toFixed(0)}% no-show (متوسط الأسطول ${fleetNoShowPct.toFixed(0)}%) — ${excessRiders} طيار زيادة`,
      potentialGainHours: round2(excessRiders * s.avgHoursPerRiderDaily * 0.5),
    });
  }

  if (s.inactiveRiders > 2) {
    items.push({
      priority: 1,
      actionAr: 'إعادة تفعيل الطيارين المتوقفين',
      evidenceAr: `${s.inactiveRiders} طيار غير نشط بدون سبب واضح`,
      potentialGainHours: round2(s.inactiveRiders * s.avgHoursPerRiderDaily * 0.4),
    });
  }

  const avgDelay = s.avgDelayMinutesDaily ?? 0;
  const avgBreak = s.avgBreakMinutesDaily ?? 0;

  if (avgDelay > fleetAvgDelay + 10) {
    const excessDelay = round2(avgDelay - fleetAvgDelay);
    items.push({
      priority: 2,
      actionAr: 'تقليل متوسط وقت التأخير',
      evidenceAr: `متوسط تأخير ${avgDelay.toFixed(0)} دقيقة (الأسطول ${fleetAvgDelay.toFixed(0)}) — فرق ${excessDelay} دقيقة`,
      potentialGainHours: round2((excessDelay / 60) * s.activeRiders * 0.3),
    });
  }

  if (avgBreak > fleetAvgBreak + 15) {
    const excessBreak = round2(avgBreak - fleetAvgBreak);
    items.push({
      priority: 2,
      actionAr: 'تقليل فترات الاستراحة الزائدة',
      evidenceAr: `متوسط استراحة ${avgBreak.toFixed(0)} دقيقة (الأسطول ${fleetAvgBreak.toFixed(0)}) — فرق ${excessBreak} دقيقة`,
      potentialGainHours: round2((excessBreak / 60) * s.activeRiders * 0.5),
    });
  }

  if (items.length === 0 && s.achievementPercent < 75) {
    items.push({
      priority: 3,
      actionAr: 'مراجعة توزيع الطيارين على الشفتات',
      evidenceAr: `تحقيق ${s.achievementPercent.toFixed(0)}% — دون المستوى المستهدف 75%`,
      potentialGainHours: round2(s.headcount * s.avgHoursPerRiderDaily * 0.1),
    });
  }

  return items.slice(0, 3);
}

function buildScorecardFromRow(
  s: SupervisorOpsRow,
  expectedHoursPerRider: number,
  maxLostTarget: number,
  includeDiagnosis: boolean,
  fleetNoShowPct: number,
  fleetAvgBreak: number,
  fleetAvgDelay: number
): SupervisorScorecard {
  const lostTargetDaily = supervisorLostTargetDaily(s);
  const lostHoursDaily = computeSupervisorLostHoursDaily(s, expectedHoursPerRider);
  const compositeScore = computeCompositeScore(s, lostTargetDaily, maxLostTarget);
  const coachingItems = buildCoachingItems(s, fleetNoShowPct, fleetAvgBreak, fleetAvgDelay);

  return {
    code: s.code,
    name: s.name,
    region: s.region,
    teamSize: s.headcount,
    activeRiders: s.activeRiders,
    noShowPercent: computeSupervisorNoShowPercent(s),
    achievementPercent: s.achievementPercent,
    utilizationPercent: s.utilizationPercent,
    lostHoursDaily,
    lostTargetDaily,
    compositeScore,
    scorecardRank: 0,
    rankCategory: 'average',
    avgBreakMinutesDaily: s.avgBreakMinutesDaily ?? 0,
    avgDelayMinutesDaily: s.avgDelayMinutesDaily ?? 0,
    coachingItems,
    bottomPerformerDiagnosis: includeDiagnosis
      ? buildBottomPerformerDiagnosis(s, lostHoursDaily, lostTargetDaily)
      : undefined,
  };
}

function assignRankCategory(rank: number, total: number): SupervisorScorecard['rankCategory'] {
  const pct = (rank - 1) / Math.max(1, total - 1);
  if (pct <= 0.25) return 'top_performer';
  if (pct <= 0.5) return 'average';
  if (pct <= 0.75) return 'needs_improvement';
  return 'critical';
}

export function buildSupervisorScorecardDrillDown(input: {
  scorecard: SupervisorScorecard;
  row: SupervisorOpsRow;
  kpiRootCauses: KpiRootCause[];
  topNegativeImpactRiders: NegativeImpactRider[];
  allActions: ManagementAction[];
}): SupervisorScorecardDrillDown {
  const { scorecard, row, kpiRootCauses, topNegativeImpactRiders, allActions } = input;
  const code = scorecard.code;

  const rootCauses = kpiRootCauses.filter((rc) =>
    rc.topSupervisors.some((c) => c.code === code)
  );

  const riderImpact = topNegativeImpactRiders.filter(
    (r) => r.supervisorCode === code || r.supervisorName === scorecard.name
  );

  const executiveActions = allActions.filter(
    (a) => a.entityType === 'supervisor' && a.entityId === code
  );

  return {
    supervisorCode: code,
    supervisorName: scorecard.name,
    kpiBreakdown: {
      teamSize: row.headcount,
      activeRiders: row.activeRiders,
      noShowRiders: row.noShowRiders,
      noShowPercent: scorecard.noShowPercent,
      inactiveRiders: row.inactiveRiders,
      dailyHours: row.dailyHours,
      achievementPercent: row.achievementPercent,
      utilizationPercent: row.utilizationPercent,
      lostHoursDaily: scorecard.lostHoursDaily,
      lostTargetDaily: scorecard.lostTargetDaily,
      avgHoursPerRiderDaily: row.avgHoursPerRiderDaily,
      resignations: row.resignations,
    },
    rootCauses,
    riderImpact,
    executiveActions,
  };
}

export function emptySupervisorScorecardsReport(): SupervisorScorecardsReport {
  return {
    topPerformers: [],
    bottomPerformers: [],
    all: [],
    drillDownByCode: {},
  };
}

export function buildSupervisorScorecards(input: {
  ctx: ControlTowerBuildContext;
  kpiRootCauses: KpiRootCause[];
  topNegativeImpactRiders: NegativeImpactRider[];
  allActions: ManagementAction[];
}): SupervisorScorecardsReport {
  const { ctx, kpiRootCauses, topNegativeImpactRiders, allActions } = input;
  const rows = ctx.supervisorRows;
  if (rows.length === 0) return emptySupervisorScorecardsReport();

  const expectedHoursPerRider = ctx.avgHoursPerActiveRider > 0 ? ctx.avgHoursPerActiveRider : 5;
  const lostTargets = rows.map((s) => supervisorLostTargetDaily(s));
  const maxLostTarget = Math.max(...lostTargets, 1);

  // Fleet averages for coaching thresholds
  const totalHeadcount = rows.reduce((s, r) => s + r.headcount, 0);
  const fleetNoShowPct = totalHeadcount > 0
    ? round2((rows.reduce((s, r) => s + r.noShowRiders, 0) / totalHeadcount) * 100)
    : 0;
  const rowsWithBreak = rows.filter((r) => (r.avgBreakMinutesDaily ?? 0) > 0);
  const fleetAvgBreak = rowsWithBreak.length > 0
    ? rowsWithBreak.reduce((s, r) => s + (r.avgBreakMinutesDaily ?? 0), 0) / rowsWithBreak.length
    : 20;
  const rowsWithDelay = rows.filter((r) => (r.avgDelayMinutesDaily ?? 0) > 0);
  const fleetAvgDelay = rowsWithDelay.length > 0
    ? rowsWithDelay.reduce((s, r) => s + (r.avgDelayMinutesDaily ?? 0), 0) / rowsWithDelay.length
    : 10;

  const bottomCodes = new Set<string>();

  let cards = rows.map((s) =>
    buildScorecardFromRow(s, expectedHoursPerRider, maxLostTarget, false, fleetNoShowPct, fleetAvgBreak, fleetAvgDelay)
  );

  cards.sort((a, b) => b.compositeScore - a.compositeScore);
  cards = cards.map((c, i) => ({
    ...c,
    scorecardRank: i + 1,
    rankCategory: assignRankCategory(i + 1, cards.length),
  }));

  const topPerformers = cards.slice(0, 5);
  const bottomSlice = [...cards].reverse().slice(0, 5);
  for (const b of bottomSlice) {
    bottomCodes.add(b.code);
  }

  const all = cards.map((c) => {
    const row = rows.find((r) => r.code === c.code)!;
    const includeDiagnosis = bottomCodes.has(c.code);
    const withDiag = includeDiagnosis
      ? buildScorecardFromRow(row, expectedHoursPerRider, maxLostTarget, true, fleetNoShowPct, fleetAvgBreak, fleetAvgDelay)
      : c;
    return { ...withDiag, scorecardRank: c.scorecardRank, rankCategory: c.rankCategory };
  });

  const topPerformersFinal = all.filter((c) => topPerformers.some((t) => t.code === c.code));
  const bottomPerformers = all
    .filter((c) => bottomCodes.has(c.code))
    .sort((a, b) => a.compositeScore - b.compositeScore);

  const drillDownByCode: Record<string, SupervisorScorecardDrillDown> = {};
  for (const card of all) {
    const row = rows.find((r) => r.code === card.code);
    if (!row) continue;
    drillDownByCode[card.code] = buildSupervisorScorecardDrillDown({
      scorecard: card,
      row,
      kpiRootCauses,
      topNegativeImpactRiders,
      allActions,
    });
  }

  return {
    topPerformers: topPerformersFinal,
    bottomPerformers,
    all,
    drillDownByCode,
  };
}
