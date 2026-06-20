import type { Rider } from '@/lib/adminService';
import { normalizeRiderCodeForPerformance } from '@/lib/dataFilter';

export const JOIN_DATE_COVERAGE_THRESHOLD = 80;

export type JoinDateRiderEntry = {
  riderCode: string;
  name: string;
  joinDate: string | null;
  supervisorCode: string;
  hasValidJoinDate: boolean;
};

export type JoinDateAuditReport = {
  totalRidersInScope: number;
  ridersWithValidJoinDate: number;
  ridersWithoutJoinDate: number;
  joinDateCoveragePercent: number;
  /** KPI disabled when coverage < 80% */
  riderLifetimeKpiEnabled: boolean;
  riderLifetimeDisabledReason?: string;
  riders: JoinDateRiderEntry[];
  ridersMissingJoinDate: JoinDateRiderEntry[];
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function parseJoinDate(raw: unknown): Date | null {
  if (raw == null || raw === '') return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw;
  const s = String(raw).trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const d = new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dmy) {
    const d = new Date(`${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function buildJoinDateAudit(ridersInScope: Rider[]): JoinDateAuditReport {
  const riders: JoinDateRiderEntry[] = ridersInScope.map((r) => {
    const code = normalizeRiderCodeForPerformance(r.code);
    const join = parseJoinDate(r.joinDate);
    const joinIso = join ? join.toISOString().split('T')[0] : null;
    return {
      riderCode: code,
      name: String(r.name ?? code),
      joinDate: joinIso,
      supervisorCode: String(r.supervisorCode ?? '').trim(),
      hasValidJoinDate: join !== null,
    };
  });

  const withJoin = riders.filter((r) => r.hasValidJoinDate);
  const withoutJoin = riders.filter((r) => !r.hasValidJoinDate);
  const total = riders.length;
  const coverage = total > 0 ? round2((withJoin.length / total) * 100) : 0;
  const enabled = coverage >= JOIN_DATE_COVERAGE_THRESHOLD;

  return {
    totalRidersInScope: total,
    ridersWithValidJoinDate: withJoin.length,
    ridersWithoutJoinDate: withoutJoin.length,
    joinDateCoveragePercent: coverage,
    riderLifetimeKpiEnabled: enabled,
    riderLifetimeDisabledReason: enabled
      ? undefined
      : `تغطية تاريخ الانضمام ${coverage}% أقل من ${JOIN_DATE_COVERAGE_THRESHOLD}% — تم تعطيل KPI متوسط عمر الطيار`,
    riders,
    ridersMissingJoinDate: withoutJoin,
  };
}
