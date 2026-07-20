/**
 * Executive Health Banner Component
 * 
 * Displays overall operations health with score, status, and critical alerts.
 * Implements SRS-002 Section 1: Executive Health Banner.
 * 
 * @module ExecutiveHealthBanner
 * @version 1.0
 */

import type { KPIEngineOutput } from '@/lib/strategicOps/kpi';
import { DataQualityBadge, GhostRiderBadge, MissingDaysAlert } from './DataQualityBanner';

type ExecutiveHealthBannerProps = {
  kpis: KPIEngineOutput;
  dataQualityScore?: number;
  ghostRiderCount?: number;
  missingDays?: string[];
};

/**
 * Calculate operations health score
 * Based on key performance indicators
 */
function calculateOperationsHealthScore(kpis: KPIEngineOutput): number {
  const weights = {
    hoursAchievement: 0.25,       // 25%
    dailyActiveRate: 0.20,        // 20%
    ordersPerHour: 0.15,          // 15%
    attendancePercent: 0.15,      // 15%
    dataQuality: 0.10,            // 10%
    capacityUtilization: 0.10,    // 10%
    lostPercent: 0.05,            // 5%
  };
  
  // Normalize each metric to 0-100 scale
  const hoursAchievementScore = Math.min(kpis.hours.hoursAchievement.value.current, 100);
  const dailyActiveRateScore = Math.min(kpis.headcount.dailyActiveRate.value.current, 100);
  const ordersPerHourScore = Math.min((kpis.orders.ordersPerHour.value.current / 3.0) * 100, 100); // 3.0 = excellent
  const attendanceScore = kpis.attendance.attendancePercent.value.current;
  const dataQualityScore = kpis.dataQuality.overallQualityScore.value.current;
  const capacityScore = Math.min(kpis.headcount.capacityUtilization.value.current, 100);
  const lostScore = Math.max(100 - kpis.lostHours.lostPercent.value.current, 0);
  
  const totalScore = 
    hoursAchievementScore * weights.hoursAchievement +
    dailyActiveRateScore * weights.dailyActiveRate +
    ordersPerHourScore * weights.ordersPerHour +
    attendanceScore * weights.attendancePercent +
    dataQualityScore * weights.dataQuality +
    capacityScore * weights.capacityUtilization +
    lostScore * weights.lostPercent;
  
  return Math.round(totalScore);
}

/**
 * Get health status label and color
 */
function getHealthStatus(score: number): {
  label: string;
  labelAr: string;
  color: string;
  bgColor: string;
  borderColor: string;
} {
  if (score >= 90) {
    return {
      label: 'Excellent',
      labelAr: 'ممتاز',
      color: 'text-emerald-300',
      bgColor: 'bg-emerald-500/10',
      borderColor: 'border-emerald-500/40',
    };
  } else if (score >= 80) {
    return {
      label: 'Good',
      labelAr: 'جيد',
      color: 'text-green-300',
      bgColor: 'bg-green-500/10',
      borderColor: 'border-green-500/40',
    };
  } else if (score >= 70) {
    return {
      label: 'Fair',
      labelAr: 'مقبول',
      color: 'text-amber-300',
      bgColor: 'bg-amber-500/10',
      borderColor: 'border-amber-500/40',
    };
  } else if (score >= 60) {
    return {
      label: 'Warning',
      labelAr: 'تحذير',
      color: 'text-orange-300',
      bgColor: 'bg-orange-500/10',
      borderColor: 'border-orange-500/40',
    };
  } else {
    return {
      label: 'Critical',
      labelAr: 'حرج',
      color: 'text-red-300',
      bgColor: 'bg-red-500/10',
      borderColor: 'border-red-500/40',
    };
  }
}

/**
 * Detect critical alerts
 */
