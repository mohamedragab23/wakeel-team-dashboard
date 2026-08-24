/**
 * Supervisor declaration queue hydration — one batchGet for all reference sheets.
 * Global short TTL cache is SHARED raw tables only; ACL filter is per-supervisor in memory.
 * Does NOT modify Protected googleSheets / liability store / payoutCycles store.
 */
import { cache } from '@/lib/cache';
import {
  getSheetDataBatchOrThrow,
  getSheetsApiReadCount,
  bumpSheetsApiReadCount,
  type BatchGetDeps,
} from '@/lib/googleSheetsBatchRead';
import { SHEET_EQUIPMENT_LIABILITY } from '@/lib/equipmentLiability/constants';
import {
  rowToEquipmentLiability,
  type EquipmentLiabilityIssue,
} from '@/lib/equipmentLiability/store';
import {
  buildSupervisorEquipmentDeskFromParts,
  parseEquipmentPaymentProposalsFromRows,
  SHEET_EQUIPMENT_PAYMENT_PROPOSALS,
  type SupervisorEquipmentDeskRow,
} from '@/lib/equipmentLiability/paymentProposals';
import { SHEET_PAYOUT_CYCLES } from '@/lib/payoutCycles/constants';
import { rowToPayoutCycle } from '@/lib/payoutCycles/store';
import type { PayoutCycle } from '@/lib/payoutCycles/types';
import { buildFreshDeclarationQueue } from '@/lib/equipmentDeductions/exceptionQueues';
import {
  cycleLabelForPayout,
  monthLabelForPayout,
} from '@/lib/equipmentDeductions/operationalEngine';
import {
  normalizeRiderCodeForPerformance,
  normalizeSupervisorCodeForMatch,
} from '@/lib/dataFilter';

const BUNDLE_CACHE_KEY = 'sup-decl:sheets-bundle:v1';
/** Shared READ-ONLY reference bundle — short TTL (financial correctness > staleness). */
const BUNDLE_TTL_MS = 20_000;
const CYCLES_TTL_MS = 3 * 60_000;

export const SUPERVISOR_DECL_BATCH_RANGES = [
  'المناديب!A:Z',
  `${SHEET_EQUIPMENT_LIABILITY}!A:AZ`,
  `${SHEET_EQUIPMENT_PAYMENT_PROPOSALS}!A:Z`,
  `${SHEET_PAYOUT_CYCLES}!A:AZ`,
  'الاستقطاعات!A:Z',
  'الاستقطاعات_الفعلية!A:Z',
] as const;

export type SupervisorDeclarationSheetsBundle = {
  rosterRows: unknown[][];
  liabilityRows: unknown[][];
  proposalRows: unknown[][];
  cycleRows: unknown[][];
  requestRows: unknown[][];
  actualRows: unknown[][];
  fetchedAt: number;
  sheetsApiReads: number;
};

export type SupervisorDeclarationHydrationResult = {
  rows: Array<
    SupervisorEquipmentDeskRow & {
      securityPaidUpfront: boolean | null;
      w1RequestEgp: number | null;
      w1RawWalletEgp: number | null;
      w1ActualEgp: number | null;
      w2RequestEgp: number | null;
      w2RawWalletEgp: number | null;
      w2ActualEgp: number | null;
      sheetActualTotalEgp: number | null;
      warnings: string[];
      needsFreshDeclaration: true;
    }
  >;
  rosterRiderCount: number;
  liabilityCount: number;
  cycles: Array<{
    cycleId: string;
    year: number;
    month: number;
    cycleNumber: number;
    startDate: string;
    endDate: string;
    payoutDate: string;
    status: string;
    isClosing: boolean;
  }>;
  metrics: {
    sheetsApiReads: number;
    cacheHit: boolean;
    batchRangeCount: number;
    perRiderSheetReads: 0;
  };
};

function parseRidersForSupervisor(
  rosterRows: unknown[][],
  supervisorCode: string
): Array<{ code: string; name: string; region?: string }> {
  const supNorm = normalizeSupervisorCodeForMatch(supervisorCode);
  const riders: Array<{ code: string; name: string; region?: string }> = [];
  for (let i = 1; i < rosterRows.length; i++) {
    const row = rosterRows[i] || [];
    const code = String(row[0] ?? '').trim();
    if (!code) continue;
    const riderSup = String(row[3] ?? '').trim();
    if (!riderSup) continue;
    if (normalizeSupervisorCodeForMatch(riderSup) !== supNorm) continue;
    riders.push({
      code,
      name: String(row[1] ?? '').trim(),
      region: String(row[2] ?? '').trim(),
    });
  }
  return riders;
}

