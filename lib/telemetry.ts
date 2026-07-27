/**
 * SRS-013 §13 — Telemetry & Health Metrics (frozen cross-cutting requirement).
 *
 * "Every new feature must expose telemetry and health metrics (execution
 * time, cache hit ratio, queue wait time, API failures, and audit events)
 * so we can monitor production behavior without enabling debug logs."
 *
 * Storage: a rolling window of the most recent samples per feature+metric,
 * kept in Redis (same Upstash account already used for caching) via
 * `lib/upstashRest.ts`, capped at MAX_SAMPLES entries and TTL_SECONDS old —
 * bounded, cheap, no new infra/service (addresses the "unbounded growth"
 * risk flagged in the architecture doc's final review, §10 item 11).
 *
 * `recordMetric()` is fire-and-forget by design: it never throws and is
 * never meant to be awaited in a way that blocks or fails the real request
 * it's measuring. If Redis isn't configured, it's a silent no-op — matches
 * the existing "optional Redis" philosophy used everywhere else.
 */
import { redisExpire, redisLPush, redisLRange, redisLTrim, isUpstashConfigured } from '@/lib/upstashRest';

export type TelemetryFeature =
  | 'rooster_client'
  | 'shift_import'
  | 'rider_search'
  | 'payroll_ledger'
  | 'rent'
  | 'financial_report'
  | 'audit_log';

export type TelemetryMetric =
  | 'exec_ms'
  | 'cache_hit'
  | 'cache_miss'
  | 'queue_wait_ms'
  | 'api_failure'
  | 'audit_event';

const MAX_SAMPLES = 500;
const TTL_SECONDS = 48 * 60 * 60; // 48h rolling window

function metricKey(feature: TelemetryFeature, metric: TelemetryMetric): string {
  return `telemetry:${feature}:${metric}`;
}

/**
 * Records one telemetry sample for `feature`/`metric`. For duration-style
 * metrics (`exec_ms`, `queue_wait_ms`) pass a millisecond `value`; for pure
 * event counters (`cache_hit`, `cache_miss`, `api_failure`, `audit_event`)
 * `value` defaults to 1 — either way the sample is stored the same way, so
 * a single code path serves both "how long" and "how many" metrics.
 */
export async function recordMetric(params: {
  feature: TelemetryFeature;
  metric: TelemetryMetric;
  value?: number;
  tags?: Record<string, string>;
}): Promise<void> {
  try {
    if (!isUpstashConfigured()) return;
    const key = metricKey(params.feature, params.metric);
    const sample: Sample = { v: params.value ?? 1, t: Date.now(), ...(params.tags ? { tags: params.tags } : {}) };
    await redisLPush(key, JSON.stringify(sample));
    await redisLTrim(key, 0, MAX_SAMPLES - 1);
    await redisExpire(key, TTL_SECONDS);
  } catch {
    // Telemetry must never break or slow down the feature it's measuring.
  }
}

type Sample = { v: number; t: number; tags?: Record<string, string> };

async function readSamples(feature: TelemetryFeature, metric: TelemetryMetric): Promise<Sample[]> {
  const raw = await redisLRange(metricKey(feature, metric), 0, MAX_SAMPLES - 1);
  const parsed: Sample[] = [];
  for (const r of raw) {
    try {
      const s = JSON.parse(r);
      if (s && typeof s.v === 'number') parsed.push(s);
    } catch {
      // Skip a malformed sample rather than failing the whole read.
    }
  }
  return parsed;
}

function percentile(sortedValues: number[], p: number): number | null {
  if (sortedValues.length === 0) return null;
  const idx = Math.min(sortedValues.length - 1, Math.floor((p / 100) * sortedValues.length));
  return sortedValues[idx];
}

function summarizeDurations(samples: Sample[]) {
  const values = samples.map((s) => s.v).sort((a, b) => a - b);
  return {
    count: values.length,
    avg: values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null,
    p50: percentile(values, 50),
    p95: percentile(values, 95),
  };
}

export type FeatureHealthSnapshot = {
  feature: TelemetryFeature;
  execMs: { count: number; avg: number | null; p50: number | null; p95: number | null };
  cacheHitRatioPct: number | null;
  queueWaitMs: { count: number; avg: number | null; p50: number | null; p95: number | null };
  apiFailureCount: number;
  auditEventCount: number;
  configured: boolean;
};

/**
 * Reads the rolling window for one feature and returns a health snapshot —
 * the exact shape rendered by `GET /api/admin/health/metrics`. Never
 * throws: on Redis being unconfigured, returns a `configured:false`
 * snapshot instead of failing the whole page.
 */
export async function getFeatureHealthSnapshot(feature: TelemetryFeature): Promise<FeatureHealthSnapshot> {
  if (!isUpstashConfigured()) {
    return {
      feature,
      execMs: { count: 0, avg: null, p50: null, p95: null },
      cacheHitRatioPct: null,
      queueWaitMs: { count: 0, avg: null, p50: null, p95: null },
      apiFailureCount: 0,
      auditEventCount: 0,
      configured: false,
    };
  }

  const [execSamples, hitSamples, missSamples, queueSamples, failureSamples, auditSamples] = await Promise.all([
    readSamples(feature, 'exec_ms'),
    readSamples(feature, 'cache_hit'),
    readSamples(feature, 'cache_miss'),
    readSamples(feature, 'queue_wait_ms'),
    readSamples(feature, 'api_failure'),
    readSamples(feature, 'audit_event'),
  ]);

  const hits = hitSamples.length;
  const misses = missSamples.length;
  const total = hits + misses;

  return {
    feature,
    execMs: summarizeDurations(execSamples),
    cacheHitRatioPct: total > 0 ? Math.round((hits / total) * 1000) / 10 : null,
    queueWaitMs: summarizeDurations(queueSamples),
    apiFailureCount: failureSamples.length,
    auditEventCount: auditSamples.length,
    configured: true,
  };
}

export const ALL_TELEMETRY_FEATURES: TelemetryFeature[] = [
  'rooster_client',
  'shift_import',
  'rider_search',
  'payroll_ledger',
  'rent',
  'financial_report',
  'audit_log',
];
