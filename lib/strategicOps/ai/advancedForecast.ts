/**
 * Advanced Forecast Engine
 * 
 * Predicts future performance using trend analysis and historical patterns.
 * Implements SRS-004 Section 9: Forecast Engine.
 * 
 * Answers: "What are our performance forecasts?"
 * 
 * @module ForecastEngine
 * @version 1.0
 */

import type { KPIEngineOutput } from '@/lib/strategicOps/kpi';
import { FORECAST_SETTINGS } from '@/lib/strategicOps/config/businessRules';

// ============================================================================
// TYPES
// ============================================================================

export type ForecastPeriod = 'week' | 'month' | 'quarter';

export type ForecastMethod = 'linear' | 'moving_average' | 'exponential_smoothing' | 'seasonal';

export type Forecast = {
  period: ForecastPeriod;
  method: ForecastMethod;
  confidence: number; // 0-100
  
  // Forecasted values
  hours: number;
  orders: number;
  activeRiders: number;
  ordersPerHour: number;
  hoursAchievement: number;
  
  // Ranges (confidence intervals)
  hoursRange: { min: number; max: number };
  ordersRange: { min: number; max: number };
  
  // Insights
  expectedTrend: 'growth' | 'stable' | 'decline';
  risks: string[];
  opportunities: string[];
  recommendations: string[];
};

export type ForecastAnalysis = {
  nextWeek: Forecast;
  nextMonth: Forecast;
  nextQuarter: Forecast;
  
  // Key insights
  overallTrend: 'growth' | 'stable' | 'decline';
  confidenceLevel: 'high' | 'medium' | 'low';
  
  // Alerts
  targetRisk: boolean; // Will we miss targets?
  capacityRisk: boolean; // Will we hit capacity limits?
  
  summary: {
    summaryEn: string;
    summaryAr: string;
  };
};

/** Backward-compatible result name used by growth planning. */
export type ForecastResult = ForecastAnalysis;

// Historical data point
export type HistoricalDataPoint = {
  date: string;
  hours: number;
  orders: number;
  activeRiders: number;
  ordersPerHour: number;
};

// ============================================================================
// FORECAST ENGINE
// ============================================================================

/**
 * Generate comprehensive forecast analysis
 */
export function generateForecastAnalysis(
  currentKPIs: KPIEngineOutput,
  historicalData: HistoricalDataPoint[]
): ForecastAnalysis {
  // 1. Generate forecasts for different periods
  const nextWeek = generateForecast(historicalData, 'week', currentKPIs);
  const nextMonth = generateForecast(historicalData, 'month', currentKPIs);
  const nextQuarter = generateForecast(historicalData, 'quarter', currentKPIs);
  
  // 2. Determine overall trend
  const overallTrend = determineOverallTrend([nextWeek, nextMonth, nextQuarter]);
  
  // 3. Calculate confidence level
  const confidenceLevel = calculateConfidenceLevel(historicalData, [nextWeek, nextMonth, nextQuarter]);
  
  // 4. Check for risks
  const targetRisk = checkTargetRisk(nextMonth, currentKPIs);
  const capacityRisk = checkCapacityRisk(nextMonth, currentKPIs);
  
  // 5. Generate summary
  const summary = generateForecastSummary({
    nextWeek,
    nextMonth,
    nextQuarter,
    overallTrend,
    targetRisk,
    capacityRisk,
  });
  
  return {
    nextWeek,
    nextMonth,
    nextQuarter,
    overallTrend,
    confidenceLevel,
    targetRisk,
    capacityRisk,
    summary,
  };
}

// ============================================================================
// FORECAST GENERATION
// ============================================================================

/**
 * Generate forecast for specific period
 */
