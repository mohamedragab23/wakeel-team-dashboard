import type { Rider } from '@/lib/adminService';
import { assessRiderMetadata, type RiderMetadataStatus } from '@/lib/riderMetadata';

export const METADATA_COVERAGE_THRESHOLD = 80;

export type SupervisorMetadataSummary = {
  supervisorCode: string;
  supervisorName: string;
  totalRiders: number;
  ridersMissingJoinDate: number;
  ridersMissingContractType: number;
  ridersMissingContractEndDate: number;
  metadataComplete: number;
  metadataCompletionPercent: number;
  ridersNeedingMetadata: RiderMetadataStatus[];
};

export type MetadataCompletionAudit = {
  totalRidersInScope: number;
  ridersMissingJoinDate: number;
  ridersMissingContractType: number;
  ridersMissingContractEndDate: number;
  metadataComplete: number;
  metadataCoveragePercent: number;
  metadataAnalyticsEnabled: boolean;
  bySupervisor: SupervisorMetadataSummary[];
  ridersNeedingMetadata: RiderMetadataStatus[];
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function buildMetadataCompletionAudit(
  ridersInScope: Rider[],
  supervisorNameByCode: Map<string, string> = new Map()
): MetadataCompletionAudit {
  const statuses = ridersInScope.map(assessRiderMetadata);
  const total = statuses.length;
  const missingJoin = statuses.filter((s) => !s.hasJoinDate).length;
  const missingContract = statuses.filter((s) => !s.hasContractType).length;
  const missingEnd = statuses.filter((s) => !s.hasContractEndDate).length;
  const complete = statuses.filter((s) => s.isMetadataComplete).length;
  const coverage = total > 0 ? round2((complete / total) * 100) : 0;

  const bySupMap = new Map<string, RiderMetadataStatus[]>();
  for (const s of statuses) {
    const code = s.supervisorCode || '__unassigned__';
    const list = bySupMap.get(code) ?? [];
    list.push(s);
    bySupMap.set(code, list);
  }

  const bySupervisor: SupervisorMetadataSummary[] = Array.from(bySupMap.entries())
    .map(([supervisorCode, riders]) => {
      const supTotal = riders.length;
      const supComplete = riders.filter((r) => r.isMetadataComplete).length;
      return {
        supervisorCode: supervisorCode === '__unassigned__' ? '' : supervisorCode,
        supervisorName:
          supervisorCode === '__unassigned__'
            ? 'غير معيّن'
            : supervisorNameByCode.get(supervisorCode) || supervisorCode,
        totalRiders: supTotal,
        ridersMissingJoinDate: riders.filter((r) => !r.hasJoinDate).length,
        ridersMissingContractType: riders.filter((r) => !r.hasContractType).length,
        ridersMissingContractEndDate: riders.filter((r) => !r.hasContractEndDate).length,
        metadataComplete: supComplete,
        metadataCompletionPercent: supTotal > 0 ? round2((supComplete / supTotal) * 100) : 0,
        ridersNeedingMetadata: riders.filter((r) => !r.isMetadataComplete),
      };
    })
    .sort((a, b) => a.metadataCompletionPercent - b.metadataCompletionPercent);

  return {
    totalRidersInScope: total,
    ridersMissingJoinDate: missingJoin,
    ridersMissingContractType: missingContract,
    ridersMissingContractEndDate: missingEnd,
    metadataComplete: complete,
    metadataCoveragePercent: coverage,
    metadataAnalyticsEnabled: coverage >= METADATA_COVERAGE_THRESHOLD,
    bySupervisor,
    ridersNeedingMetadata: statuses.filter((s) => !s.isMetadataComplete),
  };
}
