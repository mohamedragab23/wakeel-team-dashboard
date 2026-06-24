import type { SupervisorOpsRow } from '@/lib/strategicOps/buildReport';
import type {
  ActionPriority,
  ControlTowerBuildContext,
  ManagementAction,
  NegativeImpactRider,
} from '@/lib/strategicOps/controlTower/types';
import { supervisorLostTargetDaily } from '@/lib/strategicOps/controlTower/supervisorMetrics';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function stdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function priorityRank(p: ActionPriority): number {
  return { critical: 4, high: 3, medium: 2, low: 1 }[p];
}

function pushAction(
  actions: ManagementAction[],
  action: Omit<ManagementAction, 'rawRecoveryHours' | 'deduplicatedRecoveryHours'>
) {
  actions.push({
    ...action,
    rawRecoveryHours: action.expectedRecoveryHours,
    deduplicatedRecoveryHours: action.expectedRecoveryHours,
  });
}

export function buildManagementActions(
  ctx: ControlTowerBuildContext,
  supervisorRows: SupervisorOpsRow[],
  topRiders: NegativeImpactRider[]
): ManagementAction[] {
  const actions: ManagementAction[] = [];
  const { fleetTalabat, avgHoursPerActiveRider, inactiveRiders } = ctx;

  const noShowValues = supervisorRows.map((s) => s.noShowRiders);
  const fleetNoShowAvg =
    noShowValues.length > 0 ? noShowValues.reduce((a, b) => a + b, 0) / noShowValues.length : 0;
  const noShowStd = stdDev(noShowValues);
  const noShowThreshold = fleetNoShowAvg + 2 * noShowStd;

  for (const s of supervisorRows) {
    const candidates: ManagementAction[] = [];

    if (s.noShowRiders > noShowThreshold && s.noShowRiders > 0) {
      const recovery = round2(s.noShowRiders * avgHoursPerActiveRider);
      candidates.push({
        id: `sup-noshow-${s.code}`,
        priority: s.noShowRiders > 15 ? 'critical' : 'high',
        entityType: 'supervisor',
        entityId: s.code,
        entityName: s.name,
        problemAr: `المشرف ${s.name} لديه ${s.noShowRiders} no-show يومياً (المتوسط ${round2(fleetNoShowAvg)})`,
        actionAr: 'اتصل بالمشرف اليوم — فعّل خطة حضور فورية',
        expectedRecoveryHours: recovery,
        evidence: `noShow=${s.noShowRiders}, fleetAvg=${round2(fleetNoShowAvg)}, σ=${round2(noShowStd)}`,
        rawRecoveryHours: recovery,
        deduplicatedRecoveryHours: recovery,
      });
    }

    const lost = supervisorLostTargetDaily(s);
    if (lost >= 20) {
      candidates.push({
        id: `sup-hours-${s.code}`,
        priority: lost >= 50 ? 'critical' : 'high',
        entityType: 'supervisor',
        entityId: s.code,
        entityName: s.name,
        problemAr: `المشرف ${s.name} يفقد ${lost} ساعة/يوم من الهدف`,
        actionAr: 'مراجعة توزيع الطيارين ورفع ساعات الفريق',
        expectedRecoveryHours: lost,
        evidence: `lostTargetDaily=${lost}, achievement=${s.achievementPercent}%`,
        rawRecoveryHours: lost,
        deduplicatedRecoveryHours: lost,
      });
    }

    if (s.inactiveRiders >= 5) {
      const recovery = round2(s.inactiveRiders * avgHoursPerActiveRider);
      candidates.push({
        id: `sup-inactive-${s.code}`,
        priority: s.inactiveRiders >= 10 ? 'high' : 'medium',
        entityType: 'supervisor',
        entityId: s.code,
        entityName: s.name,
        problemAr: `${s.inactiveRiders} طيار غير نشط تحت ${s.name}`,
        actionAr: `تفعيل ${s.inactiveRiders} طيار — متابعة يومية`,
        expectedRecoveryHours: recovery,
        evidence: `inactiveRiders=${s.inactiveRiders}`,
        rawRecoveryHours: recovery,
        deduplicatedRecoveryHours: recovery,
      });
    }

    if (s.headcount > 0 && s.activeRiders / s.headcount < 0.6) {
      const needed = Math.ceil(s.headcount * 0.7 - s.activeRiders);
      if (needed > 0) {
        const recovery = round2(needed * avgHoursPerActiveRider);
        candidates.push({
          id: `sup-recruit-${s.code}`,
          priority: 'high',
          entityType: 'supervisor',
          entityId: s.code,
          entityName: s.name,
          problemAr: `فريق ${s.name}: ${s.activeRiders}/${s.headcount} نشط فقط (${s.utilizationPercent}%)`,
          actionAr: `تعيين/تفعيل مطلوب — ${needed} طيار`,
          expectedRecoveryHours: recovery,
          evidence: `utilization=${s.utilizationPercent}%`,
          rawRecoveryHours: recovery,
          deduplicatedRecoveryHours: recovery,
        });
      }
    }

    if (s.resignations >= 3) {
      const recovery = round2(s.resignations * avgHoursPerActiveRider * 3);
      candidates.push({
        id: `sup-resign-${s.code}`,
        priority: 'medium',
        entityType: 'supervisor',
        entityId: s.code,
        entityName: s.name,
        problemAr: `${s.resignations} إقالة معتمدة — ${s.name}`,
        actionAr: 'تدخل احتفاظ — مقابلة الطيارين المتبقين',
        expectedRecoveryHours: recovery,
        evidence: `resignations=${s.resignations}`,
        rawRecoveryHours: recovery,
        deduplicatedRecoveryHours: recovery,
      });
    }

    if (candidates.length > 0) {
      const best = candidates.sort(
        (a, b) =>
          priorityRank(b.priority) - priorityRank(a.priority) ||
          b.expectedRecoveryHours - a.expectedRecoveryHours
      )[0];
      actions.push(best);
    }
  }

  for (const r of topRiders.filter((x) => x.impactLevel === 'critical' || x.impactLevel === 'high').slice(0, 5)) {
    pushAction(actions, {
      id: `rider-impact-${r.code}`,
      priority: r.impactLevel === 'critical' ? 'critical' : 'high',
      entityType: 'rider',
      entityId: r.code,
      entityName: r.name,
      problemAr: `الطيار ${r.name}: متوقع ${r.expectedHoursDaily} س/يوم، فعلي ${r.actualHoursDaily}، مفقود ${r.lostHoursDaily} س/يوم`,
      actionAr: `متابعة الطيار ${r.name} — مشرف ${r.supervisorName || '—'}`,
      expectedRecoveryHours: round2(r.lostHoursDaily),
      evidence: `expected=${r.expectedHoursDaily}, actual=${r.actualHoursDaily}, lost=${r.lostHoursDaily}, noShow=${r.noShowCount}`,
    });
  }

  if (inactiveRiders >= 10) {
    pushAction(actions, {
      id: 'fleet-inactive',
      priority: inactiveRiders >= 30 ? 'high' : 'medium',
      entityType: 'fleet',
      entityId: 'fleet',
      entityName: 'الأسطول',
      problemAr: `${inactiveRiders} طيار غير نشط بالأسطول`,
      actionAr: `حملة تفعيل — استهداف ${Math.min(15, inactiveRiders)} طيار`,
      expectedRecoveryHours: round2(Math.min(15, inactiveRiders) * avgHoursPerActiveRider),
      evidence: `inactiveRiders=${inactiveRiders}`,
    });
  }

  if (fleetTalabat.noShowRiders > fleetNoShowAvg * 1.2 && fleetTalabat.noShowRiders > 5) {
    pushAction(actions, {
      id: 'fleet-noshow',
      priority: 'high',
      entityType: 'fleet',
      entityId: 'fleet',
      entityName: 'الأسطول',
      problemAr: `No Show أسطولي ${fleetTalabat.noShowRiders}/يوم — مرتفع`,
      actionAr: 'تنبيه حضور على مستوى المناطق — مراجعة اليوم',
      expectedRecoveryHours: round2(fleetTalabat.noShowRiders * avgHoursPerActiveRider),
      evidence: `fleetNoShow=${fleetTalabat.noShowRiders}`,
    });
  }

  return dedupeActions(actions);
}

function dedupeActions(actions: ManagementAction[]): ManagementAction[] {
  const seen = new Set<string>();
  return actions.filter((a) => {
    if (seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  });
}

export function rankActionsByImpact(actions: ManagementAction[]): ManagementAction[] {
  return [...actions].sort((a, b) => {
    const pDiff = priorityRank(b.priority) - priorityRank(a.priority);
    if (pDiff !== 0) return pDiff;
    return b.expectedRecoveryHours - a.expectedRecoveryHours;
  });
}
