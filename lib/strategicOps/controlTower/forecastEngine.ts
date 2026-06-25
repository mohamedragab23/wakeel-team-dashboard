/**
 * Priority 5: Forecast Engine
 * Weighted linear trend projection for key operational metrics.
 * Uses last 14 days of actual data (combines lookback + current period).
 *
 * Method: Weighted least-squares linear regression
 * Weights: day 1 = 0.5, day 14 = 2.0 (recent days weighted more)
 * Forecast: day 7 and day 14 forward from last data point.
 */
import { normalizeRiderCodeForPerformance } from '@/lib/dataFilter';
import type {
  ControlTowerBuildContext,
  MetricForecast,
} from '@/lib/strategicOps/controlTower/types';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

type DailyPoint = { date: string; value: number };

/** Weighted linear regression. Returns { slope, intercept, rSquared }. */
function weightedLinearRegression(points: DailyPoint[]): {
  slope: number;
  intercept: number;
  rSquared: number;
} {
  const n = points.length;
  if (n < 3) return { slope: 0, intercept: points[n - 1]?.value ?? 0, rSquared: 0 };

  // Build time indices and weights
  const ts = points.map((_, i) => i + 1); // 1..n
  const ys = points.map((p) => p.value);
  // Weights: linearly from 0.5 (oldest) to 2.0 (newest)
  const ws = ts.map((t) => 0.5 + (1.5 * (t - 1)) / (n - 1));

  const sumW = ws.reduce((s, w) => s + w, 0);
  const tBarW = ws.reduce((s, w, i) => s + w * ts[i], 0) / sumW;
  const yBarW = ws.reduce((s, w, i) => s + w * ys[i], 0) / sumW;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += ws[i] * (ts[i] - tBarW) * (ys[i] - yBarW);
    den += ws[i] * (ts[i] - tBarW) ** 2;
  }
  const slope = den > 0 ? num / den : 0;
  const intercept = yBarW - slope * tBarW;

  // Weighted R²
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    const predicted = intercept + slope * ts[i];
    ssRes += ws[i] * (ys[i] - predicted) ** 2;
    ssTot += ws[i] * (ys[i] - yBarW) ** 2;
  }
  const rSquared = ssTot > 0 ? round2(1 - ssRes / ssTot) : 0;

  return { slope, intercept, rSquared };
}

function confidenceFromR2(r2: number): MetricForecast['confidence'] {
  if (r2 > 0.7) return 'high';
  if (r2 > 0.4) return 'medium';
  return 'low';
}

function trendFromSlope(slope: number, currentValue: number): MetricForecast['trend'] {
  const relativeSlope = currentValue > 0 ? (slope / currentValue) * 100 : 0;
  if (relativeSlope > 2) return 'improving';
  if (relativeSlope < -5) return 'critical_decline';
  if (relativeSlope < -1) return 'declining';
  return 'stable';
}

/**
 * Build time series for fleet metrics from combined lookback + current performance.
 *
 * No-show definition: mirrors talabatOpsMetrics.computeDailyTalabatSeries exactly:
 *   - Only riders present in assignedRiderCodes are eligible (same roster gate).
 *   - Active    = hours > 0
 *   - No-show   = hours === 0 AND orders === 0  (isTalabatNoShow rule)
 *   - Excluded  = hours === 0 AND orders > 0    (partial-work — neither active nor no-show)
 *
 * Using this per-rider rule (rather than headcount − active) eliminates the ~5-rider
 * gap between the forecast currentValue and the KPI noShowRiders average.
 */
