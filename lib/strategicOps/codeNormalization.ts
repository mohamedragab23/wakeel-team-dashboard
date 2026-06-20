import type { Rider, Supervisor } from '@/lib/adminService';
import { normalizeRiderCodeForPerformance } from '@/lib/riderCodeUtils';

export type MatchMethod =
  | 'direct_match'
  | 'suffix_strip'
  | 'regex_extraction'
  | 'manual_review'
  | 'no_match';

export const MATCH_METHOD_LABELS_AR: Record<MatchMethod, string> = {
  direct_match: 'تطابق مباشر (100%)',
  suffix_strip: 'إزالة لاحقة (95%)',
  regex_extraction: 'استخراج رقمي (90%)',
  manual_review: 'مراجعة يدوية مطلوبة',
  no_match: 'لا يوجد تطابق',
};

export type CodeNormalizationEntry = {
  originalCode: string;
  legacyNormalizedCode: string;
  normalizedCode: string;
  effectiveCode: string;
  matchMethod: MatchMethod;
  confidence: number;
  matched: boolean;
  manualReviewRequired: boolean;
  matchedRiderName: string | null;
  matchedSupervisorCode: string | null;
  matchedSupervisorName: string | null;
  matchedMasterCode: string | null;
  rejectionReason: string | null;
  totalHours: number;
  totalOrders: number;
  rowCount: number;
};

export type CodeNormalizationAuditReport = {
  pipelinePath: string;
  codesNormalized: number;
  codesMatched: number;
  codesRejected: number;
  codesManualReview: number;
  ghostLeakagePercentBefore: number;
  ghostLeakagePercentAfter: number;
  improvementPercent: number;
  recoveredHours: number;
  recoveredOrders: number;
  recoveredRiders: number;
  ghostLeakageHoursBefore: number;
  ghostLeakageHoursAfter: number;
  ghostLeakageOrdersBefore: number;
  ghostLeakageOrdersAfter: number;
  ghostRidersCountBefore: number;
  ghostRidersCountAfter: number;
  entries: CodeNormalizationEntry[];
};

export type SmartCodeResolution = {
  originalCode: string;
  legacyNormalizedCode: string;
  normalizedCode: string;
  effectiveCode: string;
  matchMethod: MatchMethod;
  confidence: number;
  matched: boolean;
  manualReviewRequired: boolean;
  matchedRider: Rider | null;
  rejectionReason: string | null;
};

const MIN_CONFIDENCE_AUTO = 90;
const MIN_NUMERIC_DIGITS = 4;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function pct(part: number, total: number): number {
  return total > 0 ? round2((part / total) * 100) : 0;
}