function detectCriticalAlerts(kpis: KPIEngineOutput): Array<{
  severity: 'critical' | 'warning';
  messageAr: string;
  messageEn: string;
}> {
  const alerts: Array<{
    severity: 'critical' | 'warning';
    messageAr: string;
    messageEn: string;
  }> = [];
  
  // Hours Achievement < 85%
  if (kpis.hours.hoursAchievement.value.current < 85) {
    alerts.push({
      severity: 'critical',
      messageAr: `نسبة تحقيق الساعات منخفضة جداً: ${kpis.hours.hoursAchievement.value.current.toFixed(1)}%`,
      messageEn: `Hours achievement critically low: ${kpis.hours.hoursAchievement.value.current.toFixed(1)}%`,
    });
  }
  
  // Daily Active Rate < 70%
  if (kpis.headcount.dailyActiveRate.value.current < 70) {
    alerts.push({
      severity: 'critical',
      messageAr: `معدل النشاط اليومي منخفض جداً: ${kpis.headcount.dailyActiveRate.value.current.toFixed(1)}%`,
      messageEn: `Daily active rate critically low: ${kpis.headcount.dailyActiveRate.value.current.toFixed(1)}%`,
    });
  }
  
  // Orders Per Hour < 2.0
  if (kpis.orders.ordersPerHour.value.current < 2.0) {
    alerts.push({
      severity: 'warning',
      messageAr: `الإنتاجية منخفضة: ${kpis.orders.ordersPerHour.value.current.toFixed(2)} أوردر/ساعة`,
      messageEn: `Low productivity: ${kpis.orders.ordersPerHour.value.current.toFixed(2)} orders/hour`,
    });
  }
  
  // Attendance < 85%
  if (kpis.attendance.attendancePercent.value.current < 85) {
    alerts.push({
      severity: 'warning',
      messageAr: `نسبة الحضور منخفضة: ${kpis.attendance.attendancePercent.value.current.toFixed(1)}%`,
      messageEn: `Low attendance: ${kpis.attendance.attendancePercent.value.current.toFixed(1)}%`,
    });
  }
  
  // Data Quality < 90
  if (kpis.dataQuality.overallQualityScore.value.current < 90) {
    alerts.push({
      severity: 'warning',
      messageAr: `جودة البيانات منخفضة: ${kpis.dataQuality.overallQualityScore.value.current}/100`,
      messageEn: `Low data quality: ${kpis.dataQuality.overallQualityScore.value.current}/100`,
    });
  }
  
  // Ghost Riders > 5
  if (kpis.dataQuality.ghostRidersCount.value.current > 5) {
    alerts.push({
      severity: 'warning',
      messageAr: `عدد كبير من الطيارين الأشباح: ${kpis.dataQuality.ghostRidersCount.value.current}`,
      messageEn: `High ghost rider count: ${kpis.dataQuality.ghostRidersCount.value.current}`,
    });
  }
  
  return alerts;
}