function generateForecast(
  historicalData: HistoricalDataPoint[],
  period: ForecastPeriod,
  currentKPIs: KPIEngineOutput
): Forecast {
  // Determine forecast method based on data availability
  const method = selectForecastMethod(historicalData, period);
  
  // Calculate forecasts
  const hoursHistory = historicalData.map(d => d.hours);
  const ordersHistory = historicalData.map(d => d.orders);
  const ridersHistory = historicalData.map(d => d.activeRiders);
  
  const hours = forecastValue(hoursHistory, period, method);
  const orders = forecastValue(ordersHistory, period, method);
  const activeRiders = Math.round(forecastValue(ridersHistory, period, method));
  const ordersPerHour = hours > 0 ? orders / hours : 0;
  
  // Calculate confidence
  const confidence = calculateForecastConfidence(historicalData, period);
  
  // Calculate ranges (±confidence interval)
  const hoursMargin = hours * (1 - confidence / 100) * 0.5;
  const ordersMargin = orders * (1 - confidence / 100) * 0.5;
  
  const hoursRange = {
    min: Math.max(0, hours - hoursMargin),
    max: hours + hoursMargin,
  };
  
  const ordersRange = {
    min: Math.max(0, orders - ordersMargin),
    max: orders + ordersMargin,
  };
  
  // Calculate hours achievement (vs target)
  const targetHours = currentKPIs.hours.potentialHours.value.current;
  const hoursAchievement = targetHours > 0 ? (hours / targetHours) * 100 : 0;
  
  // Determine trend
  const currentHours = currentKPIs.hours.totalWorkingHours.value.current;
  const expectedTrend = hours > currentHours * 1.05 ? 'growth' : 
                       hours < currentHours * 0.95 ? 'decline' : 'stable';
  
  // Generate insights
  const risks = generateForecastRisks(hours, orders, activeRiders, currentKPIs, period);
  const opportunities = generateForecastOpportunities(hours, orders, activeRiders, currentKPIs, period);
  const recommendations = generateForecastRecommendations(expectedTrend, risks, opportunities);
  
  return {
    period,
    method,
    confidence,
    hours,
    orders,
    activeRiders,
    ordersPerHour,
    hoursAchievement,
    hoursRange,
    ordersRange,
    expectedTrend,
    risks,
    opportunities,
    recommendations,
  };
}

// ============================================================================
// FORECAST METHODS
// ============================================================================

/**
 * Select appropriate forecast method
 */
function selectForecastMethod(
  historicalData: HistoricalDataPoint[],
  period: ForecastPeriod
): ForecastMethod {
  const dataPoints = historicalData.length;
  
  // Need enough data for different methods
  if (dataPoints < 7) return 'linear';
  if (dataPoints < 14) return 'moving_average';
  if (dataPoints < 30) return 'exponential_smoothing';
  
  // Check for seasonality
  if (dataPoints >= 30 && period !== 'week') {
    return 'seasonal';
  }
  
  return 'exponential_smoothing';
}

/**
 * Forecast value using selected method
 */
function forecastValue(
  values: number[],
  period: ForecastPeriod,
  method: ForecastMethod
): number {
  if (values.length === 0) return 0;
  
  switch (method) {
    case 'linear':
      return forecastLinear(values, getPeriodSteps(period));
    
    case 'moving_average':
      return forecastMovingAverage(values, getPeriodSteps(period));
    
    case 'exponential_smoothing':
      return forecastExponentialSmoothing(values, getPeriodSteps(period));
    
    case 'seasonal':
      return forecastSeasonal(values, getPeriodSteps(period));
    
    default:
      return forecastLinear(values, getPeriodSteps(period));
  }
}

function getPeriodSteps(period: ForecastPeriod): number {
  switch (period) {
    case 'week': return 7;
    case 'month': return 30;
    case 'quarter': return 90;
  }
}

/**
 * Linear regression forecast
 */
function forecastLinear(values: number[], steps: number): number {
  const n = values.length;
  if (n < 2) return values[n - 1] || 0;
  
  // Calculate slope
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  values.forEach((y, x) => {
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
  });
  
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  
  // Project forward
  const futureX = n - 1 + steps;
  return Math.max(0, slope * futureX + intercept);
}

/**
 * Moving average forecast
 */
function forecastMovingAverage(values: number[], steps: number): number {
  const window = Math.min(7, values.length);
  const recentValues = values.slice(-window);
  const average = recentValues.reduce((sum, v) => sum + v, 0) / recentValues.length;
  
  // Simple projection: assume trend continues
  return average;
}

/**
 * Exponential smoothing forecast
 */
function forecastExponentialSmoothing(values: number[], steps: number): number {
  const alpha = FORECAST_SETTINGS.EXPONENTIAL_SMOOTHING_ALPHA;
  
  let smoothed = values[0];
  values.slice(1).forEach(value => {
    smoothed = alpha * value + (1 - alpha) * smoothed;
  });
  
  // Project with simple linear trend
  const recentTrend = values.length >= 2 
    ? (values[values.length - 1] - values[values.length - 2]) / values[values.length - 2]
    : 0;
  
  return Math.max(0, smoothed * (1 + recentTrend * (steps / 7)));
}