function cleanRawCode(raw: string): string {
  return String(raw ?? '')
    .replace(/\uFEFF/g, '')
    .trim()
    .replace(/^['’`]+/, '')
    .replace(/^"(.*)"$/, '$1');
}

/** Strip WAKEEL suffix/prefix patterns → numeric core candidate. */
function trySuffixStrip(raw: string): string | null {
  let s = cleanRawCode(raw).replace(/\s+/g, ' ');
  const patterns = [
    /^(\d{4,})[\s_-]+wakeel(?:[\s_-]*bc)?$/i,
    /^(\d{4,})[\s_-]+bc$/i,
    /^wakeel[\s_-]+(\d{4,})$/i,
    /^(\d{4,})-wakeel(?:-bc)?$/i,
    /^(\d{4,})_wakeel(?:_bc)?$/i,
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m?.[1]) {
      const norm = normalizeRiderCodeForPerformance(m[1]);
      if (norm && /^\d+$/.test(norm) && norm.length >= MIN_NUMERIC_DIGITS) return norm;
    }
  }
  const stripped = s
    .replace(/[_\s-]+wakeel(_bc)?$/i, '')
    .replace(/^wakeel[_\s-]+/i, '')
    .replace(/\s+bc$/i, '')
    .trim();
  const norm = normalizeRiderCodeForPerformance(stripped);
  if (norm && /^\d+$/.test(norm) && norm.length >= MIN_NUMERIC_DIGITS && norm !== normalizeRiderCodeForPerformance(raw)) {
    return norm;
  }
  return null;
}

/** Extract all numeric blocks (4+ digits) from code string. */
function extractNumericCandidates(raw: string): string[] {
  const western = cleanRawCode(raw)
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
  const matches = western.match(/\d{4,}/g) ?? [];
  const unique = [...new Set(matches.map((m) => normalizeRiderCodeForPerformance(m)).filter(Boolean))];
  return unique;
}

function findMasterByNorm(allMasterRiders: Rider[], norm: string): Rider[] {
  return allMasterRiders.filter((r) => normalizeRiderCodeForPerformance(r.code) === norm);
}

export function resolveSmartRiderCode(
  rawRiderCode: string,
  allMasterRiders: Rider[]
): SmartCodeResolution {
  const originalCode = String(rawRiderCode ?? '').trim();
  const legacyNormalizedCode = normalizeRiderCodeForPerformance(originalCode);

  const base: Omit<SmartCodeResolution, 'normalizedCode' | 'effectiveCode' | 'matchMethod' | 'confidence' | 'matched' | 'manualReviewRequired' | 'matchedRider' | 'rejectionReason'> = {
    originalCode,
    legacyNormalizedCode,
  };

  if (!legacyNormalizedCode) {
    return {
      ...base,
      normalizedCode: '',
      effectiveCode: '',
      matchMethod: 'no_match',
      confidence: 0,
      matched: false,
      manualReviewRequired: true,
      matchedRider: null,
      rejectionReason: 'فشل التطبيع الأساسي للكود',
    };
  }

  const directMatches = findMasterByNorm(allMasterRiders, legacyNormalizedCode);
  if (directMatches.length === 1) {
    return {
      ...base,
      normalizedCode: legacyNormalizedCode,
      effectiveCode: legacyNormalizedCode,
      matchMethod: 'direct_match',
      confidence: 100,
      matched: true,
      manualReviewRequired: false,
      matchedRider: directMatches[0],
      rejectionReason: null,
    };
  }
  if (directMatches.length > 1) {
    return {
      ...base,
      normalizedCode: legacyNormalizedCode,
      effectiveCode: legacyNormalizedCode,
      matchMethod: 'manual_review',
      confidence: 50,
      matched: false,
      manualReviewRequired: true,
      matchedRider: null,
      rejectionReason: `أكثر من مندوب في المناديب يطابق الكود ${legacyNormalizedCode}`,
    };
  }

  const suffixCandidate = trySuffixStrip(originalCode);
  if (suffixCandidate) {
    const suffixMatches = findMasterByNorm(allMasterRiders, suffixCandidate);
    if (suffixMatches.length === 1) {
      return {
        ...base,
        normalizedCode: suffixCandidate,
        effectiveCode: suffixCandidate,
        matchMethod: 'suffix_strip',
        confidence: 95,
        matched: true,
        manualReviewRequired: false,
        matchedRider: suffixMatches[0],
        rejectionReason: null,
      };
    }
    if (suffixMatches.length > 1) {
      return {
        ...base,
        normalizedCode: suffixCandidate,
        effectiveCode: legacyNormalizedCode,
        matchMethod: 'manual_review',
        confidence: 50,
        matched: false,
        manualReviewRequired: true,
        matchedRider: null,
        rejectionReason: `إزالة اللاحقة → ${suffixCandidate} لكن يطابق ${suffixMatches.length} مناديب`,
      };
    }
  }

  const numericCandidates = extractNumericCandidates(originalCode);
  if (numericCandidates.length > 1) {
    return {
      ...base,
      normalizedCode: numericCandidates[0],
      effectiveCode: legacyNormalizedCode,
      matchMethod: 'manual_review',
      confidence: 70,
      matched: false,
      manualReviewRequired: true,
      matchedRider: null,
      rejectionReason: `أكثر من مرشح رقمي: ${numericCandidates.join(', ')}`,
    };
  }

  if (numericCandidates.length === 1) {
    const candidate = numericCandidates[0];
    const regexMatches = findMasterByNorm(allMasterRiders, candidate);
    if (regexMatches.length === 1) {
      const confidence = candidate === legacyNormalizedCode ? 100 : 90;
      const method: MatchMethod = candidate === legacyNormalizedCode ? 'direct_match' : 'regex_extraction';
      if (confidence >= MIN_CONFIDENCE_AUTO) {
        return {
          ...base,
          normalizedCode: candidate,
          effectiveCode: candidate,
          matchMethod: method,
          confidence,
          matched: true,
          manualReviewRequired: false,
          matchedRider: regexMatches[0],
          rejectionReason: null,
        };
      }
    }
    if (regexMatches.length > 1) {
      return {
        ...base,
        normalizedCode: candidate,
        effectiveCode: legacyNormalizedCode,
        matchMethod: 'manual_review',
        confidence: 50,
        matched: false,
        manualReviewRequired: true,
        matchedRider: null,
        rejectionReason: `الاستخراج الرقمي ${candidate} يطابق أكثر من مندوب`,
      };
    }
  }

  return {
    ...base,
    normalizedCode: legacyNormalizedCode,
    effectiveCode: legacyNormalizedCode,
    matchMethod: 'no_match',
    confidence: 0,
    matched: false,
    manualReviewRequired: false,
    matchedRider: null,
    rejectionReason: null,
  };
}

export function buildCodeNormalizationAudit(input: {
  rows: Array<{
    originalCode: string;
    legacyCode: string;
    effectiveCode: string;
    hours: number;
    orders: number;
    resolution: SmartCodeResolution;
  }>;
  masterNormSet: Set<string>;
  supervisors: Supervisor[];
}): CodeNormalizationAuditReport {
  const supervisorMap = new Map(
    input.supervisors.map((s) => [String(s.code ?? '').trim(), s])
  );

  const byOriginal = new Map<string, CodeNormalizationEntry>();

  let ghostHoursBefore = 0;
  let ghostHoursAfter = 0;
  let ghostOrdersBefore = 0;
  let ghostOrdersAfter = 0;
  const ghostRidersBefore = new Set<string>();
  const ghostRidersAfter = new Set<string>();
  const recoveredRiders = new Set<string>();

  for (const row of input.rows) {
    const wasGhost = !input.masterNormSet.has(row.legacyCode);
    const isGhost = !input.masterNormSet.has(row.effectiveCode);

    if (wasGhost) {
      ghostHoursBefore += row.hours;
      ghostOrdersBefore += row.orders;
      ghostRidersBefore.add(row.originalCode);
    }
    if (isGhost) {
      ghostHoursAfter += row.hours;
      ghostOrdersAfter += row.orders;
      ghostRidersAfter.add(row.originalCode);
    }
    if (wasGhost && !isGhost) {
      recoveredRiders.add(row.originalCode);
    }

    const res = row.resolution;
    const rider = res.matchedRider;
    const supCode = rider ? String(rider.supervisorCode ?? '').trim() : '';
    const sup = supCode ? supervisorMap.get(supCode) : undefined;

    const existing = byOriginal.get(row.originalCode);
    if (!existing) {
      byOriginal.set(row.originalCode, {
        originalCode: row.originalCode,
        legacyNormalizedCode: row.legacyCode,
        normalizedCode: res.normalizedCode,
        effectiveCode: row.effectiveCode,
        matchMethod: res.matchMethod,
        confidence: res.confidence,
        matched: res.matched && res.confidence >= MIN_CONFIDENCE_AUTO && !res.manualReviewRequired,
        manualReviewRequired: res.manualReviewRequired || res.confidence < MIN_CONFIDENCE_AUTO,
        matchedRiderName: rider ? String(rider.name ?? rider.code) : null,
        matchedSupervisorCode: supCode || null,
        matchedSupervisorName: sup?.name ?? (supCode || null),
        matchedMasterCode: rider ? String(rider.code ?? '').trim() : null,
        rejectionReason: res.rejectionReason,
        totalHours: round2(row.hours),
        totalOrders: row.orders,
        rowCount: 1,
      });
    } else {
      existing.totalHours = round2(existing.totalHours + row.hours);
      existing.totalOrders += row.orders;
      existing.rowCount += 1;
    }
  }

  const entries = [...byOriginal.values()].sort((a, b) => b.totalHours - a.totalHours);

  const codesNormalized = entries.filter((e) => e.legacyNormalizedCode !== e.effectiveCode).length;
  const codesMatched = entries.filter((e) => e.matched).length;
  const codesManualReview = entries.filter((e) => e.manualReviewRequired).length;
  const codesRejected = entries.filter(
    (e) => !e.matched && !e.manualReviewRequired && e.matchMethod === 'no_match'
  ).length;

  const totalHours = round2(ghostHoursBefore + (input.rows.reduce((s, r) => s + r.hours, 0) - ghostHoursBefore));
  const totalRecorded = input.rows.reduce((s, r) => s + r.hours, 0);
  const totalRecordedRounded = round2(totalRecorded);

  const ghostLeakagePercentBefore = pct(ghostHoursBefore, totalRecordedRounded);
  const ghostLeakagePercentAfter = pct(ghostHoursAfter, totalRecordedRounded);
  const improvementPercent =
    ghostLeakagePercentBefore > 0
      ? round2(((ghostLeakagePercentBefore - ghostLeakagePercentAfter) / ghostLeakagePercentBefore) * 100)
      : 0;

  return {
    pipelinePath: 'RAW → Normalize Rider Code → Deduplication → Ghost Audit → KPI Engine',
    codesNormalized,
    codesMatched,
    codesRejected,
    codesManualReview,
    ghostLeakagePercentBefore,
    ghostLeakagePercentAfter,
    improvementPercent,
    recoveredHours: round2(ghostHoursBefore - ghostHoursAfter),
    recoveredOrders: ghostOrdersBefore - ghostOrdersAfter,
    recoveredRiders: recoveredRiders.size,
    ghostLeakageHoursBefore: round2(ghostHoursBefore),
    ghostLeakageHoursAfter: round2(ghostHoursAfter),
    ghostLeakageOrdersBefore: ghostOrdersBefore,
    ghostLeakageOrdersAfter: ghostOrdersAfter,
    ghostRidersCountBefore: ghostRidersBefore.size,
    ghostRidersCountAfter: ghostRidersAfter.size,
    entries,
  };
}
