/**
 * SRS-013 Phase 1 — Automatic Shift Import.
 *
 * Replaces the manual "Rooster -> download CSV -> upload here" workflow with
 * a direct call: dashboard picks Zone + date range, this route fetches the
 * CSV from Rooster itself (via `RoosterClient.exportShiftsCsv`, which goes
 * through Phase 0's Smart Cache + Request Queue) and feeds it into the
 * exact same, untouched `analyzeLegacyShifts()` used by the manual-upload
 * route (`/api/shifts/legacy-analyze`) — same response shape, same auth
 * guard, same admin-zone-scoping logic (duplicated here verbatim rather
 * than refactored out, to keep the existing route's behavior at zero risk).
 *
 * Gated by `FEATURE_SHIFT_IMPORT_ENABLED` (default disabled): the POST
 * handler 503s and the GET status-check reports `enabled:false` so the UI
 * hides the new panel entirely until the flag is turned on.
 */
import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { analyzeLegacyShifts } from '@/lib/shiftsLegacyAnalyze';
import { getAllSupervisors } from '@/lib/adminService';
import { parseAdminAllowedZonesList, supervisorZonesOverlapAllowed } from '@/lib/zones';
import { getSupervisorCodesInAdminDataScope } from '@/lib/adminZoneScope';
import { getRoosterCityMap, resolveRoosterCityId } from '@/lib/rooster/cityMap';
import { RoosterClient } from '@/lib/rooster/RoosterClient';
import { appendAuditLog } from '@/lib/auditLog';
import { recordMetric } from '@/lib/telemetry';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const MAX_RANGE_DAYS = 31;

function isShiftImportEnabled(): boolean {
  return String(process.env.FEATURE_SHIFT_IMPORT_ENABLED || '').trim().toLowerCase() === 'true';
}

type Decoded = {
  role?: 'supervisor' | 'admin';
  name?: string;
  code?: string;
  dataZone?: string;
};

async function authenticate(request: NextRequest): Promise<
  | { ok: true; decoded: Decoded; allowedSupervisorNames: Set<string> | null }
  | { ok: false; response: NextResponse }
> {
  const token = extractBearerToken(request);
  if (!token) {
    return { ok: false, response: NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 }) };
  }
  const decoded = verifyToken(token) as Decoded | null;
  if (!decoded || (decoded.role !== 'supervisor' && decoded.role !== 'admin')) {
    return { ok: false, response: NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 }) };
  }

  // Identical admin-zone-scoping logic to app/api/shifts/legacy-analyze/route.ts
  // (duplicated intentionally -- that file is not touched by this phase).
  let allowedSupervisorNames: Set<string> | null = null;
  if (decoded.role === 'admin') {
    const allowedCodes = await getSupervisorCodesInAdminDataScope(
      decoded as Parameters<typeof getSupervisorCodesInAdminDataScope>[0]
    );
    if (allowedCodes && allowedCodes.size > 0) {
      const sups = await getAllSupervisors(false);
      const labels = new Set<string>();
      for (const s of sups) {
        if (!allowedCodes.has(String(s.code ?? '').trim())) continue;
        const code = String(s.code ?? '').trim();
        const name = String(s.name ?? '').trim();
        if (code) labels.add(code);
        if (name) labels.add(name);
      }
      allowedSupervisorNames = labels;
    } else {
      const scopeZones = parseAdminAllowedZonesList(decoded.dataZone);
      if (scopeZones.length > 0) {
        const sups = await getAllSupervisors(false);
        const labels = new Set<string>();
        for (const s of sups) {
          if (!supervisorZonesOverlapAllowed(s.region, scopeZones)) continue;
          const code = String(s.code ?? '').trim();
          const name = String(s.name ?? '').trim();
          if (code) labels.add(code);
          if (name) labels.add(name);
        }
        allowedSupervisorNames = labels;
      }
    }
  }

  return { ok: true, decoded, allowedSupervisorNames };
}

function daysBetween(startIso: string, endIso: string): number {
  const start = new Date(`${startIso}T00:00:00Z`).getTime();
  const end = new Date(`${endIso}T00:00:00Z`).getTime();
  return Math.round((end - start) / (24 * 60 * 60 * 1000));
}

