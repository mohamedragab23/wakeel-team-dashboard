export type RoadmapRidersAudit = {
  gapHours: number;
  avgHoursPerActiveRider: number | null;
  rawQuotient: number | null;
  rawCalculation: string;
  roundedResult: number | null;
  validationPassed: boolean;
  validationMessage?: string;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Parse numeric input without coercing null/undefined to 0. */
export function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : parseFloat(String(value).replace(/[, ]+/g, ''));
  return Number.isFinite(n) ? n : null;
}

/**
 * ⌈gapHours ÷ avgHoursPerActiveRider⌉
 * When gap > 0 and avg > 0, roundedResult is always >= 1 (never 0).
 */
export function computeAdditionalRidersNeeded(
  gapHoursInput: unknown,
  avgHoursPerActiveRiderInput: unknown
): RoadmapRidersAudit {
  const gapHours = toFiniteNumber(gapHoursInput);
  const avgHoursPerActiveRider = toFiniteNumber(avgHoursPerActiveRiderInput);

  if (gapHours === null || gapHours <= 0) {
    return {
      gapHours: gapHours === null ? 0 : round2(gapHours),
      avgHoursPerActiveRider,
      rawQuotient: gapHours === null ? null : 0,
      rawCalculation: 'لا فجوة — الهدف اليومي متحقق أو متجاوز',
      roundedResult: 0,
      validationPassed: true,
    };
  }

  const gap = round2(gapHours);

  if (avgHoursPerActiveRider === null || avgHoursPerActiveRider <= 0) {
    return {
      gapHours: gap,
      avgHoursPerActiveRider,
      rawQuotient: null,
      rawCalculation: `تعذّر الحساب: متوسط ساعات الطيار النشط يومياً غير صالح (${avgHoursPerActiveRiderInput ?? 'null'})`,
      roundedResult: null,
      validationPassed: true,
      validationMessage: 'متوسط الساعات غير متوفر أو صفر',
    };
  }

  const avg = round2(avgHoursPerActiveRider);
  const rawQuotient = round2(gap / avg);
  const roundedResult = Math.ceil(rawQuotient);
  const rawCalculation = `${gap} ÷ ${avg} = ${rawQuotient}`;
  const validationPassed = roundedResult > 0;

  return {
    gapHours: gap,
    avgHoursPerActiveRider: avg,
    rawQuotient,
    rawCalculation,
    roundedResult,
    validationPassed,
    validationMessage: validationPassed
      ? undefined
      : 'قاعدة التحقق: عند وجود فجوة ومتوسط ساعات > 0 يجب ألا يكون عدد الطيارين المطلوب 0',
  };
}

export function formatAdditionalRidersCalculation(audit: RoadmapRidersAudit): string {
  if (audit.gapHours <= 0) {
    return audit.rawCalculation;
  }
  if (audit.avgHoursPerActiveRider === null || audit.avgHoursPerActiveRider <= 0) {
    return audit.rawCalculation;
  }
  if (audit.roundedResult === null) {
    return `${audit.rawCalculation} → CEIL = —`;
  }
  return `⌈${audit.gapHours} ÷ ${audit.avgHoursPerActiveRider}⌉ = ${audit.roundedResult} طيار (${audit.rawCalculation})`;
}

export function additionalRidersDisplayValue(audit: RoadmapRidersAudit): number | null {
  return audit.roundedResult;
}

export function validateRoadmapRidersAudit(audit: RoadmapRidersAudit): boolean {
  if (audit.gapHours > 0 && audit.avgHoursPerActiveRider !== null && audit.avgHoursPerActiveRider > 0) {
    return audit.roundedResult !== null && audit.roundedResult > 0 && audit.validationPassed;
  }
  return audit.validationPassed;
}
