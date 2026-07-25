/**
 * SRS-011 Part 4 — Fleet Distribution Intelligence.
 *
 * A COO doesn't think in "Target Achievement %" — they think in riders and
 * hours: who is barely working, who is stable, who is elite. This engine
 * buckets every rider already computed in `RiderIntelligence` (SRS-006) by
 * their actual daily hours, with names/supervisor/last-active-day attached,
 * plus a deterministic "what if we raised everyone under 4h to 6h" uplift —
 * no invented numbers, just re-aggregating what's already computed.
 */
import type { RiderIntelligence } from './types';

export type FleetHourBucketId = 'under_2' | 'under_4' | '4_6' | '6_8' | '8_10' | 'over_10';
export type FleetBucketTone = 'critical' | 'warning' | 'neutral' | 'good' | 'elite';

export type FleetBucketRider = {
  code: string;
  name: string;
  supervisorCode: string;
  supervisorName: string;
  actualHoursDaily: number;
  noShowCount: number;
  lastActiveDate: string | null;
  /** Merged in later (async, Google Sheets) by the API layer — null until then. */
  lastCommentAr: string | null;
  lastCommentDate: string | null;
};

export type FleetHourBucket = {
  id: FleetHourBucketId;
  labelAr: string;
  labelEn: string;
  minHours: number;
  maxHours: number | null;
  tone: FleetBucketTone;
  count: number;
  riders: FleetBucketRider[];
  recommendationAr: string;
};

export type FleetDistribution = {
  buckets: FleetHourBucket[];
  totalRiders: number;
  currentAvgHoursDaily: number;
  /** "If every rider under 4h were raised to 6h, fleet avg daily hours would
   *  increase by X" — Part 1's closing projection line. */
  upliftScenario: {
    ridersAffected: number;
    hoursAddedDaily: number;
    projectedAvgHoursDaily: number;
    deltaAvgHoursDaily: number;
  };
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const BUCKET_DEFS: Array<{
  id: FleetHourBucketId;
  labelAr: string;
  labelEn: string;
  min: number;
  max: number | null;
  tone: FleetBucketTone;
  recommendationAr: string;
}> = [
  {
    id: 'under_2',
    labelAr: 'أقل من 2 ساعة',
    labelEn: 'Under 2 Hours',
    min: 0,
    max: 2,
    tone: 'critical',
    recommendationAr: 'خطورة قصوى — شبه متوقفين عن العمل فعليًا. تواصل فوري اليوم أو قرار استبدال.',
  },
  {
    id: 'under_4',
    labelAr: 'أقل من 4 ساعات',
    labelEn: 'Under 4 Hours',
    min: 2,
    max: 4,
    tone: 'warning',
    recommendationAr: 'الأكثر تأثيرًا على تحقيق الهدف اليوم — يحتاجون تدخل المشرف المباشر خلال الساعات القادمة.',
  },
  {
    id: '4_6',
    labelAr: '4 إلى 6 ساعات',
    labelEn: '4–6 Hours',
    min: 4,
    max: 6,
    tone: 'neutral',
    recommendationAr: 'قابلون للتحسين بسهولة — دفعة بسيطة من المشرف (ساعة إضافية) تكفي لنقلهم لمستوى مستقر.',
  },
  {
    id: '6_8',
    labelAr: '6 إلى 8 ساعات',
    labelEn: '6–8 Hours',
    min: 6,
    max: 8,
    tone: 'good',
    recommendationAr: 'مستقرون — العمود الفقري للأسطول. حافظ على جدولهم ولا تغيّر شيئًا بدون سبب.',
  },
  {
    id: '8_10',
    labelAr: '8 إلى 10 ساعات',
    labelEn: '8–10 Hours',
    min: 8,
    max: 10,
    tone: 'good',
    recommendationAr: 'أداء عالٍ — رشّحهم كمرجع (Benchmark) لتدريب الطيارين الجدد في نفس الفريق.',
  },
  {
    id: 'over_10',
    labelAr: 'أكثر من 10 ساعات',
    labelEn: '+10 Hours (Elite)',
    min: 10,
    max: null,
    tone: 'elite',
    recommendationAr: 'طيارون Elite — راقب الإرهاق (Burnout) رغم الأداء الممتاز، فهو غير قابل للتكرار على باقي الأسطول.',
  },
];

export function buildFleetDistribution(riderIntelligence: RiderIntelligence[]): FleetDistribution {
  const buckets: FleetHourBucket[] = BUCKET_DEFS.map((def) => {
    const riders: FleetBucketRider[] = riderIntelligence
      .filter((r) => r.actualHoursDaily >= def.min && (def.max === null || r.actualHoursDaily < def.max))
      .sort((a, b) => a.actualHoursDaily - b.actualHoursDaily)
      .map((r) => ({
        code: r.code,
        name: r.name,
        supervisorCode: r.supervisorCode,
        supervisorName: r.supervisorName,
        actualHoursDaily: r.actualHoursDaily,
        noShowCount: r.noShowCount,
        lastActiveDate: r.lastActiveDate,
        lastCommentAr: null,
        lastCommentDate: null,
      }));

    return {
      id: def.id,
      labelAr: def.labelAr,
      labelEn: def.labelEn,
      minHours: def.min,
      maxHours: def.max,
      tone: def.tone,
      count: riders.length,
      riders,
      recommendationAr: def.recommendationAr,
    };
  });

  const totalRiders = riderIntelligence.length;
  const totalHoursDaily = riderIntelligence.reduce((s, r) => s + r.actualHoursDaily, 0);
  const currentAvgHoursDaily = totalRiders > 0 ? round2(totalHoursDaily / totalRiders) : 0;

  // "What if every rider under 4h was raised to 6h?" — deterministic sum of
  // gaps for the under_2 + under_4 buckets, re-averaged over the same fleet.
  const belowFour = riderIntelligence.filter((r) => r.actualHoursDaily < 4);
  const hoursAddedDaily = round2(belowFour.reduce((s, r) => s + Math.max(0, 6 - r.actualHoursDaily), 0));
  const projectedAvgHoursDaily =
    totalRiders > 0 ? round2((totalHoursDaily + hoursAddedDaily) / totalRiders) : 0;

  return {
    buckets,
    totalRiders,
    currentAvgHoursDaily,
    upliftScenario: {
      ridersAffected: belowFour.length,
      hoursAddedDaily,
      projectedAvgHoursDaily,
      deltaAvgHoursDaily: round2(projectedAvgHoursDaily - currentAvgHoursDaily),
    },
  };
}
