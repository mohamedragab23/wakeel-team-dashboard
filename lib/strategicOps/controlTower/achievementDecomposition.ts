import type { SupervisorOpsRow } from '@/lib/strategicOps/buildReport';
import type { AchievementDecomposition, ControlTowerBuildContext } from '@/lib/strategicOps/controlTower/types';
import { supervisorImpliedTargetDaily, supervisorLostTargetDaily } from '@/lib/strategicOps/controlTower/supervisorMetrics';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function buildAchievementDecomposition(
  ctx: ControlTowerBuildContext,
  supervisorRows: SupervisorOpsRow[],
  topRidersByLoss: Array<{ code: string; name: string; lostHoursDaily: number }>
): AchievementDecomposition {
  const { fleetTalabat } = ctx;
  const gapHoursDaily = round2(Math.max(0, fleetTalabat.targetHours - fleetTalabat.actualHours));
  const gapRidersDaily = round2(Math.max(0, fleetTalabat.headcount - fleetTalabat.activeRiders));
  const gapShiftsTotal = fleetTalabat.dailySeries.reduce(
    (s, d) => s + Math.max(0, d.scheduledRiders - d.activeRiders),
    0
  );

  const topSupervisorsByLoss = supervisorRows
    .map((s) => ({
      code: s.code,
      name: s.name,
      lostTargetHoursDaily: supervisorLostTargetDaily(s),
    }))
    .filter((s) => s.lostTargetHoursDaily > 0)
    .sort((a, b) => b.lostTargetHoursDaily - a.lostTargetHoursDaily)
    .slice(0, 10);

  return {
    achievementPercent: fleetTalabat.achievementPercent,
    gapHoursDaily,
    gapRidersDaily,
    gapShiftsTotal,
    topSupervisorsByLoss,
    topRidersByLoss: topRidersByLoss.slice(0, 10),
  };
}
