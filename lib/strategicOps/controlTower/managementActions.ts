import type { SupervisorOpsRow } from '@/lib/strategicOps/buildReport';
import type {
  ActionPriority,
  ActionConfidence,
  ActionUrgency,
  ActionDifficulty,
  ControlTowerBuildContext,
  ManagementAction,
  NegativeImpactRider,
} from '@/lib/strategicOps/controlTower/types';
import { supervisorLostTargetDaily } from '@/lib/strategicOps/controlTower/supervisorMetrics';
import { getUnitEconomicsConfig, totalHireInvestment } from '@/lib/strategicOps/digitalTwin/config/unitEconomics';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** SRS-010 Part 3 — Action Engine enrichment.
 *  Every action kind maps to a fixed operational profile (difficulty / risk /
 *  which KPIs it moves) derived from what the action actually *is* — recruiting
 *  is always harder & costlier than a phone call, regardless of the supervisor.
 *  The only per-action variables are the numbers (cost, ROI, deadline), which
 *  are computed from the same recovery/rider figures already on the action. */
type ActionKind =
  | 'sup-noshow'
  | 'sup-hours'
  | 'sup-inactive'
  | 'sup-recruit'
  | 'sup-resign'
  | 'rider-impact'
  | 'fleet-inactive'
  | 'fleet-noshow';

const ACTION_PROFILE: Record<
  ActionKind,
  { difficulty: ActionDifficulty; difficultyAr: string; riskIfIgnoredAr: string; affectedKpiIds: string[] }
> = {
  'sup-noshow': {
    difficulty: 'easy',
    difficultyAr: 'سهل — مكالمة/رسالة اليوم، بدون تكلفة',
    riskIfIgnoredAr: 'إذا لم يتم التواصل اليوم، الغياب يتكرر غدًا وتتراكم الساعات المفقودة يوميًا.',
    affectedKpiIds: ['no_show', 'active_riders', 'target_achievement'],
  },
  'sup-hours': {
    difficulty: 'medium',
    difficultyAr: 'متوسط — يحتاج مراجعة يومية مع المشرف حتى تثبت النتيجة',
    riskIfIgnoredAr: 'الفجوة اليومية تتراكم على مدار الشهر وتقلّل نسبة تحقيق الهدف بشكل ملموس.',
    affectedKpiIds: ['target_achievement', 'active_riders'],
  },
  'sup-inactive': {
    difficulty: 'easy',
    difficultyAr: 'سهل — مكالمات تفعيل، بدون تكلفة',
    riskIfIgnoredAr: 'الطيارون غير النشطين قد يتركوا العمل فعليًا إذا طالت فترة عدم التواصل.',
    affectedKpiIds: ['active_riders', 'utilization'],
  },
  'sup-recruit': {
    difficulty: 'hard',
    difficultyAr: 'صعب — توظيف فعلي + تدريب، النتيجة تظهر بعد أسابيع لا أيام',
    riskIfIgnoredAr: 'الفجوة الهيكلية (نقص عدد الطيارين) لن تُغلَق بالتدخلات التشغيلية وحدها — تستمر شهريًا.',
    affectedKpiIds: ['headcount', 'active_riders', 'utilization'],
  },
  'sup-resign': {
    difficulty: 'medium',
    difficultyAr: 'متوسط — مقابلات احتفاظ مع الفريق المتبقي',
    riskIfIgnoredAr: 'قد لا تمنع المقابلة استقالات أخرى إذا كان السبب هيكليًا (راتب/جدول عمل) لا فرديًا.',
    affectedKpiIds: ['active_riders'],
  },
  'rider-impact': {
    difficulty: 'easy',
    difficultyAr: 'سهل — مكالمة متابعة فردية، بدون تكلفة',
    riskIfIgnoredAr: 'الغياب/التراجع المتكرر لطيار واحد قد يكون مؤشرًا مبكرًا على مشكلة أوسع في فريقه.',
    affectedKpiIds: ['active_riders', 'target_achievement'],
  },
  'fleet-inactive': {
    difficulty: 'medium',
    difficultyAr: 'متوسط — حملة تفعيل جماعية عبر كل المشرفين',
    riskIfIgnoredAr: 'الطاقة الكامنة (طيارون مسجلون بلا ساعات) تتبخر إذا تجاوز الخمول عدة أسابيع.',
    affectedKpiIds: ['active_riders', 'utilization'],
  },
  'fleet-noshow': {
    difficulty: 'medium',
    difficultyAr: 'متوسط — تنبيه حضور على مستوى كل المناطق',
    riskIfIgnoredAr: 'الغياب المرتفع أسطوليًا يوسّع فجوة الهدف الكلي كل يوم يمر بدون تدخل.',
    affectedKpiIds: ['no_show', 'target_achievement'],
  },
};

