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

/** Format seconds to "Xh Ym" or "Ym" or "00:00" */
function formatWorkTime(seconds: number): string {
  if (!seconds || seconds === 0) return '00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}س ${m}د`;
  return `${m}د`;
}

/** Format shift time from ISO timestamp to "HH:MM - HH:MM" */
function formatSessionLabel(startISO: any, endISO: any): string {
  try {
    if (!startISO) return '—';
    const start = new Date(startISO);
    const end = endISO ? new Date(endISO) : null;
    const startTime = start.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: false });
    if (!end) return startTime;
    const endTime = end.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: false });
    return `${startTime} - ${endTime}`;
  } catch {
    return String(startISO || '—');
  }
}

const FIELD_CANDIDATES = {
  riderId: ['employee_id', 'employeeId', 'id', 'riderId', 'rider_id'],
  riderName: ['name', 'riderName', 'rider_name', 'fullName', 'full_name'],
  riderState: ['status', 'riderState', 'rider_state', 'state'],
  walletBalance: ['wallet_info.balance', 'walletBalance', 'wallet_balance', 'wallet', 'walletAmount'],
  breaksCount: ['performance.time_spent.number_of_breaks', 'breaksCount', 'breaks_count', 'breaks', 'numberOfBreaks', 'number_of_breaks'],
  breakTime: ['performance.time_spent.break_seconds', 'breaksTime', 'breaks_time', 'breakTime', 'break_time'],
  lateTime: ['performance.time_spent.late_seconds', 'lateTime', 'late_time'],
  currentSession: ['active_shift_started_at', 'currentSession', 'current_session', 'sessionLabel', 'session'],
  performance: ['performance.utilization_rate', 'performance', 'utr', 'UTR'],
  timeWorked: ['performance.time_spent.worked_seconds', 'timeWorked', 'time_worked', 'workedTime', 'worked_time'],
  acceptanceRate: ['performance.acceptance_rate', 'acceptanceRate', 'acceptance_rate', 'acceptance'],
  ordersToday: ['deliveries_info.completed_deliveries_count', 'orders', 'deliveries', 'ordersToday', 'orders_today'],
  vehicle: ['vehicle.name', 'vehicle', 'vehicleType', 'vehicle_type'],
  zone: ['starting_point.name', 'zone.name', 'zone', 'area', 'startingPoint', 'starting_point'],
} as const;

/** Best-effort status bucket from Talabat's free-text state + breaks/late signals. */
function classifyStatusBucket(rawState: string, breaksCount: number, lateTimeSeconds: number): LiveRiderStatusBucket {
  const s = rawState.trim().toLowerCase();
  if (!s) return 'unknown';
  if (lateTimeSeconds > 0) return 'late';
  if (s === 'break' || breaksCount > 0) return 'on_break';
  if (s === 'working' || /working|active|online|busy|delivering/.test(s)) return 'online';
  if (/ending|offline|inactive|logged.?out/.test(s)) return 'offline';
  return 'unknown';
}

export function mapRawRoosterLiveRider(row: RawRider, lastSyncAt: string): LiveRider | null {
  const riderId = pick(row, FIELD_CANDIDATES.riderId);
  if (riderId === null) return null;

  const rawState = String(pick(row, FIELD_CANDIDATES.riderState) ?? '').trim();
  const breaksCount = toNumber(pick(row, FIELD_CANDIDATES.breaksCount), 0);
  const lateTimeSeconds = toSeconds(pick(row, FIELD_CANDIDATES.lateTime));
  
  // Format session label from ISO timestamps
  const shiftStart = row['active_shift_started_at'];
  const shiftEnd = row['active_shift_ended_at'];
  const currentSessionLabel = formatSessionLabel(shiftStart, shiftEnd);
  
  // Format worked time from seconds
  const workedSeconds = toSeconds(pick(row, FIELD_CANDIDATES.timeWorked));
  const timeWorkedLabel = formatWorkTime(workedSeconds);

  return {
    riderId: String(riderId).trim(),
    riderName: String(pick(row, FIELD_CANDIDATES.riderName) ?? '').trim(),
    riderState: rawState,
    statusBucket: classifyStatusBucket(rawState, breaksCount, lateTimeSeconds),
    walletBalance: toNumber(pick(row, FIELD_CANDIDATES.walletBalance), 0),
    breaksCount,
    breakTimeSeconds: toSeconds(pick(row, FIELD_CANDIDATES.breakTime)),
    lateTimeSeconds,
    currentSessionLabel,
    performance: pick(row, FIELD_CANDIDATES.performance),
    timeWorkedLabel,
    acceptanceRate: (() => {
      const raw = pick(row, FIELD_CANDIDATES.acceptanceRate);
      if (raw === null) return null;
      const n = toNumber(raw, NaN);
      // Convert to percentage if it's a decimal (0.0-1.0)
      if (Number.isFinite(n) && n <= 1.0) return n * 100;
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
