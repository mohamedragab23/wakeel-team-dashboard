import type { SupervisorOpsRow } from '@/lib/strategicOps/buildReport';
import type {
  ActionPriority,
  ActionConfidence,
  ActionUrgency,
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

function ordersFromHours(hours: number, avgHoursPerOrder: number): number {
  if (avgHoursPerOrder <= 0) return 0;
  return round2(hours / avgHoursPerOrder);
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

  const ordersPerHour = fleetTalabat.actualHours > 0
    ? round2(fleetTalabat.dailySeries.reduce((s, d) => s + (d as any).orders || 0, 0) / Math.max(1, fleetTalabat.actualHours))
    : 0;

  const noShowValues = supervisorRows.map((s) => s.noShowRiders);
  const fleetNoShowAvg =
    noShowValues.length > 0 ? noShowValues.reduce((a, b) => a + b, 0) / noShowValues.length : 0;
  const noShowStd = stdDev(noShowValues);
  const noShowThreshold = fleetNoShowAvg + 2 * noShowStd;

  for (const s of supervisorRows) {
    const candidates: ManagementAction[] = [];

    if (s.noShowRiders > noShowThreshold && s.noShowRiders > 0) {
      const recovery = round2(s.noShowRiders * avgHoursPerActiveRider);
      const priority: ActionPriority = s.noShowRiders > 15 ? 'critical' : 'high';
      candidates.push({
        id: `sup-noshow-${s.code}`,
        priority,
        entityType: 'supervisor',
        entityId: s.code,
        entityName: s.name,
        problemAr: `المشرف ${s.name} لديه ${s.noShowRiders} غياب يومياً (المتوسط ${round2(fleetNoShowAvg)})`,
        actionAr: `اتصل بالمشرف ${s.name} اليوم — فعّل خطة حضور فورية`,
        whyAr: `نسبة الغياب تتجاوز المتوسط بمقدار ${round2(s.noShowRiders - fleetNoShowAvg)} طيار يومياً`,
        expectedRecoveryHours: recovery,
        expectedRecoveryOrders: ordersFromHours(recovery, ordersPerHour > 0 ? 1 / ordersPerHour : 0),
        riderCount: s.noShowRiders,
        confidence: 'high',
        urgency: 'immediate',
        evidence: `noShow=${s.noShowRiders}, fleetAvg=${round2(fleetNoShowAvg)}, σ=${round2(noShowStd)}`,
        rawRecoveryHours: recovery,
        deduplicatedRecoveryHours: recovery,
      });
    }

    const lost = supervisorLostTargetDaily(s);
    if (lost >= 20) {
      const priority: ActionPriority = lost >= 50 ? 'critical' : 'high';
      const confidence: ActionConfidence = s.achievementPercent < 50 ? 'high' : 'medium';
      candidates.push({
        id: `sup-hours-${s.code}`,
        priority,
        entityType: 'supervisor',
        entityId: s.code,
        entityName: s.name,
        problemAr: `المشرف ${s.name} يفقد ${lost} ساعة/يوم من الهدف (تحقيق ${s.achievementPercent}%)`,
        actionAr: `مراجعة توزيع الطيارين ورفع ساعات فريق ${s.name}`,
        whyAr: `الهدف اليومي ${round2(s.dailyHours / (s.achievementPercent / 100))} ساعة — الفعلي ${s.dailyHours} ساعة`,
        expectedRecoveryHours: lost,
        expectedRecoveryOrders: ordersFromHours(lost, ordersPerHour > 0 ? 1 / ordersPerHour : 0),
        riderCount: s.headcount,
        confidence,
        urgency: lost >= 80 ? 'immediate' : 'this_week',
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
        actionAr: `تفعيل ${s.inactiveRiders} طيار — متابعة يومية مع ${s.name}`,
        whyAr: `هؤلاء الطيارون مسجلون في الفريق لكن لا يسجلون ساعات`,
        expectedRecoveryHours: recovery,
        expectedRecoveryOrders: ordersFromHours(recovery, ordersPerHour > 0 ? 1 / ordersPerHour : 0),
        riderCount: s.inactiveRiders,
        confidence: 'medium',
        urgency: s.inactiveRiders >= 10 ? 'this_week' : 'this_month',
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
          actionAr: `تعيين/تفعيل مطلوب — ${needed} طيار في فريق ${s.name}`,
          whyAr: `الاستثمار أقل من 60% — ${s.headcount - s.activeRiders} طيار مسجل غير فعّال`,
          expectedRecoveryHours: recovery,
          expectedRecoveryOrders: ordersFromHours(recovery, ordersPerHour > 0 ? 1 / ordersPerHour : 0),
          riderCount: needed,
          confidence: 'medium',
          urgency: 'this_week',
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
        problemAr: `${s.resignations} إقالة معتمدة في فريق ${s.name}`,
        actionAr: `مقابلة الطيارين المتبقين في فريق ${s.name} — تدخل احتفاظ`,
        whyAr: `الإقالات المتكررة تشير إلى مشكلة في بيئة العمل أو الإدارة`,
        expectedRecoveryHours: recovery,
        expectedRecoveryOrders: ordersFromHours(recovery, ordersPerHour > 0 ? 1 / ordersPerHour : 0),
        riderCount: s.resignations,
        confidence: 'low',
        urgency: 'this_month',
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

  // Top critical/high riders
  for (const r of topRiders.filter((x) => x.impactLevel === 'critical' || x.impactLevel === 'high').slice(0, 5)) {
    pushAction(actions, {
      id: `rider-impact-${r.code}`,
      priority: r.impactLevel === 'critical' ? 'critical' : 'high',
      entityType: 'rider',
      entityId: r.code,
      entityName: r.name,
      problemAr: `الطيار ${r.name}: متوقع ${r.expectedHoursDaily} س/يوم، فعلي ${r.actualHoursDaily}، مفقود ${r.lostHoursDaily} س/يوم`,
      actionAr: `متابعة الطيار ${r.name} — مشرف ${r.supervisorName || '—'}`,
      whyAr: `${r.noShowCount > 0 ? `غاب ${r.noShowCount} يوم من ${r.scheduledDays}` : 'انخفاض في ساعات العمل عن المتوقع'}`,
      expectedRecoveryHours: round2(r.lostHoursDaily),
      expectedRecoveryOrders: ordersFromHours(r.lostHoursDaily, ordersPerHour > 0 ? 1 / ordersPerHour : 0),
      riderCount: 1,
      confidence: r.noShowCount > 0 ? 'high' : 'medium',
      urgency: r.impactLevel === 'critical' ? 'immediate' : 'this_week',
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
      whyAr: `طيارون مسجلون لم يسجلوا أي ساعات في الفترة — طاقة كامنة غير مستغلة`,
      expectedRecoveryHours: round2(Math.min(15, inactiveRiders) * avgHoursPerActiveRider),
      expectedRecoveryOrders: 0,
      riderCount: inactiveRiders,
      confidence: 'medium',
      urgency: 'this_week',
      evidence: `inactiveRiders=${inactiveRiders}`,
    });
  }

  if (fleetTalabat.noShowRiders > fleetNoShowAvg * 1.2 && fleetTalabat.noShowRiders > 5) {
    const recovery = round2(fleetTalabat.noShowRiders * avgHoursPerActiveRider);
    pushAction(actions, {
      id: 'fleet-noshow',
      priority: 'high',
      entityType: 'fleet',
      entityId: 'fleet',
      entityName: 'الأسطول',
      problemAr: `No Show أسطولي ${fleetTalabat.noShowRiders} طيار/يوم — مرتفع`,
      actionAr: 'تنبيه حضور على مستوى المناطق — مراجعة اليوم',
      whyAr: `معدل الغياب فوق الطبيعي — ${fleetTalabat.noShowRiders} طيار لا يعمل رغم التسجيل`,
      expectedRecoveryHours: recovery,
      expectedRecoveryOrders: ordersFromHours(recovery, ordersPerHour > 0 ? 1 / ordersPerHour : 0),
      riderCount: Math.round(fleetTalabat.noShowRiders),
      confidence: 'high',
      urgency: 'immediate',
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
