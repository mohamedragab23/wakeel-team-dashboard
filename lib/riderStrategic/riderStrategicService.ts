import { getAllRiders } from '@/lib/adminService';
import {
  appendToSheet,
  ensureSheetExists,
  getSheetData,
  updateSheetRow,
} from '@/lib/googleSheets';
import { parseDailySheetDate, normalizeSupervisorCodeForMatch } from '@/lib/dataFilter';
import { normalizeRiderCodeForPerformance } from '@/lib/riderCodeUtils';
import { isApprovedResignationStatus } from '@/lib/strategicOps/resignationStatus';
import { cache, CACHE_KEYS } from '@/lib/cache';
import {
  RIDER_STATUS_OPTIONS,
  RIDER_TYPE_OPTIONS,
  SHEET_STRATEGIC_AUDIT,
  SHEET_STRATEGIC_RIDERS,
  STRATEGIC_RIDER_HEADERS,
  type RiderStrategicEditableFields,
  type RiderStrategicProfile,
  type RiskLevel,
  type RiderStatusOption,
  type RiderTypeOption,
} from './types';
import { logStrategicRiderChanges } from './activityLog';

const SHEET_RIDERS = 'المناديب';
const SHEET_PERFORMANCE = 'البيانات اليومية';
const SHEET_RESIGNATIONS = 'طلبات_الإقالة';

export async function ensureStrategicSheets(): Promise<void> {
  await ensureSheetExists(SHEET_STRATEGIC_RIDERS, [...STRATEGIC_RIDER_HEADERS]);
}

function isStrategicHeader(row: unknown[]): boolean {
  const a = String(row[0] ?? '').trim();
  return a === 'كود_الطيار' || a === 'كود الطيار';
}

function parseNum(v: unknown): number {
  const n = parseFloat(String(v ?? '').replace(/[, ]+/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

function formatIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseIsoDate(v: unknown): string {
  if (!v) return '';
  if (v instanceof Date && !isNaN(v.getTime())) return formatIsoDate(v);
  const s = String(v).trim();
  if (!s) return '';
  const d = parseDailySheetDate(v);
  return d ? formatIsoDate(d) : s.slice(0, 10);
}

function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(`${fromIso}T00:00:00`);
  const b = new Date(`${toIso}T00:00:00`);
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return 0;
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / 86400000));
}

export function computeRiskLevel(daysSince: number | null): RiskLevel {
  if (daysSince === null) return 'unknown';
  if (daysSince <= 3) return 'green';
  if (daysSince <= 7) return 'yellow';
  return 'red';
}

type ResignationInfo = { reason: string; date: string };

function buildLastActivityMap(perfData: unknown[][]): Map<string, string> {
  const map = new Map<string, string>();
  const start = perfData.length > 0 && String(perfData[0][0] ?? '').includes('تاريخ') ? 1 : 0;

  for (let i = start; i < perfData.length; i++) {
    const row = perfData[i];
    if (!row?.length) continue;
    const date = parseDailySheetDate(row[0]);
    if (!date) continue;
    const hours = parseNum(row[2]);
    const orders = parseNum(row[6]);
    if (hours <= 0 && orders <= 0) continue;
    const code = normalizeRiderCodeForPerformance(row[1]);
    if (!code) continue;
    const dateStr = formatIsoDate(date);
    const prev = map.get(code);
    if (!prev || dateStr > prev) map.set(code, dateStr);
  }
  return map;
}

function buildResignationMap(resData: unknown[][]): Map<string, ResignationInfo> {
  const map = new Map<string, ResignationInfo>();
  const start = resData.length > 0 ? 1 : 0;

  for (let i = start; i < resData.length; i++) {
    const row = resData[i];
    if (!row?.length) continue;
    if (!isApprovedResignationStatus(row[5])) continue;
    const code = normalizeRiderCodeForPerformance(row[2]);
    if (!code) continue;
    const approval = parseIsoDate(row[7]) || parseIsoDate(row[6]);
    const reason = String(row[4] ?? '').trim();
    const existing = map.get(code);
    if (!existing || (approval && approval > existing.date)) {
      map.set(code, { reason, date: approval });
    }
  }
  return map;
}

type StoredStrategicRow = {
  sheetRow: number;
  riderCode: string;
  name: string;
  actualJoinDate: string;
  riderType: string;
  dailyTargetHours: number;
  currentStatus: string;
  supervisorNotes: string;
  lastFollowUpDate: string;
  updatedAt: string;
  updatedBy: string;
};

function readStoredStrategicRows(data: unknown[][]): Map<string, StoredStrategicRow> {
  const map = new Map<string, StoredStrategicRow>();
  const start = data.length > 0 && isStrategicHeader(data[0]) ? 1 : 0;

  for (let i = start; i < data.length; i++) {
    const row = data[i];
    if (!row?.length) continue;
    const code = normalizeRiderCodeForPerformance(row[0]);
    if (!code) continue;
    map.set(code, {
      sheetRow: i + 1,
      riderCode: code,
      name: String(row[1] ?? '').trim(),
      actualJoinDate: parseIsoDate(row[2]),
      riderType: String(row[3] ?? '').trim(),
      dailyTargetHours: parseNum(row[4]),
      currentStatus: String(row[5] ?? '').trim(),
      supervisorNotes: String(row[6] ?? '').trim(),
      lastFollowUpDate: parseIsoDate(row[14]),
      updatedAt: String(row[15] ?? '').trim(),
      updatedBy: String(row[16] ?? '').trim(),
    });
  }
  return map;
}