export function ExecutiveHealthBanner({ 
  kpis,
  dataQualityScore,
  ghostRiderCount,
  missingDays = [],
}: ExecutiveHealthBannerProps) {
  const healthScore = calculateOperationsHealthScore(kpis);
  const status = getHealthStatus(healthScore);
  const alerts = detectCriticalAlerts(kpis);
  const criticalAlerts = alerts.filter(a => a.severity === 'critical');
  const warningAlerts = alerts.filter(a => a.severity === 'warning');
  
  return (
    <div className={`rounded-2xl border ${status.borderColor} ${status.bgColor} p-6 mb-6`}>
      {/* Header Row */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
        {/* Health Score */}
        <div>
          <p className="text-xs text-gray-400 mb-1">مركز العمليات الاستراتيجي — الوضع الراهن</p>
          <div className="flex items-baseline gap-2">
            <span className={`text-5xl font-bold ${status.color}`}>{healthScore}</span>
            <span className="text-lg text-gray-500">/100</span>
            <span className="text-2xl font-semibold text-white mr-2">{status.labelAr}</span>
          </div>
          <p className="text-xs text-gray-400 mt-1">{status.label}</p>
        </div>
        
        {/* Badges */}
        <div className="flex flex-wrap gap-2 items-center">
          {dataQualityScore !== undefined && (
            <DataQualityBadge score={dataQualityScore} />
          )}
          {ghostRiderCount !== undefined && ghostRiderCount > 0 && (
            <GhostRiderBadge count={ghostRiderCount} />
          )}
        </div>
      </div>
      
      {/* Key Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-4">
        <MetricBadge
          label="تحقيق الساعات"
          value={`${kpis.hours.hoursAchievement.value.current.toFixed(1)}%`}
          trend={kpis.hours.hoursAchievement.value.trendArrow}
          healthy={kpis.hours.hoursAchievement.value.current >= 95}
        />
        <MetricBadge
          label="معدل النشاط"
          value={`${kpis.headcount.dailyActiveRate.value.current.toFixed(1)}%`}
          trend={kpis.headcount.dailyActiveRate.value.trendArrow}
          healthy={kpis.headcount.dailyActiveRate.value.current >= 85}
        />
        <MetricBadge
          label="أوردر/ساعة"
          value={kpis.orders.ordersPerHour.value.current.toFixed(2)}
          trend={kpis.orders.ordersPerHour.value.trendArrow}
          healthy={kpis.orders.ordersPerHour.value.current >= 2.5}
        />
        <MetricBadge
          label="الحضور"
          value={`${kpis.attendance.attendancePercent.value.current.toFixed(1)}%`}
          trend={kpis.attendance.attendancePercent.value.trendArrow}
          healthy={kpis.attendance.attendancePercent.value.current >= 92}
        />
        <MetricBadge
          label="طيارين عاملين"
          value={kpis.headcount.workingRiders.value.current.toString()}
          trend={kpis.headcount.workingRiders.value.trendArrow}
          healthy={true}
        />
        <MetricBadge
          label="إجمالي ساعات"
          value={kpis.hours.totalWorkingHours.value.current.toLocaleString()}
          trend={kpis.hours.totalWorkingHours.value.trendArrow}
          healthy={true}
        />
        <MetricBadge
          label="إجمالي أوردرات"
          value={kpis.orders.totalOrders.value.current.toLocaleString()}
          trend={kpis.orders.totalOrders.value.trendArrow}
          healthy={true}
        />
      </div>
      
      {/* Critical Alerts */}
      {criticalAlerts.length > 0 && (
        <div className="mb-3">
          <div className="rounded-lg bg-red-500/20 border border-red-500/40 p-3">
            <p className="text-sm font-semibold text-red-300 mb-2">
              🔴 تنبيهات حرجة ({criticalAlerts.length})
            </p>
            <div className="space-y-1">
              {criticalAlerts.map((alert, idx) => (
                <p key={idx} className="text-xs text-red-200">
                  • {alert.messageAr}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}
      
      {/* Warning Alerts */}
      {warningAlerts.length > 0 && (
        <div className="mb-3">
          <div className="rounded-lg bg-amber-500/20 border border-amber-500/40 p-3">
            <p className="text-sm font-semibold text-amber-300 mb-2">
              ⚠️ تحذيرات ({warningAlerts.length})
            </p>
            <div className="space-y-1">
              {warningAlerts.slice(0, 3).map((alert, idx) => (
                <p key={idx} className="text-xs text-amber-200">
                  • {alert.messageAr}
                </p>
              ))}
              {warningAlerts.length > 3 && (
                <p className="text-xs text-amber-300">
                  ... و {warningAlerts.length - 3} تحذيرات أخرى
                </p>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* Missing Days Alert */}
      {missingDays.length > 0 && (
        <MissingDaysAlert missingDays={missingDays} />
      )}
      
      {/* Timestamp */}
      <div className="mt-4 pt-3 border-t border-white/10">
        <p className="text-xs text-gray-500">
          آخر تحديث: {kpis.calculatedAt.toLocaleString('ar-EG', { 
            dateStyle: 'medium', 
            timeStyle: 'short' 
          })}
        </p>
      </div>
    </div>
  );
}

/**
 * Metric Badge Component
 */
function MetricBadge({ 
  label, 
  value, 
  trend, 
  healthy 
}: { 
  label: string; 
  value: string; 
  trend: string; 
  healthy: boolean;
}) {
  const bgColor = healthy ? 'bg-white/5' : 'bg-red-500/10';
  const borderColor = healthy ? 'border-white/10' : 'border-red-500/30';
  
  return (
    <div className={`rounded-lg border ${borderColor} ${bgColor} p-2 text-center`}>
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <div className="flex items-center justify-center gap-1">
        <p className="text-sm font-bold text-white">{value}</p>
        <span className="text-xs">{trend}</span>
      </div>
    </div>
  );
}