/**
 * Seasonal forecast (simplified)
 */
function forecastSeasonal(values: number[], steps: number): number {
  // Use average of same period in previous cycles
  const seasonLength = 30; // Monthly seasonality
  const numSeasons = Math.floor(values.length / seasonLength);
  
  if (numSeasons < 2) {
    return forecastExponentialSmoothing(values, steps);
  }
  
  // Average the same day across seasons
  let sum = 0;
  let count = 0;
  for (let i = numSeasons - 1; i >= 0; i--) {
    const idx = i * seasonLength + (steps % seasonLength);
    if (idx < values.length) {
      sum += values[idx];
      count++;
    }
  }
  
  return count > 0 ? sum / count : values[values.length - 1];
}

// ============================================================================
// CONFIDENCE & VALIDATION
// ============================================================================

/**
 * Calculate forecast confidence
 */
function calculateForecastConfidence(
  historicalData: HistoricalDataPoint[],
  period: ForecastPeriod
): number {
  const dataPoints = historicalData.length;
  
  // Base confidence on data availability
  let confidence = 50; // Base
  
  // More data = higher confidence
  if (dataPoints >= 90) confidence += 30;
  else if (dataPoints >= 30) confidence += 20;
  else if (dataPoints >= 14) confidence += 10;
  else if (dataPoints >= 7) confidence += 5;
  
  // Shorter period = higher confidence
  if (period === 'week') confidence += 15;
  else if (period === 'month') confidence += 10;
  
  // Check volatility (reduce confidence for high variance)
  const hoursValues = historicalData.map(d => d.hours);
  const variance = calculateVariance(hoursValues);
  const mean = hoursValues.reduce((s, v) => s + v, 0) / hoursValues.length;
  const cv = mean > 0 ? Math.sqrt(variance) / mean : 0; // Coefficient of variation
  
  if (cv > 0.3) confidence -= 15; // High volatility
  else if (cv > 0.2) confidence -= 10;
  
  return Math.max(30, Math.min(95, confidence));
}

function calculateVariance(values: number[]): number {
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  return squaredDiffs.reduce((s, v) => s + v, 0) / values.length;
}

/**
 * Determine overall trend from multiple forecasts
 */
function determineOverallTrend(forecasts: Forecast[]): 'growth' | 'stable' | 'decline' {
  const growthCount = forecasts.filter(f => f.expectedTrend === 'growth').length;
  const declineCount = forecasts.filter(f => f.expectedTrend === 'decline').length;
  
  if (growthCount > declineCount) return 'growth';
  if (declineCount > growthCount) return 'decline';
  return 'stable';
}

function calculateConfidenceLevel(
  historicalData: HistoricalDataPoint[],
  forecasts: Forecast[]
): 'high' | 'medium' | 'low' {
  const avgConfidence = forecasts.reduce((sum, f) => sum + f.confidence, 0) / forecasts.length;
  
  if (avgConfidence >= 75) return 'high';
  if (avgConfidence >= 55) return 'medium';
  return 'low';
}

// ============================================================================
// RISK & OPPORTUNITY DETECTION
// ============================================================================

function checkTargetRisk(monthForecast: Forecast, currentKPIs: KPIEngineOutput): boolean {
  return monthForecast.hoursAchievement < 90;
}

function checkCapacityRisk(monthForecast: Forecast, currentKPIs: KPIEngineOutput): boolean {
  const currentCapacity = currentKPIs.headcount.capacityUtilization.value.current;
  return currentCapacity > 85 && monthForecast.expectedTrend === 'growth';
}

function generateForecastRisks(
  hours: number,
  orders: number,
  activeRiders: number,
  currentKPIs: KPIEngineOutput,
  period: ForecastPeriod
): string[] {
  const risks: string[] = [];
  
  const currentHours = currentKPIs.hours.totalWorkingHours.value.current;
  const currentRiders = currentKPIs.headcount.workingRiders.value.current;
  
  // Declining hours
  if (hours < currentHours * 0.9) {
    risks.push(`انخفاض متوقع في الساعات بنسبة ${(((currentHours - hours) / currentHours) * 100).toFixed(0)}%`);
  }
  
  // Declining riders
  if (activeRiders < currentRiders * 0.9) {
    risks.push(`انخفاض متوقع في المناديب النشطين`);
  }
  
  // Low target achievement
  const targetHours = currentKPIs.hours.potentialHours.value.current;
  const achievement = targetHours > 0 ? (hours / targetHours) * 100 : 0;
  if (achievement < 85) {
    risks.push(`خطر عدم تحقيق الهدف (${achievement.toFixed(0)}%)`);
  }
  
  return risks;
}

