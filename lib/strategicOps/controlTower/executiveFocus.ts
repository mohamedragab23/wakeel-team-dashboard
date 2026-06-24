import type { ActionPriority, ManagementAction } from '@/lib/strategicOps/controlTower/types';

const PRIORITY_ORDER: Record<ActionPriority, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

function entityKey(action: ManagementAction): string {
  return `${action.entityType}:${action.entityId}`;
}

export type ExecutiveFocusResult = {
  executiveFocus: ManagementAction[];
  audit: {
    rawRecoveryHoursTotal: number;
    deduplicatedRecoveryHoursTotal: number;
    actionsBeforeDedup: number;
    actionsAfterDedup: number;
  };
};

/**
 * One action per entity (supervisor / rider / fleet). Keeps highest-priority, then highest recovery.
 */
export function buildExecutiveFocus(actions: ManagementAction[], limit = 10): ExecutiveFocusResult {
  const withRaw = actions.map((a) => ({
    ...a,
    rawRecoveryHours: a.rawRecoveryHours ?? a.expectedRecoveryHours,
  }));

  const rawRecoveryHoursTotal = round2(
    withRaw.reduce((s, a) => s + (a.rawRecoveryHours ?? a.expectedRecoveryHours), 0)
  );

  const byEntity = new Map<string, ManagementAction>();
  for (const action of withRaw) {
    const key = entityKey(action);
    const existing = byEntity.get(key);
    if (!existing) {
      byEntity.set(key, action);
      continue;
    }
    const pNew = PRIORITY_ORDER[action.priority];
    const pOld = PRIORITY_ORDER[existing.priority];
    if (
      pNew > pOld ||
      (pNew === pOld && action.expectedRecoveryHours > existing.expectedRecoveryHours)
    ) {
      byEntity.set(key, action);
    }
  }

  const deduped = [...byEntity.values()].sort((a, b) => {
    const pDiff = PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority];
    if (pDiff !== 0) return pDiff;
    return b.expectedRecoveryHours - a.expectedRecoveryHours;
  });

  const executiveFocus = deduped.slice(0, limit).map((a) => ({
    ...a,
    rawRecoveryHours: a.rawRecoveryHours ?? a.expectedRecoveryHours,
    deduplicatedRecoveryHours: a.expectedRecoveryHours,
  }));

  const deduplicatedRecoveryHoursTotal = round2(
    executiveFocus.reduce((s, a) => s + a.deduplicatedRecoveryHours, 0)
  );

  return {
    executiveFocus,
    audit: {
      rawRecoveryHoursTotal,
      deduplicatedRecoveryHoursTotal,
      actionsBeforeDedup: withRaw.length,
      actionsAfterDedup: byEntity.size,
    },
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
