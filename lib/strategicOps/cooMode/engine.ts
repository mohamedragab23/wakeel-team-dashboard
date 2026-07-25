/**
 * SRS-010/SRS-011 Part 9/10 — COO Mode.
 * Auto-answers a fixed executive question set (now exposed as a free-text
 * chat via keyword matching in the panel) using ONLY existing, already-
 * certified engines (Control Tower, SRS-006 root cause/decision confidence,
 * SRS-007 Digital Twin what-if simulation, SRS-011 Fleet Distribution).
 * Nothing here invents new math or free-text generation — it narrates
 * outputs of engines that already exist, and always discloses its source.
 */
import type { StrategicOpsReport } from '@/lib/strategicOps/buildReport';
import { buildExecutiveBrief } from '@/lib/strategicOps/executiveBrief';
import { buildDigitalTwinSnapshot } from '@/lib/strategicOps/digitalTwin/twinBuilder';
import { runSimulation } from '@/lib/strategicOps/digitalTwin/scenarioEngine';
import type { CooModeAnswer, CooModeReport } from './types';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function whatIfAnswerAr(
  label: string,
  hireRiders?: number,
  activeRidersDelta?: number,
  targetPercentChange?: number,
  report?: StrategicOpsReport
): { answerAr: string; confidencePercent: number } {
  if (!report) return { answerAr: 'غير متاح.', confidencePercent: 0 };
  try {
    const twin = buildDigitalTwinSnapshot(report, {
      startDate: report.meta.startDate,
      endDate: report.meta.endDate,
      zone: report.meta.zone,
      supervisorCode: report.meta.supervisorCode,
    });
    const result = runSimulation(twin, { hireRiders, activeRidersDelta, targetPercentChange });
    const d = result.impact.deltas;
    const fin = result.impact.financial;
    const dec = result.decision;
    const answerAr =
      `${label}: ساعات ${d.hours >= 0 ? '+' : ''}${d.hours}/يوم، إنجاز ${d.achievement >= 0 ? '+' : ''}${d.achievement} نقطة، ` +
      `ربح تقديري ${fin.profit} ${fin.currency} — القرار المقترح: ${dec.answerAr} (${dec.whyAr})`;
    return { answerAr, confidencePercent: dec.confidence };
  } catch {
    return { answerAr: 'بيانات الفترة الحالية غير كافية لمحاكاة هذا السيناريو.', confidencePercent: 0 };
  }
}