function profileToSheetRow(p: RiderStrategicProfile): string[] {
  return [
    p.riderCode,
    p.name,
    p.actualJoinDate,
    p.riderType,
    String(p.dailyTargetHours || ''),
    p.currentStatus,
    p.supervisorNotes,
    p.lastActivityDate ?? '',
    p.daysSinceLastActivity !== null ? String(p.daysSinceLastActivity) : '',
    p.resignationReason,
    p.resignationDate,
    p.riskLevel,
    p.activationOwnerCode,
    p.activationOwnerName,
    p.lastFollowUpDate,
    p.updatedAt,
    p.updatedBy,
  ];
}

function buildProfile(
  base: {
    code: string;
    name: string;
    joinDate?: string;
    supervisorCode: string;
    supervisorName: string;
    status?: string;
  },
  stored: StoredStrategicRow | undefined,
  lastActivity: string | undefined,
  resignation: ResignationInfo | undefined,
  todayIso: string,
  canEdit: boolean
): RiderStrategicProfile {
  const actualJoinDate = stored?.actualJoinDate || parseIsoDate(base.joinDate);
  const lastActivityDate = lastActivity || null;
  const daysSinceLastActivity = lastActivityDate ? daysBetween(lastActivityDate, todayIso) : null;

  let currentStatus = stored?.currentStatus as RiderStatusOption | '';
  if (!currentStatus) {
    const s = String(base.status ?? '').trim();
    if (s.includes('مُقال') || resignation) currentStatus = 'غير نشط';
    else if (s.includes('موقوف') || s.includes('معلق')) currentStatus = 'موقوف';
    else currentStatus = 'نشط';
  }

  return {
    riderCode: base.code,
    name: stored?.name || base.name,
    actualJoinDate,
    riderType: (stored?.riderType as RiderTypeOption) || '',
    dailyTargetHours: stored?.dailyTargetHours ?? 0,
    currentStatus,
    supervisorNotes: stored?.supervisorNotes ?? '',
    lastActivityDate,
    daysSinceLastActivity,
    resignationReason: resignation?.reason ?? '',
    resignationDate: resignation?.date ?? '',
    riskLevel: computeRiskLevel(daysSinceLastActivity),
    activationOwnerCode: base.supervisorCode,
    activationOwnerName: base.supervisorName,
    lastFollowUpDate: stored?.lastFollowUpDate ?? '',
    updatedAt: stored?.updatedAt ?? '',
    updatedBy: stored?.updatedBy ?? '',
    sheetRow: stored?.sheetRow ?? null,
    missingJoinDate: !actualJoinDate,
    canEdit,
  };
}

export type LoadProfilesOptions = {
  supervisorCodes?: Set<string> | null;
  riderCode?: string;
  refresh?: boolean;
};

