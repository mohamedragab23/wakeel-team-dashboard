import type { DigitalTwinState, TwinSupervisorRow } from './types';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type SupervisorSimResult = {
  supervisors: TwinSupervisorRow[];
  expectedImprovementPercent: number;
  riskScore: number;
  confidence: number;
  noteAr: string;
};

export function simulateSupervisorChanges(
  twin: DigitalTwinState,
  opts: {
    replaceWeakSupervisor?: boolean;
    reallocateRiders?: number;
    supervisorTargetPercentChange?: number;
  }
): SupervisorSimResult {
  let supervisors = twin.supervisors.map((s) => ({ ...s }));
  let improvement = 0;
  let risk = 20;
  let note = 'لا تغيير على المشرفين';

  if (opts.replaceWeakSupervisor && supervisors.length > 1) {
    const sorted = [...supervisors].sort((a, b) => a.achievement - b.achievement);
    const worst = sorted[0];
    const best = sorted[sorted.length - 1];
    const idx = supervisors.findIndex((s) => s.code === worst.code);
    if (idx >= 0) {
      const lift = round2((best.achievement - worst.achievement) * 0.4);
      supervisors[idx] = {
        ...supervisors[idx],
        achievement: round2(Math.min(100, worst.achievement + lift)),
        hours: round2(worst.hours * (1 + lift / 100)),
        riskScore: Math.max(0, worst.riskScore - 15),
      };
      improvement += lift;
      risk += 10;
      note = `استبدال أداء المشرف الأضعف (${worst.name}) بنمط أداء أقرب للأفضل (${best.name})`;
    }
  }

  if (opts.reallocateRiders && opts.reallocateRiders > 0 && supervisors.length > 1) {
    const n = opts.reallocateRiders;
    const sorted = [...supervisors].sort((a, b) => a.achievement - b.achievement);
    const worst = sorted[0];
    const best = sorted[sorted.length - 1];
    const move = Math.min(n, worst.headcount);
    const wIdx = supervisors.findIndex((s) => s.code === worst.code);
    const bIdx = supervisors.findIndex((s) => s.code === best.code);
    if (wIdx >= 0 && bIdx >= 0) {
      supervisors[wIdx].headcount -= move;
      supervisors[wIdx].activeRiders = Math.max(0, supervisors[wIdx].activeRiders - move);
      supervisors[bIdx].headcount += move;
      supervisors[bIdx].activeRiders += move;
      improvement += round2(move * 0.3);
      risk += 5;
      note =
        (note === 'لا تغيير على المشرفين' ? '' : note + ' — ') +
        `نقل ${move} طيار من ${worst.name} إلى ${best.name}`;
    }
  }

  if (opts.supervisorTargetPercentChange != null) {
    const factor = 1 + opts.supervisorTargetPercentChange / 100;
    supervisors = supervisors.map((s) => ({
      ...s,
      target: round2(s.target * factor),
      achievement: s.target * factor > 0 ? round2((s.hours / (s.target * factor)) * 100) : 0,
    }));
    note =
      (note === 'لا تغيير على المشرفين' ? '' : note + ' — ') +
      `تعديل أهداف المشرفين بنسبة ${opts.supervisorTargetPercentChange}%`;
  }

  const confidence = Math.max(40, 85 - risk);

  return {
    supervisors,
    expectedImprovementPercent: round2(improvement),
    riskScore: round2(Math.min(100, risk)),
    confidence,
    noteAr: note,
  };
}
