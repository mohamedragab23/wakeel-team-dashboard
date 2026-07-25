/**
 * SRS-011 Part 11 — bridges the existing Action Engine / Control Tower
 * output into the Decision Learning log's shape. Kept separate from
 * `store.ts` (pure persistence) and `types.ts` (pure types).
 */
import type { ControlTowerReport, ManagementAction } from '@/lib/strategicOps/controlTower/types';
import type { DecisionLogEntry } from './types';

const EVALUATION_WINDOW_DAYS = 2;

function actionKindFromId(action: ManagementAction): string {
  // ids are minted as `${kind}-${entityCode}` in managementActions.ts
  const suffix = `-${action.entityId}`;
  return action.id.endsWith(suffix) ? action.id.slice(0, action.id.length - suffix.length) : action.id;
}

/** Baseline metric per entity type — the number this recommendation is meant
 *  to move upward. Supervisors are measured on Target Achievement %, riders
 *  on their own actual daily hours, fleet/zone actions fall back to overall
 *  achievement. */
function baselineMetricFor(
  action: ManagementAction,
  ct: ControlTowerReport
): { label: string; value: number } {
  if (action.entityType === 'supervisor') {
    const sup = ct.supervisorIntelligence.find((s) => s.code === action.entityId);
    if (sup) return { label: 'نسبة تحقيق الهدف (Target Achievement %)', value: sup.achievementPercent };
  }
  if (action.entityType === 'rider') {
    const rider = ct.riderIntelligence.find((r) => r.code === action.entityId);
    if (rider) return { label: 'الساعات الفعلية اليومية (Actual Hours/Day)', value: rider.actualHoursDaily };
  }
  return { label: 'نسبة تحقيق الهدف العامة (Fleet Achievement %)', value: ct.executiveHealth.achievementPercent };
}

/** Build new candidates to log from today's critical/high-priority actions.
 *  `logNewDecisions()` in store.ts will silently skip any id already logged
 *  today, so this can be called on every report build without duplicating. */
export function buildDecisionCandidates(
  ct: ControlTowerReport,
  periodStart: string,
  periodEnd: string
): Array<Omit<DecisionLogEntry, 'executed' | 'executedAt' | 'executedByCode' | 'evaluated' | 'evaluatedAt' | 'afterMetricValue' | 'metricDeltaPct' | 'outcome' | 'notes'>> {
  const issuedAt = new Date().toISOString();
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + EVALUATION_WINDOW_DAYS);
  const todayKey = issuedAt.slice(0, 10);

  return (ct.executiveFocus ?? [])
    .filter((a) => a.priority === 'critical' || a.priority === 'high')
    .map((action) => {
      const kind = actionKindFromId(action);
      const baseline = baselineMetricFor(action, ct);
      return {
        id: `${action.entityType}-${action.entityId}-${kind}-${todayKey}`,
        actionKind: kind,
        entityType: action.entityType,
        entityId: action.entityId,
        entityName: action.entityName,
        problemAr: action.problemAr,
        actionAr: action.actionAr,
        confidencePercent:
          action.confidence === 'high' ? 82 : action.confidence === 'medium' ? 65 : action.confidence === 'low' ? 45 : 70,
        issuedAt,
        periodStart,
        periodEnd,
        baselineMetricLabel: baseline.label,
        baselineMetricValue: baseline.value,
        baselineLostHours: action.deduplicatedRecoveryHours,
        evaluationDueAt: dueDate.toISOString(),
      };
    });
}

/** Current-metric lookup map for `evaluateDueDecisions()` — keyed by
 *  `${entityType}:${entityId}` to avoid supervisor/rider code collisions. */
export function buildCurrentMetricMap(ct: ControlTowerReport): Map<string, number> {
  const map = new Map<string, number>();
  for (const s of ct.supervisorIntelligence) {
    map.set(`supervisor:${s.code}`, s.achievementPercent);
  }
  for (const r of ct.riderIntelligence) {
    map.set(`rider:${r.code}`, r.actualHoursDaily);
  }
  return map;
}