function parseLiabilities(rows: unknown[][]): EquipmentLiabilityIssue[] {
  const out: EquipmentLiabilityIssue[] = [];
  for (let i = 1; i < rows.length; i++) {
    const issue = rowToEquipmentLiability(rows[i] || [], i + 1);
    if (issue) out.push(issue);
  }
  return out;
}

function parseCycles(rows: unknown[][]): PayoutCycle[] {
  const out: PayoutCycle[] = [];
  for (let i = 1; i < rows.length; i++) {
    const c = rowToPayoutCycle(rows[i] || [], i + 1);
    if (c) out.push(c);
  }
  return out.sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    if (a.month !== b.month) return a.month - b.month;
    return a.cycleNumber - b.cycleNumber;
  });
}

export function invalidateSupervisorDeclarationBundleCache(): void {
  cache.clear(BUNDLE_CACHE_KEY);
  cache.clear(`${BUNDLE_CACHE_KEY}:cycles`);
}

/** After declaration Save — drop shared bundle so next load sees fresh evidence if needed. */
export function invalidateAfterSupervisorDeclarationSave(): void {
  // Declarations are append-only; reference sheets (liability/request/actual) unchanged by Save.
  // Keep short TTL; force-refresh only if callers need immediate re-evidence.
  // Do NOT wipe cycles aggressively — separate key with longer TTL.
  cache.clear(BUNDLE_CACHE_KEY);
}

export async function loadSupervisorDeclarationSheetsBundle(opts?: {
  forceRefresh?: boolean;
  deps?: BatchGetDeps;
}): Promise<{ bundle: SupervisorDeclarationSheetsBundle; cacheHit: boolean; sheetsApiReads: number }> {
  if (!opts?.forceRefresh) {
    const cached = cache.get<SupervisorDeclarationSheetsBundle>(BUNDLE_CACHE_KEY);
    if (cached) {
      return { bundle: cached, cacheHit: true, sheetsApiReads: 0 };
    }
  }

  const readsBefore = getSheetsApiReadCount();
  const tables = await getSheetDataBatchOrThrow([...SUPERVISOR_DECL_BATCH_RANGES], {
    deps: opts?.deps,
    maxAttempts: 3,
  });
  // Injected deps do not bump the global counter — count as exactly 1 batch read.
  const sheetsApiReads = opts?.deps
    ? 1
    : Math.max(1, getSheetsApiReadCount() - readsBefore);

  const bundle: SupervisorDeclarationSheetsBundle = {
    rosterRows: tables[0] || [],
    liabilityRows: tables[1] || [],
    proposalRows: tables[2] || [],
    cycleRows: tables[3] || [],
    requestRows: tables[4] || [],
    actualRows: tables[5] || [],
    fetchedAt: Date.now(),
    sheetsApiReads,
  };
  cache.set(BUNDLE_CACHE_KEY, bundle, BUNDLE_TTL_MS);
  const cycles = parseCycles(bundle.cycleRows);
  cache.set(`${BUNDLE_CACHE_KEY}:cycles`, cycles, CYCLES_TTL_MS);
  return { bundle, cacheHit: false, sheetsApiReads };
}

export function getCachedPayoutCyclesShort(): PayoutCycle[] | null {
  return cache.get<PayoutCycle[]>(`${BUNDLE_CACHE_KEY}:cycles`);
}

export function findPayoutCycleInCacheOrBundle(
  cycleId: string,
  bundle?: SupervisorDeclarationSheetsBundle
): PayoutCycle | null {
  const want = String(cycleId || '')
    .trim()
    .toLowerCase()
    .replace(/[{}]/g, '');
  if (!want) return null;
  const fromCache = getCachedPayoutCyclesShort();
  const list = fromCache || (bundle ? parseCycles(bundle.cycleRows) : []);
  return (
    list.find(
      (c) =>
        String(c.cycleId || '')
          .trim()
          .toLowerCase()
          .replace(/[{}]/g, '') === want
    ) || null
  );
}

export function assertRiderOnSupervisorRosterFromBundle(params: {
  bundle: SupervisorDeclarationSheetsBundle;
  supervisorCode: string;
  riderCode: string;
}): boolean {
  const riders = parseRidersForSupervisor(params.bundle.rosterRows, params.supervisorCode);
  const want = normalizeRiderCodeForPerformance(params.riderCode);
  return riders.some((r) => normalizeRiderCodeForPerformance(r.code) === want);
}

export function findLiabilityInBundle(
  bundle: SupervisorDeclarationSheetsBundle,
  equipmentIssueId?: string,
  riderCode?: string
): EquipmentLiabilityIssue | null {
  const issues = parseLiabilities(bundle.liabilityRows);
  const id = String(equipmentIssueId || '').trim();
  if (id) return issues.find((i) => i.equipmentIssueId === id) || null;
  const want = normalizeRiderCodeForPerformance(String(riderCode || ''));
  if (!want) return null;
  const forRider = issues.filter(
    (i) => normalizeRiderCodeForPerformance(i.riderCode) === want
  );
  return forRider.find((i) => i.status === 'open') || forRider[0] || null;
}