function generateForecastOpportunities(
  hours: number,
  orders: number,
  activeRiders: number,
  currentKPIs: KPIEngineOutput,
  period: ForecastPeriod
): string[] {
  const opportunities: string[] = [];
  
  const currentHours = currentKPIs.hours.totalWorkingHours.value.current;
  
  // Growing hours
  if (hours > currentHours * 1.1) {
    opportunities.push(`نمو متوقع في الساعات بنسبة ${(((hours - currentHours) / currentHours) * 100).toFixed(0)}%`);
  }
  
  // High achievement
  const targetHours = currentKPIs.hours.potentialHours.value.current;
  const achievement = targetHours > 0 ? (hours / targetHours) * 100 : 0;
  if (achievement > 100) {
    opportunities.push(`توقع تجاوز الهدف (${achievement.toFixed(0)}%)`);
  }
  
  return opportunities;
}

function generateForecastRecommendations(
  trend: Forecast['expectedTrend'],
  risks: string[],
  opportunities: string[]
): string[] {
  const recommendations: string[] = [];
  
  if (trend === 'decline') {
    recommendations.push('إجراءات عاجلة لوقف التراجع');
    recommendations.push('زيادة التوظيف');
    recommendations.push('تحسين الاحتفاظ بالمناديب');
  } else if (trend === 'growth') {
    recommendations.push('الاستعداد للنمو');
    recommendations.push('توظيف استباقي');
    recommendations.push('تحسين البنية التحتية');
  }
  
  if (risks.length > 0) {
    recommendations.push('مراقبة يومية للمؤشرات');
  }
  
  if (opportunities.length > 0) {
    recommendations.push('استغلال فرص النمو');
  }
  
  return recommendations;
}

// ============================================================================
// SUMMARY GENERATION
// ============================================================================

function generateForecastSummary(data: {
  nextWeek: Forecast;
  nextMonth: Forecast;
  nextQuarter: Forecast;
  overallTrend: 'growth' | 'stable' | 'decline';
  targetRisk: boolean;
  capacityRisk: boolean;
}): { summaryEn: string; summaryAr: string } {
  const { nextWeek, nextMonth, overallTrend, targetRisk, capacityRisk } = data;
  
  const trendEmoji = overallTrend === 'growth' ? '📈' : overallTrend === 'decline' ? '📉' : '➡️';
  const trendLabel = overallTrend === 'growth' ? 'نمو' : overallTrend === 'decline' ? 'تراجع' : 'استقرار';
  const trendLabelEn = overallTrend === 'growth' ? 'Growth' : overallTrend === 'decline' ? 'Decline' : 'Stable';
  
  let riskAlert = '';
  let riskAlertAr = '';
  
  if (targetRisk && capacityRisk) {
    riskAlert = '⚠️ Target miss & capacity risks detected';
    riskAlertAr = '⚠️ خطر عدم تحقيق الهدف ونقص الطاقة';
  } else if (targetRisk) {
    riskAlert = '⚠️ Target miss risk';
    riskAlertAr = '⚠️ خطر عدم تحقيق الهدف';
  } else if (capacityRisk) {
    riskAlert = '⚠️ Capacity constraint risk';
    riskAlertAr = '⚠️ خطر نقص الطاقة';
  }
  
  return {
    summaryEn: `${trendEmoji} ${trendLabelEn} trend expected. Next week: ${nextWeek.hours.toFixed(0)}h, ${nextWeek.orders} orders (${nextWeek.confidence.toFixed(0)}% confidence). Next month: ${nextMonth.hours.toFixed(0)}h, ${nextMonth.hoursAchievement.toFixed(0)}% achievement. ${riskAlert}`,
    summaryAr: `${trendEmoji} اتجاه ${trendLabel} متوقع. الأسبوع القادم: ${nextWeek.hours.toFixed(0)} ساعة، ${nextWeek.orders} أوردر (ثقة ${nextWeek.confidence.toFixed(0)}%). الشهر القادم: ${nextMonth.hours.toFixed(0)} ساعة، ${nextMonth.hoursAchievement.toFixed(0)}% تحقيق. ${riskAlertAr}`,
  };
}
