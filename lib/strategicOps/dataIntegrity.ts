import { parseDailySheetDate, normalizeRiderCodeForPerformance } from '@/lib/dataFilter';
import type { Rider, Supervisor } from '@/lib/adminService';
import {
  resolveSmartRiderCode,
  buildCodeNormalizationAudit,
  type CodeNormalizationAuditReport,
  type SmartCodeResolution,
} from '@/lib/strategicOps/codeNormalization';

export type ValidatedPerfRec = {
  date: string;
  riderCode: string;
  hours: number;
  orders: number;
  breakMinutes: number;
  delayMinutes: number;
  sheetRow: number;
};

export type SmartDedupLogEntry = {
  riderCode: string;
  date: string;
  duplicatesCount: number;
  selectedRecordReason: string;
};

export type GhostRiderShadowEntry = {
  riderCode: string;
  rawRiderCode: string;
  totalHours: number;
  totalOrders: number;
  rowCount: number;
  dates: string[];
};

export type ScopeExcludedRiderEntry = {
  riderCode: string;
  rawRiderCode: string;
  totalHours: number;
  totalOrders: number;
  rowCount: number;
  dates: string[];
};

export type GhostRiderRowEntry = {
  riderCode: string;
  rawRiderCode: string;
  date: string;
  sheetRow: number;
  hours: number;
  orders: number;
};

export type UnassignedRiderEntry = {
  riderCode: string;
  name: string;
};

export type DataIntegrityReport = {
  totalRows: number;
  validRows: number;
  officialRows: number;
  shadowRows: number;
  duplicateRows: number;
  missingRiders: number;
  missingSupervisors: number;
  missingDates: string[];
  completenessPercentage: number;
  validDaysInDataset: number;
  calendarPeriodDays: number;
  dataQualityScore: number;
  kpiQualityGatePassed: boolean;
  dataLeakageDetected: boolean;
  ghostLeakagePercent: number;
  warningLevel: 'none' | 'amber' | 'red';
  warningMessage: string;
  operationalAverageHoursPerDay: number;
  executionAverageHoursPerDay: number;
  officialTotalHours: number;
  ghostRiderLeakageHours: number;
  ghostRidersCount: number;
  ghostRiderHours: number;
  ghostRiderList: GhostRiderShadowEntry[];
  /** Full ghost list for audit export (not truncated) */
  ghostRiderListFull: GhostRiderShadowEntry[];
  ghostRiders: GhostRiderRowEntry[];
  scopeExcludedRiders: ScopeExcludedRiderEntry[];
  scopeExcludedRiderCount: number;
  ghostRiderRowCount: number;
  unassignedRiders: UnassignedRiderEntry[];
  unassignedRiderCount: number;
  deduplication: {
    duplicateGroupsCount: number;
    recordsRemoved: number;
    deduplicationLog: SmartDedupLogEntry[];
  };
  presentDates: string[];
  codeNormalization: CodeNormalizationAuditReport;
};

export type DataIntegrityInput = {
  dailySheetRaw: unknown[][];
  startDate: Date;
  endDate: Date;
  ridersInScope: Rider[];
  allMasterRiders: Rider[];
  supervisors?: Supervisor[];
};

export type DataIntegrityResult = {
  report: DataIntegrityReport;
  officialPerformance: ValidatedPerfRec[];
  shadowPerformance: ValidatedPerfRec[];
};

export const KPI_QUALITY_THRESHOLD = 85;
export const GHOST_LEAKAGE_THRESHOLD_PERCENT = 5;

export const KPI_QUALITY_WARNING_AR =
  'تحذير: جودة البيانات أقل من الحد المطلوب — المؤشرات قد تكون غير دقيقة';

export const KPI_DATA_LEAKAGE_WARNING_AR =
  'DATA LEAKAGE DETECTED — KPIs MAY BE MISLEADING';

function formatIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function enumerateCalendarDates(start: Date, end: Date): string[] {
  const dates: string[] = [];
  const cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  const endD = new Date(end);
  endD.setHours(0, 0, 0, 0);
  while (cur.getTime() <= endD.getTime()) {
    dates.push(formatIsoDate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

function parseNum(v: unknown): number {
  const n = parseFloat(String(v ?? '').replace(/[, ]+/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function inDateRangeIso(dateStr: string, start: Date, end: Date): boolean {
  const d = parseDailySheetDate(dateStr);
  if (!d) return false;
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const s = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
  const e = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
  return t >= s && t <= e;
}

type RawPerfRow = {
  date: string;
  /** Effective code after smart normalization (used for matching & dedup) */
  riderCode: string;
  /** Legacy normalizeRiderCodeForPerformance only */
  legacyRiderCode: string;
  rawRiderCode: string;
  hours: number;
  orders: number;
  breakMinutes: number;
  delayMinutes: number;
  sheetRow: number;
  smartResolution: SmartCodeResolution;
};

function buildMasterMap(riders: Rider[]): Map<string, Rider> {
  const map = new Map<string, Rider>();
  for (const r of riders) {
    const n = normalizeRiderCodeForPerformance(r.code);
    if (n) map.set(n, r);
  }
  return map;
}

function completenessScore(row: RawPerfRow, masterByNorm: Map<string, Rider>): number {
  let score = 0;
  if (row.hours > 0) score += 1;
  if (row.orders > 0) score += 1;
  const rider = masterByNorm.get(row.riderCode);
  if (rider) score += 1;
  if (rider && String(rider.supervisorCode ?? '').trim()) score += 1;
  return score;
}

function selectBestDuplicate(
  group: RawPerfRow[],
  masterByNorm: Map<string, Rider>
): { kept: RawPerfRow; reason: string } {
  if (group.length === 1) {
    return { kept: group[0], reason: 'single_record' };
  }

  const ranked = group
    .map((row) => ({
      row,
      score: completenessScore(row, masterByNorm),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.row.hours !== a.row.hours) return b.row.hours - a.row.hours;
      return b.row.sheetRow - a.row.sheetRow;
    });

  const best = ranked[0];
  return {
    kept: best.row,
    reason: `completeness_score=${best.score}, hours=${best.row.hours}, sheet_row=${best.row.sheetRow}`,
  };
}

function computeDataQualityScore(input: {
  completenessPercentage: number;
  duplicateRows: number;
  totalRows: number;
  ghostRiderRowCount: number;
  unassignedRiderCount: number;
  totalRegistered: number;
  missingSupervisors: number;
}): number {
  let score = 100;

  score -= (100 - input.completenessPercentage) * 0.4;

  if (input.totalRows > 0) {
    const dupPct = (input.duplicateRows / input.totalRows) * 100;
    score -= Math.min(20, dupPct * 0.2);
    const ghostPct = (input.ghostRiderRowCount / input.totalRows) * 100;
    score -= Math.min(15, ghostPct * 0.15);
  }

  if (input.totalRegistered > 0) {
    const unassignedPct = (input.unassignedRiderCount / input.totalRegistered) * 100;
    score -= Math.min(10, unassignedPct * 0.1);
  }

  score -= Math.min(15, input.missingSupervisors * 2);

  return round2(Math.max(0, Math.min(100, score)));
}

function toValidatedRec(row: RawPerfRow): ValidatedPerfRec {
  return {
    date: row.date,
    riderCode: row.rawRiderCode,
    hours: row.hours,
    orders: row.orders,
    breakMinutes: row.breakMinutes,
    delayMinutes: row.delayMinutes,
    sheetRow: row.sheetRow,
  };
}

/**
 * Data Integrity Layer — COO-grade operational truth pipeline.
 * RAW → Normalize Rider Code → Deduplication → Ghost Audit → KPI Engine
 */
export function runDataIntegrityLayer(input: DataIntegrityInput): DataIntegrityResult {
  const { dailySheetRaw, startDate, endDate, ridersInScope, allMasterRiders, supervisors = [] } = input;

  const masterByNorm = buildMasterMap(allMasterRiders);
  const masterNormSet = new Set(masterByNorm.keys());
  const scopeNormSet = new Set(
    ridersInScope.map((r) => normalizeRiderCodeForPerformance(r.code)).filter(Boolean)
  );

  const supervisorCodesValid = new Set(
    allMasterRiders.map((r) => String(r.supervisorCode ?? '').trim()).filter(Boolean)
  );

  const unassignedRiders: UnassignedRiderEntry[] = [];
  let missingSupervisors = 0;

  for (const r of ridersInScope) {
    const code = normalizeRiderCodeForPerformance(r.code);
    if (!code) continue;
    const sup = String(r.supervisorCode ?? '').trim();
    if (!sup) {
      unassignedRiders.push({ riderCode: code, name: String(r.name ?? code) });
    } else if (!supervisorCodesValid.has(sup)) {
      missingSupervisors += 1;
    }
  }

  const rawInRange: RawPerfRow[] = [];
  const headerOffset =
    dailySheetRaw.length > 0 && String(dailySheetRaw[0][0] ?? '').includes('تاريخ') ? 1 : 0;

  for (let i = headerOffset; i < dailySheetRaw.length; i++) {
    const row = dailySheetRaw[i];
    if (!row?.length) continue;

    const parsed = parseDailySheetDate(row[0]);
    if (!parsed) continue;
    const dateStr = formatIsoDate(parsed);
    if (!inDateRangeIso(dateStr, startDate, endDate)) continue;

    const rawRiderCode = String(row[1] ?? '').trim();
    const legacyNorm = normalizeRiderCodeForPerformance(rawRiderCode);
    if (!legacyNorm) continue;

    const smartResolution = resolveSmartRiderCode(rawRiderCode, allMasterRiders);
    const effectiveCode =
      smartResolution.matched &&
      smartResolution.confidence >= 90 &&
      !smartResolution.manualReviewRequired
        ? smartResolution.effectiveCode
        : legacyNorm;

    rawInRange.push({
      date: dateStr,
      riderCode: effectiveCode,
      legacyRiderCode: legacyNorm,
      rawRiderCode,
      hours: parseNum(row[2]),
      orders: parseNum(row[6]),
      breakMinutes: parseNum(row[3]),
      delayMinutes: parseNum(row[4]),
      sheetRow: i + 1,
      smartResolution,
    });
  }

  const totalRows = rawInRange.length;

  const byDayRider = new Map<string, RawPerfRow[]>();
  for (const rec of rawInRange) {
    const key = `${rec.date}|${rec.riderCode}`;
    const list = byDayRider.get(key) ?? [];
    list.push(rec);
    byDayRider.set(key, list);
  }

  const deduplicationLog: SmartDedupLogEntry[] = [];
  let duplicateRows = 0;
  let duplicateGroupsCount = 0;

  const officialDeduped: RawPerfRow[] = [];
  const shadowDeduped: RawPerfRow[] = [];
  const scopeExcludedDeduped: RawPerfRow[] = [];
  const ghostRowEntries: GhostRiderRowEntry[] = [];

  for (const [, group] of byDayRider) {
    const { kept, reason } = selectBestDuplicate(group, masterByNorm);

    if (group.length > 1) {
      duplicateGroupsCount += 1;
      duplicateRows += group.length - 1;
      deduplicationLog.push({
        riderCode: kept.riderCode,
        date: kept.date,
        duplicatesCount: group.length,
        selectedRecordReason: reason,
      });
    }

    const isGhost = !masterNormSet.has(kept.riderCode);

    if (isGhost) {
      shadowDeduped.push(kept);
      ghostRowEntries.push({
        riderCode: kept.riderCode,
        rawRiderCode: kept.rawRiderCode,
        date: kept.date,
        sheetRow: kept.sheetRow,
        hours: kept.hours,
        orders: kept.orders,
      });
      continue;
    }

    if (!scopeNormSet.has(kept.riderCode)) {
      scopeExcludedDeduped.push(kept);
      continue;
    }

    officialDeduped.push(kept);
  }

  const officialPerformance = officialDeduped.map(toValidatedRec);
  const shadowPerformance = shadowDeduped.map(toValidatedRec);

  const allKeptDates = new Set([
    ...officialDeduped.map((r) => r.date),
    ...shadowDeduped.map((r) => r.date),
  ]);
  const expectedDates = enumerateCalendarDates(startDate, endDate);
  const missingDates = expectedDates.filter((d) => !allKeptDates.has(d));
  const completenessPercentage =
    expectedDates.length > 0
      ? round2((allKeptDates.size / expectedDates.length) * 100)
      : 0;

  const calendarPeriodDays = expectedDates.length;
  const validDaysInDataset = allKeptDates.size;

  const officialTotalHours = round2(officialPerformance.reduce((s, r) => s + r.hours, 0));
  const ghostRiderLeakageHours = round2(shadowPerformance.reduce((s, r) => s + r.hours, 0));
  const totalRecordedHours = round2(officialTotalHours + ghostRiderLeakageHours);

  const operationalAverageHoursPerDay =
    calendarPeriodDays > 0 ? round2(officialTotalHours / calendarPeriodDays) : 0;
  const executionAverageHoursPerDay =
    validDaysInDataset > 0 ? round2(officialTotalHours / validDaysInDataset) : 0;

  const ghostLeakagePercent =
    totalRecordedHours > 0 ? round2((ghostRiderLeakageHours / totalRecordedHours) * 100) : 0;

  const ghostByRider = new Map<string, GhostRiderShadowEntry>();
  for (const row of shadowDeduped) {
    const existing = ghostByRider.get(row.riderCode);
    if (!existing) {
      ghostByRider.set(row.riderCode, {
        riderCode: row.riderCode,
        rawRiderCode: row.rawRiderCode,
        totalHours: row.hours,
        totalOrders: row.orders,
        rowCount: 1,
        dates: [row.date],
      });
    } else {
      existing.totalHours = round2(existing.totalHours + row.hours);
      existing.totalOrders += row.orders;
      existing.rowCount += 1;
      existing.dates.push(row.date);
    }
  }

  const ghostRiderList = [...ghostByRider.values()].sort((a, b) => b.totalHours - a.totalHours);
  const uniqueGhostRiders = ghostRiderList.length;

  const scopeExcludedByRider = new Map<string, ScopeExcludedRiderEntry>();
  for (const row of scopeExcludedDeduped) {
    const existing = scopeExcludedByRider.get(row.riderCode);
    if (!existing) {
      scopeExcludedByRider.set(row.riderCode, {
        riderCode: row.riderCode,
        rawRiderCode: row.rawRiderCode,
        totalHours: row.hours,
        totalOrders: row.orders,
        rowCount: 1,
        dates: [row.date],
      });
    } else {
      existing.totalHours = round2(existing.totalHours + row.hours);
      existing.totalOrders += row.orders;
      existing.rowCount += 1;
      existing.dates.push(row.date);
    }
  }
  const scopeExcludedRiders = [...scopeExcludedByRider.values()].sort(
    (a, b) => b.totalHours - a.totalHours
  );

  const allProcessedRows = [...officialDeduped, ...shadowDeduped, ...scopeExcludedDeduped];
  const codeNormalization = buildCodeNormalizationAudit({
    rows: allProcessedRows.map((r) => ({
      originalCode: r.rawRiderCode,
      legacyCode: r.legacyRiderCode,
      effectiveCode: r.riderCode,
      hours: r.hours,
      orders: r.orders,
      resolution: r.smartResolution,
    })),
    masterNormSet,
    supervisors,
  });

  const dataQualityScore = computeDataQualityScore({
    completenessPercentage,
    duplicateRows,
    totalRows,
    ghostRiderRowCount: ghostRowEntries.length,
    unassignedRiderCount: unassignedRiders.length,
    totalRegistered: ridersInScope.length,
    missingSupervisors,
  });

  const dataLeakageDetected = ghostLeakagePercent > GHOST_LEAKAGE_THRESHOLD_PERCENT;
  const qualityBelowThreshold = dataQualityScore < KPI_QUALITY_THRESHOLD;
  const kpiQualityGatePassed = !qualityBelowThreshold && !dataLeakageDetected;

  let warningLevel: DataIntegrityReport['warningLevel'] = 'none';
  let warningMessage = '';

  if (dataLeakageDetected && qualityBelowThreshold) {
    warningLevel = 'red';
    warningMessage = `${KPI_DATA_LEAKAGE_WARNING_AR} | ${KPI_QUALITY_WARNING_AR}`;
  } else if (dataLeakageDetected) {
    warningLevel = 'red';
    warningMessage = `${KPI_DATA_LEAKAGE_WARNING_AR} (${ghostLeakagePercent}% ghost leakage)`;
  } else if (qualityBelowThreshold) {
    warningLevel = 'amber';
    warningMessage = `${KPI_QUALITY_WARNING_AR} (${dataQualityScore}/100)`;
  }

  const report: DataIntegrityReport = {
    totalRows,
    validRows: officialPerformance.length + shadowPerformance.length,
    officialRows: officialPerformance.length,
    shadowRows: shadowPerformance.length,
    duplicateRows,
    missingRiders: uniqueGhostRiders,
    missingSupervisors,
    missingDates,
    completenessPercentage,
    validDaysInDataset,
    calendarPeriodDays,
    dataQualityScore,
    kpiQualityGatePassed,
    dataLeakageDetected,
    ghostLeakagePercent,
    warningLevel,
    warningMessage,
    operationalAverageHoursPerDay,
    executionAverageHoursPerDay,
    officialTotalHours,
    ghostRiderLeakageHours,
    ghostRidersCount: uniqueGhostRiders,
    ghostRiderHours: ghostRiderLeakageHours,
    ghostRiderList: ghostRiderList.slice(0, 100),
    ghostRiderListFull: ghostRiderList,
    ghostRiders: ghostRowEntries.slice(0, 100),
    scopeExcludedRiders,
    scopeExcludedRiderCount: scopeExcludedRiders.length,
    ghostRiderRowCount: ghostRowEntries.length,
    unassignedRiders,
    unassignedRiderCount: unassignedRiders.length,
    deduplication: {
      duplicateGroupsCount,
      recordsRemoved: duplicateRows,
      deduplicationLog: deduplicationLog.slice(0, 50),
    },
    presentDates: [...allKeptDates].sort(),
    codeNormalization,
  };

  return { report, officialPerformance, shadowPerformance };
}

/** @deprecated use runDataIntegrityLayer return shape */
export type DuplicateAuditEntry = SmartDedupLogEntry;
