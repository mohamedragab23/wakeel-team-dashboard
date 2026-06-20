import type { RiderStrategicAnalytics, RiderStrategicProfile, RiskLevel } from './types';

function daysBetweenIso(fromIso: string, toIso: string): number {
  const a = new Date(`${fromIso}T00:00:00`);
  const b = new Date(`${toIso}T00:00:00`);
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return 0;
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / 86400000));
}

export function buildRiderStrategicAnalytics(profiles: RiderStrategicProfile[]): RiderStrategicAnalytics {
  const today = new Date().toISOString().slice(0, 10);

  const lifetimeSamples = profiles
    .filter((p) => p.actualJoinDate && p.resignationDate)
    .map((p) => daysBetweenIso(p.actualJoinDate, p.resignationDate))
    .filter((d) => d > 0);

  const averageRiderLifetimeDays =
    lifetimeSamples.length > 0
      ? Math.round(lifetimeSamples.reduce((s, d) => s + d, 0) / lifetimeSamples.length)
      : 0;

  const typeCounts = new Map<string, number>();
  for (const p of profiles) {
    const t = p.riderType || 'غير محدد';
    typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
  }
  const total = profiles.length || 1;
  const riderTypeDistribution = [...typeCounts.entries()]
    .map(([type, count]) => ({
      type,
      count,
      percent: Math.round((count / total) * 1000) / 10,
    }))
    .sort((a, b) => b.count - a.count);

  const riskRiders = profiles
    .filter((p) => p.riskLevel === 'yellow' || p.riskLevel === 'red' || p.riskLevel === 'unknown')
    .map((p) => ({
      riderCode: p.riderCode,
      name: p.name,
      riskLevel: p.riskLevel as RiskLevel,
      daysSinceLastActivity: p.daysSinceLastActivity,
      supervisorCode: p.activationOwnerCode,
      supervisorName: p.activationOwnerName,
    }))
    .sort((a, b) => (b.daysSinceLastActivity ?? 999) - (a.daysSinceLastActivity ?? 999));

  const inactiveRiders = profiles
    .filter(
      (p) =>
        p.currentStatus === 'غير نشط' ||
        p.currentStatus === 'موقوف' ||
        (p.daysSinceLastActivity !== null && p.daysSinceLastActivity > 7)
    )
    .map((p) => ({
      riderCode: p.riderCode,
      name: p.name,
      currentStatus: p.currentStatus,
      daysSinceLastActivity: p.daysSinceLastActivity,
      supervisorCode: p.activationOwnerCode,
    }));

  const upcomingAttrition = profiles
    .filter((p) => p.resignationDate)
    .map((p) => ({
      riderCode: p.riderCode,
      name: p.name,
      resignationDate: p.resignationDate,
      resignationReason: p.resignationReason,
      supervisorCode: p.activationOwnerCode,
    }))
    .sort((a, b) => b.resignationDate.localeCompare(a.resignationDate));

  const supervisorMap = new Map<
    string,
    { name: string; assigned: number; followed: number; overdue: number }
  >();

  for (const p of profiles) {
    const code = p.activationOwnerCode || '—';
    const entry = supervisorMap.get(code) ?? {
      name: p.activationOwnerName || code,
      assigned: 0,
      followed: 0,
      overdue: 0,
    };
    entry.assigned += 1;

    const needsFollowUp =
      p.riskLevel === 'yellow' || p.riskLevel === 'red' || p.currentStatus === 'تحت المتابعة';

    if (needsFollowUp) {
      const followDays = p.lastFollowUpDate ? daysBetweenIso(p.lastFollowUpDate, today) : 999;
      if (followDays <= 7) entry.followed += 1;
      else entry.overdue += 1;
    }

    supervisorMap.set(code, entry);
  }

  const supervisorFollowUpCompliance = [...supervisorMap.entries()]
    .map(([supervisorCode, s]) => {
      const needTotal = s.followed + s.overdue;
      return {
        supervisorCode,
        supervisorName: s.name,
        assignedRiders: s.assigned,
        followedUpWithin7Days: s.followed,
        compliancePercent: needTotal > 0 ? Math.round((s.followed / needTotal) * 1000) / 10 : 100,
        overdueRiders: s.overdue,
      };
    })
    .sort((a, b) => a.compliancePercent - b.compliancePercent);

  return {
    averageRiderLifetimeDays,
    lifetimeSampleCount: lifetimeSamples.length,
    riderTypeDistribution,
    riskRiders,
    inactiveRiders,
    upcomingAttrition,
    supervisorFollowUpCompliance,
  };
}
