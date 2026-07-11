/**
 * Live 3PL read API. Supervisors and the dashboard NEVER call Talabat
 * directly — this route only ever reads the shared Redis snapshot written
 * by `app/api/cron/rooster-live-sync`.
 *
 * Auth/scoping intentionally mirrors `app/api/riders/route.ts` exactly:
 * same token extraction, same admin-zone-scoping helpers, same
 * `getSupervisorRiders()` call — nothing new invented here.
 */
import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { getSupervisorRiders, getAllAssignedRiders } from '@/lib/dataService';
import { parseAdminAllowedZonesList } from '@/lib/zones';
import { getSupervisorCodesInAdminDataScope } from '@/lib/adminZoneScope';
import { normalizeRiderCodeForPerformance } from '@/lib/riderCodeUtils';
import { getLiveRidersSnapshot, isRoosterLiveStoreReady, STALE_AFTER_MS } from '@/lib/roosterLive/store';
import { getRoosterLiveCityId } from '@/lib/roosterLive/tokenProvider';
import type {
  LiveRider,
  LiveRiderWithAssignment,
  LiveRidersApiResponse,
  LiveRidersDistributionBucket,
  LiveRidersKpis,
} from '@/lib/roosterLive/types';

export const dynamic = 'force-dynamic';

const WALLET_ALERT_THRESHOLD = 0; // negative or zero wallet balance counts as an alert

function buildDistribution(riders: LiveRiderWithAssignment[], keyOf: (r: LiveRiderWithAssignment) => string, labels: Record<string, string>): LiveRidersDistributionBucket[] {
  const counts = new Map<string, number>();
  for (const r of riders) {
    const key = keyOf(r);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([key, count]) => ({ key, label: labels[key] || key, count }))
    .sort((a, b) => b.count - a.count);
}

function computeKpis(riders: LiveRiderWithAssignment[]): LiveRidersKpis {
  return riders.reduce<LiveRidersKpis>(
    (acc, r) => {
      acc.total += 1;
      if (r.statusBucket === 'online') acc.online += 1;
      else if (r.statusBucket === 'offline') acc.offline += 1;
      else if (r.statusBucket === 'busy') acc.busy += 1;
      else if (r.statusBucket === 'on_break') acc.onBreak += 1;
      if (r.statusBucket === 'late' || r.lateTimeSeconds > 0) acc.late += 1;
      if (r.walletBalance <= WALLET_ALERT_THRESHOLD) acc.walletAlerts += 1;
      return acc;
    },
    { total: 0, online: 0, offline: 0, busy: 0, onBreak: 0, late: 0, walletAlerts: 0 }
  );
}

const STATUS_LABELS: Record<string, string> = {
  online: 'متصل',
  busy: 'مشغول',
  on_break: 'في استراحة',
  late: 'متأخر',
  offline: 'غير متصل',
  unknown: 'غير معروف',
};

export async function GET(request: NextRequest) {
  try {
    const token = extractBearerToken(request);
    if (!token) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }
    const decoded = verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }

    if (!isRoosterLiveStoreReady()) {
      return NextResponse.json(
        { success: false, error: 'خدمة العمليات المباشرة غير مُفعّلة بعد (Redis غير مُهيأ).' },
        { status: 503 }
      );
    }

    // Scope to this viewer's riders — identical logic to /api/riders.
    let internalRiders =
      decoded.role === 'admin' ? await getAllAssignedRiders(true) : await getSupervisorRiders(decoded.code, true);

    if (decoded.role === 'admin') {
      const allowedSup = await getSupervisorCodesInAdminDataScope(
        decoded as Parameters<typeof getSupervisorCodesInAdminDataScope>[0]
      );
      if (allowedSup) {
        internalRiders = internalRiders.filter((r) => allowedSup.has(String(r.supervisorCode ?? '').trim()));
      } else {
        const zones = parseAdminAllowedZonesList((decoded as { dataZone?: string }).dataZone);
        if (zones.length > 0) {
          const allow = new Set<string>(zones);
          internalRiders = internalRiders.filter((r) => allow.has((r.region || '').trim()));
        }
      }
    }

    const byNormalizedCode = new Map<string, (typeof internalRiders)[number]>();
    for (const r of internalRiders) {
      byNormalizedCode.set(normalizeRiderCodeForPerformance(r.code), r);
    }
    const allowedNormalizedCodes = new Set(byNormalizedCode.keys());

    const cityId = getRoosterLiveCityId();
    const snapshot = await getLiveRidersSnapshot(cityId);

    const liveByNormalizedId = new Map<string, LiveRider>();
    for (const lr of snapshot?.riders ?? []) {
      liveByNormalizedId.set(normalizeRiderCodeForPerformance(lr.riderId), lr);
    }

    // Only riders assigned to this viewer are ever returned — riders present
    // in the Talabat snapshot but not in this viewer's scope are dropped here.
    const scoped: LiveRiderWithAssignment[] = [];
    for (const normCode of allowedNormalizedCodes) {
      const internal = byNormalizedCode.get(normCode)!;
      const live = liveByNormalizedId.get(normCode);
      if (!live) continue; // rider assigned but not currently present in the live feed (e.g. not logged into Rooster today)
      scoped.push({
        ...live,
        supervisorCode: internal.supervisorCode || null,
        supervisorName: internal.supervisorName || null,
        unmapped: false,
      });
    }

    const kpis = computeKpis(scoped);
    const distributions = {
      status: buildDistribution(scoped, (r) => r.statusBucket, STATUS_LABELS),
      wallet: buildDistribution(
        scoped,
        (r) => (r.walletBalance <= WALLET_ALERT_THRESHOLD ? 'alert' : r.walletBalance < 200 ? 'low' : 'ok'),
        { alert: 'تنبيه رصيد', low: 'رصيد منخفض', ok: 'رصيد جيد' }
      ),
      breaks: buildDistribution(scoped, (r) => (r.breaksCount > 0 ? 'has_breaks' : 'no_breaks'), {
        has_breaks: 'أخذ استراحة',
        no_breaks: 'بدون استراحة',
      }),
      late: buildDistribution(scoped, (r) => (r.lateTimeSeconds > 0 ? 'late' : 'on_time'), {
        late: 'متأخر',
        on_time: 'في الوقت',
      }),
    };

    const lastSyncAt = snapshot?.lastSyncAt ?? null;
    const ageMs = lastSyncAt ? Date.now() - new Date(lastSyncAt).getTime() : null;
    const stale = ageMs === null ? true : ageMs > STALE_AFTER_MS;

    const response: LiveRidersApiResponse = {
      success: true,
      data: scoped,
      kpis,
      distributions,
      lastSyncAt,
      ageMs,
      stale,
    };
    return NextResponse.json(response);
  } catch (error: any) {
    console.error('Get live riders error:', error);
    return NextResponse.json({ success: false, error: error.message || 'حدث خطأ' }, { status: 500 });
  }
}
