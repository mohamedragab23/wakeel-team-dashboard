import { normalizeRiderCodeForPerformance } from '@/lib/dataFilter';
import type { DataIntegrityReport, ValidatedPerfRec } from '@/lib/strategicOps/dataIntegrity';

export type RiskLevel = 'green' | 'yellow' | 'red';

export type StiBreakdown = {
  normalizedHoursPerformance: number;
  retentionScore: number;
  inverseGhostDependency: number;
  officialHours: number;
  allocatedGhostHours: number;
  trueHours: number;
  ghostDependencyRatio: number;
  activeRiderRatio: number;
  attritionRate: number;
};

export type SupervisorTruthIndex = {
  supervisorId: string;
  supervisorName: string;
  region: string;
  stiScore: number;
  rank: number;
  ghostDependencyRatio: number;
  retentionScore: number;
  riskLevel: RiskLevel;
  breakdown: StiBreakdown;
};

export type CoreRiderEntry = {
  riderCode: string;
  riderName: string;
  hours: number;
  shareOfSupervisorHours: number;
};

export type RiderDependencyResult = {
  supervisorId: string;
  supervisorName: string;
  dependencyScore: number;
  fragilityIndex: number;
  coreRidersList: CoreRiderEntry[];
  riskLevel: RiskLevel;
  breakdown: {
    totalSupervisorHours: number;
    coreRidersHours: number;
    coreRiderCount: number;
    assignedRiders: number;
    paretoThresholdPercent: number;
  };
};

export type OrpsBreakdown = {
  ghostLeakageScore: number;
  dependencyRisk: number;
  attritionPressure: number;
  inactivityRate: number;
  dataQualityPenalty: number;
  stiInverse: number;
};

export type OperationalRiskPrediction = {
  supervisorId: string;
  supervisorName: string;
  orpsScore: number;
  riskLevel: RiskLevel;
  primaryRiskDriver: string;
  breakdown: OrpsBreakdown;
};

export type TruthCriticalAlert = {
  severity: RiskLevel;
  type:
    | 'supervisor_collapse_risk'
    | 'over_dependency'
    | 'ghost_leakage_spike'
    | 'single_point_of_failure';
  messageAr: string;
  supervisorId?: string;
  riderCode?: string;
};

export type OperationalTruthIntelligence = {
  supervisorTruthIndex: SupervisorTruthIndex[];
  riderDependency: RiderDependencyResult[];
  operationalRiskPrediction: OperationalRiskPrediction[];
  globalInsights: {
    top5StableSupervisors: SupervisorTruthIndex[];
    top5HighestRiskSupervisors: OperationalRiskPrediction[];
    mostDependencyHeavyTeams: RiderDependencyResult[];
    instabilityDrivers: Array<{ riderCode: string; riderName: string; hours: number; globalShare: number }>;
    ghostLeakageHotspots: Array<{ riderCode: string; hours: number; shareOfGhostLeakage: number }>;
    singlePointOfFailureRiders: Array<{
      riderCode: string;
      riderName: string;
      supervisorId: string;
      supervisorName: string;
      hours: number;
      supervisorShare: number;
    }>;
  };
  criticalAlerts: TruthCriticalAlert[];
};

export function createDisabledOperationalTruthIntelligence(
  reasonAr: string
): OperationalTruthIntelligence {
  return {
    supervisorTruthIndex: [],
    riderDependency: [],
    operationalRiskPrediction: [],
    globalInsights: {
      top5StableSupervisors: [],
      top5HighestRiskSupervisors: [],
      mostDependencyHeavyTeams: [],
      instabilityDrivers: [],
      ghostLeakageHotspots: [],
      singlePointOfFailureRiders: [],
    },
    criticalAlerts: [
      {
        severity: 'red',
        type: 'ghost_leakage_spike',
        messageAr: reasonAr,
      },
    ],
  };
}

type RiderAggLite = {
  code: string;
  name: string;
  supervisorCode: string;
  totalHours: number;
  totalOrders: number;
};

type SupervisorLite = {
  code: string;
  name: string;
  region: string;
  targetDaily: number;
};

