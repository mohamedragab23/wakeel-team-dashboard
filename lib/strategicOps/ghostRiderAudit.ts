import type { Rider, Supervisor } from '@/lib/adminService';
import { normalizeRiderCodeForPerformance, riderCodesMatch } from '@/lib/riderCodeUtils';
import type { ScopeExcludedRiderEntry } from '@/lib/strategicOps/dataIntegrity';

export type GhostRiderCategory =
  | 'code_mismatch'
  | 'missing_master'
  | 'normalization_failed'
  | 'zone_filtering'
  | 'supervisor_mapping';

export const GHOST_CATEGORY_LABELS_AR: Record<GhostRiderCategory, string> = {
  code_mismatch: 'A — عدم تطابق الكود',
  missing_master: 'B — غائب من شيت المناديب',
  normalization_failed: 'C — فشل التطبيع',
  zone_filtering: 'D — استبعاد فلتر الزون/المشرف',
  supervisor_mapping: 'E — فشل ربط المشرف',
};

export type GhostRiderAuditEntry = {
  riderCode: string;
  rawRiderCode: string;
  riderName: string;
  supervisorCode: string;
  supervisorName: string;
  totalHours: number;
  totalOrders: number;
  workDays: number;
  category: GhostRiderCategory;
  reasonAr: string;
  masterCodeIfFound: string | null;
};

export type GhostRootCauseSummary = {
  codeMismatchPercent: number;
  missingMasterPercent: number;
  normalizationFailedPercent: number;
  zoneFilteringPercent: number;
  supervisorMappingPercent: number;
  counts: Record<GhostRiderCategory, number>;
};

