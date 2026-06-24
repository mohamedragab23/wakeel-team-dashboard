import type { Rider } from '@/lib/adminService';
import { assessRiderMetadata, type RiderMetadataStatus } from '@/lib/riderMetadata';

export type RiderMissingJoinDateEntry = {
  riderCode: string;
  name: string;
};

export type SupervisorJoinDateAlert = {
  supervisorCode: string;
  supervisorName: string;
  missingJoinDateCount: number;
  ridersMissingJoinDate: RiderMissingJoinDateEntry[];
};

export type RiderMetadataNotificationPayload = {
  missingJoinDateCount: number;
  ridersMissingJoinDate: RiderMissingJoinDateEntry[];
  message: string;
  actionUrl: string;
};

function isActiveRider(rider: Rider): boolean {
  const status = String(rider.status ?? 'نشط').trim();
  return !status || status === 'نشط';
}

export function filterActiveRidersMissingJoinDate(riders: Rider[]): RiderMetadataStatus[] {
  return riders.filter(isActiveRider).map(assessRiderMetadata).filter((s) => !s.hasJoinDate);
}

export function buildSupervisorJoinDateAlerts(
  riders: Rider[],
  supervisorNameByCode: Map<string, string> = new Map()
): SupervisorJoinDateAlert[] {
  const bySupervisor = new Map<string, RiderMissingJoinDateEntry[]>();

  for (const status of filterActiveRidersMissingJoinDate(riders)) {
    const code = status.supervisorCode || '__unassigned__';
    const list = bySupervisor.get(code) ?? [];
    list.push({ riderCode: status.riderCode, name: status.name });
    bySupervisor.set(code, list);
  }

  return Array.from(bySupervisor.entries())
    .filter(([code]) => code !== '__unassigned__')
    .map(([supervisorCode, ridersMissingJoinDate]) => ({
      supervisorCode,
      supervisorName: supervisorNameByCode.get(supervisorCode) || supervisorCode,
      missingJoinDateCount: ridersMissingJoinDate.length,
      ridersMissingJoinDate: ridersMissingJoinDate.sort((a, b) => a.name.localeCompare(b.name, 'ar')),
    }))
    .filter((s) => s.missingJoinDateCount > 0)
    .sort((a, b) => b.missingJoinDateCount - a.missingJoinDateCount);
}

export function buildRiderMetadataNotificationPayload(
  riders: Rider[]
): RiderMetadataNotificationPayload {
  const missing = filterActiveRidersMissingJoinDate(riders).map((s) => ({
    riderCode: s.riderCode,
    name: s.name,
  }));

  const count = missing.length;
  const message =
    count === 0
      ? 'جميع المناديب النشطين لديك لديهم Join Date.'
      : count === 1
        ? 'مندوب واحد نشط بدون Join Date — يرجى إكمال البيانات.'
        : `${count} مناديب نشطين بدون Join Date — يرجى إكمال البيانات.`;

  return {
    missingJoinDateCount: count,
    ridersMissingJoinDate: missing.sort((a, b) => a.name.localeCompare(b.name, 'ar')),
    message,
    actionUrl: '/rider-metadata-audit',
  };
}
