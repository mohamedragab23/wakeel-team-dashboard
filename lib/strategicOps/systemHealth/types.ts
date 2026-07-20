/**
 * System Integrity Center — types (SRS-006 Section 2)
 */

export type ConnectivityStatus = 'connected' | 'disconnected' | 'slow';
export type HealthStatus = 'healthy' | 'degraded' | 'critical';

export type UploadStatusMetrics = {
  lastUploadDate: string | null;
  missingDays: string[];
  presentDays: number;
  calendarDays: number;
  completenessPercent: number;
};

export type RequestMetric = {
  at: string;
  durationMs: number;
  ok: boolean;
};

export type SystemHealthMetrics = {
  overall: {
    status: HealthStatus;
    score: number;
    lastCheck: string;
  };
  dataHealth: {
    googleSheetsConnectivity: ConnectivityStatus;
    lastSuccessfulFetch: string | null;
    sheetsLatencyMs: number | null;
    uploadStatus: UploadStatusMetrics;
    dataFreshnessMinutes: number | null;
    dataQualityScore: number;
    ghostRiders: number;
    ghostLeakagePercent: number;
    duplicateRecords: number;
  };
  apiHealth: {
    responseTimeMs: number;
    successRate: number;
    status: HealthStatus;
  };
  calculationEngine: {
    lastCalculation: string | null;
    calculationTimeMs: number | null;
    failedCalculations: number;
    auditAccuracyScore: number | null;
    status: HealthStatus;
  };
  cacheHealth: {
    hitRate: number | null;
    status: HealthStatus;
    noteAr: string;
  };
  memoryUsage: {
    heapUsedMb: number | null;
    heapTotalMb: number | null;
    rssMb: number | null;
  };
  auditStatus: {
    lastRun: string | null;
    overallStatus: 'PASS' | 'WARN' | 'FAIL' | 'unknown';
    passCount: number;
    warnCount: number;
    failCount: number;
  };
  configuration: {
    target: number;
    city: string;
    zone: string;
    supervisorFilter: string;
    version: string;
    startDate: string;
    endDate: string;
  };
  backgroundJobs: {
    noteAr: string;
    status: HealthStatus;
  };
};