const DEADLINE_AR: Record<ActionUrgency, string> = {
  immediate: 'اليوم قبل الساعة 4:00 مساءً',
  this_week: 'خلال 3 أيام (نهاية هذا الأسبوع)',
  this_month: 'خلال أسبوعين',
};

/** Enrich a raw candidate with Part-3 fields: Owner / Deadline / Difficulty /
 *  Cost / Risk / Affected KPIs / Estimated ROI — computed, not hardcoded. */
function enrichAction(
  kind: ActionKind,
  candidate: Omit<ManagementAction, 'rawRecoveryHours' | 'deduplicatedRecoveryHours'>,
  opts: { ordersPerHour: number; recruitRiders?: number } = { ordersPerHour: 0 }
): Omit<ManagementAction, 'rawRecoveryHours' | 'deduplicatedRecoveryHours'> {
  const profile = ACTION_PROFILE[kind];
  const economics = getUnitEconomicsConfig();
  const urgency = candidate.urgency ?? 'this_week';

  const costEstimateEGP =
    kind === 'sup-recruit' ? round2(totalHireInvestment(economics, opts.recruitRiders ?? candidate.riderCount ?? 0)) : 0;

  // Daily value = recovered hours converted to orders (already computed per-action
  // where available) × revenue/order from the same economics config used across
  // the Digital Twin — one source of truth for money, not a separate guess here.
  const dailyOrders =
    candidate.expectedRecoveryOrders ?? (opts.ordersPerHour > 0 ? round2(candidate.expectedRecoveryHours * opts.ordersPerHour) : 0);
  const dailyValueEGP = round2(dailyOrders * economics.revenuePerOrder);

  let estimatedRoiAr: string;
  if (costEstimateEGP <= 0) {
    estimatedRoiAr =
      dailyValueEGP > 0
        ? `بدون تكلفة — قيمة يومية متوقعة ≈ ${dailyValueEGP.toLocaleString('en-US')} ${economics.currency} (أثر فوري بلا استثمار)`
        : 'بدون تكلفة — أثر تشغيلي مباشر (استرداد ساعات) بلا استثمار مادي';
  } else if (dailyValueEGP > 0) {
    const paybackDays = Math.max(1, Math.ceil(costEstimateEGP / dailyValueEGP));
    estimatedRoiAr = `تكلفة ${costEstimateEGP.toLocaleString('en-US')} ${economics.currency} — استرداد التكلفة خلال ~${paybackDays} يوم عمل عند ${dailyValueEGP.toLocaleString('en-US')} ${economics.currency}/يوم قيمة مقدّرة`;
  } else {
    estimatedRoiAr = `تكلفة ${costEstimateEGP.toLocaleString('en-US')} ${economics.currency} — نتيجة تشغيلية (استرداد ساعات) لا تُقاس بعائد مالي مباشر فورًا`;
  }

  return {
    ...candidate,
    ownerAr: candidate.entityType === 'fleet' ? 'مدير العمليات (Ops Manager)' : candidate.entityName,
    deadlineAr: DEADLINE_AR[urgency],
    difficulty: profile.difficulty,
    difficultyAr: profile.difficultyAr,
    costEstimateEGP,
    costCurrency: economics.currency,
    riskIfIgnoredAr: profile.riskIfIgnoredAr,
    affectedKpiIds: profile.affectedKpiIds,
    estimatedRoiAr,
  };
}

function stdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function priorityRank(p: ActionPriority): number {
  return { critical: 4, high: 3, medium: 2, low: 1 }[p];
}

function ordersFromHours(hours: number, avgHoursPerOrder: number): number {
  if (avgHoursPerOrder <= 0) return 0;
  return round2(hours / avgHoursPerOrder);
}