export function buildCooModeReport(report: StrategicOpsReport): CooModeReport {
  const brief = buildExecutiveBrief(report);
  const ct = report.controlTower;

  const answers: CooModeAnswer[] = [];

  answers.push({
    id: 'biggest_problem',
    questionAr: 'ما هي أكبر مشكلة تشغيلية؟',
    answerAr: brief.hasData ? brief.mainReasonAr : 'لا تتوفر بيانات كافية حاليًا لتحديد ذلك.',
    confidencePercent: brief.confidencePercent,
    kpiId: brief.kpiId,
    detailAr: brief.causeChainAr,
    sourceAr: 'Executive Brief Engine (Root Cause Explainability)',
    matchKeywords: ['أكبر مشكلة', 'أهم مشكلة', 'المشكلة الرئيسية', 'biggest problem', 'ما الخطأ'],
  });

  answers.push({
    id: 'what_today',
    questionAr: 'ما الذي يجب أن أفعله اليوم؟',
    answerAr: brief.hasData
      ? `${brief.topPriorityAr} — الموعد: ${brief.topPriorityDeadlineAr} — العائد المتوقع: ${brief.expectedGainAr}`
      : 'لا توجد أولوية محسوبة تلقائيًا بعد.',
    confidencePercent: brief.confidencePercent,
    kpiId: brief.kpiId,
    actionId: brief.actionId,
    sourceAr: 'Action Engine (executiveFocus) + Executive Brief',
    matchKeywords: ['ماذا أفعل', 'ماذا يجب أن أفعل', 'أفعل أولاً', 'what should i do', 'اليوم'],
  });

  const worstSup = ct?.supervisorIntelligence?.[0] ?? null;
  answers.push({
    id: 'supervisor_intervention',
    questionAr: 'أي مشرف يحتاج تدخل الآن؟',
    answerAr: worstSup
      ? `${worstSup.name} — يفقد ${worstSup.lostTargetHours} ساعة/يوم من الهدف (تحقيق ${worstSup.achievementPercent}%). ${worstSup.rootCauseAr}`
      : 'لا توجد بيانات كافية عن أداء المشرفين حاليًا.',
    confidencePercent: worstSup ? 80 : 0,
    kpiId: 'target_achievement',
    sourceAr: 'Supervisor Intelligence (Control Tower)',
    matchKeywords: ['مشرف', 'supervisor', 'تدخل', 'أي مشرف', 'سبب انخفاض الساعات'],
  });

  const contacts = ct?.dailyContactList?.slice(0, 5) ?? [];
  answers.push({
    id: 'riders_to_contact',
    questionAr: 'أي المناديب يجب الاتصال بهم اليوم؟',
    answerAr: contacts.length
      ? contacts.map((c) => `${c.name} (مشرف: ${c.supervisorName || '—'})`).join(' · ')
      : 'لا توجد قائمة اتصال حرجة محسوبة اليوم.',
    confidencePercent: contacts.length ? 75 : 0,
    kpiId: 'active_riders',
    detailAr: contacts.map(
      (c) => `${c.name}: متوقع استرداد ${c.expectedRecoveryHours} ساعة / ${c.expectedRecoveryOrders} طلب`
    ),
    sourceAr: 'Daily Contact List (Control Tower)',
    matchKeywords: ['اتصل', 'مناديب', 'riders', 'خمسة', 'أول خمسة', 'يحتاجون تدخل'],
  });

  answers.push({
    id: 'money_lost_today',
    questionAr: 'كم نخسر ماديًا اليوم؟',
    answerAr: brief.financialImpactAr,
    confidencePercent: brief.financialImpactEgp != null ? 65 : 0,
    kpiId: 'target_achievement',
    sourceAr: 'Executive Brief (Unit Economics config)',
    matchKeywords: ['خسارة', 'نخسر', 'مادي', 'فلوس', 'money', 'egp'],
  });

  const recoverableHours = ct?.executiveFocus?.length
    ? round2(ct.executiveFocus.reduce((s, a) => s + (a.deduplicatedRecoveryHours || 0), 0))
    : null;
  answers.push({
    id: 'hours_recoverable_today',
    questionAr: 'كم ساعة يمكن استردادها اليوم؟',
    answerAr:
      recoverableHours != null
        ? `~${recoverableHours} ساعة/يوم إذا نُفّذت كل الإجراءات المفتوحة في مركز الإجراءات الإدارية.`
        : 'غير متاح — لا توجد إجراءات مفتوحة محسوبة.',
    confidencePercent: recoverableHours != null ? 70 : 0,
    kpiId: 'target_achievement',
    sourceAr: 'Action Engine (executiveFocus deduplicated recovery)',
    matchKeywords: ['ساعة يمكن استردادها', 'استرداد', 'recoverable hours'],
  });

  const primaryCauseExpl = report.srs006?.rootCauseExplanations?.[0] ?? null;
  answers.push({
    id: 'blocking_target',
    questionAr: 'ما الذي يعيق تحقيق الهدف؟',
    answerAr: primaryCauseExpl
      ? `${primaryCauseExpl.whatHappenedAr} — ${primaryCauseExpl.whyAr}`
      : 'لا يوجد سبب جذري واضح محسوب بعد لهذه الفترة.',
    confidencePercent: primaryCauseExpl ? 75 : 0,
    kpiId: 'target_achievement',
    sourceAr: 'Root Cause Explainability Engine (SRS-006)',
    matchKeywords: ['لماذا لم نحقق الهدف', 'يعيق', 'ما سبب', 'لماذا انخفض', 'why did we miss'],
  });

  const hire20 = whatIfAnswerAr('لو وظفت 20 طيار', 20, undefined, undefined, report);
  answers.push({
    id: 'what_if_hire_20',
    questionAr: 'ماذا يحدث لو وظفت 20 طيار؟',
    answerAr: hire20.answerAr,
    confidencePercent: hire20.confidencePercent,
    kpiId: 'active_riders',
    sourceAr: 'Digital Twin Scenario Engine (SRS-007)',
    matchKeywords: ['وظفت', 'توظيف', '20 طيار', 'hire', 'recruit riders'],
  });

  const activate30 = whatIfAnswerAr('لو نشّطت 30 طيار غير نشط', undefined, 30, undefined, report);
  answers.push({
    id: 'what_if_activate_30',
    questionAr: 'ماذا يحدث لو نشّطت 30 طيار غير نشط؟',
    answerAr: activate30.answerAr,
    confidencePercent: activate30.confidencePercent,
    kpiId: 'active_riders',
    sourceAr: 'Digital Twin Scenario Engine (SRS-007)',
    matchKeywords: ['نشّطت', 'فعّلت', 'طيار إضافي', 'activate riders', '20 rider إضافيين', 'إضافيين'],
  });

  const targetChange = whatIfAnswerAr('لو غيّرت المستهدف +10%', undefined, undefined, 10, report);
  answers.push({
    id: 'what_if_target_change',
    questionAr: 'ماذا يحدث لو غيّرت المستهدف (+10% كمثال)؟',
    answerAr: targetChange.answerAr,
    confidencePercent: targetChange.confidencePercent,
    kpiId: 'target_achievement',
    sourceAr: 'Digital Twin Scenario Engine (SRS-007)',
    matchKeywords: ['غيّرت المستهدف', 'target change', 'رفع المستهدف'],
  });

  const criticalAction = ct?.executiveFocus?.find((a) => a.priority === 'critical') ?? null;
  answers.push({
    id: 'biggest_risk',
    questionAr: 'ما هو أكبر خطر تشغيلي الآن؟',
    answerAr: criticalAction
      ? `${criticalAction.entityName}: ${criticalAction.problemAr}`
      : ct?.executiveHealth
        ? `مستوى الخطر العام: ${ct.executiveHealth.riskLevel} — ${ct.executiveHealth.situationSummaryAr}`
        : 'لا يوجد خطر حرج محدد حاليًا.',
    confidencePercent: criticalAction ? 85 : ct?.executiveHealth ? 60 : 0,
    kpiId: 'target_achievement',
    actionId: criticalAction?.id ?? null,
    sourceAr: 'Action Engine (executiveFocus) + Executive Health Summary',
    matchKeywords: ['أكبر خطر', 'خطر تشغيلي', 'biggest risk'],
  });

  answers.push({
    id: 'one_hour_today',
    questionAr: 'لو عندي ساعة واحدة فقط اليوم، أفعل ماذا؟',
    answerAr: brief.hasData
      ? `ركّز فقط على: ${brief.topPriorityAr} — هذا الإجراء الواحد يعطي أعلى استرداد لكل وحدة وقت اليوم (${brief.expectedGainAr}).`
      : 'لا توجد أولوية محسوبة بعد لتحديد أفضل استخدام لساعة واحدة.',
    confidencePercent: brief.confidencePercent,
    kpiId: brief.kpiId,
    actionId: brief.actionId,
    sourceAr: 'Executive Brief Engine',
    matchKeywords: ['ساعة واحدة', 'one hour', 'أفعل ماذا أولاً'],
  });

  // ── SRS-011 Part 10 additions — fleet-hours + zone questions from Fleet Distribution ──
  const fleet = ct?.fleetDistribution ?? null;
  const under2 = fleet?.buckets.find((b) => b.id === 'under_2') ?? null;
  const under4 = fleet?.buckets.find((b) => b.id === 'under_4') ?? null;
  const belowFourRiders = [...(under2?.riders ?? []), ...(under4?.riders ?? [])];
  answers.push({
    id: 'riders_under_4h',
    questionAr: 'كم Rider أقل من 4 ساعات؟ من هم؟',
    answerAr: fleet
      ? `${belowFourRiders.length} طيار يعملون أقل من 4 ساعات/يوم (${under2?.count ?? 0} منهم أقل من 2 ساعة).`
      : 'توزيع الأسطول حسب الساعات غير متاح لهذه الفترة.',
    confidencePercent: fleet ? 90 : 0,
    kpiId: 'active_riders',
    detailAr: belowFourRiders
      .slice(0, 15)
      .map((r) => `${r.name} (${r.supervisorName || '—'}) — ${r.actualHoursDaily}س/يوم`),
    sourceAr: 'Fleet Distribution Intelligence (SRS-011 Part 4)',
    matchKeywords: ['أقل من 4 ساعات', 'rider أقل من', 'under 4 hours', 'من هم', 'كم rider'],
  });

  const regionMap = new Map<string, { totalLost: number; count: number }>();
  for (const s of ct?.supervisorIntelligence ?? []) {
    const region = s.region || 'غير محدد';
    const entry = regionMap.get(region) ?? { totalLost: 0, count: 0 };
    entry.totalLost += s.lostTargetHours;
    entry.count += 1;
    regionMap.set(region, entry);
  }
  const worstRegion = [...regionMap.entries()].sort((a, b) => b[1].totalLost - a[1].totalLost)[0] ?? null;
  answers.push({
    id: 'zone_needs_recruit',
    questionAr: 'أي Zone تحتاج Recruit؟',
    answerAr: worstRegion
      ? `منطقة "${worstRegion[0]}" — تفقد ${round2(worstRegion[1].totalLost)} ساعة/يوم مجمّعة عبر ${worstRegion[1].count} مشرف/مشرفين. راجع Recruitment Analysis لتحديد العدد المطلوب بدقة قبل اتخاذ قرار توظيف.`
      : 'لا توجد بيانات مناطق كافية لتحديد ذلك.',
    confidencePercent: worstRegion ? 70 : 0,
    kpiId: 'active_riders',
    sourceAr: 'Supervisor Intelligence grouped by region + Recruitment Analysis',
    matchKeywords: ['zone تحتاج', 'أي zone', 'أي منطقة', 'recruit', 'توظيف في منطقة'],
  });

  return {
    generatedAt: new Date().toISOString(),
    answers,
  };
}