/** Capability/status check + zone list -- lets the UI decide whether to show the panel at all. */
export async function GET(request: NextRequest) {
  const auth = await authenticate(request);
  if (!auth.ok) return auth.response;

  return NextResponse.json({
    success: true,
    enabled: isShiftImportEnabled(),
    zones: Object.keys(getRoosterCityMap()),
    maxRangeDays: MAX_RANGE_DAYS,
  });
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  try {
    const auth = await authenticate(request);
    if (!auth.ok) return auth.response;
    const { decoded, allowedSupervisorNames } = auth;

    if (!isShiftImportEnabled()) {
      return NextResponse.json({ success: false, enabled: false, error: 'الاستيراد التلقائي غير مفعّل حاليًا' }, { status: 503 });
    }

    const body = await request.json().catch(() => null);
    const zone = String(body?.zone ?? '').trim();
    const startDate = String(body?.startDate ?? '').trim();
    const endDate = String(body?.endDate ?? '').trim();

    if (!zone || !startDate || !endDate) {
      return NextResponse.json({ success: false, error: 'مطلوب: الزون وتاريخ البداية والنهاية' }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return NextResponse.json({ success: false, error: 'صيغة التاريخ يجب أن تكون YYYY-MM-DD' }, { status: 400 });
    }

    const cityId = resolveRoosterCityId(zone);
    if (!cityId) {
      return NextResponse.json(
        { success: false, error: `زون غير معروف: ${zone}. الزونات المتاحة: ${Object.keys(getRoosterCityMap()).join(', ') || '(لا يوجد)'}` },
        { status: 400 }
      );
    }

    const spanDays = daysBetween(startDate, endDate);
    if (spanDays < 0) {
      return NextResponse.json({ success: false, error: 'تاريخ النهاية قبل تاريخ البداية' }, { status: 400 });
    }
    if (spanDays > MAX_RANGE_DAYS) {
      return NextResponse.json(
        { success: false, error: `أقصى مدى مسموح به ${MAX_RANGE_DAYS} يوم (المطلوب: ${spanDays} يوم)` },
        { status: 400 }
      );
    }

    let exported: { filename: string; bytes: ArrayBuffer };
    try {
      exported = await RoosterClient.exportShiftsCsv({ cityId, cityLabel: zone, startDate, endDate });
    } catch (e: any) {
      void recordMetric({ feature: 'shift_import', metric: 'api_failure' });
      console.error('[api/rooster/shifts/import] RoosterClient.exportShiftsCsv failed:', e);
      return NextResponse.json({ success: false, error: 'تعذر الاتصال بروستر لاستيراد الشفتات، حاول مرة أخرى' }, { status: 502 });
    }

    const analyzed = await analyzeLegacyShifts({
      viewer: { role: decoded.role!, name: decoded.name || '', code: decoded.code || '' },
      allowedSupervisorNames,
      files: [{ name: exported.filename, bytes: exported.bytes }],
      rangeStart: startDate,
      rangeEnd: endDate,
      selectedDates: [],
    });

    void appendAuditLog({
      domain: 'rooster_import',
      action: 'shift_import',
      entityType: 'shift_import',
      entityCode: `${zone}:${startDate}:${endDate}`,
      actorCode: decoded.code || '',
      actorName: decoded.name || '',
      after: { zone, cityId, startDate, endDate, filename: exported.filename },
    }).catch((err) => {
      console.error('[api/rooster/shifts/import] appendAuditLog failed:', err);
      void recordMetric({ feature: 'audit_log', metric: 'api_failure', tags: { action: 'shift_import' } });
    });
    void recordMetric({ feature: 'shift_import', metric: 'exec_ms', value: Date.now() - startedAt });

    return NextResponse.json({ success: true, ...analyzed });
  } catch (error: any) {
    void recordMetric({ feature: 'shift_import', metric: 'api_failure' });
    console.error('[api/rooster/shifts/import]', error);
    return NextResponse.json({ success: false, error: error?.message || 'حدث خطأ' }, { status: 500 });
  }
}
