import type { StrategicOpsReport } from '@/lib/strategicOps/buildReport';

export function formatStrategicOpsChatGptText(report: StrategicOpsReport): string {
  const lines: string[] = [];
  const add = (s = '') => lines.push(s);
  const es = report.executiveSummary;
  const ha = report.hoursAnalysis;
  const lh = report.lostHours;
  const oh = report.operationalHealth;
  const hr = report.hoursRoadmap;

  add('═══════════════════════════════════════════════════════════');
  add('مركز العمليات الاستراتيجي — تقرير تحليل تشغيلي كامل');
  add('للتحليل الاستراتيجي عبر ChatGPT');
  add('═══════════════════════════════════════════════════════════');
  add();
  add(`تاريخ الإنشاء: ${report.meta.generatedAt}`);
  add(`الفترة: ${report.meta.startDate} → ${report.meta.endDate} (${report.meta.periodDays} يوم تقويم، ${report.meta.validDaysInDataset} يوم بيانات صالحة)`);
  add(`العرض الافتراضي: ${report.meta.defaultMetricView === 'daily' ? 'قيم يومية مطبّعة' : report.meta.defaultMetricView} | هدف يومي: ${report.meta.dailyHoursTarget} | خط أساس: ${report.meta.dailyHoursBaseline}`);
  add(`الزون: ${report.meta.zone === 'all' ? 'كل الزونات' : report.meta.zone}`);
  add(`المشرف: ${report.meta.supervisorCode === 'all' ? 'كل المشرفين' : report.meta.supervisorCode}`);
  add();

  const to = report.talabatOperations;
  add('── Talabat Operations (مصدر الحقيقة) ──');
  add(`Headcount: ${to.headcount}`);
  add(`Active Riders (avg daily): ${to.activeRiders} | فريدون بالفترة: ${to.uniqueActiveRidersInPeriod}`);
  add(`No Show (avg daily): ${to.noShowRiders}`);
  add(`Actual Hours (avg daily): ${to.actualHours} | Target: ${to.targetHours}`);
  add(`Achievement: ${to.achievementPercent}% | Utilization: ${to.utilizationPercent}%`);
  add(`Avg Hours/Active Rider: ${to.avgHoursPerActiveRider}`);
  add(`Data coverage: ${report.sourceDataCoverage.coverage}%`);
  add();
  add('── TALABAT ACCURACY SCORE ──');
  add(`Overall: ${report.talabatAccuracyScore.overallAccuracyPercent ?? '—'}%`);
  report.talabatAccuracyScore.matches.forEach((m) =>
    add(`  ${m.kpiLabelAr}: dashboard=${m.dashboardValue} talabat=${m.talabatValue ?? '—'} match=${m.matchPercent ?? '—'}%`)
  );
  add();

  const dil = report.dataIntegrity;
  add('── ٠. تقرير سلامة البيانات (DIL) ──');
  add(`درجة الجودة: ${dil.dataQualityScore}/100 | بوابة KPI: ${dil.kpiQualityGatePassed ? 'مفتوحة' : 'مغلقة'}`);
  add(`تحذير: ${dil.warningMessage || 'لا يوجد'}`);
  add(`متوسط تشغيلي: ${dil.operationalAverageHoursPerDay} س/يوم (${dil.calendarPeriodDays} يوم تقويم)`);
  add(`متوسط تنفيذي: ${dil.executionAverageHoursPerDay} س/يوم (${dil.validDaysInDataset} يوم بيانات)`);
  add(`صفوف: ${dil.totalRows} خام → ${dil.officialRows} رسمية + ${dil.shadowRows} shadow`);
  add(`تكرارات: ${dil.deduplication.recordsRemoved} من ${dil.deduplication.duplicateGroupsCount} مجموعة`);
  add(`Ghost leakage: ${dil.ghostRiderLeakageHours} ساعة (${dil.ghostLeakagePercent}%) | ${dil.ghostRidersCount} طيار`);
  add(`${report.kpiTrust.labelAr}: ${report.kpiTrust.descriptionAr}`);
  add();
  add('── ٠ب. تدقيق Ghost Riders ──');
  add(`إجمالي Ghost: ${report.ghostRiderAudit.totalGhostRiders} | مستبعدون بالفلتر: ${report.ghostRiderAudit.totalScopeExcludedRiders}`);
  add(`Root cause: A=${report.ghostRiderAudit.rootCauseSummary.codeMismatchPercent}% B=${report.ghostRiderAudit.rootCauseSummary.missingMasterPercent}% C=${report.ghostRiderAudit.rootCauseSummary.normalizationFailedPercent}% D=${report.ghostRiderAudit.rootCauseSummary.zoneFilteringPercent}% E=${report.ghostRiderAudit.rootCauseSummary.supervisorMappingPercent}%`);
  report.ghostRiderAudit.riders.slice(0, 30).forEach((g) =>
    add(`  ${g.rawRiderCode} | ${g.riderName} | ${g.totalHours}س | ${g.category} | ${g.reasonAr}`)
  );
  add();
  add('── ٠ج. تدقيق تاريخ الانضمام ──');
  add(`تغطية: ${report.joinDateAudit.joinDateCoveragePercent}% | صالح: ${report.joinDateAudit.ridersWithValidJoinDate} | بدون: ${report.joinDateAudit.ridersWithoutJoinDate}`);
  add(`KPI عمر الطيار: ${report.joinDateAudit.riderLifetimeKpiEnabled ? 'مفعّل' : 'معطّل'}`);
  add();
  const cn = report.codeNormalizationAudit;
  const pn = report.postNormalizationValidation;
  add('── POST-NORMALIZATION VALIDATION REPORT ──');
  add(pn.proofStatementAr);
  add(`1 Ghost Before: ${pn.ghostBefore.ridersCount} riders | ${pn.ghostBefore.hours}س | ${pn.ghostBefore.orders} طلب | ${pn.ghostBefore.percent}%`);
  add(`2 Ghost After: ${pn.ghostAfter.ridersCount} riders | ${pn.ghostAfter.hours}س | ${pn.ghostAfter.orders} طلب | ${pn.ghostAfter.percent}%`);
  add(`3 Recovery: ${pn.recovery.riders} riders | ${pn.recovery.hours}س | ${pn.recovery.orders} طلب | تحسّن ${pn.recovery.improvementPercent}%`);
  add(`4 Fixed: Direct=${pn.rootCauseFixes.directMatch} Suffix=${pn.rootCauseFixes.suffixRemoval} Numeric=${pn.rootCauseFixes.numericExtraction} Manual=${pn.rootCauseFixes.manualReview}`);
  add(`5 Confidence: 100%=${pn.confidenceDistribution.counts.pct100} 95%=${pn.confidenceDistribution.counts.pct95} 90%=${pn.confidenceDistribution.counts.pct90} <90%=${pn.confidenceDistribution.counts.below90}`);
  add(`8 Conclusion: ${pn.executiveConclusion.primaryCauseAr} | تنسيق ${pn.executiveConclusion.codeFormattingProblemPercent}% | ناقص مناديب ${pn.executiveConclusion.missingRidersInMasterPercent}%`);
  add(`9 Trust Before: L${pn.trustImpact.before.trustLevel} | Score ${pn.trustImpact.before.executiveAccuracyScore} | Trust? ${pn.trustImpact.before.canTrustAnswerAr}`);
  add(`9 Trust After: L${pn.trustImpact.after.trustLevel} | Score ${pn.trustImpact.after.executiveAccuracyScore} | Trust? ${pn.trustImpact.after.canTrustAnswerAr}`);
  add();
  add('── Code Normalization (detail) ──');
  add(`  Ghost: ${cn.ghostLeakagePercentBefore}% → ${cn.ghostLeakagePercentAfter}% (تحسّن ${cn.improvementPercent}%)`);
  add(`  مسترد: ${cn.recoveredHours}س | ${cn.recoveredOrders} طلب | ${cn.recoveredRiders} طيار`);
  add(`  مطبّع: ${cn.codesNormalized} | مطابق: ${cn.codesMatched} | مراجعة: ${cn.codesManualReview}`);
  add();

  add('── ١. إجمالي الطيارين والنشاط (Talabat) ──');
  add(`Headcount: ${es.totalRegisteredRiders}`);
  add(`متوسط النشطين يومياً: ${es.activeRiders} | فريدون بالفترة: ${es.uniqueActiveRidersInPeriod}`);
  add(`No Show يومياً: ${es.noShowRiders}`);
  add(`تحقيق الهدف: ${es.achievementPercent}% | استغلال: ${es.utilizationRate}%`);
  add();

  add('── ٢. الساعات ──');
  add(`متوسط الساعات اليومية (الأسطول): ${ha.averageDailyHours}`);
  add(`إجمالي الساعات (الفترة): ${ha.totalHours} — يومي مطبّع: ${ha.totalHoursDual.daily}`);
  add(`متوسط الساعات/طيار/يوم: ${ha.averageHoursPerRiderDual.daily} (فترة: ${ha.averageHoursPerRider})`);
  add(`متوسط الساعات/طيار نشط/يوم: ${ha.averageHoursPerActiveRiderDual.daily} (فترة: ${ha.averageHoursPerActiveRider})`);
  add(`أعلى يوم: ${ha.highestDay?.date ?? '—'} (${ha.highestDay?.hours ?? 0} ساعة)`);
  add(`أدنى يوم: ${ha.lowestDay?.date ?? '—'} (${ha.lowestDay?.hours ?? 0} ساعة)`);
  add();

  add('── ٣. توزيع الساعات (متوسط يومي) ──');
  for (const b of report.activityDistribution.buckets) {
    add(`${b.label}: ${b.count} طيار (${b.percent}%) — متوسط يومي/طيار: ${b.avgDailyHoursPerRider} | فترة: ${b.hoursContribution} ساعة`);
  }
  add();

  add('── ٤. أداء المشرفين (يومي افتراضي) ──');
  for (const s of report.supervisorPerformance.rows) {
    add(
      `${s.name} (${s.code}): معيّنون=${s.assignedRiders}، نشطون=${s.activeRiders}، غير نشطين=${s.inactiveRiders}، ` +
        `س/يوم=${s.totalHoursDual.daily} (فترة=${s.totalHours})، متوسط س/ط/يوم=${s.avgHoursPerRiderDaily}، ` +
        `حضور=${s.attendancePercent}%، هدف=${s.targetAchievementPercent}%، إنتاجية=${s.productivityScore}، إقالات=${s.resignations}`
    );
  }
  if (report.supervisorPerformance.bestSupervisor) {
    add(`الأفضل: ${report.supervisorPerformance.bestSupervisor.name}`);
  }
  if (report.supervisorPerformance.worstSupervisor) {
    add(`الأضعف: ${report.supervisorPerformance.worstSupervisor.name}`);
  }
  add();

  add('── ٥. تحليل الساعات المهدرة ──');
  add(`الساعات المحتملة: ${lh.potentialHoursDual.daily} س/يوم (فترة: ${lh.potentialHours})`);
  add(`الساعات الفعلية: ${lh.actualHoursDual.daily} س/يوم (فترة: ${lh.actualHours})`);
  add(`الساعات المهدرة: ${lh.lostHoursDual.daily} س/يوم (${lh.lostPercent}%) — فترة: ${lh.lostHours}`);
  for (const b of lh.breakdown) {
    add(`  ${b.category}: ${b.hoursDual.daily} س/يوم (${b.percent}%) — فترة: ${b.hours}س — ${b.riderCount} طيار/إقالة`);
  }
  add();

  add('── ٦. تحليل التسرب ──');
  add(`عدد الإقالات المعتمدة: ${report.attrition.approvedResignations}`);
  add(`نسبة التسرب: ${report.attrition.attritionRate}%`);
  add(`متوسط التسرب الشهري: ${report.attrition.monthlyAttritionRate}%`);
  add(`متوسط الطيارين النشطين يومياً: ${report.attrition.averageActiveRidersDuringPeriod}`);
  add(`متوسط عمر الطيار (أيام): ${report.attrition.riderLifetimeKpiEnabled ? report.attrition.averageRiderLifetimeDays : 'معطّل — ' + (report.attrition.riderLifetimeDisabledReason ?? '')}`);
  add('أكثر المشرفين فقداناً للطيارين:');
  report.attrition.topSupervisorsLosingRiders.forEach((s, i) => add(`  ${i + 1}. ${s.name}: ${s.count}`));
  add();

  add('── ٧. فرص النمو ──');
  for (const sc of report.growthOpportunities.scenarios) {
    add(`${sc.label}: +${sc.additionalHoursGainDaily} س/يوم (فترة: +${sc.additionalHoursGain}س) → متوقع يومي ${sc.expectedTotalHoursDaily} (${sc.affectedRiders} طيار)`);
  }
  add();

  add('── ٧ب. مؤشرات النمو والتوسع ──');
  add(`هدف يومي: ${report.growthExpansion.dailyTargetHours} ساعة | المتوسط الحالي: ${report.growthExpansion.currentAverageDailyHours} ساعة/يوم`);
  for (const ind of report.growthExpansion.indicators) {
    add(`${ind.labelAr}: ${ind.displayValue}`);
    add(`  الصيغة: ${ind.formula}`);
    add(`  الحساب: ${ind.calculation}`);
  }
  add();

  add('── ٨. خارطة ٢٢٠٠ ساعة يومياً ──');
  add(`المتوسط اليومي الحالي: ${hr.currentDailyHours} | الهدف اليومي: ${hr.targetDailyHours} | الفجوة اليومية: ${hr.dailyGap}`);
  add(`طيارون إضافيون: ${hr.additionalActiveRidersNeeded} | ${hr.calculationTrace.additionalRidersCalculation}`);
  add(`تتبع: ${hr.calculationTrace.dailyGapCalculation}`);
  add(`مرجع الفترة: ${hr.currentPeriodHours} ساعة خلال ${hr.periodDays} يوم (لا يُقارن بالهدف اليومي)`);
  hr.roadmap.forEach((r) => add(`  • ${r}`));
  add();

  add('── ٨ب. مراجعة المعادلات التشغيلية ──');
  for (const row of report.operationalFormulaAudit.validationTable) {
    add(`${row.kpi}: ${row.result} [${row.status === 'valid' ? 'صالح' : 'تحذير'}]`);
    add(`  الصيغة: ${row.formula}`);
    add(`  البيانات: ${row.rawData}`);
    if (row.statusReason) add(`  ملاحظة: ${row.statusReason}`);
  }
  add(`شرح التسرب: ${report.operationalFormulaAudit.attrition.explanation}`);
  add();

  add('── ٧ج. ذكاء الحقيقة التشغيلية ──');
  const oti = report.operationalTruthIntelligence;
  oti.criticalAlerts.slice(0, 8).forEach((a) => add(`[${a.severity}] ${a.messageAr}`));
  oti.supervisorTruthIndex.slice(0, 10).forEach((s) =>
    add(`STI ${s.supervisorName}: ${s.stiScore} | ghost=${s.ghostDependencyRatio * 100}%`)
  );
  oti.operationalRiskPrediction.slice(0, 10).forEach((o) =>
    add(`ORPS ${o.supervisorName}: ${o.orpsScore} | ${o.primaryRiskDriver}`)
  );
  add();

  add('── ٩. درجة صحة التشغيل ──');
  add(`الدرجة: ${oh.score}/100 — ${oh.levelLabelAr}`);
  add(`  الاستغلال: ${oh.components.utilization} | عكس التسرب: ${oh.components.attritionInverse} | النشاط: ${oh.components.activePercent}`);
  add(`  الساعات/طيار: ${oh.components.hoursPerRider} | التعيين: ${oh.components.recruitment}`);
  add();

  add('── ١٠. أعلى/أدنى الطيارين (متوسط يومي) ──');
  add('أعلى ٢٠ بالمتوسط اليومي:');
  report.utilization.top20ByHours.forEach((r, i) => add(`  ${i + 1}. ${r.name} (${r.code}): ${r.avgDailyHours} س/يوم، ${r.avgDailyOrders} طلب/يوم [فترة: ${r.hours}س]`));
  add('أدنى ٢٠ بالمتوسط اليومي:');
  report.utilization.bottom20ByHours.forEach((r, i) => add(`  ${i + 1}. ${r.name} (${r.code}): ${r.avgDailyHours} س/يوم`));
  add();

  add('── ١١. مخاطر المشرفين ──');
  report.supervisorRisk.rows.slice(0, 10).forEach((s) => {
    add(`${s.name}: مخاطر ${s.riskScore}/100 [${s.riskLevel}] — ${s.factors.join('؛ ')}`);
  });
  add();

  add('── ١٢. رؤى الإدارة التشغيلية ──');
  const ai = report.aiInsights;
  add(`أكبر مشكلة: ${ai.biggestProblem}`);
  add(`سبب الساعات المهدرة: ${ai.lostHoursCause}`);
  add(`مشرف يحتاج تدخل: ${ai.supervisorNeedingIntervention}`);
  add(`طيارون غير مستغَلون: ${ai.underutilizedRiders}`);
  add(`تركيز هذا الأسبوع: ${ai.focusThisWeek}`);
  add(`تركيز هذا الشهر: ${ai.focusThisMonth}`);
  add(`أسرع مكاسب ساعات: ${ai.fastestHourGains}`);
  add();

  const fa = report.finalKpiAccuracyAudit;
  add('═══════════════════════════════════════════════════════════');
  add('FINAL KPI ACCURACY AUDIT');
  add('═══════════════════════════════════════════════════════════');
  add(`Executive Accuracy Score: ${fa.executiveAccuracyScore.score}/100 — ${fa.executiveAccuracyScore.gradeLabelAr}`);
  add(`CAN MANAGEMENT TRUST THIS REPORT? ${fa.managementTrust.answerAr}`);
  fa.managementTrust.reasons.forEach((r) => add(`  • ${r}`));
  add();
  add('1 Ghost Verification');
  add(`  Ghost: ${fa.ghostVerification.actualGhostRiders} | Mismatch: ${fa.ghostVerification.codeMismatchCount} | Missing master: ${fa.ghostVerification.missingFromMasterCount}`);
  add(`  Zone excluded: ${fa.ghostVerification.zoneFilterExcludedCount} | Supervisor excluded: ${fa.ghostVerification.supervisorFilterExcludedCount}`);
  add(`  Leakage: ${fa.ghostVerification.ghostLeakageHours}h / ${fa.ghostVerification.ghostLeakageOrders} orders (${fa.ghostVerification.ghostLeakagePercent}%)`);
  add();
  add('2 Join Date');
  add(`  Coverage: ${fa.joinDateValidation.joinDateCoveragePercent}% | Lifetime KPI: ${fa.joinDateValidation.lifetimeDisplayBlocked ? 'NULL' : 'enabled'}`);
  add();
  add('3 Active Riders');
  add(`  Unique: ${fa.activeRidersConsistency.uniqueActiveRidersInPeriod} | Avg daily: ${fa.activeRidersConsistency.averageDailyActiveRiders} | StdDev: ${fa.activeRidersConsistency.dailyActiveStdDev}`);
  add(`  ${fa.activeRidersConsistency.discrepancyExplanationAr}`);
  add();
  add('4 Roadmap');
  add(`  Gap: ${fa.roadmapValidation.dailyGap} | Riders: ${fa.roadmapValidation.additionalRidersNeeded} | ${fa.roadmapValidation.additionalRidersCalculation}`);
  add();
  add('5 KPI Trust');
  add(`  Level ${fa.kpiTrustVerification.trustLevel} | DQ ${fa.kpiTrustVerification.dataQualityScore} | Gate: ${fa.kpiTrustVerification.gateStatusAr}`);
  add();
  add('═══════════════════════════════════════════════════════════');
  add('نهاية التقرير');
  add('═══════════════════════════════════════════════════════════');

  return lines.join('\n');
}
