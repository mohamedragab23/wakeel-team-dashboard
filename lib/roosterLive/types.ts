/**
 * Shared types for the Talabat Live 3PL integration.
 *
 * Naming: "roosterLive" to distinguish from the existing historical
 * `roosterExport`/`roosterSession` (CSV shifts export) modules — this is a
 * separate, additive feature. Nothing here is imported by, or imports from,
 * the existing rooster export/session code.
 */

/** One rider's live snapshot, normalized from the raw Talabat payload. */
export interface LiveRider {
  /** Talabat Rider ID (used to match against المناديب sheet code). */
  riderId: string;
  riderName: string;
  /** Raw state string as returned by Talabat (e.g. "Working", "Ending", "Offline"). */
  riderState: string;
  /** Normalized status bucket used for KPIs / donut charts / badge color. */
  statusBucket: LiveRiderStatusBucket;
  walletBalance: number;
  breaksCount: number;
  /** Total break time, in seconds. */
  breakTimeSeconds: number;
  /** Total late time, in seconds. */
  lateTimeSeconds: number;
  currentSessionLabel: string;
  performance: string | number | null;
  timeWorkedLabel: string;
  acceptanceRate: number | null;
  ordersToday: number | null;
  vehicle: string | null;
  zone: string | null;
  /** ISO timestamp of when this row was last refreshed by the sync job. */
  lastSyncAt: string;
}

export type LiveRiderStatusBucket = 'online' | 'busy' | 'on_break' | 'late' | 'offline' | 'unknown';

/** Rider enriched with internal supervisor mapping (added by the read API, not the sync job). */
export interface LiveRiderWithAssignment extends LiveRider {
  supervisorCode: string | null;
  supervisorName: string | null;
  /** True when the Talabat rider could not be matched to a rider in المناديب. */
  unmapped: boolean;
}

export interface LiveRidersSnapshot {
  cityId: string;
  riders: LiveRider[];
  lastSyncAt: string;
  /** How long the fetch+map+store cycle took, ms — for health/observability. */
  syncDurationMs: number;
  riderCount: number;
}

export interface LiveRidersKpis {
  total: number;
  online: number;
  offline: number;
  busy: number;
  onBreak: number;
  late: number;
  walletAlerts: number;
}

export interface LiveRidersDistributionBucket {
  key: string;
  label: string;
  count: number;
}

export interface LiveRidersApiResponse {
  success: true;
  data: LiveRiderWithAssignment[];
  kpis: LiveRidersKpis;
  distributions: {
    status: LiveRidersDistributionBucket[];
    wallet: LiveRidersDistributionBucket[];
    breaks: LiveRidersDistributionBucket[];
    late: LiveRidersDistributionBucket[];
  };
  lastSyncAt: string | null;
  /** ms since lastSyncAt — lets the client decide "stale" without clock-skew guessing twice. */
  ageMs: number | null;
  /** If true, data is older than the expected sync cadence — show a "sync delayed" banner. */
  stale: boolean;
}