/**
 * Assembles the full supervisor declaration queue from ONE batchGet (or cache).
 * Guarantees: zero per-rider Sheets reads.
 */
export async function hydrateSupervisorDeclarationQueue(params: {
  supervisorCode: string;
  year?: number;
  month?: number;
  forceRefresh?: boolean;
  deps?: BatchGetDeps;
}): Promise<SupervisorDeclarationHydrationResult> {
  const { bundle, cacheHit, sheetsApiReads } = await loadSupervisorDeclarationSheetsBundle({
    forceRefresh: params.forceRefresh,
    deps: params.deps,
  });

  const riders = parseRidersForSupervisor(bundle.rosterRows, params.supervisorCode);
  const issues = parseLiabilities(bundle.liabilityRows);
  const proposals = parseEquipmentPaymentProposalsFromRows(bundle.proposalRows);
  const desk = buildSupervisorEquipmentDeskFromParts({
    supervisorCode: params.supervisorCode,
    riders,
    issues,
    pendingProposals: proposals,
  });

  const year = params.year ?? 2026;
  const month = params.month ?? 8;
  const cyclesAll = parseCycles(bundle.cycleRows);
  const cyclesFiltered = cyclesAll.filter((c) => c.year === year && c.month === month);
  const ordered = [...cyclesFiltered]
    .filter((c) => !c.isClosing)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const evidenceCycles = ordered.slice(0, 2).map((c) => ({
    cycleLabel: cycleLabelForPayout(c),
    monthLabel: monthLabelForPayout(c),
    year: c.year,
  }));

  const queue = buildFreshDeclarationQueue({
    roster: desk.rows.map((r) => ({
      riderCode: r.riderCode,
      riderName: r.riderName,
      supervisorCode: params.supervisorCode,
    })),
    liabilities: issues,
    requestRows: bundle.requestRows,
    actualRows: bundle.actualRows,
    evidenceCycles,
    supervisorCode: params.supervisorCode,
  });
  const evidenceByRider = new Map(
    queue.map((q) => [normalizeRiderCodeForPerformance(q.riderCode), q] as const)
  );

  const rows = desk.rows.map((r) => {
    const ev = evidenceByRider.get(normalizeRiderCodeForPerformance(r.riderCode));
    return {
      ...r,
      securityPaidUpfront: ev?.securityPaidUpfront ?? null,
      w1RequestEgp: ev?.w1?.requestEgp ?? null,
      w1RawWalletEgp: ev?.w1?.rawWalletEgp ?? null,
      w1ActualEgp: ev?.w1?.actualAbsEgp ?? null,
      w2RequestEgp: ev?.w2?.requestEgp ?? null,
      w2RawWalletEgp: ev?.w2?.rawWalletEgp ?? null,
      w2ActualEgp: ev?.w2?.actualAbsEgp ?? null,
      sheetActualTotalEgp:
        ev?.w1 || ev?.w2
          ? (ev?.w1?.actualAbsEgp || 0) + (ev?.w2?.actualAbsEgp || 0)
          : null,
      warnings:
        ev?.warnings ||
        (r.hasLiability ? [] : ['MISSING_LIABILITY_NEEDS_SUPERVISOR_REVIEW']),
      needsFreshDeclaration: true as const,
    };
  });

  return {
    rows,
    rosterRiderCount: desk.rosterRiderCount,
    liabilityCount: desk.liabilityCount,
    cycles: cyclesFiltered.map((c) => ({
      cycleId: c.cycleId,
      year: c.year,
      month: c.month,
      cycleNumber: c.cycleNumber,
      startDate: c.startDate,
      endDate: c.endDate,
      payoutDate: c.payoutDate,
      status: c.status,
      isClosing: !!c.isClosing,
    })),
    metrics: {
      sheetsApiReads: cacheHit ? 0 : sheetsApiReads,
      cacheHit,
      batchRangeCount: SUPERVISOR_DECL_BATCH_RANGES.length,
      perRiderSheetReads: 0,
    },
  };
}

/** Estimate concurrent load: shared cache → 1 cold read per instance window. */
export function estimateConcurrentSupervisorReads(params: {
  supervisors: number;
  cacheHitRatio: number;
}): number {
  const cold = Math.max(0, 1 - params.cacheHitRatio);
  return Math.ceil(params.supervisors * cold);
}

// Keep bump available for tests that inject fake batchGet without going through default client.
export { bumpSheetsApiReadCount };
