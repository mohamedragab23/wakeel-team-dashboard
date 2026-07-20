/**
 * SRS-006 §10 — Cross Validation across operational sources.
 */

export type CrossValidationCheck = {
  id: string;
  sourceA: string;
  sourceB: string;
  metricAr: string;
  status: 'PASS' | 'WARN' | 'FAIL';
  detailAr: string;
  valueA?: number | string;
  valueB?: number | string;
};

export type CrossValidationReport = {
  generatedAt: string;
  passCount: number;
  warnCount: number;
  failCount: number;
  checks: CrossValidationCheck[];
};

function check(
  id: string,
  sourceA: string,
  sourceB: string,
  metricAr: string,
  a: number,
  b: number,
  tolPct = 5
): CrossValidationCheck {
  const diff = Math.abs(a - b);
  const base = Math.max(Math.abs(a), 1);
  const pct = (diff / base) * 100;
  const status = pct <= 1 ? 'PASS' : pct <= tolPct ? 'WARN' : 'FAIL';
  return {
    id,
    sourceA,
    sourceB,
    metricAr,
    status,
    valueA: a,
    valueB: b,
    detailAr: `فرق ${Math.round(pct * 100) / 100}% (تسامح ${tolPct}%)`,
  };
}

export function buildCrossValidationReport(input: {
  dailySheetActiveRiders: number;
  ridersSheetHeadcount: number;
  commentsCount?: number;
  hiringJoined?: number;
  executiveNewHires?: number;
  terminations?: number;
  executiveResignations?: number;
  targetFromSupervisors: number;
  targetFromFleet: number;
  ordersFromTrend: number;
  hoursFromFleet: number;
}): CrossValidationReport {
  const checks: CrossValidationCheck[] = [
    check(
      'hc-vs-active',
      'المناديب',
      'البيانات اليومية',
      'Headcount vs Active scale',
      input.ridersSheetHeadcount,
      Math.max(input.dailySheetActiveRiders, 1),
      80 // scale check — active << HC is normal; flag only extreme
    ),
    check(
      'target-align',
      'المشرفين',
      'Talabat Fleet',
      'Target Hours',
      input.targetFromSupervisors,
      input.targetFromFleet,
      2
    ),
    {
      id: 'orders-hours-coherence',
      sourceA: 'البيانات اليومية (طلبات)',
      sourceB: 'البيانات اليومية (ساعات)',
      metricAr: 'تماسك الطلبات/الساعات',
      status:
        input.hoursFromFleet > 0 && input.ordersFromTrend / input.hoursFromFleet < 10
          ? 'PASS'
          : 'WARN',
      valueA: input.ordersFromTrend,
      valueB: input.hoursFromFleet,
      detailAr: 'OPH خارج النطاق المتوقع' ,
    },
  ];

  if (input.hiringJoined != null && input.executiveNewHires != null) {
    checks.push(
      check(
        'hiring-align',
        'التوظيف',
        'الملخص التنفيذي',
        'New Hires',
        input.hiringJoined,
        input.executiveNewHires,
        15
      )
    );
  }

  if (input.terminations != null && input.executiveResignations != null) {
    checks.push(
      check(
        'term-align',
        'الإنهاء',
        'الملخص التنفيذي',
        'Resignations',
        input.terminations,
        input.executiveResignations,
        15
      )
    );
  }

  if (input.commentsCount != null) {
    checks.push({
      id: 'comments-presence',
      sourceA: 'التعليقات اليومية',
      sourceB: 'الفترة',
      metricAr: 'وجود تعليقات',
      status: input.commentsCount > 0 ? 'PASS' : 'WARN',
      valueA: input.commentsCount,
      detailAr:
        input.commentsCount > 0
          ? `${input.commentsCount} تعليق في الفترة`
          : 'لا تعليقات — تحقق من تكامل Daily Comments',
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    passCount: checks.filter((c) => c.status === 'PASS').length,
    warnCount: checks.filter((c) => c.status === 'WARN').length,
    failCount: checks.filter((c) => c.status === 'FAIL').length,
    checks,
  };
}