export type GhostRiderAuditReport = {
  totalGhostRiders: number;
  totalScopeExcludedRiders: number;
  totalAnomalies: number;
  ghostLeakagePercent: number;
  registeredRidersInScope: number;
  ratioGhostToRegisteredPercent: number;
  riders: GhostRiderAuditEntry[];
  rootCauseSummary: GhostRootCauseSummary;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function pct(part: number, total: number): number {
  return total > 0 ? round2((part / total) * 100) : 0;
}

/** Extract leading numeric rider id from codes like "1502449_WAKEEL_BC". */
function extractLeadingNumericCode(raw: string): string {
  const m = String(raw).match(/(\d{4,})/);
  if (!m) return '';
  return normalizeRiderCodeForPerformance(m[1]);
}

function buildMasterMaps(allMasterRiders: Rider[]) {
  const byNorm = new Map<string, Rider>();
  const byRaw = new Map<string, Rider>();
  for (const r of allMasterRiders) {
    const norm = normalizeRiderCodeForPerformance(r.code);
    if (norm) byNorm.set(norm, r);
    const raw = String(r.code ?? '').trim();
    if (raw) byRaw.set(raw, r);
  }
  return { byNorm, byRaw };
}

function findMasterByFuzzy(
  rawRiderCode: string,
  norm: string,
  byNorm: Map<string, Rider>,
  byRaw: Map<string, Rider>
): Rider | null {
  if (norm && byNorm.has(norm)) return byNorm.get(norm)!;

  const raw = String(rawRiderCode).trim();
  if (byRaw.has(raw)) return byRaw.get(raw)!;

  for (const r of byNorm.values()) {
    if (riderCodesMatch(rawRiderCode, r.code)) return r;
  }

  const leading = extractLeadingNumericCode(rawRiderCode);
  if (leading && byNorm.has(leading)) return byNorm.get(leading)!;

  return null;
}

function classifyGhostRider(input: {
  rawRiderCode: string;
  norm: string;
  master: Rider | null;
  inMasterByNorm: boolean;
  scopeExcluded: boolean;
  supervisorMap: Map<string, Supervisor>;
}): { category: GhostRiderCategory; reasonAr: string; masterCode: string | null } {
  const { rawRiderCode, norm, master, inMasterByNorm, scopeExcluded, supervisorMap } = input;

  if (scopeExcluded && inMasterByNorm && master) {
    const sup = String(master.supervisorCode ?? '').trim();
    if (!sup) {
      return {
        category: 'supervisor_mapping',
        reasonAr: 'الطيار موجود في المناديب لكن بدون مشرف — مُستبعد من نطاق التحليل',
        masterCode: String(master.code ?? '').trim(),
      };
    }
    return {
      category: 'zone_filtering',
      reasonAr: `الطيار موجود في المناديب (كود ${master.code}) لكن خارج نطاق الزون/المشرف المحدد`,
      masterCode: String(master.code ?? '').trim(),
    };
  }

  if (!norm || (norm === '0' && rawRiderCode.replace(/\D/g, '').length > 0)) {
    return {
      category: 'normalization_failed',
      reasonAr: `فشل تطبيع الكود من "${rawRiderCode}" إلى معرّف صالح`,
      masterCode: master ? String(master.code ?? '').trim() : null,
    };
  }

  if (master && !inMasterByNorm) {
    const sup = String(master.supervisorCode ?? '').trim();
    if (!sup) {
      return {
        category: 'supervisor_mapping',
        reasonAr: `تطابق جزئي مع المناديب (كود الشيت: ${master.code}) لكن بدون مشرف معيّن`,
        masterCode: String(master.code ?? '').trim(),
      };
    }
    return {
      category: 'code_mismatch',
      reasonAr: `الكود في البيانات اليومية "${rawRiderCode}" لا يطابق كود المناديب "${master.code}" بعد التطبيع`,
      masterCode: String(master.code ?? '').trim(),
    };
  }

  if (master && inMasterByNorm) {
    const sup = String(master.supervisorCode ?? '').trim();
    if (!sup) {
      return {
        category: 'supervisor_mapping',
        reasonAr: 'موجود في المناديب لكن بدون مشرف',
        masterCode: String(master.code ?? '').trim(),
      };
    }
  }

  return {
    category: 'missing_master',
    reasonAr: 'لا يوجد سجل مطابق في شيت المناديب (المناديب)',
    masterCode: null,
  };
}

type GhostAgg = {
  riderCode: string;
  rawRiderCode: string;
  totalHours: number;
  totalOrders: number;
  workDays: Set<string>;
  inMasterByNorm: boolean;
  scopeExcluded: boolean;
};

export function buildGhostRiderAudit(input: {
  ghostRiderList: Array<{
    riderCode: string;
    rawRiderCode: string;
    totalHours: number;
    totalOrders: number;
    dates: string[];
  }>;
  scopeExcludedRiders: ScopeExcludedRiderEntry[];
  allMasterRiders: Rider[];
  ridersInScopeCount: number;
  ghostLeakagePercent: number;
  supervisors: Supervisor[];
}): GhostRiderAuditReport {
  const { byNorm, byRaw } = buildMasterMaps(input.allMasterRiders);
  const supervisorMap = new Map(
    input.supervisors.map((s) => [String(s.code ?? '').trim(), s])
  );

  const agg = new Map<string, GhostAgg>();

  for (const g of input.ghostRiderList) {
    const existing = agg.get(g.riderCode);
    if (!existing) {
      agg.set(g.riderCode, {
        riderCode: g.riderCode,
        rawRiderCode: g.rawRiderCode,
        totalHours: g.totalHours,
        totalOrders: g.totalOrders,
        workDays: new Set(g.dates),
        inMasterByNorm: false,
        scopeExcluded: false,
      });
    } else {
      existing.totalHours = round2(existing.totalHours + g.totalHours);
      existing.totalOrders += g.totalOrders;
      for (const d of g.dates) existing.workDays.add(d);
    }
  }

  for (const s of input.scopeExcludedRiders) {
    const existing = agg.get(s.riderCode);
    if (!existing) {
      agg.set(s.riderCode, {
        riderCode: s.riderCode,
        rawRiderCode: s.rawRiderCode,
        totalHours: s.totalHours,
        totalOrders: s.totalOrders,
        workDays: new Set(s.dates),
        inMasterByNorm: true,
        scopeExcluded: true,
      });
    } else {
      existing.inMasterByNorm = true;
      existing.scopeExcluded = true;
      existing.totalHours = round2(existing.totalHours + s.totalHours);
      existing.totalOrders += s.totalOrders;
      for (const d of s.dates) existing.workDays.add(d);
    }
  }

  const riders: GhostRiderAuditEntry[] = [];

  for (const row of agg.values()) {
    const master = findMasterByFuzzy(row.rawRiderCode, row.riderCode, byNorm, byRaw);
    const { category, reasonAr, masterCode } = classifyGhostRider({
      rawRiderCode: row.rawRiderCode,
      norm: row.riderCode,
      master,
      inMasterByNorm: row.inMasterByNorm || (master ? byNorm.has(normalizeRiderCodeForPerformance(master.code)) : false),
      scopeExcluded: row.scopeExcluded,
      supervisorMap,
    });

    const masterRider = master ?? (row.riderCode ? byNorm.get(row.riderCode) : undefined);
    const supCode = masterRider ? String(masterRider.supervisorCode ?? '').trim() : '';
    const sup = supCode ? supervisorMap.get(supCode) : undefined;

    riders.push({
      riderCode: row.riderCode,
      rawRiderCode: row.rawRiderCode,
      riderName: masterRider ? String(masterRider.name ?? row.riderCode) : row.rawRiderCode,
      supervisorCode: supCode,
      supervisorName: sup?.name ?? (supCode || '—'),
      totalHours: round2(row.totalHours),
      totalOrders: row.totalOrders,
      workDays: row.workDays.size,
      category,
      reasonAr,
      masterCodeIfFound: masterCode,
    });
  }

  riders.sort((a, b) => b.totalHours - a.totalHours);

  const counts: Record<GhostRiderCategory, number> = {
    code_mismatch: 0,
    missing_master: 0,
    normalization_failed: 0,
    zone_filtering: 0,
    supervisor_mapping: 0,
  };
  for (const r of riders) counts[r.category] += 1;

  const total = riders.length;
  const ghostOnly = riders.filter((r) => r.category !== 'zone_filtering').length;
  const scopeExcluded = counts.zone_filtering;

  const rootCauseSummary: GhostRootCauseSummary = {
    codeMismatchPercent: pct(counts.code_mismatch, total),
    missingMasterPercent: pct(counts.missing_master, total),
    normalizationFailedPercent: pct(counts.normalization_failed, total),
    zoneFilteringPercent: pct(counts.zone_filtering, total),
    supervisorMappingPercent: pct(counts.supervisor_mapping, total),
    counts,
  };

  return {
    totalGhostRiders: ghostOnly,
    totalScopeExcludedRiders: scopeExcluded,
    totalAnomalies: total,
    ghostLeakagePercent: input.ghostLeakagePercent,
    registeredRidersInScope: input.ridersInScopeCount,
    ratioGhostToRegisteredPercent: pct(ghostOnly, input.ridersInScopeCount),
    riders,
    rootCauseSummary,
  };
}