function pushAction(
  actions: ManagementAction[],
  action: Omit<ManagementAction, 'rawRecoveryHours' | 'deduplicatedRecoveryHours'>,
  kind?: ActionKind,
  opts?: { ordersPerHour: number; recruitRiders?: number }
) {
  const enriched = kind ? enrichAction(kind, action, opts) : action;
  actions.push({
    ...enriched,
    rawRecoveryHours: action.expectedRecoveryHours,
    deduplicatedRecoveryHours: action.expectedRecoveryHours,
  });
}

export function buildManagementActions(
  ctx: ControlTowerBuildContext,
  supervisorRows: SupervisorOpsRow[],
  topRiders: NegativeImpactRider[]
): ManagementAction[] {
  const actions: ManagementAction[] = [];
  const { fleetTalabat, avgHoursPerActiveRider, inactiveRiders } = ctx;

  const ordersPerHour = fleetTalabat.actualHours > 0
    ? round2(fleetTalabat.dailySeries.reduce((s, d) => s + (d as any).orders || 0, 0) / Math.max(1, fleetTalabat.actualHours))
    : 0;

  const noShowValues = supervisorRows.map((s) => s.noShowRiders);
  const noShowStd = stdDev(noShowValues);

  // Fleet-level rates for relative comparisons.
  // A supervisor whose rate exceeds the fleet average by more than 5pp is above-average
  // in that dimension. This prevents the entire fleet from being classified the same way
  // in high-no-show environments (e.g. Alexandria fleet-wide no-show = 37%).
  const fleetHeadcount = Math.max(1, ctx.headcount);
  const fleetNoShowRate = fleetTalabat.noShowRiders / fleetHeadcount;
  const fleetInactiveRate = inactiveRiders / fleetHeadcount;
  const fleetUtilizationPct = fleetTalabat.utilizationPercent ?? 0;
  // Supervisor-level fleet average (for display in Arabic labels)
  const fleetNoShowAvg =
    noShowValues.length > 0 ? noShowValues.reduce((a, b) => a + b, 0) / noShowValues.length : 0;

  // Relative excess thresholds — a supervisor must exceed fleet by at least 5pp to be
  // classified with that root cause. Prevents blanket classification in high-no-show periods.
  const RELATIVE_EXCESS = 0.05; // 5 percentage points above fleet average

  for (const s of supervisorRows) {
    const candidates: ManagementAction[] = [];

    const noShowRate = s.headcount > 0 ? s.noShowRiders / s.headcount : 0;
    const inactiveRate = s.headcount > 0 ? s.inactiveRiders / s.headcount : 0;

    // Relative excesses: how much worse is this supervisor vs the fleet?
    const noShowExcess = noShowRate - fleetNoShowRate;         // positive = worse than fleet
    const inactiveExcess = inactiveRate - fleetInactiveRate;   // positive = more inactive
    const utilizationDeficit = fleetUtilizationPct - s.utilizationPercent; // positive = lower util

    // No-show specific action: supervisor is MEANINGFULLY above fleet average on attendance.
    // Uses relative threshold, not absolute 25%, to avoid blanket classification.
    const isWorseOnNoShow = s.noShowRiders > 0 && noShowExcess > RELATIVE_EXCESS;
    if (isWorseOnNoShow) {
      const recovery = round2(s.noShowRiders * avgHoursPerActiveRider);
      const priority: ActionPriority = s.noShowRiders > 15 ? 'critical' : 'high';
      const enriched = enrichAction('sup-noshow', {
        id: `sup-noshow-${s.code}`,
        priority,
        entityType: 'supervisor',
        entityId: s.code,
        entityName: s.name,
        problemAr: `المشرف ${s.name}: غياب ${s.noShowRiders} طيار (${Math.round(noShowRate * 100)}%) — أعلى من متوسط الأسطول (${Math.round(fleetNoShowRate * 100)}%) بفارق ${Math.round(noShowExcess * 100)} نقطة`,
        actionAr: `اتصل بالمشرف ${s.name} اليوم — فعّل خطة حضور فورية`,
        whyAr: `نسبة الغياب في فريقه ${Math.round(noShowExcess * 100)} نقطة أعلى من متوسط الأسطول — أسوأ من الفريق العام`,
        expectedRecoveryHours: recovery,
        expectedRecoveryOrders: ordersFromHours(recovery, ordersPerHour > 0 ? 1 / ordersPerHour : 0),
        riderCount: s.noShowRiders,
        confidence: 'high',
        urgency: 'immediate',
        evidence: `noShowRate=${Math.round(noShowRate * 100)}%, fleetNoShowRate=${Math.round(fleetNoShowRate * 100)}%, excess=${Math.round(noShowExcess * 100)}pp, σ=${round2(noShowStd)}`,
      }, { ordersPerHour });
      candidates.push({ ...enriched, rawRecoveryHours: recovery, deduplicatedRecoveryHours: recovery });
    }

    const lost = supervisorLostTargetDaily(s);
    if (lost >= 20) {
      const priority: ActionPriority = lost >= 50 ? 'critical' : 'high';
      const confidence: ActionConfidence = s.achievementPercent < 50 ? 'high' : 'medium';

      // Dominant-driver classification using RELATIVE performance vs fleet.
      // Priority: attendance excess > inactive excess > utilization deficit > generic.
      let actionAr: string;
      let whyAr: string;

      if (noShowExcess > RELATIVE_EXCESS) {
        actionAr = `أولوية اليوم: متابعة ${s.noShowRiders} غائب في فريق ${s.name} — أداء الحضور أسوأ من المتوسط بـ${Math.round(noShowExcess * 100)}نقطة`;
        whyAr = `فريق ${s.name} يتجاوز متوسط الغياب الأسطولي بـ${Math.round(noShowExcess * 100)} نقطة — المحرك الرئيسي للفجوة`;
      } else if (inactiveExcess > RELATIVE_EXCESS) {
        actionAr = `إعادة تفعيل ${s.inactiveRiders} طيار متوقف في فريق ${s.name} — نسبة الخمول أعلى من الأسطول`;
        whyAr = `${Math.round(inactiveRate * 100)}% من الفريق غير نشط (متوسط الأسطول ${Math.round(fleetInactiveRate * 100)}%) — طاقة كامنة غير مستغلة`;
      } else if (utilizationDeficit > 5) {
        actionAr = `دفع ساعات العمل للطيارين النشطين في فريق ${s.name} — استثمار ${round2(s.utilizationPercent)}% فقط`;
        whyAr = `الطيارون النشطون يعملون أقل من متوسط الأسطول ${round2(fleetUtilizationPct)}% — مشكلة ساعات لا غياب`;
      } else if (isWorseOnNoShow || noShowRate > 0.30) {
        // High absolute no-show even if not relatively worse (fleet-wide problem)
        actionAr = `متابعة غياب فريق ${s.name}: ${s.noShowRiders} طيار (${Math.round(noShowRate * 100)}%) — مستوى مرتفع`;
        whyAr = `الغياب مرتفع على مستوى الأسطول كله — يحتاج متابعة حتى لو ليس الأسوأ نسبياً`;
      } else {
        actionAr = `مراجعة هيكل فريق ${s.name}: ${lost} ساعة مفقودة/يوم — لا سبب واحد واضح`;
        whyAr = `لا يبرز سبب واحد كمحرك رئيسي — يُنصح بمراجعة شاملة للفريق مع المشرف`;
      }

      const hoursUrgency: ActionUrgency = lost >= 80 ? 'immediate' : 'this_week';
      const hoursEnriched = enrichAction('sup-hours', {
        id: `sup-hours-${s.code}`,
        priority,
        entityType: 'supervisor',
        entityId: s.code,
        entityName: s.name,
        problemAr: `المشرف ${s.name} يفقد ${lost} ساعة/يوم من الهدف (تحقيق ${s.achievementPercent}%)`,
        actionAr,
        whyAr,
        expectedRecoveryHours: lost,
        expectedRecoveryOrders: ordersFromHours(lost, ordersPerHour > 0 ? 1 / ordersPerHour : 0),
        riderCount: s.headcount,
        confidence,
        urgency: hoursUrgency,
        evidence: `lost=${lost}h, achievement=${s.achievementPercent}%, noShowExcess=${Math.round(noShowExcess * 100)}pp, inactiveExcess=${Math.round(inactiveExcess * 100)}pp, utilDef=${round2(utilizationDeficit)}pp`,
      }, { ordersPerHour });
      candidates.push({ ...hoursEnriched, rawRecoveryHours: lost, deduplicatedRecoveryHours: lost });
    }

    if (s.inactiveRiders >= 5) {
      const recovery = round2(s.inactiveRiders * avgHoursPerActiveRider);
      const inactiveUrgency: ActionUrgency = s.inactiveRiders >= 10 ? 'this_week' : 'this_month';
      const inactiveEnriched = enrichAction('sup-inactive', {
        id: `sup-inactive-${s.code}`,
        priority: s.inactiveRiders >= 10 ? 'high' : 'medium',
        entityType: 'supervisor',
        entityId: s.code,
        entityName: s.name,
        problemAr: `${s.inactiveRiders} طيار غير نشط تحت ${s.name}`,
        actionAr: `تفعيل ${s.inactiveRiders} طيار — متابعة يومية مع ${s.name}`,
        whyAr: `هؤلاء الطيارون مسجلون في الفريق لكن لا يسجلون ساعات`,
        expectedRecoveryHours: recovery,
        expectedRecoveryOrders: ordersFromHours(recovery, ordersPerHour > 0 ? 1 / ordersPerHour : 0),
        riderCount: s.inactiveRiders,
        confidence: 'medium',
        urgency: inactiveUrgency,
        evidence: `inactiveRiders=${s.inactiveRiders}`,
      }, { ordersPerHour });
      candidates.push({ ...inactiveEnriched, rawRecoveryHours: recovery, deduplicatedRecoveryHours: recovery });
    }

    if (s.headcount > 0 && s.activeRiders / s.headcount < 0.6) {
      const needed = Math.ceil(s.headcount * 0.7 - s.activeRiders);
      if (needed > 0) {
        const recovery = round2(needed * avgHoursPerActiveRider);
        const recruitEnriched = enrichAction('sup-recruit', {
          id: `sup-recruit-${s.code}`,
          priority: 'high',
          entityType: 'supervisor',
          entityId: s.code,
          entityName: s.name,
          problemAr: `فريق ${s.name}: ${s.activeRiders}/${s.headcount} نشط فقط (${s.utilizationPercent}%)`,
          actionAr: `تعيين/تفعيل مطلوب — ${needed} طيار في فريق ${s.name}`,
          whyAr: `الاستثمار أقل من 60% — ${s.headcount - s.activeRiders} طيار مسجل غير فعّال`,
          expectedRecoveryHours: recovery,
          expectedRecoveryOrders: ordersFromHours(recovery, ordersPerHour > 0 ? 1 / ordersPerHour : 0),
          riderCount: needed,
          confidence: 'medium',
          urgency: 'this_week',
          evidence: `utilization=${s.utilizationPercent}%`,
        }, { ordersPerHour, recruitRiders: needed });
        candidates.push({ ...recruitEnriched, rawRecoveryHours: recovery, deduplicatedRecoveryHours: recovery });
      }
    }

    if (s.resignations >= 3) {
      const recovery = round2(s.resignations * avgHoursPerActiveRider * 3);
      const resignEnriched = enrichAction('sup-resign', {
        id: `sup-resign-${s.code}`,
        priority: 'medium',
        entityType: 'supervisor',
        entityId: s.code,
        entityName: s.name,
        problemAr: `${s.resignations} إقالة معتمدة في فريق ${s.name}`,
        actionAr: `مقابلة الطيارين المتبقين في فريق ${s.name} — تدخل احتفاظ`,
        whyAr: `الإقالات المتكررة تشير إلى مشكلة في بيئة العمل أو الإدارة`,
        expectedRecoveryHours: recovery,
        expectedRecoveryOrders: ordersFromHours(recovery, ordersPerHour > 0 ? 1 / ordersPerHour : 0),
        riderCount: s.resignations,
        confidence: 'low',
        urgency: 'this_month',
        evidence: `resignations=${s.resignations}`,
      }, { ordersPerHour });
      candidates.push({ ...resignEnriched, rawRecoveryHours: recovery, deduplicatedRecoveryHours: recovery });
    }

    if (candidates.length > 0) {
      const best = candidates.sort(
        (a, b) =>
          priorityRank(b.priority) - priorityRank(a.priority) ||
          b.expectedRecoveryHours - a.expectedRecoveryHours
      )[0];
      actions.push(best);
    }
  }

  // Top critical/high riders
  for (const r of topRiders.filter((x) => x.impactLevel === 'critical' || x.impactLevel === 'high').slice(0, 5)) {
    pushAction(actions, {
      id: `rider-impact-${r.code}`,
      priority: r.impactLevel === 'critical' ? 'critical' : 'high',
      entityType: 'rider',
      entityId: r.code,
      entityName: r.name,
      problemAr: `الطيار ${r.name}: متوقع ${r.expectedHoursDaily} س/يوم، فعلي ${r.actualHoursDaily}، مفقود ${r.lostHoursDaily} س/يوم`,
      actionAr: `متابعة الطيار ${r.name} — مشرف ${r.supervisorName || '—'}`,
      whyAr: `${r.noShowCount > 0 ? `غاب ${r.noShowCount} يوم من ${r.scheduledDays}` : 'انخفاض في ساعات العمل عن المتوقع'}`,
      expectedRecoveryHours: round2(r.lostHoursDaily),
      expectedRecoveryOrders: ordersFromHours(r.lostHoursDaily, ordersPerHour > 0 ? 1 / ordersPerHour : 0),
      riderCount: 1,
      confidence: r.noShowCount > 0 ? 'high' : 'medium',
      urgency: r.impactLevel === 'critical' ? 'immediate' : 'this_week',
      evidence: `expected=${r.expectedHoursDaily}, actual=${r.actualHoursDaily}, lost=${r.lostHoursDaily}, noShow=${r.noShowCount}`,
    }, 'rider-impact', { ordersPerHour });
  }

  if (inactiveRiders >= 10) {
    pushAction(actions, {
      id: 'fleet-inactive',
      priority: inactiveRiders >= 30 ? 'high' : 'medium',
      entityType: 'fleet',
      entityId: 'fleet',
      entityName: 'الأسطول',
      problemAr: `${inactiveRiders} طيار غير نشط بالأسطول`,
      actionAr: `حملة تفعيل — استهداف ${Math.min(15, inactiveRiders)} طيار`,
      whyAr: `طيارون مسجلون لم يسجلوا أي ساعات في الفترة — طاقة كامنة غير مستغلة`,
      expectedRecoveryHours: round2(Math.min(15, inactiveRiders) * avgHoursPerActiveRider),
      expectedRecoveryOrders: 0,
      riderCount: inactiveRiders,
      confidence: 'medium',
      urgency: 'this_week',
      evidence: `inactiveRiders=${inactiveRiders}`,
    }, 'fleet-inactive', { ordersPerHour });
  }

  if (fleetTalabat.noShowRiders > fleetNoShowAvg * 1.2 && fleetTalabat.noShowRiders > 5) {
    const recovery = round2(fleetTalabat.noShowRiders * avgHoursPerActiveRider);
    pushAction(actions, {
      id: 'fleet-noshow',
      priority: 'high',
      entityType: 'fleet',
      entityId: 'fleet',
      entityName: 'الأسطول',
      problemAr: `No Show أسطولي ${fleetTalabat.noShowRiders} طيار/يوم — مرتفع`,
      actionAr: 'تنبيه حضور على مستوى المناطق — مراجعة اليوم',
      whyAr: `معدل الغياب فوق الطبيعي — ${fleetTalabat.noShowRiders} طيار لا يعمل رغم التسجيل`,
      expectedRecoveryHours: recovery,
      expectedRecoveryOrders: ordersFromHours(recovery, ordersPerHour > 0 ? 1 / ordersPerHour : 0),
      riderCount: Math.round(fleetTalabat.noShowRiders),
      confidence: 'high',
      urgency: 'immediate',
      evidence: `fleetNoShow=${fleetTalabat.noShowRiders}`,
    }, 'fleet-noshow', { ordersPerHour });
  }

  return dedupeActions(actions);
}

function dedupeActions(actions: ManagementAction[]): ManagementAction[] {
  const seen = new Set<string>();
  return actions.filter((a) => {
    if (seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  });
}

export function rankActionsByImpact(actions: ManagementAction[]): ManagementAction[] {
  return [...actions].sort((a, b) => {
    const pDiff = priorityRank(b.priority) - priorityRank(a.priority);
    if (pDiff !== 0) return pDiff;
    return b.expectedRecoveryHours - a.expectedRecoveryHours;
  });
}
