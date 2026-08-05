import { RoosterClient } from '@/lib/rooster/RoosterClient';

export type RiderOpsFields = {
  roosterSuspended: boolean | null;
  hasStartingPoints: boolean | null;
  contractEndDate: string | null;
};

/**
 * Fail-open: Rooster outage must never blank rider tables.
 * Prefers Rooster active-contract end date, falls back to sheet value.
 */
export async function enrichWithRoosterOps<T extends { code: string; contractEndDate?: string | null }>(
  rows: T[]
): Promise<(T & RiderOpsFields)[]> {
  try {
    const map = await RoosterClient.getOperationalStatusMap(rows.map((r) => r.code));
    return rows.map((r) => {
      const ops = map[String(r.code).trim()];
      const sheetEnd = r.contractEndDate ? String(r.contractEndDate).trim().slice(0, 10) : null;
      return {
        ...r,
        roosterSuspended: ops ? ops.suspended : null,
        hasStartingPoints: ops ? ops.hasStartingPoints : null,
        contractEndDate: ops?.contractEndDate || sheetEnd || null,
      };
    });
  } catch {
    return rows.map((r) => ({
      ...r,
      roosterSuspended: null as boolean | null,
      hasStartingPoints: null as boolean | null,
      contractEndDate: r.contractEndDate ? String(r.contractEndDate).trim().slice(0, 10) : null,
    }));
  }
}
