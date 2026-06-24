import type { ControlTowerRiderInput } from '@/lib/strategicOps/controlTower/types';

export type SupervisorMappingHealth = {
  totalRiders: number;
  mappedCount: number;
  unmappedCount: number;
  mappedPercent: number;
  resolvedFromSecondarySource: number;
  score: number;
};

export function resolveRiderSupervisorNames(
  riders: Array<{
    code: string;
    name: string;
    region: string;
    supervisorCode: string;
    supervisorName: string;
    totalHours: number;
    totalOrders: number;
  }>,
  supervisorNameByCode: Map<string, string>
): { riders: ControlTowerRiderInput[]; mapping: SupervisorMappingHealth } {
  let resolvedFromSecondary = 0;
  let mapped = 0;

  const resolved = riders.map((r) => {
    const code = String(r.supervisorCode ?? '').trim();
    const primary = String(r.supervisorName ?? '').trim();
    const secondary = code ? supervisorNameByCode.get(code) ?? '' : '';
    let supervisorName = primary;

    if (!supervisorName && secondary) {
      supervisorName = secondary;
      resolvedFromSecondary += 1;
    }

    if (supervisorName || code) mapped += 1;

    return {
      ...r,
      supervisorName: supervisorName || (code ? code : ''),
    };
  });

  const total = resolved.length;
  const unmapped = total - mapped;

  return {
    riders: resolved,
    mapping: {
      totalRiders: total,
      mappedCount: mapped,
      unmappedCount: unmapped,
      mappedPercent: total > 0 ? Math.round((mapped / total) * 10000) / 100 : 0,
      resolvedFromSecondarySource: resolvedFromSecondary,
      score: total > 0 ? Math.round((mapped / total) * 100) : 100,
    },
  };
}
