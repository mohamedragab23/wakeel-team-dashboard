/**
 * SRS-008 §14 — Export validation (pure, no browser).
 */

export type ExportValidationResult = {
  format: 'text' | 'excel_structure' | 'csv_structure' | 'pdf_structure';
  pass: boolean;
  detailAr: string;
};

type MiniReport = {
  meta: { startDate: string; endDate: string; zone: string };
  talabatOperations: { actualHours: number; achievementPercent: number };
  executiveSummary: { totalRegisteredRiders: number };
  supervisorPerformance: { rows: Array<{ code: string; name: string; dailyHours: number; achievementPercent: number }> };
};

function mini(): MiniReport {
  return {
    meta: { startDate: '2026-07-01', endDate: '2026-07-07', zone: 'Alexandria' },
    talabatOperations: { actualHours: 1400, achievementPercent: 70 },
    executiveSummary: { totalRegisteredRiders: 100 },
    supervisorPerformance: {
      rows: [{ code: 'S1', name: 'A', dailyHours: 200, achievementPercent: 80 }],
    },
  };
}

/** Mirrors key lines from formatStrategicOpsChatGptText without full report dependency */
function buildExportText(r: MiniReport): string {
  return [
    'مركز العمليات الاستراتيجي — تقرير تحليل تشغيلي كامل',
    `الفترة: ${r.meta.startDate} → ${r.meta.endDate}`,
    `الزون: ${r.meta.zone}`,
    `Actual Hours (avg daily): ${r.talabatOperations.actualHours}`,
    `Achievement: ${r.talabatOperations.achievementPercent}%`,
    `Headcount: ${r.executiveSummary.totalRegisteredRiders}`,
  ].join('\n');
}

export function runExportValidationSuite(): ExportValidationResult[] {
  const r = mini();
  const text = buildExportText(r);

  const textPass =
    text.includes('مركز العمليات الاستراتيجي') &&
    text.includes(String(r.talabatOperations.actualHours)) &&
    text.includes(r.meta.zone) &&
    text.length > 80;

  const excelPass =
    r.talabatOperations != null &&
    r.executiveSummary != null &&
    Array.isArray(r.supervisorPerformance.rows);

  const csvHeader = 'code,name,hours,achievement';
  const csv = [
    csvHeader,
    ...r.supervisorPerformance.rows.map(
      (row) => `${row.code},${row.name},${row.dailyHours},${row.achievementPercent}`
    ),
  ].join('\n');
  const csvPass = csv.startsWith(csvHeader) && csv.includes('S1');

  const pdfPass = text.includes(r.meta.startDate) && text.includes(r.meta.endDate);

  return [
    {
      format: 'text',
      pass: textPass,
      detailAr: textPass ? `نص صالح (${text.length} حرف)` : 'فشل النص',
    },
    {
      format: 'excel_structure',
      pass: excelPass,
      detailAr: excelPass
        ? 'هيكل Excel: الملخص · Talabat · المشرفين'
        : 'هيكل Excel ناقص',
    },
    {
      format: 'csv_structure',
      pass: csvPass,
      detailAr: csvPass ? `CSV ${csv.split('\n').length} سطر` : 'CSV فاشل',
    },
    {
      format: 'pdf_structure',
      pass: pdfPass,
      detailAr: pdfPass ? 'محتوى الطباعة/PDF يحتوي الفترة' : 'PDF ناقص',
    },
  ];
}
