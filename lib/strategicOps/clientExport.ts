import type { StrategicOpsReport } from '@/lib/strategicOps/buildReport';
import { formatStrategicOpsChatGptText } from '@/lib/strategicOps/formatReportText';
import { GHOST_CATEGORY_LABELS_AR } from '@/lib/strategicOps/ghostRiderAudit';
import { MATCH_METHOD_LABELS_AR } from '@/lib/strategicOps/codeNormalization';

export function exportStrategicOpsExcel(report: StrategicOpsReport): void {
  import('xlsx').then((XLSX) => {
    const wb = XLSX.utils.book_new();
    const es = report.executiveSummary;

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['مركز العمليات الاستراتيجي'],
        ['الفترة', `${report.meta.startDate} → ${report.meta.endDate}`],
        ['الزون', report.meta.zone],
        ['المشرف', report.meta.supervisorCode],
        [],
        ['المؤشر', 'القيمة'],
        ['إجمالي الطيارين المسجلين', es.totalRegisteredRiders],
        ['المعيّنون للمشرفين', es.totalAssignedToSupervisors],
        ['الطيارون النشطون', es.activeRiders],
        ['الطيارون غير النشطين', es.inactiveRiders],
        ['الطيارون الموقوفون', es.suspendedRiders],
        ['الإقالات المعتمدة', es.approvedResignations],
        ['انضمام جديد', es.newRidersJoined],
        ['معدل الاستغلال %', es.utilizationRate],
        ['نسبة التسرب %', es.attritionRate],
        ['متوسط التسرب الشهري %', es.monthlyAttritionRate],
        ['درجة صحة التشغيل', report.operationalHealth.score],
      ]),
      'الملخص التنفيذي'
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['تقرير سلامة البيانات'],
        ['درجة الجودة', report.dataIntegrity.dataQualityScore],
        ['متوسط تشغيلي س/يوم', report.dataIntegrity.operationalAverageHoursPerDay],
        ['متوسط تنفيذي س/يوم', report.dataIntegrity.executionAverageHoursPerDay],
        ['صفوف معالجة', report.dataIntegrity.totalRows],
        ['صفوف رسمية', report.dataIntegrity.officialRows],
        ['صفوف shadow', report.dataIntegrity.shadowRows],
        ['تكرارات محذوفة', report.dataIntegrity.deduplication.recordsRemoved],
        ['Ghost leakage ساعة', report.dataIntegrity.ghostRiderLeakageHours],
        ['Ghost leakage %', report.dataIntegrity.ghostLeakagePercent],
        ['اكتمال الأيام %', report.dataIntegrity.completenessPercentage],
        ['أيام ناقصة', report.dataIntegrity.missingDates.length],
        ['Ghost riders', report.dataIntegrity.ghostRidersCount],
        ['غير معيّنين', report.dataIntegrity.unassignedRiderCount],
        ['أيام بيانات صالحة', report.meta.validDaysInDataset],
        ['أيام تقويم', report.meta.periodDays],
      ]),
      'سلامة البيانات'
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        report.ghostRiderAudit.riders.map((g) => ({
          الكود_الخام: g.rawRiderCode,
          الكود_المطبّع: g.riderCode,
          الاسم: g.riderName,
          المشرف: g.supervisorName,
          كود_المشرف: g.supervisorCode,
          ساعات: g.totalHours,
          طلبات: g.totalOrders,
          أيام_عمل: g.workDays,
          التصنيف: g.category,
          التصنيف_عربي: GHOST_CATEGORY_LABELS_AR[g.category],
          السبب: g.reasonAr,
          كود_المناديب_إن_وُجد: g.masterCodeIfFound ?? '',
        }))
      ),
      'تدقيق Ghost Riders'
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['ملخص Ghost Root Cause'],
        ['إجمالي Ghost', report.ghostRiderAudit.totalGhostRiders],
        ['مستبعدون بالفلتر', report.ghostRiderAudit.totalScopeExcludedRiders],
        ['A عدم تطابق %', report.ghostRiderAudit.rootCauseSummary.codeMismatchPercent],
        ['B غائب من المناديب %', report.ghostRiderAudit.rootCauseSummary.missingMasterPercent],
        ['C فشل تطبيع %', report.ghostRiderAudit.rootCauseSummary.normalizationFailedPercent],
        ['D فلتر زون %', report.ghostRiderAudit.rootCauseSummary.zoneFilteringPercent],
        ['E ربط مشرف %', report.ghostRiderAudit.rootCauseSummary.supervisorMappingPercent],
      ]),
      'Ghost Root Cause'
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        report.joinDateAudit.riders.map((r) => ({
          الكود: r.riderCode,
          الاسم: r.name,
          تاريخ_الانضمام: r.joinDate ?? '',
          المشرف: r.supervisorCode,
          صالح: r.hasValidJoinDate ? 'نعم' : 'لا',
        }))
      ),
      'تدقيق تاريخ الانضمام'
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['مستوى ثقة المؤشرات'],
        ['المستوى', report.kpiTrust.level],
        ['الوصف', report.kpiTrust.labelAr],
        ['جودة البيانات', report.kpiTrust.dataQualityScore],
        ['تسرب Ghost %', report.kpiTrust.ghostLeakagePercent],
        ['ثقة كاملة', report.kpiTrust.fullStrategicKpis ? 'نعم' : 'لا'],
        ['تعطيل STI/ORPS', report.kpiTrust.disableStiOrpsGrowthRoadmap ? 'نعم' : 'لا'],
      ]),
      'ثقة المؤشرات'
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['تتبع خارطة 2200'],
        ['الفجوة اليومية', report.hoursRoadmap.dailyGap],
        ['طيارون إضافيون', report.hoursRoadmap.additionalActiveRidersNeeded],
        ['متوسط نشط يومياً', report.hoursRoadmap.calculationTrace.avgDailyHoursPerActiveRider],
        ['الصيغة', report.hoursRoadmap.calculationTrace.formula],
        ['حساب الفجوة', report.hoursRoadmap.calculationTrace.dailyGapCalculation],
        ['حساب الطيارين', report.hoursRoadmap.calculationTrace.additionalRidersCalculation],
      ]),
      'تتبع 2200'
    );

    const cn = report.codeNormalizationAudit;
    const pn = report.postNormalizationValidation;
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['POST-NORMALIZATION VALIDATION REPORT'],
        ['Generated', pn.generatedAt],
        ['Proof', pn.proofStatementAr],
        [],
        ['1 Ghost Before'],
        ['Riders', pn.ghostBefore.ridersCount],
        ['Hours', pn.ghostBefore.hours],
        ['Orders', pn.ghostBefore.orders],
        ['Percent', pn.ghostBefore.percent],
        [],
        ['2 Ghost After'],
        ['Riders', pn.ghostAfter.ridersCount],
        ['Hours', pn.ghostAfter.hours],
        ['Orders', pn.ghostAfter.orders],
        ['Percent', pn.ghostAfter.percent],
        [],
        ['3 Recovery'],
        ['Riders', pn.recovery.riders],
        ['Hours', pn.recovery.hours],
        ['Orders', pn.recovery.orders],
        ['Improvement %', pn.recovery.improvementPercent],
        [],
        ['4 Root Cause Fixes'],
        ['Direct Match', pn.rootCauseFixes.directMatch],
        ['Suffix Removal', pn.rootCauseFixes.suffixRemoval],
        ['Numeric Extraction', pn.rootCauseFixes.numericExtraction],
        ['Manual Review', pn.rootCauseFixes.manualReview],
        [],
        ['5 Confidence Distribution'],
        ['100%', pn.confidenceDistribution.pct100],
        ['95%', pn.confidenceDistribution.pct95],
        ['90%', pn.confidenceDistribution.pct90],
        ['<90%', pn.confidenceDistribution.below90],
        [],
        ['8 Executive Conclusion'],
        ['Primary Cause', pn.executiveConclusion.primaryCauseAr],
        ['Code Formatting %', pn.executiveConclusion.codeFormattingProblemPercent],
        ['Missing Master %', pn.executiveConclusion.missingRidersInMasterPercent],
        [],
        ['9 Trust Before'],
        ['Trust Level', pn.trustImpact.before.trustLevel],
        ['Accuracy Score', pn.trustImpact.before.executiveAccuracyScore],
        ['CAN TRUST?', pn.trustImpact.before.canTrustAnswerAr],
        [],
        ['9 Trust After'],
        ['Trust Level', pn.trustImpact.after.trustLevel],
        ['Accuracy Score', pn.trustImpact.after.executiveAccuracyScore],
        ['CAN TRUST?', pn.trustImpact.after.canTrustAnswerAr],
        ['Score Delta', pn.trustImpact.accuracyScoreDelta],
        ['Ghost Delta %', pn.trustImpact.ghostLeakageDelta],
      ]),
      'POST NORM VALIDATION'
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        pn.top50Recovered.map((r) => ({
          Original_Code: r.originalCode,
          Normalized_Code: r.normalizedCode,
          Hours_Recovered: r.hoursRecovered,
          Orders_Recovered: r.ordersRecovered,
          Confidence: r.confidence,
          Match_Method: r.matchMethod,
        }))
      ),
      'TOP 50 RECOVERED'
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        pn.remainingGhosts.riders.map((r) => ({
          Original_Code: r.originalCode,
          Legacy_Code: r.legacyCode,
          Effective_Code: r.effectiveCode,
          Hours: r.hours,
          Orders: r.orders,
          Reason: r.reasonAr,
        }))
      ),
      'REMAINING GHOSTS'
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['CODE NORMALIZATION AUDIT'],
        ['Pipeline', cn.pipelinePath],
        ['Codes Normalized', cn.codesNormalized],
        ['Codes Matched', cn.codesMatched],
        ['Codes Rejected', cn.codesRejected],
        ['Manual Review', cn.codesManualReview],
        [],
        ['Ghost Before %', cn.ghostLeakagePercentBefore],
        ['Ghost After %', cn.ghostLeakagePercentAfter],
        ['Improvement %', cn.improvementPercent],
        ['Recovered Hours', cn.recoveredHours],
        ['Recovered Orders', cn.recoveredOrders],
        ['Recovered Riders', cn.recoveredRiders],
      ]),
      'CODE NORMALIZATION AUDIT'
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        cn.entries.map((e) => ({
          Original_Code: e.originalCode,
          Legacy_Normalized: e.legacyNormalizedCode,
          Normalized_Code: e.normalizedCode,
          Effective_Code: e.effectiveCode,
          Match_Method: MATCH_METHOD_LABELS_AR[e.matchMethod],
          Confidence: e.confidence,
          Matched: e.matched ? 'yes' : 'no',
          Manual_Review: e.manualReviewRequired ? 'yes' : 'no',
          Rider_Name: e.matchedRiderName ?? '',
          Supervisor: e.matchedSupervisorName ?? '',
          Master_Code: e.matchedMasterCode ?? '',
          Hours: e.totalHours,
          Orders: e.totalOrders,
          Rows: e.rowCount,
          Rejection_Reason: e.rejectionReason ?? '',
        }))
      ),
      'CODE NORM DETAIL'
    );

    const fa = report.finalKpiAccuracyAudit;
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['FINAL KPI ACCURACY AUDIT'],
        ['Executive Accuracy Score', fa.executiveAccuracyScore.score],
        ['Grade', fa.executiveAccuracyScore.gradeLabelAr],
        ['CAN MANAGEMENT TRUST?', fa.managementTrust.answerAr],
        [],
        ['Ghost Verification'],
        ['Actual Ghost Riders', fa.ghostVerification.actualGhostRiders],
        ['Code Mismatch', fa.ghostVerification.codeMismatchCount],
        ['Missing From Master', fa.ghostVerification.missingFromMasterCount],
        ['Zone Filter Excluded', fa.ghostVerification.zoneFilterExcludedCount],
        ['Supervisor Filter Excluded', fa.ghostVerification.supervisorFilterExcludedCount],
        ['Ghost Leakage Hours', fa.ghostVerification.ghostLeakageHours],
        ['Ghost Leakage Orders', fa.ghostVerification.ghostLeakageOrders],
        ['Ghost Leakage %', fa.ghostVerification.ghostLeakagePercent],
        [],
        ['Join Date Coverage %', fa.joinDateValidation.joinDateCoveragePercent],
        ['Valid Join Dates', fa.joinDateValidation.validJoinDates],
        ['Missing Join Dates', fa.joinDateValidation.missingJoinDates],
        ['Rider Lifetime KPI', fa.joinDateValidation.lifetimeDisplayBlocked ? 'NULL' : 'enabled'],
        [],
        ['Unique Active Riders', fa.activeRidersConsistency.uniqueActiveRidersInPeriod],
        ['Avg Daily Active', fa.activeRidersConsistency.averageDailyActiveRiders],
        ['Daily Active Min', fa.activeRidersConsistency.dailyActiveMin],
        ['Daily Active Max', fa.activeRidersConsistency.dailyActiveMax],
        ['Daily Active StdDev', fa.activeRidersConsistency.dailyActiveStdDev],
        [],
        ['Roadmap Daily Gap', fa.roadmapValidation.dailyGap],
        ['Additional Riders', fa.roadmapValidation.additionalRidersNeeded],
        ['Zero Validation', fa.roadmapValidation.zeroValidationPassed ? 'PASS' : 'FAIL'],
        [],
        ['Trust Level', fa.kpiTrustVerification.trustLevel],
        ['Data Quality', fa.kpiTrustVerification.dataQualityScore],
        ['Gate Status', fa.kpiTrustVerification.gateStatusAr],
        ...fa.managementTrust.reasons.map((r) => ['Trust Reason', r]),
      ]),
      'FINAL KPI AUDIT'
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        fa.ghostVerification.top100.map((g) => ({
          Code: g.code,
          Name: g.name,
          Hours: g.hours,
          Orders: g.orders,
          Root_Cause: g.rootCauseLabelAr,
        }))
      ),
      'FINAL Ghost Top100'
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        fa.kpiTrustVerification.kpiGates.map((g) => ({
          KPI: g.kpiAr,
          Enabled: g.enabled ? 'yes' : 'no',
          Reason: g.reasonAr,
        }))
      ),
      'FINAL KPI Gates'
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        report.operationalTruthIntelligence.supervisorTruthIndex.map((s) => ({
          المشرف: s.supervisorName,
          STI: s.stiScore,
          الترتيب: s.rank,
          تسرب_Ghost: s.ghostDependencyRatio,
          احتفاظ: s.retentionScore,
          المستوى: s.riskLevel,
        }))
      ),
      'ذكاء الحقيقة STI'
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        report.operationalTruthIntelligence.operationalRiskPrediction.map((o) => ({
          المشرف: o.supervisorName,
          ORPS: o.orpsScore,
          المستوى: o.riskLevel,
          السبب_الرئيسي: o.primaryRiskDriver,
        }))
      ),
      'توقع المخاطر ORPS'
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        report.activityDistribution.buckets.map((b) => ({
          الفئة: b.label,
          العدد: b.count,
          النسبة: b.percent,
          متوسط_يومي_للطيار: b.avgDailyHoursPerRider,
          ساعات_الفترة: b.hoursContribution,
        }))
      ),
      'توزيع النشاط'
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        report.lostHours.breakdown.map((b) => ({
          الفئة: b.category,
          مهدرة_يومياً: b.hoursDual.daily,
          مهدرة_الفترة: b.hours,
          النسبة: b.percent,
          العدد: b.riderCount,
        }))
      ),
      'الساعات المهدرة'
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        report.growthExpansion.indicators.map((ind) => ({
          المؤشر: ind.labelAr,
          القيمة: ind.displayValue,
          الصيغة: ind.formula,
          الحساب: ind.calculation,
        }))
      ),
      'مؤشرات النمو والتوسع'
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        report.supervisorPerformance.rows.map((s) => ({
          الكود: s.code,
          الاسم: s.name,
          معيّنون: s.assignedRiders,
          نشطون: s.activeRiders,
          غير_نشطين: s.inactiveRiders,
          ساعات_يومياً: s.totalHoursDual.daily,
          ساعات_الفترة: s.totalHours,
          متوسط_س_ط_يومياً: s.avgHoursPerRiderDaily,
          طلبات_يومياً: s.avgOrdersDaily,
          إقالات: s.resignations,
          إنتاجية: s.productivityScore,
        }))
      ),
      'المشرفون'
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        report.operationalFormulaAudit.validationTable.map((row) => ({
          المؤشر: row.kpi,
          الصيغة: row.formula,
          البيانات_الخام: row.rawData,
          النتيجة: row.result,
          الحالة: row.status === 'valid' ? 'صالح' : 'تحذير',
          ملاحظة: row.statusReason ?? '',
        }))
      ),
      'مراجعة المعادلات'
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        report.operationalFormulaAudit.approvedResignations.records.map((rec) => ({
          صف_الشيت: rec.sheetRow,
          كود_الطيار: rec.riderCode,
          الاسم: rec.riderName,
          المشرف: rec.supervisorCode,
          الحالة: rec.statusRaw,
          تاريخ_الموافقة: rec.approvalDate,
          مُحتسب: rec.included ? 'نعم' : 'لا',
          ملاحظة_التكرار: rec.dedupeNote ?? '',
        }))
      ),
      'تدقيق الإقالات'
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        report.dataValidation.map((d) => ({
          المؤشر: d.kpi,
          الشيت: d.sourceSheet,
          الأعمدة: d.columns,
          السجلات: d.recordsRead,
          الحساب: d.formula,
          النتيجة: d.result,
        }))
      ),
      'تدقيق البيانات'
    );

    XLSX.writeFile(wb, `strategic-ops-${report.meta.startDate}_${report.meta.endDate}.xlsx`);
  });
}

export function exportStrategicOpsPdf(report: StrategicOpsReport): void {
  const text = formatStrategicOpsChatGptText(report);
  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8"/>
  <title>مركز العمليات الاستراتيجي</title>
  <style>
    body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; padding: 32px; color: #111; line-height: 1.6; direction: rtl; }
    h1 { font-size: 20px; margin-bottom: 8px; }
    pre { white-space: pre-wrap; font-size: 11px; font-family: Consolas, monospace; text-align: right; }
    @media print { body { padding: 16px; } }
  </style>
</head>
<body>
  <h1>مركز العمليات الاستراتيجي</h1>
  <p>${report.meta.startDate} → ${report.meta.endDate}</p>
  <pre>${text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
</body>
</html>`;

  const w = window.open('', '_blank');
  if (!w) {
    alert('يرجى السماح بالنوافذ المنبثقة لتصدير PDF');
    return;
  }
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 500);
}

export async function copyStrategicOpsText(report: StrategicOpsReport): Promise<void> {
  await navigator.clipboard.writeText(formatStrategicOpsChatGptText(report));
}
