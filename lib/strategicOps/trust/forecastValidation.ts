/**
 * SRS-006 §6 — Forecast Validation (MAPE, intervals, reliability).
 */

import type { MetricForecast } from '@/lib/strategicOps/controlTower/types';

export type ForecastValidation = {
  metricKey: string;
  methodAr: string;
  confidence: MetricForecast['confidence'];
  historicalAccuracyPercent: number;
  pastForecastError: number;
  mape: number;
  predictionInterval: { low: number; high: number };
  bestCase: number;
  worstCase: number;
  expectedCase: number;
  reliability: 'ممتاز' | 'جيد' | 'متوسط' | 'ضعيف';
  reliabilityScore: number;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function reliabilityFrom(r2: number, mape: number): {
  label: ForecastValidation['reliability'];
  score: number;
} {
  const score = round2(Math.max(0, Math.min(100, r2 * 70 + Math.max(0, 30 - mape))));
  if (score >= 80) return { label: 'ممتاز', score };
  if (score >= 65) return { label: 'جيد', score };
  if (score >= 45) return { label: 'متوسط', score };
  return { label: 'ضعيف', score };
}

/**
 * Validate a forecast using R² as proxy for historical fit and
 * residual band as prediction interval. MAPE approximated from (1-R²)*scale.
 */
export function validateForecast(f: MetricForecast): ForecastValidation {
  const mape = round2(Math.max(2, (1 - Math.max(0, f.rSquared)) * 35));
  const err = round2(Math.abs(f.day7Forecast - f.currentValue) * (1 - f.rSquared));
  const band = Math.max(Math.abs(f.day7Forecast) * (mape / 100), Math.abs(f.currentValue) * 0.05);
  const expected = f.day7Forecast;
  const best = round2(expected + band);
  const worst = round2(Math.max(0, expected - band));
  const histAcc = round2(Math.max(0, Math.min(100, f.rSquared * 100)));
  const { label, score } = reliabilityFrom(f.rSquared, mape);

  return {
    metricKey: f.metricKey,
    methodAr: 'انحدار خطي مرجّح (14 يوم) — Weighted OLS',
    confidence: f.confidence,
    historicalAccuracyPercent: histAcc,
    pastForecastError: err,
    mape,
    predictionInterval: { low: worst, high: best },
    bestCase: best,
    worstCase: worst,
    expectedCase: expected,
    reliability: label,
    reliabilityScore: score,
  };
}

export function validateAllForecasts(forecasts: MetricForecast[]): ForecastValidation[] {
  return forecasts.map(validateForecast);
}
