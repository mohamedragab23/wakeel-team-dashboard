import type { SupervisorOpsRow } from '@/lib/strategicOps/buildReport';

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function supervisorImpliedTargetDaily(s: SupervisorOpsRow): number {
  if (s.achievementPercent > 0) {
    return round2(s.dailyHours / (s.achievementPercent / 100));
  }
  return s.dailyHours;
}

export function supervisorLostTargetDaily(s: SupervisorOpsRow): number {
  const target = supervisorImpliedTargetDaily(s);
  return round2(Math.max(0, target - s.dailyHours));
}
