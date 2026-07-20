/**
 * Data Quality Warning Banner
 * 
 * Displays critical data quality issues before KPI calculations
 * Implements SRS-001 Section 11, SRS-005 Section 9
 * 
 * @module DataQualityBanner
 */

import { DATA_QUALITY_THRESHOLDS } from '@/lib/strategicOps/config/businessRules';
import type { ValidationReport } from '@/lib/strategicOps/validators/dataValidator';
import type { GhostRiderAuditReport } from '@/lib/strategicOps/ghostRiderAudit';

type DataQualityBannerProps = {
  validationReport?: ValidationReport;
  ghostRiderAudit?: GhostRiderAuditReport;
  dataCoveragePercent?: number;
  missingDays?: string[];
};

export function DataQualityBanner({
  validationReport,
  ghostRiderAudit,
  dataCoveragePercent,
  missingDays = [],
}: DataQualityBannerProps) {
  // Determine if we should show banner
  const showBanner =
    validationReport && !validationReport.valid ||
    (ghostRiderAudit && ghostRiderAudit.ghostLeakagePercent > DATA_QUALITY_THRESHOLDS.MAX_GHOST_RIDER_PERCENT) ||
    (dataCoveragePercent !== undefined && dataCoveragePercent < DATA_QUALITY_THRESHOLDS.MIN_DATA_COVERAGE_PERCENT);

  if (!showBanner) {
    return null;
  }

  // Determine severity
  const isCritical =
    (validationReport && validationReport.qualityScore < 80) ||
    (ghostRiderAudit && ghostRiderAudit.ghostLeakagePercent > DATA_QUALITY_THRESHOLDS.MAX_GHOST_RIDER_PERCENT * 2) ||
    (dataCoveragePercent !== undefined && dataCoveragePercent < 80);

  const bgColor = isCritical
    ? 'bg-red-900/20 border-red-500'
    : 'bg-amber-900/20 border-amber-500';

  const icon = isCritical ? '🔴' : '⚠️';
  const title = isCritical ? 'تحذير حرج: جودة البيانات منخفضة' : 'تنبيه: مشاكل في جودة البيانات';

  return (
    <div className={`rounded-xl border-2 ${bgColor} p-6 mb-6`}>
      <div className="flex items-start gap-4">
        <span className="text-3xl">{icon}</span>
        <div className="flex-1">
          <h3 className="text-xl font-bold text-white mb-3">{title}</h3>
          
          {/* Validation Issues */}
          {validationReport && validationReport.issues.length > 0 && (
            <div className="mb-4">
              <p className="text-sm text-gray-300 mb-2">
                <strong>درجة جودة البيانات:</strong> {validationReport.qualityScore}/100
              </p>
              <div className="space-y-2">
                {validationReport.issues.slice(0, 5).map((issue, idx) => (
                  <div
                    key={idx}
                    className="rounded-lg bg-black/20 p-3 text-sm"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                        issue.severity === 'critical' ? 'bg-red-500 text-white' :
                        issue.severity === 'error' ? 'bg-orange-500 text-white' :
                        issue.severity === 'warning' ? 'bg-amber-500 text-white' :
                        'bg-blue-500 text-white'
                      }`}>
                        {issue.severity === 'critical' ? 'حرج' :
                         issue.severity === 'error' ? 'خطأ' :
                         issue.severity === 'warning' ? 'تحذير' : 'معلومات'}
                      </span>
                      <span className="text-gray-300 font-semibold">{issue.category}</span>
                    </div>
                    <p className="text-gray-200 mb-1">{issue.message}</p>
                    {issue.recommendation && (
                      <p className="text-cyan-300 text-xs mt-2">
                        💡 <strong>الحل:</strong> {issue.recommendation}
                      </p>
                    )}
                  </div>
                ))}
                {validationReport.issues.length > 5 && (
                  <p className="text-gray-400 text-sm">
                    ... و {validationReport.issues.length - 5} مشاكل أخرى
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Ghost Riders */}
          {ghostRiderAudit && ghostRiderAudit.totalGhostRiders > 0 && (
            <div className="mb-4">
              <div className="rounded-lg bg-black/20 p-3">
                <p className="text-white font-semibold mb-2">
                  👻 تم اكتشاف {ghostRiderAudit.totalGhostRiders} "طيار شبح" (Ghost Riders)
                </p>
                <p className="text-gray-300 text-sm mb-2">
                  نسبة التسريب: <strong className="text-red-300">{ghostRiderAudit.ghostLeakagePercent.toFixed(2)}%</strong>
                  {' '}من إجمالي الساعات المسجلة
                </p>
                <p className="text-gray-400 text-xs mb-3">
                  الطيارين الأشباح موجودون في Sheet "البيانات اليومية" لكن غير موجودين في Sheet "المناديب".
                  هذا يؤدي إلى أرقام غير دقيقة.
                </p>
                {ghostRiderAudit.riders.slice(0, 3).length > 0 && (
                  <div className="text-xs text-gray-400">
                    <strong>أمثلة:</strong>
                    {ghostRiderAudit.riders.slice(0, 3).map((rider, idx) => (
                      <div key={idx} className="ml-4">
                        • {rider.riderCode} ({rider.totalHours.toFixed(1)} ساعة)
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-cyan-300 text-xs mt-3">
                  💡 <strong>الحل:</strong> أضف هؤلاء الطيارين إلى Sheet "المناديب" أو احذف سجلاتهم من "البيانات اليومية"
                </p>
              </div>
            </div>
          )}

          {/* Data Coverage */}
          {dataCoveragePercent !== undefined && dataCoveragePercent < DATA_QUALITY_THRESHOLDS.MIN_DATA_COVERAGE_PERCENT && (
            <div className="mb-4">
              <div className="rounded-lg bg-black/20 p-3">
                <p className="text-white font-semibold mb-2">
                  📊 تغطية البيانات منخفضة: {dataCoveragePercent.toFixed(1)}%
                </p>
                <p className="text-gray-300 text-sm mb-2">
                  الحد الأدنى المطلوب: {DATA_QUALITY_THRESHOLDS.MIN_DATA_COVERAGE_PERCENT}%
                </p>
                {missingDays.length > 0 && (
                  <>
                    <p className="text-gray-400 text-xs mb-2">
                      أيام ناقصة: {missingDays.length} يوم
                    </p>
                    {missingDays.slice(0, 7).length > 0 && (
                      <div className="text-xs text-gray-400">
                        <strong>الأيام الناقصة:</strong>
                        <div className="ml-4 mt-1">
                          {missingDays.slice(0, 7).join(', ')}
                          {missingDays.length > 7 && ` ... و ${missingDays.length - 7} أيام أخرى`}
                        </div>
                      </div>
                    )}
                  </>
                )}
                <p className="text-cyan-300 text-xs mt-3">
                  💡 <strong>الحل:</strong> أكمل رفع البيانات اليومية للأيام الناقصة في Sheet "البيانات اليومية"
                </p>
              </div>
            </div>
          )}

          {/* Impact Warning */}
          {isCritical && (
            <div className="mt-4 pt-4 border-t border-white/10">
              <p className="text-red-300 font-semibold text-sm">
                ⚠️ تحذير: بسبب المشاكل المذكورة أعلاه، قد تكون بعض التحليلات والتوقعات غير دقيقة.
                يُنصح بحل هذه المشاكل قبل اتخاذ قرارات استراتيجية.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Data Quality Score Badge
 * Compact display for quality score in header
 */
export function DataQualityBadge({ score }: { score: number }) {
  const color =
    score >= 95 ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' :
    score >= 85 ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' :
    'bg-red-500/20 text-red-300 border-red-500/40';

  const icon = score >= 95 ? '✅' : score >= 85 ? '⚠️' : '🔴';

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-semibold ${color}`}>
      <span>{icon}</span>
      <span>جودة البيانات: {score}/100</span>
    </div>
  );
}

/**
 * Missing Days Alert (compact)
 */
export function MissingDaysAlert({ missingDays }: { missingDays: string[] }) {
  if (missingDays.length === 0) return null;

  return (
    <div className="rounded-lg bg-amber-900/20 border border-amber-500/40 p-3 text-sm">
      <div className="flex items-start gap-2">
        <span className="text-lg">📅</span>
        <div className="flex-1">
          <p className="text-amber-200 font-semibold mb-1">
            بيانات ناقصة: {missingDays.length} يوم
          </p>
          <p className="text-gray-400 text-xs">
            الأيام: {missingDays.slice(0, 5).join(', ')}
            {missingDays.length > 5 && ` ... (${missingDays.length - 5} أيام أخرى)`}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Ghost Rider Count Badge (for header)
 */
export function GhostRiderBadge({ count }: { count: number }) {
  if (count === 0) return null;

  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-red-500/40 bg-red-500/20 text-red-300 text-sm font-semibold">
      <span>👻</span>
      <span>{count} Ghost Riders</span>
    </div>
  );
}
