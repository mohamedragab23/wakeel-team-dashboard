import type { StrategicOpsReport } from '@/lib/strategicOps/buildReport';
import { formatStrategicOpsChatGptText } from '@/lib/strategicOps/formatReportText';

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
      XLSX.utils.json_to_sheet(
        report.activityDistribution.buckets.map((b) => ({
          الفئة: b.label,
          العدد: b.count,
          النسبة: b.percent,
          مساهمة_الساعات: b.hoursContribution,
        }))
      ),
      'توزيع النشاط'
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        report.lostHours.breakdown.map((b) => ({
          الفئة: b.category,
          ساعات_مهدرة: b.hours,
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
          ساعات: s.totalHours,
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