export async function loadRiderStrategicProfiles(
  options: LoadProfilesOptions = {}
): Promise<RiderStrategicProfile[]> {
  await ensureStrategicSheets();

  const [riders, strategicData, perfData, resData] = await Promise.all([
    getAllRiders(options.refresh ?? false),
    getSheetData(SHEET_STRATEGIC_RIDERS, !options.refresh),
    getSheetData(SHEET_PERFORMANCE, !options.refresh),
    getSheetData(SHEET_RESIGNATIONS, !options.refresh),
  ]);

  const storedMap = readStoredStrategicRows(strategicData);
  const lastActivityMap = buildLastActivityMap(perfData);
  const resignationMap = buildResignationMap(resData);
  const todayIso = formatIsoDate(new Date());

  let filtered = riders.map((r) => ({
    code: normalizeRiderCodeForPerformance(r.code),
    name: String(r.name ?? '').trim(),
    joinDate: r.joinDate,
    supervisorCode: String(r.supervisorCode ?? '').trim(),
    supervisorName: String(r.supervisorName ?? '').trim(),
    status: r.status,
  }));

  if (options.supervisorCodes) {
    const scopeNorm = new Set(
      [...options.supervisorCodes].map((c) => normalizeSupervisorCodeForMatch(c))
    );
    filtered = filtered.filter((r) =>
      scopeNorm.has(normalizeSupervisorCodeForMatch(r.supervisorCode))
    );
  }

  if (options.riderCode) {
    const target = normalizeRiderCodeForPerformance(options.riderCode);
    filtered = filtered.filter((r) => r.code === target);
  }

  return filtered
    .filter((r) => r.code)
    .map((r) => {
      const canEdit =
        !options.supervisorCodes ||
        [...options.supervisorCodes].some(
          (c) =>
            normalizeSupervisorCodeForMatch(c) ===
            normalizeSupervisorCodeForMatch(r.supervisorCode)
        );
      return buildProfile(
        r,
        storedMap.get(r.code),
        lastActivityMap.get(r.code),
        resignationMap.get(r.code),
        todayIso,
        canEdit
      );
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
}

export async function upsertRiderStrategicProfile(
  riderCode: string,
  fields: RiderStrategicEditableFields,
  actor: { code: string; name: string },
  source: 'manual' | 'bulk' = 'manual'
): Promise<RiderStrategicProfile> {
  if (!fields.actualJoinDate?.trim()) {
    throw new Error('تاريخ الانضمام الفعلي إلزامي');
  }

  if (fields.riderType && !RIDER_TYPE_OPTIONS.includes(fields.riderType as RiderTypeOption)) {
    throw new Error('نوع الطيار غير صالح');
  }

  if (fields.currentStatus && !RIDER_STATUS_OPTIONS.includes(fields.currentStatus as RiderStatusOption)) {
    throw new Error('حالة الطيار غير صالحة');
  }

  await ensureStrategicSheets();
  const normalized = normalizeRiderCodeForPerformance(riderCode);
  const [profiles, strategicData] = await Promise.all([
    loadRiderStrategicProfiles({ riderCode: normalized, refresh: true }),
    getSheetData(SHEET_STRATEGIC_RIDERS, false),
  ]);

  const existing = profiles[0];
  if (!existing) throw new Error('الطيار غير موجود');

  const before: Record<string, string> = {
    actualJoinDate: existing.actualJoinDate,
    riderType: existing.riderType,
    dailyTargetHours: String(existing.dailyTargetHours),
    currentStatus: existing.currentStatus,
    supervisorNotes: existing.supervisorNotes,
    lastFollowUpDate: existing.lastFollowUpDate,
  };

  const updated: RiderStrategicProfile = {
    ...existing,
    actualJoinDate: fields.actualJoinDate ?? existing.actualJoinDate,
    riderType: fields.riderType !== undefined ? fields.riderType : existing.riderType,
    dailyTargetHours: fields.dailyTargetHours !== undefined ? fields.dailyTargetHours : existing.dailyTargetHours,
    currentStatus: fields.currentStatus !== undefined ? fields.currentStatus : existing.currentStatus,
    supervisorNotes: fields.supervisorNotes !== undefined ? fields.supervisorNotes : existing.supervisorNotes,
    lastFollowUpDate: fields.lastFollowUpDate !== undefined ? fields.lastFollowUpDate : existing.lastFollowUpDate,
    updatedAt: new Date().toISOString(),
    updatedBy: actor.name || actor.code,
    missingJoinDate: false,
  };

  const after: Record<string, string> = {
    actualJoinDate: updated.actualJoinDate,
    riderType: updated.riderType,
    dailyTargetHours: String(updated.dailyTargetHours),
    currentStatus: updated.currentStatus,
    supervisorNotes: updated.supervisorNotes,
    lastFollowUpDate: updated.lastFollowUpDate,
  };

  await logStrategicRiderChanges(normalized, before, after, actor.code, actor.name, source);

  const storedMap = readStoredStrategicRows(strategicData);
  const stored = storedMap.get(normalized);
  const rowValues = profileToSheetRow(updated);

  if (stored?.sheetRow) {
    await updateSheetRow(SHEET_STRATEGIC_RIDERS, stored.sheetRow, rowValues);
  } else {
    await appendToSheet(SHEET_STRATEGIC_RIDERS, [rowValues], false);
    updated.sheetRow = strategicData.length + 1;
  }

  cache.clear(CACHE_KEYS.sheetData(SHEET_STRATEGIC_RIDERS));
  const refreshed = (await loadRiderStrategicProfiles({ riderCode: normalized, refresh: true }))[0];
  return refreshed ?? updated;
}

export async function syncAutoFieldsToSheet(profiles: RiderStrategicProfile[]): Promise<void> {
  const strategicData = await getSheetData(SHEET_STRATEGIC_RIDERS, false);
  const storedMap = readStoredStrategicRows(strategicData);

  for (const p of profiles) {
    const stored = storedMap.get(p.riderCode);
    const rowValues = profileToSheetRow(p);
    if (stored?.sheetRow) {
      const needsUpdate =
        String(strategicData[stored.sheetRow - 1]?.[7] ?? '') !== (p.lastActivityDate ?? '') ||
        String(strategicData[stored.sheetRow - 1]?.[8] ?? '') !==
          (p.daysSinceLastActivity !== null ? String(p.daysSinceLastActivity) : '') ||
        String(strategicData[stored.sheetRow - 1]?.[11] ?? '') !== p.riskLevel;
      if (needsUpdate) {
        await updateSheetRow(SHEET_STRATEGIC_RIDERS, stored.sheetRow, rowValues);
      }
    }
  }
}

export function invalidateStrategicRiderCaches(): void {
  cache.clear(CACHE_KEYS.sheetData(SHEET_STRATEGIC_RIDERS));
  cache.clear(CACHE_KEYS.sheetData(SHEET_STRATEGIC_AUDIT));
  cache.clear('admin:riders');
}
