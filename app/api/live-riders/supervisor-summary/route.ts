/**
 * Admin-only endpoint: Aggregated live riders data per supervisor.
 * 
 * Returns summary statistics for each supervisor instead of individual riders.
 */
import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { getAllAssignedRiders } from '@/lib/dataService';
import { getSupervisorCodesInAdminDataScope } from '@/lib/adminZoneScope';
import { parseAdminAllowedZonesList } from '@/lib/zones';
import { normalizeRiderCodeForPerformance } from '@/lib/riderCodeUtils';
import { getLiveRidersSnapshot, isRoosterLiveStoreReady, STALE_AFTER_MS } from '@/lib/roosterLive/store';
import { getRoosterLiveCityId } from '@/lib/roosterLive/tokenProvider';
import type { LiveRider } from '@/lib/roosterLive/types';

export const dynamic = 'force-dynamic';

interface SupervisorSummary {
  supervisorCode: string;
  supervisorName: string;
  totalRiders: number;
  online: number;
  offline: number;
  onBreak: number;
  late: number;
  working: number;
  walletAlerts: number;
  avgUtilization: number;
  avgAcceptanceRate: number;
}

export async function GET(request: NextRequest) {
  try {
    const token = extractBearerToken(request);
    if (!token) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }
    const decoded = verifyToken(token);
    if (!decoded || decoded.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'مخصص للإدمن فقط' }, { status: 403 });
    }

    if (!isRoosterLiveStoreReady()) {
      return NextResponse.json(
        { success: false, error: 'خدمة العمليات المباشرة غير مُفعّلة بعد (Redis غير مُهيأ).' },
        { status: 503 }
      );
    }

    // Get all riders with supervisor assignments
    let internalRiders = await getAllAssignedRiders(true);

    // Apply admin data scope filtering
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

    // Build lookup maps
    const byNormalizedCode = new Map<string, (typeof internalRiders)[number]>();
    for (const r of internalRiders) {
      byNormalizedCode.set(normalizeRiderCodeForPerformance(r.code), r);
    }

    // Get live snapshot
    const cityId = getRoosterLiveCityId();
    const snapshot = await getLiveRidersSnapshot(cityId);
    const liveByNormalizedId = new Map<string, LiveRider>();
    for (const lr of snapshot?.riders ?? []) {
      liveByNormalizedId.set(normalizeRiderCodeForPerformance(lr.riderId), lr);
    }

    // Group by supervisor
    const supervisorMap = new Map<string, {
      code: string;
      name: string;
      riders: Array<{ internal: typeof internalRiders[number]; live: LiveRider }>;
    }>();

    for (const normCode of byNormalizedCode.keys()) {
      const internal = byNormalizedCode.get(normCode)!;
      const live = liveByNormalizedId.get(normCode);
      if (!live) continue; // Rider not in live feed today

      const supCode = String(internal.supervisorCode || 'UNKNOWN').trim();
      const supName = String(internal.supervisorName || 'غير معين').trim();
      const key = supCode || supName;

      if (!supervisorMap.has(key)) {
        supervisorMap.set(key, { code: supCode, name: supName, riders: [] });
      }
      supervisorMap.get(key)!.riders.push({ internal, live });
    }

    // Compute aggregated statistics per supervisor
    const summaries: SupervisorSummary[] = [];
    for (const [_, group] of supervisorMap) {
      let online = 0, offline = 0, onBreak = 0, late = 0, working = 0, walletAlerts = 0;
      let totalUtilization = 0, totalAcceptance = 0, countUtilization = 0, countAcceptance = 0;

      for (const { live } of group.riders) {
        // Count by status
        if (live.statusBucket === 'online') online++;
        else if (live.statusBucket === 'offline') offline++;
        else if (live.statusBucket === 'on_break') onBreak++;
        
        if (live.statusBucket === 'late' || live.lateTimeSeconds > 0) late++;
        if (live.riderState.toLowerCase() === 'working') working++;
        if (live.walletBalance <= 0) walletAlerts++;

        // Aggregate performance metrics
        if (live.performance !== null && live.performance !== undefined) {
          const perf = typeof live.performance === 'number' ? live.performance : parseFloat(String(live.performance));
          if (!isNaN(perf)) {
            totalUtilization += perf;
            countUtilization++;
          }
        }
        if (live.acceptanceRate !== null) {
          totalAcceptance += live.acceptanceRate;
          countAcceptance++;
        }
      }

      summaries.push({
        supervisorCode: group.code,
        supervisorName: group.name,
        totalRiders: group.riders.length,
        online,
        offline,
        onBreak,
        late,
        working,
        walletAlerts,
        avgUtilization: countUtilization > 0 ? totalUtilization / countUtilization : 0,
        avgAcceptanceRate: countAcceptance > 0 ? totalAcceptance / countAcceptance : 0,
      });
    }

    // Sort by totalRiders descending
    summaries.sort((a, b) => b.totalRiders - a.totalRiders);

    const lastSyncAt = snapshot?.lastSyncAt ?? null;
    const ageMs = lastSyncAt ? Date.now() - new Date(lastSyncAt).getTime() : null;
    const stale = ageMs === null ? true : ageMs > STALE_AFTER_MS;

    return NextResponse.json({
      success: true,
      data: summaries,
      lastSyncAt,
      ageMs,
      stale,
    });
  } catch (error: any) {
    console.error('[supervisor-summary]', error);
    return NextResponse.json({ success: false, error: error.message || 'حدث خطأ' }, { status: 500 });
  }
}
