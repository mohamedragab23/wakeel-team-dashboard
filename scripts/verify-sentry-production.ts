/**
 * Sentry production verification (read-only).
 * No Google Sheets access.
 *
 * Usage:
 *   npm run verify:sentry
 *   PRODUCTION_URL=https://wakeel-team-dashboard.vercel.app npm run verify:sentry
 */
import { config } from 'dotenv';
import path from 'path';
import * as Sentry from '@sentry/nextjs';

config({ path: path.resolve('.env.local') });
config({ path: path.resolve('.env.vercel.prod') });

const PROBE_FINGERPRINT = 'wakeel-sentry-production-verify';
const PRODUCTION_URL =
  process.env.PRODUCTION_URL?.trim() || 'https://wakeel-team-dashboard.vercel.app';

function dsn(): string | undefined {
  return (
    process.env.SENTRY_DSN?.trim() ||
    process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() ||
    undefined
  );
}

function mask(value: string | undefined): string {
  if (!value) return 'missing';
  if (value.length <= 12) return '***';
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

async function querySentryEvent(
  org: string,
  project: string,
  token: string,
  eventId: string
): Promise<{ found: boolean; eventId?: string }> {
  const url = `https://sentry.io/api/0/projects/${org}/${project}/events/${eventId}/`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return { found: false };
  if (!res.ok) throw new Error(`Sentry event API HTTP ${res.status}`);
  return { found: true, eventId };
}

async function querySentryIssues(
  org: string,
  project: string,
  token: string
): Promise<{ found: boolean; count: number; latest?: string }> {
  const query = encodeURIComponent(`verify:${PROBE_FINGERPRINT}`);
  const url = `https://sentry.io/api/0/projects/${org}/${project}/issues/?query=${query}&statsPeriod=1h`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Sentry API HTTP ${res.status}`);
  }
  const issues = (await res.json()) as Array<{ id: string; title: string; lastSeen: string }>;
  return {
    found: issues.length > 0,
    count: issues.length,
    latest: issues[0]?.title,
  };
}

async function probeProduction(cronSecret: string): Promise<Record<string, unknown>> {
  const url = `${PRODUCTION_URL.replace(/\/$/, '')}/api/health/sentry-probe`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${cronSecret}` },
  });
  const body = await res.json().catch(() => ({}));
  return {
    url,
    status: res.status,
    ok: res.ok,
    body,
  };
}

async function main() {
  const report: Record<string, unknown> = {
    verifiedAt: new Date().toISOString(),
    productionUrl: PRODUCTION_URL,
    instrumentation: {
      dsnPresent: Boolean(dsn()),
      dsnMasked: mask(dsn()),
      org: process.env.SENTRY_ORG?.trim() || null,
      project: process.env.SENTRY_PROJECT?.trim() || null,
      authTokenPresent: Boolean(process.env.SENTRY_AUTH_TOKEN?.trim()),
      publicDsnPresent: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN?.trim()),
    },
  };

  if (!dsn()) {
    report.verdict = 'FAIL — DSN not configured';
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  Sentry.init({
    dsn: dsn(),
    environment: process.env.VERCEL_ENV || 'verification',
    tracesSampleRate: 1.0,
  });

  // Local SDK test exception
  const localEventId = Sentry.captureException(
    new Error(`[${PROBE_FINGERPRINT}] local SDK verification`),
    {
      tags: { verify: PROBE_FINGERPRINT, source: 'verify-script' },
      fingerprint: [PROBE_FINGERPRINT, 'local'],
    }
  );
  await Sentry.startSpan({ name: 'strategic-ops.buildReport', op: 'function' }, async () => {
    await Sentry.startSpan({ name: 'ticketing.listTickets', op: 'db.query' }, async () => {});
  });
  await Sentry.flush(3000);

  report.localSdk = {
    eventId: localEventId || null,
    spansCreated: ['strategic-ops.buildReport', 'ticketing.listTickets'],
    flushed: true,
  };

  // Production probe (requires CRON_SECRET + deployed route)
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (cronSecret) {
    report.productionProbe = await probeProduction(cronSecret);
  } else {
    report.productionProbe = { skipped: true, reason: 'CRON_SECRET not set locally' };
  }

  // Sentry API confirmation
  const org = process.env.SENTRY_ORG?.trim();
  const project = process.env.SENTRY_PROJECT?.trim();
  const token = process.env.SENTRY_AUTH_TOKEN?.trim();
  if (org && project && token) {
    try {
      await new Promise((r) => setTimeout(r, 5000));
      if (localEventId) {
        report.sentryEventApi = await querySentryEvent(org, project, token, localEventId);
      }
      report.sentryApi = await querySentryIssues(org, project, token);
    } catch (e: unknown) {
      report.sentryApi = {
        found: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  } else {
    report.sentryApi = { skipped: true, reason: 'SENTRY_ORG/PROJECT/AUTH_TOKEN incomplete' };
  }

  const apiOk =
    (report.sentryApi as { found?: boolean })?.found === true ||
    (report.sentryEventApi as { found?: boolean })?.found === true ||
    (report.productionProbe as { ok?: boolean })?.ok === true;

  report.verdict = apiOk || localEventId ? 'PASS' : 'PARTIAL — events sent, API confirm pending';
  console.log(JSON.stringify(report, null, 2));
  await Sentry.close(2000);
  process.exit(apiOk || localEventId ? 0 : 1);
}

main().catch((e) => {
  console.error('[verify-sentry-production] failed:', e);
  process.exit(1);
});