export type TruthEngineInput = {
  dataIntegrity: DataIntegrityReport;
  officialPerformance: ValidatedPerfRec[];
  shadowPerformance: ValidatedPerfRec[];
  supervisors: SupervisorLite[];
  riderAggs: RiderAggLite[];
  resignationsBySupervisor: Map<string, number>;
  operationalPeriodDays: number;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function riskFromScore(score: number, greenMax: number, yellowMax: number): RiskLevel {
  if (score <= greenMax) return 'green';
  if (score <= yellowMax) return 'yellow';
  return 'red';
}

function stiRiskLevel(sti: number): RiskLevel {
  if (sti >= 70) return 'green';
  if (sti >= 40) return 'yellow';
  return 'red';
}

function orpsRiskLevel(orps: number): RiskLevel {
  if (orps <= 30) return 'green';
  if (orps <= 60) return 'yellow';
  return 'red';
}

function dependencyRiskLevel(score: number): RiskLevel {
  if (score < 0.5) return 'green';
  if (score < 0.7) return 'yellow';
  return 'red';
}

/** Pareto: smallest set of riders whose cumulative hours reach `threshold` of total. */
function paretoCoreRiders(
  riders: Array<{ code: string; name: string; hours: number }>,
  threshold = 0.8
): { core: typeof riders; coreHours: number; totalHours: number } {
  const totalHours = riders.reduce((s, r) => s + r.hours, 0);
  if (totalHours <= 0) return { core: [], coreHours: 0, totalHours: 0 };

  const sorted = [...riders].sort((a, b) => b.hours - a.hours);
  let cumulative = 0;
  const core: typeof riders = [];

  for (const r of sorted) {
    core.push(r);
    cumulative += r.hours;
    if (cumulative / totalHours >= threshold) break;
  }

  return { core, coreHours: cumulative, totalHours };
}

function allocateGhostHoursByShare(
  supervisorOfficialHours: number,
  totalOfficialHours: number,
  totalGhostHours: number
): number {
  if (totalOfficialHours <= 0 || totalGhostHours <= 0) return 0;
  return round2(totalGhostHours * (supervisorOfficialHours / totalOfficialHours));
}

export function buildOperationalTruthIntelligence(input: TruthEngineInput): OperationalTruthIntelligence {
  const {
    dataIntegrity,
    supervisors,
    riderAggs,
    resignationsBySupervisor,
    operationalPeriodDays,
  } = input;

  const totalOfficialHours = dataIntegrity.officialTotalHours;
  const totalGhostHours = dataIntegrity.ghostRiderLeakageHours;

  const ridersBySupervisor = new Map<string, RiderAggLite[]>();
  for (const agg of riderAggs) {
    const sup = String(agg.supervisorCode ?? '').trim();
    if (!sup) continue;
    const list = ridersBySupervisor.get(sup) ?? [];
    list.push(agg);
    ridersBySupervisor.set(sup, list);
  }

  const fleetAvgHoursPerRider =
    riderAggs.length > 0
      ? riderAggs.reduce((s, a) => s + a.totalHours, 0) / riderAggs.length
      : 0;

  const dataQualityPenalty = round2(100 - dataIntegrity.dataQualityScore);
  const missingDataRate = round2(100 - dataIntegrity.completenessPercentage);

  const stiRows: SupervisorTruthIndex[] = [];
  const rdeRows: RiderDependencyResult[] = [];

  for (const sup of supervisors) {
    const code = String(sup.code ?? '').trim();
    const supRiders = ridersBySupervisor.get(code) ?? [];
    const assigned = supRiders.length;
    const officialHours = round2(supRiders.reduce((s, r) => s + r.totalHours, 0));
    const allocatedGhostHours = allocateGhostHoursByShare(officialHours, totalOfficialHours, totalGhostHours);
    const trueHours = round2(officialHours + allocatedGhostHours);
    const ghostDependencyRatio = trueHours > 0 ? round2(allocatedGhostHours / trueHours) : 0;

    const activeCount = supRiders.filter((r) => r.totalHours > 0).length;
    const inactiveCount = supRiders.filter((r) => r.totalHours <= 0 && r.totalOrders <= 0).length;
    const activeRiderRatio = assigned > 0 ? round2((activeCount / assigned) * 100) : 0;

    const resignations = resignationsBySupervisor.get(code) ?? 0;
    const attritionRate = assigned > 0 ? round2((resignations / assigned) * 100) : 0;
    const retentionScore = round2(clamp(100 - attritionRate, 0, 100));

    const avgHoursPerRider = assigned > 0 ? officialHours / assigned : 0;
    let normalizedHoursPerformance =
      fleetAvgHoursPerRider > 0
        ? round2(clamp((avgHoursPerRider / fleetAvgHoursPerRider) * 100, 0, 100))
        : 0;

    const targetTotal = sup.targetDaily * operationalPeriodDays;
    if (targetTotal > 0) {
      const targetAchievement = clamp((officialHours / targetTotal) * 100, 0, 100);
      normalizedHoursPerformance = round2(normalizedHoursPerformance * 0.5 + targetAchievement * 0.5);
    }

    const hoursPerf = normalizedHoursPerformance;

    const inverseGhostDependency = round2((1 - ghostDependencyRatio) * 100);

    const stiScore = round2(
      0.4 * hoursPerf + 0.3 * retentionScore + 0.3 * inverseGhostDependency
    );

    stiRows.push({
      supervisorId: code,
      supervisorName: sup.name || code,
      region: sup.region || '',
      stiScore,
      rank: 0,
      ghostDependencyRatio,
      retentionScore,
      riskLevel: stiRiskLevel(stiScore),
      breakdown: {
        normalizedHoursPerformance: hoursPerf,
        retentionScore,
        inverseGhostDependency,
        officialHours,
        allocatedGhostHours,
        trueHours,
        ghostDependencyRatio,
        activeRiderRatio,
        attritionRate,
      },
    });

    const riderHoursList = supRiders.map((r) => ({
      code: normalizeRiderCodeForPerformance(r.code),
      name: r.name || r.code,
      hours: r.totalHours,
    }));

    const pareto = paretoCoreRiders(riderHoursList, 0.8);
    const dependencyScore =
      pareto.totalHours > 0 ? round2(pareto.coreHours / pareto.totalHours) : 0;
    const fragilityIndex = dependencyScore;

    const coreRidersList: CoreRiderEntry[] = pareto.core.map((r) => ({
      riderCode: r.code,
      riderName: r.name,
      hours: round2(r.hours),
      shareOfSupervisorHours:
        pareto.totalHours > 0 ? round2((r.hours / pareto.totalHours) * 100) : 0,
    }));

    rdeRows.push({
      supervisorId: code,
      supervisorName: sup.name || code,
      dependencyScore,
      fragilityIndex,
      coreRidersList,
      riskLevel: dependencyRiskLevel(dependencyScore),
      breakdown: {
        totalSupervisorHours: round2(pareto.totalHours),
        coreRidersHours: round2(pareto.coreHours),
        coreRiderCount: pareto.core.length,
        assignedRiders: assigned,
        paretoThresholdPercent: 80,
      },
    });
  }

  stiRows.sort((a, b) => b.stiScore - a.stiScore);
  stiRows.forEach((r, i) => {
    r.rank = i + 1;
  });

  const stiById = new Map(stiRows.map((s) => [s.supervisorId, s]));
  const rdeById = new Map(rdeRows.map((r) => [r.supervisorId, r]));

  const orpsRows: OperationalRiskPrediction[] = [];

  for (const sup of supervisors) {
    const code = String(sup.code ?? '').trim();
    const sti = stiById.get(code);
    const rde = rdeById.get(code);
    const assigned = (ridersBySupervisor.get(code) ?? []).length;
    const resignations = resignationsBySupervisor.get(code) ?? 0;
    const inactive = (ridersBySupervisor.get(code) ?? []).filter(
      (r) => r.totalHours <= 0 && r.totalOrders <= 0
    ).length;

    const ghostLeakageScore = round2((sti?.ghostDependencyRatio ?? 0) * 100);
    const dependencyRisk = round2((rde?.dependencyScore ?? 0) * 100);
    const attritionPressure = assigned > 0 ? round2((resignations / assigned) * 100) : 0;
    const inactivityRate = assigned > 0 ? round2((inactive / assigned) * 100) : 0;
    const stiInverse = round2(100 - (sti?.stiScore ?? 50));

    const breakdown: OrpsBreakdown = {
      ghostLeakageScore,
      dependencyRisk,
      attritionPressure,
      inactivityRate,
      dataQualityPenalty: round2(dataQualityPenalty * 0.5 + missingDataRate * 0.5),
      stiInverse,
    };

    const orpsScore = round2(
      0.25 * ghostLeakageScore +
        0.25 * dependencyRisk +
        0.2 * attritionPressure +
        0.15 * inactivityRate +
        0.15 * breakdown.dataQualityPenalty
    );

    const drivers: Array<[string, number]> = [
      ['تسرب Ghost Riders', ghostLeakageScore * 0.25],
      ['تركّز الاعتماد على نواة الطيارين', dependencyRisk * 0.25],
      ['ضغط الإقالات', attritionPressure * 0.2],
      ['معدل عدم النشاط', inactivityRate * 0.15],
      ['عقوبة جودة البيانات', breakdown.dataQualityPenalty * 0.15],
    ];
    drivers.sort((a, b) => b[1] - a[1]);
    const primaryRiskDriver = drivers[0]?.[0] ?? 'غير محدد';

    orpsRows.push({
      supervisorId: code,
      supervisorName: sup.name || code,
      orpsScore,
      riskLevel: orpsRiskLevel(orpsScore),
      primaryRiskDriver,
      breakdown,
    });
  }

  orpsRows.sort((a, b) => b.orpsScore - a.orpsScore);

  const globalTotalHours = riderAggs.reduce((s, r) => s + r.totalHours, 0);
  const sortedGlobalRiders = [...riderAggs]
    .sort((a, b) => b.totalHours - a.totalHours)
    .map((r) => ({
      riderCode: normalizeRiderCodeForPerformance(r.code),
      riderName: r.name || r.code,
      hours: r.totalHours,
      globalShare: globalTotalHours > 0 ? round2((r.totalHours / globalTotalHours) * 100) : 0,
    }));

  let cumulative = 0;
  const instabilityDrivers: OperationalTruthIntelligence['globalInsights']['instabilityDrivers'] = [];
  for (const r of sortedGlobalRiders) {
    if (globalTotalHours <= 0) break;
    instabilityDrivers.push(r);
    cumulative += r.hours;
    if (cumulative / globalTotalHours >= 0.8) break;
  }

  const ghostHotspots = dataIntegrity.ghostRiderList.map((g) => ({
    riderCode: g.riderCode,
    hours: g.totalHours,
    shareOfGhostLeakage:
      totalGhostHours > 0 ? round2((g.totalHours / totalGhostHours) * 100) : 0,
  }));

  const singlePointOfFailureRiders: OperationalTruthIntelligence['globalInsights']['singlePointOfFailureRiders'] =
    [];
  for (const rde of rdeRows) {
    for (const core of rde.coreRidersList) {
      if (core.shareOfSupervisorHours >= 25) {
        singlePointOfFailureRiders.push({
          riderCode: core.riderCode,
          riderName: core.riderName,
          supervisorId: rde.supervisorId,
          supervisorName: rde.supervisorName,
          hours: core.hours,
          supervisorShare: core.shareOfSupervisorHours,
        });
      }
    }
  }
  singlePointOfFailureRiders.sort((a, b) => b.supervisorShare - a.supervisorShare);

  const criticalAlerts: TruthCriticalAlert[] = [];

  for (const orps of orpsRows) {
    if (orps.orpsScore >= 60) {
      criticalAlerts.push({
        severity: 'red',
        type: 'supervisor_collapse_risk',
        messageAr: `المشرف ${orps.supervisorName} (${orps.supervisorId}) معرّض لانهيار تشغيلي — ORPS=${orps.orpsScore}`,
        supervisorId: orps.supervisorId,
      });
    }
  }

  for (const rde of rdeRows) {
    if (rde.dependencyScore >= 0.7) {
      criticalAlerts.push({
        severity: rde.dependencyScore >= 0.85 ? 'red' : 'yellow',
        type: 'over_dependency',
        messageAr: `فريق ${rde.supervisorName}: اعتماد تشغيلي مرتفع (${round2(rde.dependencyScore * 100)}%) على ${rde.coreRidersList.length} طيار نواة`,
        supervisorId: rde.supervisorId,
      });
    }
  }

  if (dataIntegrity.dataLeakageDetected) {
    criticalAlerts.push({
      severity: 'red',
      type: 'ghost_leakage_spike',
      messageAr: `تسرب Ghost Riders: ${dataIntegrity.ghostRiderLeakageHours} ساعة (${dataIntegrity.ghostLeakagePercent}% من إجمالي الساعات المسجلة)`,
    });
  }

  for (const spof of singlePointOfFailureRiders.slice(0, 10)) {
    criticalAlerts.push({
      severity: spof.supervisorShare >= 40 ? 'red' : 'yellow',
      type: 'single_point_of_failure',
      messageAr: `طيار ${spof.riderName} (${spof.riderCode}) يحمل ${spof.supervisorShare}% من ساعات مشرف ${spof.supervisorName}`,
      supervisorId: spof.supervisorId,
      riderCode: spof.riderCode,
    });
  }

  for (const sti of stiRows) {
    if (sti.stiScore >= 70 && sti.breakdown.ghostDependencyRatio > 0.15) {
      criticalAlerts.push({
        severity: 'yellow',
        type: 'supervisor_collapse_risk',
        messageAr: `المشرف ${sti.supervisorName} يبدو أداءه جيداً (STI=${sti.stiScore}) لكن يعتمد على تسرب بيانات بنسبة ${round2(sti.ghostDependencyRatio * 100)}% — أداء مضلل محتمل`,
        supervisorId: sti.supervisorId,
      });
    }
  }

  return {
    supervisorTruthIndex: stiRows,
    riderDependency: rdeRows.sort((a, b) => b.dependencyScore - a.dependencyScore),
    operationalRiskPrediction: orpsRows,
    globalInsights: {
      top5StableSupervisors: stiRows.slice(0, 5),
      top5HighestRiskSupervisors: orpsRows.slice(0, 5),
      mostDependencyHeavyTeams: [...rdeRows].sort((a, b) => b.dependencyScore - a.dependencyScore).slice(0, 5),
      instabilityDrivers,
      ghostLeakageHotspots: ghostHotspots.slice(0, 10),
      singlePointOfFailureRiders: singlePointOfFailureRiders.slice(0, 15),
    },
    criticalAlerts,
  };
}
