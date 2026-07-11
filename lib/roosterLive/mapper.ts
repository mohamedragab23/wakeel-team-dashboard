/**
 * Maps a raw Talabat Live 3PL rider row into our normalized `LiveRider` type.
 *
 * IMPORTANT — verify against the real response before going live:
 * we have not yet captured the exact JSON field names returned by
 * `/api/rider-live-operations/v1/external/city/{cityId}/riders` (only the
 * *rendered UI columns* from the Rooster screen were available: ID, Name,
 * Current Session, Performance, Time worked, Acceptance Rate, Wallet
 * Balance, Breaks, Breaks time, Late time, Rider state, Location).
 *
 * `FIELD_CANDIDATES` below tries the common shapes (camelCase, snake_case,
 * a couple of likely nested paths). If Talabat's real field names differ,
 * this is the ONLY file that needs a one-line edit — add the real key to
 * the relevant candidate list.
 */
import type { LiveRider, LiveRiderStatusBucket } from '@/lib/roosterLive/types';

type RawRider = Record<string, any>;

function pick(row: RawRider, candidates: readonly string[]): any {
  for (const key of candidates) {
    const value = key.includes('.') ? key.split('.').reduce<any>((acc, k) => acc?.[k], row) : row[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

function toNumber(value: any, fallback = 0): number {
  if (value === null || value === undefined || value === '') return fallback;
  const n = typeof value === 'number' ? value : parseFloat(String(value).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : fallback;
}

/** Accepts seconds, "HH:MM:SS", or "HH:MM" and returns seconds. */
function toSeconds(value: any): number {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return value;
  const str = String(value).trim();
  const parts = str.split(':').map((p) => parseInt(p, 10));
  if (parts.length >= 2 && parts.every((p) => Number.isFinite(p))) {
    const [h, m, s = 0] = parts.length === 2 ? [0, parts[0], parts[1]] : parts;
    return h * 3600 + m * 60 + s;
  }
  const n = parseFloat(str);
  return Number.isFinite(n) ? n : 0;
}

const FIELD_CANDIDATES = {
  riderId: ['id', 'riderId', 'rider_id', 'employeeId', 'employee_id'],
  riderName: ['name', 'riderName', 'rider_name', 'fullName', 'full_name'],
  riderState: ['riderState', 'rider_state', 'state', 'status'],
  walletBalance: ['walletBalance', 'wallet_balance', 'wallet', 'walletAmount'],
  breaksCount: ['breaksCount', 'breaks_count', 'breaks', 'numberOfBreaks', 'number_of_breaks'],
  breakTime: ['breaksTime', 'breaks_time', 'breakTime', 'break_time'],
  lateTime: ['lateTime', 'late_time'],
  currentSession: ['currentSession', 'current_session', 'sessionLabel', 'session'],
  performance: ['performance', 'utr', 'UTR'],
  timeWorked: ['timeWorked', 'time_worked', 'workedTime', 'worked_time'],
  acceptanceRate: ['acceptanceRate', 'acceptance_rate', 'acceptance'],
  ordersToday: ['orders', 'deliveries', 'ordersToday', 'orders_today'],
  vehicle: ['vehicle', 'vehicleType', 'vehicle_type'],
  zone: ['zone', 'area', 'startingPoint', 'starting_point'],
} as const;

/** Best-effort status bucket from Talabat's free-text state + breaks/late signals. */
function classifyStatusBucket(rawState: string, breaksCount: number, lateTimeSeconds: number): LiveRiderStatusBucket {
  const s = rawState.trim().toLowerCase();
  if (!s) return 'unknown';
  if (lateTimeSeconds > 0) return 'late';
  if (breaksCount > 0 && /break/.test(s)) return 'on_break';
  if (/working|active|online|busy|delivering/.test(s)) return 'online';
  if (/ending|offline|inactive|logged.?out/.test(s)) return 'offline';
  if (/break/.test(s)) return 'on_break';
  return 'unknown';
}

export function mapRawRoosterLiveRider(row: RawRider, lastSyncAt: string): LiveRider | null {
  const riderId = pick(row, FIELD_CANDIDATES.riderId);
  if (riderId === null) return null;

  const rawState = String(pick(row, FIELD_CANDIDATES.riderState) ?? '').trim();
  const breaksCount = toNumber(pick(row, FIELD_CANDIDATES.breaksCount), 0);
  const lateTimeSeconds = toSeconds(pick(row, FIELD_CANDIDATES.lateTime));

  return {
    riderId: String(riderId).trim(),
    riderName: String(pick(row, FIELD_CANDIDATES.riderName) ?? '').trim(),
    riderState: rawState,
    statusBucket: classifyStatusBucket(rawState, breaksCount, lateTimeSeconds),
    walletBalance: toNumber(pick(row, FIELD_CANDIDATES.walletBalance), 0),
    breaksCount,
    breakTimeSeconds: toSeconds(pick(row, FIELD_CANDIDATES.breakTime)),
    lateTimeSeconds,
    currentSessionLabel: String(pick(row, FIELD_CANDIDATES.currentSession) ?? '').trim(),
    performance: pick(row, FIELD_CANDIDATES.performance),
    timeWorkedLabel: String(pick(row, FIELD_CANDIDATES.timeWorked) ?? '').trim(),
    acceptanceRate: (() => {
      const raw = pick(row, FIELD_CANDIDATES.acceptanceRate);
      if (raw === null) return null;
      const n = toNumber(raw, NaN);
      return Number.isFinite(n) ? n : null;
    })(),
    ordersToday: (() => {
      const raw = pick(row, FIELD_CANDIDATES.ordersToday);
      if (raw === null) return null;
      const n = toNumber(raw, NaN);
      return Number.isFinite(n) ? n : null;
    })(),
    vehicle: pick(row, FIELD_CANDIDATES.vehicle) ? String(pick(row, FIELD_CANDIDATES.vehicle)) : null,
    zone: pick(row, FIELD_CANDIDATES.zone) ? String(pick(row, FIELD_CANDIDATES.zone)) : null,
    lastSyncAt,
  };
}

export function mapRawRoosterLiveRiders(rows: unknown[], lastSyncAt: string): LiveRider[] {
  const mapped: LiveRider[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const rider = mapRawRoosterLiveRider(row as RawRider, lastSyncAt);
    if (rider) mapped.push(rider);
  }
  return mapped;
}
