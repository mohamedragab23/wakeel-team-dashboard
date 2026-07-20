/**
 * System Health Monitor — SRS-006 Section 2
 */

import { getSheetData } from '@/lib/googleSheets';
import type { StrategicOpsReport } from '@/lib/strategicOps/buildReport';
import type { LiveAuditReport } from '@/lib/strategicOps/audit';
import type {
  ConnectivityStatus,
  HealthStatus,
  SystemHealthMetrics,
} from './types';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function statusFromScore(score: number): HealthStatus {
  if (score >= 85) return 'healthy';
  if (score >= 70) return 'degraded';
  return 'critical';
}

async function probeGoogleSheets(): Promise<{
  connectivity: ConnectivityStatus;
  latencyMs: number | null;
  lastSuccessfulFetch: string | null;
}> {
  const t0 = Date.now();
  try {
    await getSheetData('المناديب', false);
    const latencyMs = Date.now() - t0;
    return {
      connectivity: latencyMs > 5000 ? 'slow' : 'connected',
      latencyMs,
      lastSuccessfulFetch: new Date().toISOString(),
    };
  } catch {
    return {
      connectivity: 'disconnected',
      latencyMs: Date.now() - t0,
      lastSuccessfulFetch: null,
    };
  }
}

function memorySnapshot(): SystemHealthMetrics['memoryUsage'] {
  try {
    if (typeof process !== 'undefined' && typeof process.memoryUsage === 'function') {
      const m = process.memoryUsage();
      return {
        heapUsedMb: round2(m.heapUsed / (1024 * 1024)),
        heapTotalMb: round2(m.heapTotal / (1024 * 1024)),
        rssMb: round2(m.rss / (1024 * 1024)),
      };
    }
  } catch {
    /* ignore */
  }
  return { heapUsedMb: null, heapTotalMb: null, rssMb: null };
}

export async function gatherSystemHealthMetrics(input: {
  report?: StrategicOpsReport | null;
  liveAudit?: LiveAuditReport | null;
  filters: {
    startDate: string;
    endDate: string;
    zone: string;
    supervisorCode: string;
  };
  apiResponseTimeMs?: number;
  version?: string;
}): Promise<SystemHealthMetrics> {
  const { report, liveAudit, filters, apiResponseTimeMs = 0, version = '1.0.0' } = input;
  const sheets = await probeGoogleSheets();

  const di = report?.dataIntegrity;
  const coverage = report?.sourceDataCoverage?.coverage ?? di?.completenessPercentage ?? 0;

  let dataScore = 70;
  if (di) {
    dataScore = round2(
      di.dataQualityScore * 0.5 +
        (100 - Math.min(100, di.ghostLeakagePercent * 4)) * 0.3 +
        coverage * 0.2
    );
  }
  if (sheets.connectivity === 'disconnected') dataScore = Math.min(dataScore, 30);
  if (sheets.connectivity === 'slow') dataScore = Math.min(dataScore, 70);

  const apiScore =
    apiResponseTimeMs <= 0
      ? 90
      : apiResponseTimeMs < 1500
        ? 100
        : apiResponseTimeMs < 4000
          ? 80
          : apiResponseTimeMs < 10000
            ? 55
            : 30;

  const calcScore = liveAudit
    ? liveAudit.accuracyScore
    : report?.finalKpiAccuracyAudit?.executiveAccuracyScore?.score ?? 75;

  const overallScore = round2(dataScore * 0.4 + apiScore * 0.25 + calcScore * 0.35);

  const freshnessMinutes =
    report?.meta?.generatedAt != null
      ? round2((Date.now() - new Date(report.meta.generatedAt).getTime()) / 60000)
      : null;
    
    return {
      overall: {
      status: statusFromScore(overallScore),
        score: overallScore,
        lastCheck: new Date().toISOString(),
      },
      dataHealth: {
      googleSheetsConnectivity: sheets.connectivity,
      lastSuccessfulFetch: sheets.lastSuccessfulFetch,
      sheetsLatencyMs: sheets.latencyMs,
        uploadStatus: {
        lastUploadDate: di?.presentDates?.length
          ? di.presentDates[di.presentDates.length - 1]
          : null,
        missingDays: di?.missingDates ?? [],
        presentDays: di?.validDaysInDataset ?? 0,
        calendarDays: di?.calendarPeriodDays ?? 0,
        completenessPercent: di?.completenessPercentage ?? 0,
      },
      dataFreshnessMinutes: freshnessMinutes,
      dataQualityScore: di?.dataQualityScore ?? 0,
      ghostRiders: di?.ghostRidersCount ?? 0,
      ghostLeakagePercent: di?.ghostLeakagePercent ?? 0,
      duplicateRecords: di?.duplicateRows ?? 0,
      },
      apiHealth: {
      responseTimeMs: apiResponseTimeMs || sheets.latencyMs || 0,
      successRate: sheets.connectivity === 'disconnected' ? 0 : 100,
      status: statusFromScore(apiScore),
      },
      calculationEngine: {
      lastCalculation: report?.meta?.generatedAt ?? null,
      calculationTimeMs: liveAudit?.durationMs ?? null,
      failedCalculations: liveAudit?.failCount ?? 0,
      auditAccuracyScore: liveAudit?.accuracyScore ?? null,
      status: statusFromScore(calcScore),
      },
      cacheHealth: {
      hitRate: null,
      status: 'healthy',
      noteAr: 'التخزين المؤقت الطبقي (ذاكرة + Redis) مفعّل لتقارير العمليات الاستراتيجية',
    },
    memoryUsage: memorySnapshot(),
    auditStatus: {
      lastRun: liveAudit?.generatedAt ?? report?.finalKpiAccuracyAudit?.generatedAt ?? null,
      overallStatus: liveAudit?.overallStatus ?? 'unknown',
      passCount: liveAudit?.passCount ?? 0,
      warnCount: liveAudit?.warnCount ?? 0,
      failCount: liveAudit?.failCount ?? 0,
      },
      configuration: {
      target: report?.talabatOperations?.targetHours ?? report?.meta?.dailyHoursTarget ?? 0,
      city: filters.zone === 'all' ? 'كل المدن' : filters.zone,
      zone: filters.zone,
      supervisorFilter: filters.supervisorCode,
      version,
      startDate: filters.startDate,
      endDate: filters.endDate,
    },
    backgroundJobs: {
      noteAr: 'Live Audit يعمل عند الطلب مع تخزين مؤقت 10 دقائق',
      status: 'healthy',
    },
  };
}
