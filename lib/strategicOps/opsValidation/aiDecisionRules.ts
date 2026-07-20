/**
 * SRS-008 §11 — AI recommendation quality gates (deterministic scenarios).
 */

export type AiScenario = {
  id: string;
  hoursGap: number;
  inactiveRiders: number;
  recommendation: 'activate' | 'hire' | 'mixed' | 'monitor';
  hireCount?: number;
};

export type AiValidationResult = {
  scenarioId: string;
  expectedPass: boolean;
  actualPass: boolean;
  reasonAr: string;
};

/**
 * Prefer activation when inactive pool is material vs gap.
 * SRS example: gap 1200 + 80 inactive → Activate = Pass; Hire 300 = Fail.
 */
function preferActivateFirst(hoursGap: number, inactiveRiders: number): boolean {
  const recoverableHours = inactiveRiders * 5;
  return recoverableHours >= hoursGap * 0.25 || inactiveRiders >= 50;
}

/**
 * Evaluate whether a recommendation is acceptable for the scenario.
 * actualPass=true means the recommendation is considered good.
 */
export function validateAiRecommendation(s: AiScenario): AiValidationResult {
  const preferActivate = preferActivateFirst(s.hoursGap, s.inactiveRiders);

  if (s.recommendation === 'activate' && preferActivate) {
    return {
      scenarioId: s.id,
      expectedPass: true,
      actualPass: true,
      reasonAr: 'تفعيل غير النشطين أولوية منطقية قبل التعيين الكبير',
    };
  }

  if (s.recommendation === 'hire' && (s.hireCount ?? 0) >= 200 && preferActivate) {
    return {
      scenarioId: s.id,
      expectedPass: false,
      actualPass: false,
      reasonAr: 'تعيين ضخم مع وجود غير نشطين كافين — قرار مرفوض',
    };
  }

  if (s.recommendation === 'hire' && !preferActivate && (s.hireCount ?? 0) > 0) {
    return {
      scenarioId: s.id,
      expectedPass: true,
      actualPass: true,
      reasonAr: 'الفجوة أكبر من طاقة التفعيل — التعيين مبرر',
    };
  }

  if (s.recommendation === 'activate' && !preferActivate) {
    return {
      scenarioId: s.id,
      expectedPass: false,
      actualPass: false,
      reasonAr: 'التفعيل وحده لا يكفي للفجوة — يجب مزج أو تعيين',
    };
  }

  if (s.recommendation === 'mixed') {
    return {
      scenarioId: s.id,
      expectedPass: true,
      actualPass: true,
      reasonAr: 'مزيج تفعيل + تعيين جزئي مقبول',
    };
  }

  return {
    scenarioId: s.id,
    expectedPass: true,
    actualPass: true,
    reasonAr: 'سيناريو مقبول ضمن القواعد',
  };
}

/** Returns true when the recommendation's quality matches `shouldBeAccepted`. */
export function aiScenarioMeetsExpectation(s: AiScenario, shouldBeAccepted: boolean): boolean {
  const r = validateAiRecommendation(s);
  return r.actualPass === shouldBeAccepted;
}