function buildFleetDailySeries(
  ctx: ControlTowerBuildContext
): Map<string, { hours: number; orders: number; activeRiders: number; noShowRiders: number }> {
  const all = [...(ctx.lookbackPerformance ?? []), ...ctx.performance];
  const assignedCodes = ctx.assignedRiderCodes;

  // Per date: accumulate per-rider totals (hours + orders) for assigned riders only.
  const byDate = new Map<
    string,
    { hours: number; orders: number; riderTotals: Map<string, { hours: number; orders: number }> }
  >();

  for (const row of all) {
    const norm = normalizeRiderCodeForPerformance(row.riderCode);
    if (!norm) continue;
    // Apply the same assignedRiderCodes gate used by the KPI engine.
    if (!assignedCodes.has(norm)) continue;

    const existing = byDate.get(row.date) ?? {
      hours: 0,
      orders: 0,
      riderTotals: new Map<string, { hours: number; orders: number }>(),
    };
    existing.hours += row.hours;
    existing.orders += row.orders;

    // Accumulate per-rider totals so we can apply isTalabatNoShow correctly.
    const prev = existing.riderTotals.get(norm) ?? { hours: 0, orders: 0 };
    existing.riderTotals.set(norm, {
      hours: prev.hours + row.hours,
      orders: prev.orders + row.orders,
    });

    byDate.set(row.date, existing);
  }

  const result = new Map<string, { hours: number; orders: number; activeRiders: number; noShowRiders: number }>();
  for (const [date, data] of byDate) {
    let activeRiders = 0;
    let noShowRiders = 0;

    for (const totals of data.riderTotals.values()) {
      if (totals.hours > 0) {
        activeRiders++;
      } else if (totals.orders === 0) {
        // hours === 0 AND orders === 0 → isTalabatNoShow
        noShowRiders++;
      }
      // hours === 0 AND orders > 0 → partial work, excluded from both counts (same as KPI)
    }

    result.set(date, {
      hours: round2(data.hours),
      orders: data.orders,
      activeRiders,
      noShowRiders,
    });
  }
  return result;
}

