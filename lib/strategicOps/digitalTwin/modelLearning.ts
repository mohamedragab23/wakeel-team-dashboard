/**
 * SRS-007 §18 — Model Learning: prediction vs reality + accuracy tracking.
 */

export type PredictionRecord = {
  scenarioId: string;
  predictedAt: string;
  predictedHours: number;
  predictedOrders: number;
  predictedAchievement: number;
  actualHours?: number | null;
  actualOrders?: number | null;
  actualAchievement?: number | null;
  recordedAt?: string | null;
};

export type LearningMetrics = {
  sampleSize: number;
  mapeHours: number | null;
  mapeOrders: number | null;
  mapeAchievement: number | null;
  biasHours: number | null;
  accuracyScore: number;
  calibrationNoteAr: string;
  suggestedAdjustments: {
    hoursFactor: number;
    ordersFactor: number;
  };
};

function mape(predicted: number[], actual: number[]): number | null {
  if (predicted.length === 0 || predicted.length !== actual.length) return null;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < predicted.length; i++) {
    if (actual[i] === 0) continue;
    sum += Math.abs(actual[i] - predicted[i]) / Math.abs(actual[i]);
    n++;
  }
  return n > 0 ? Math.round((sum / n) * 10000) / 100 : null;
}

function bias(predicted: number[], actual: number[]): number | null {
  if (!predicted.length) return null;
  const avg =
    predicted.reduce((s, p, i) => s + (p - actual[i]), 0) / predicted.length;
  return Math.round(avg * 100) / 100;
}

export function computeLearningMetrics(records: PredictionRecord[]): LearningMetrics {
  const complete = records.filter(
    (r) =>
      r.actualHours != null &&
      r.actualOrders != null &&
      r.actualAchievement != null
  );

  if (complete.length === 0) {
    return {
      sampleSize: 0,
      mapeHours: null,
      mapeOrders: null,
      mapeAchievement: null,
      biasHours: null,
      accuracyScore: 0,
      calibrationNoteAr: 'لا نتائج فعلية بعد — سجّل Actual Result بعد التنفيذ',
      suggestedAdjustments: { hoursFactor: 1, ordersFactor: 1 },
    };
  }

  const pH = complete.map((r) => r.predictedHours);
  const aH = complete.map((r) => r.actualHours as number);
  const pO = complete.map((r) => r.predictedOrders);
  const aO = complete.map((r) => r.actualOrders as number);
  const pA = complete.map((r) => r.predictedAchievement);
  const aA = complete.map((r) => r.actualAchievement as number);

  const mapeHours = mape(pH, aH);
  const mapeOrders = mape(pO, aO);
  const mapeAchievement = mape(pA, aA);
  const biasHours = bias(pH, aH);

  const avgMape =
    [mapeHours, mapeOrders, mapeAchievement].filter((x): x is number => x != null).reduce((s, x) => s + x, 0) /
    Math.max(1, [mapeHours, mapeOrders, mapeAchievement].filter((x) => x != null).length);

  const accuracyScore = Math.round(Math.max(0, Math.min(100, 100 - avgMape)));

  const hoursFactor =
    biasHours != null && aH.reduce((s, v) => s + v, 0) > 0
      ? Math.max(0.7, Math.min(1.3, 1 - biasHours / (aH.reduce((s, v) => s + v, 0) / aH.length)))
      : 1;

  return {
    sampleSize: complete.length,
    mapeHours,
    mapeOrders,
    mapeAchievement,
    biasHours,
    accuracyScore,
    calibrationNoteAr:
      accuracyScore >= 80
        ? 'النموذج معاير جيداً — استمر في التسجيل'
        : 'النموذج ينحاز — طبّق عوامل التصحيح المقترحة على المحاكاة القادمة',
    suggestedAdjustments: {
      hoursFactor: Math.round(hoursFactor * 1000) / 1000,
      ordersFactor: 1,
    },
  };
}

export function applyLearningCalibration<T extends { actualHours: number; orders: number }>(
  fleet: T,
  adjustments: { hoursFactor: number; ordersFactor: number }
): T {
  return {
    ...fleet,
    actualHours: Math.round(fleet.actualHours * adjustments.hoursFactor * 100) / 100,
    orders: Math.round(fleet.orders * adjustments.ordersFactor * 100) / 100,
  };
}
