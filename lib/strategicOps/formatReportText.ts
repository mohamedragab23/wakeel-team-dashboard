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
  add(`الفترة: ${report.meta.startDate} → ${report.meta.endDate} (${report.meta.periodDays} يوم)`);
  add(`الزون: ${report.meta.zone === 'all' ? 'كل الزونات' : report.meta.zone}`);
  add(`المشرف: ${report.meta.supervisorCode === 'all' ? 'كل المشرفين' : report.meta.supervisorCode}`);
  add();

  add('── ١. إجمالي الطيارين والنشاط ──');
  add(`إجمالي الطيارين المسجلين: ${es.totalRegisteredRiders}`);
  add(`المعيّنون للمشرفين: ${es.totalAssignedToSupervisors}`);
  add(`الطيارون النشطون (SUM ساعات > 0): ${es.activeRiders} (${es.activePercent}%)`);
  add(`الطيارون غير النشطين (ساعات=٠ وطلبات=٠): ${es.inactiveRiders} (${es.inactivePercent}%)`);
  add(`الطيارون الموقوفون (من شيت المناديب): ${es.suspendedRiders}`);
  add(`عدد الإقالات المعتمدة: ${es.approvedResignations}`);
  add(`معدل الاستغلال: ${es.utilizationRate}%`);
  add();

  add('── ٢. الساعات ──');
  add(`إجمالي الساعات: ${ha.totalHours}`);
  add(`متوسط الساعات اليومية: ${ha.averageDailyHours}`);
  add(`متوسط الساعات لكل طيار: ${ha.averageHoursPerRider}`);
  add(`متوسط الساعات لكل طيار نشط: ${ha.averageHoursPerActiveRider}`);
  add(`أعلى يوم: ${ha.highestDay?.date ?? '—'} (${ha.highestDay?.hours ?? 0} ساعة)`);
  add(`أدنى يوم: ${ha.lowestDay?.date ?? '—'} (${ha.lowestDay?.hours ?? 0} ساعة)`);
  add();

  add('── ٣. توزيع الساعات ──');
  for (const b of report.activityDistribution.buckets) {
    add(`${b.label}: ${b.count} طيار (${b.percent}%) — مساهمة ${b.hoursContribution} ساعة`);
  }
  add();

  add('── ٤. أداء المشرفين ──');
  for (const s of report.supervisorPerformance.rows) {
    add(
      `${s.name} (${s.code}): معيّنون=${s.assignedRiders}، نشطون=${s.activeRiders}، غير نشطين=${s.inactiveRiders}، ` +
        `ساعات=${s.totalHours}، حضور=${s.attendancePercent}%، هدف=${s.targetAchievementPercent}%، إنتاجية=${s.productivityScore}، إقالات=${s.resignations}`
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
  add(`الساعات المحتملة: ${lh.potentialHours}`);
  add(`الساعات الفعلية: ${lh.actualHours}`);
  add(`الساعات المهدرة: ${lh.lostHours} (${lh.lostPercent}%)`);
  for (const b of lh.breakdown) {
    add(`  ${b.category}: ${b.hours} ساعة (${b.percent}%) — ${b.riderCount} طيار/إقالة`);
  }
  add();

  add('── ٦. تحليل التسرب ──');
  add(`عدد الإقالات المعتمدة: ${report.attrition.approvedResignations}`);
  add(`نسبة التسرب: ${report.attrition.attritionRate}%`);
  add(`متوسط التسرب الشهري: ${report.attrition.monthlyAttritionRate}%`);
  add(`متوسط الطيارين النشطين يومياً: ${report.attrition.averageActiveRidersDuringPeriod}`);
  add(`متوسط عمر الطيار (أيام): ${report.attrition.averageRiderLifetimeDays}`);
  add('أكثر المشرفين فقداناً للطيارين:');
  report.attrition.topSupervisorsLosingRiders.forEach((s, i) => add(`  ${i + 1}. ${s.name}: ${s.count}`));
  add();

  add('── ٧. فرص النمو ──');
  for (const sc of report.growthOpportunities.scenarios) {
    add(`${sc.label}: +${sc.additionalHoursGain} ساعة → إجمالي متوقع ${sc.expectedTotalHours} (${sc.affectedRiders} طيار)`);
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

  add('── ٩. درجة صحة التشغيل ──');
  add(`الدرجة: ${oh.score}/100 — ${oh.levelLabelAr}`);
  add(`  الاستغلال: ${oh.components.utilization} | عكس التسرب: ${oh.components.attritionInverse} | النشاط: ${oh.components.activePercent}`);
  add(`  الساعات/طيار: ${oh.components.hoursPerRider} | التعيين: ${oh.components.recruitment}`);
  add();

  add('── ١٠. أعلى/أدنى الطيارين ──');
  add('أعلى ٢٠ بالساعات:');
  report.utilization.top20ByHours.forEach((r, i) => add(`  ${i + 1}. ${r.name} (${r.code}): ${r.hours}س، ${r.orders} طلب`));
  add('أدنى ٢٠ بالساعات:');
  report.utilization.bottom20ByHours.forEach((r, i) => add(`  ${i + 1}. ${r.name} (${r.code}): ${r.hours}س`));
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
  add('═══════════════════════════════════════════════════════════');
  add('نهاية التقرير');
  add('═══════════════════════════════════════════════════════════');

  return lines.join('\n');
}