export function buildForecastMetrics(ctx: ControlTowerBuildContext): MetricForecast[] {
  const { fleetDailyTargetHours } = ctx;
  const dailySeries = buildFleetDailySeries(ctx);

  // Get the last 14 dates (most recent)
  const sortedDates = Array.from(dailySeries.keys()).sort().slice(-14);
  if (sortedDates.length < 3) return [];

  const forecastResults: MetricForecast[] = [];

  // ── 1. Achievement % ───────────────────────────────────────────────────────
  const achievementPoints: DailyPoint[] = sortedDates.map((date) => ({
    date,
    value: fleetDailyTargetHours > 0
      ? round2((dailySeries.get(date)!.hours / fleetDailyTargetHours) * 100)
      : 0,
  }));
  {
    const { slope, intercept, rSquared } = weightedLinearRegression(achievementPoints);
    const n = achievementPoints.length;
    const current = achievementPoints[n - 1].value;
    const day7 = round2(Math.max(0, Math.min(120, intercept + slope * (n + 7))));
    const day14 = round2(Math.max(0, Math.min(120, intercept + slope * (n + 14))));
    const trend = trendFromSlope(slope, current);
    const alertAr = day14 < 60 ? '⚠️ تحذير: الأداء متجه نحو الانهيار — تدخل عاجل مطلوب' : null;
    forecastResults.push({
      metricKey: 'achievementPct',
      metricLabelAr: 'نسبة التحقيق %',
      currentValue: current,
      day7Forecast: day7,
      day14Forecast: day14,
      trend,
      confidence: confidenceFromR2(rSquared),
      alertAr,
      interpretationAr:
        trend === 'critical_decline' ? 'الأداء في تراجع حاد — تدخل فوري مطلوب' :
        trend === 'declining' ? 'الأداء في تراجع مستمر — مراقبة يومية ضرورية' :
        trend === 'improving' ? 'الأداء في تحسن — استمر على نفس النهج' :
        'الأداء مستقر — لا تغيير جوهري متوقع',
      rSquared,
    });
  }

  // ── 2. No-Show Count ───────────────────────────────────────────────────────
  const noShowPoints: DailyPoint[] = sortedDates.map((date) => ({
    date,
    value: dailySeries.get(date)!.noShowRiders,
  }));
  {
    const { slope, intercept, rSquared } = weightedLinearRegression(noShowPoints);
    const n = noShowPoints.length;
    const current = noShowPoints[n - 1].value;
    const day7 = round2(Math.max(0, intercept + slope * (n + 7)));
    const day14 = round2(Math.max(0, intercept + slope * (n + 14)));
    const trend = trendFromSlope(-slope, current); // inverted: increasing no-show = declining
    const alertAr = day14 > 150 ? '🔴 خطر: الغياب في ارتفاع خطير — يتجاوز 40% من الأسطول' : null;
    forecastResults.push({
      metricKey: 'noShowCount',
      metricLabelAr: 'عدد الغائبين',
      currentValue: Math.round(current),
      day7Forecast: Math.round(day7),
      day14Forecast: Math.round(day14),
      trend,
      confidence: confidenceFromR2(rSquared),
      alertAr,
      interpretationAr:
        slope > 3 ? 'الغياب في ارتفاع مستمر — مراجعة خطة الحضور فوراً' :
        slope < -3 ? 'الغياب في تحسن — استمر على خطة الحضور الحالية' :
        'الغياب مستقر — متابعة المستوى الراهن',
      rSquared,
    });
  }

  // ── 3. Active Rider Count ──────────────────────────────────────────────────
  const activePoints: DailyPoint[] = sortedDates.map((date) => ({
    date,
    value: dailySeries.get(date)!.activeRiders,
  }));
  {
    const { slope, intercept, rSquared } = weightedLinearRegression(activePoints);
    const n = activePoints.length;
    const current = activePoints[n - 1].value;
    const day7 = round2(Math.max(0, intercept + slope * (n + 7)));
    const day14 = round2(Math.max(0, intercept + slope * (n + 14)));
    const trend = trendFromSlope(slope, current);
    forecastResults.push({
      metricKey: 'activeRiderCount',
      metricLabelAr: 'عدد الطيارين النشطين',
      currentValue: Math.round(current),
      day7Forecast: Math.round(day7),
      day14Forecast: Math.round(day14),
      trend,
      confidence: confidenceFromR2(rSquared),
      alertAr: slope < -5 ? '⚠️ الأسطول النشط في تراجع سريع' : null,
      interpretationAr:
        slope > 3 ? 'الأسطول النشط في نمو — اتجاه إيجابي' :
        slope < -3 ? 'الأسطول النشط في تراجع — مخاطر تشغيلية' :
        'الأسطول النشط مستقر',
      rSquared,
    });
  }

  // ── 4. Hours Gap (target - actual) ────────────────────────────────────────
  const gapPoints: DailyPoint[] = sortedDates.map((date) => ({
    date,
    value: Math.max(0, fleetDailyTargetHours - dailySeries.get(date)!.hours),
  }));
  {
    const { slope, intercept, rSquared } = weightedLinearRegression(gapPoints);
    const n = gapPoints.length;
    const current = gapPoints[n - 1].value;
    const day7 = round2(Math.max(0, intercept + slope * (n + 7)));
    const day14 = round2(Math.max(0, intercept + slope * (n + 14)));
    const trend = trendFromSlope(-slope, current); // inverted: smaller gap = improving
    forecastResults.push({
      metricKey: 'hoursGap',
      metricLabelAr: 'فجوة الساعات (هدف - فعلي)',
      currentValue: round2(current),
      day7Forecast: day7,
      day14Forecast: day14,
      trend,
      confidence: confidenceFromR2(rSquared),
      alertAr: day14 > current * 1.3 ? '⚠️ الفجوة تتسع — تدهور في الأداء التشغيلي' : null,
      interpretationAr:
        slope < -5 ? 'الفجوة تضيق — أداء تشغيلي في تحسن' :
        slope > 5 ? 'الفجوة تتسع — الأداء يتدهور' :
        'الفجوة مستقرة',
      rSquared,
    });
  }

  return forecastResults;
}
