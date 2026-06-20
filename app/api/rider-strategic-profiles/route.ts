import { NextRequest, NextResponse } from 'next/server';
import {
  loadRiderStrategicProfiles,
  upsertRiderStrategicProfile,
  invalidateStrategicRiderCaches,
} from '@/lib/riderStrategic/riderStrategicService';
import { resolveStrategicProfileActor, assertCanEditRider } from '@/lib/riderStrategic/access';
import { normalizeRiderCodeForPerformance } from '@/lib/riderCodeUtils';
import { getSheetData } from '@/lib/googleSheets';
import { parseAuditRows } from '@/lib/riderStrategic/activityLog';
import { SHEET_STRATEGIC_AUDIT } from '@/lib/riderStrategic/types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const resolved = await resolveStrategicProfileActor(request);
    if ('error' in resolved) return resolved.error;
    const { actor } = resolved;

    const { searchParams } = new URL(request.url);
    const refresh = searchParams.get('refresh') === 'true';
    const riderCode = searchParams.get('riderCode') ?? undefined;
    const includeAudit = searchParams.get('audit') === 'true';

    const profiles = await loadRiderStrategicProfiles({
      supervisorCodes: actor.supervisorScope,
      riderCode,
      refresh,
    });

    let auditLog: ReturnType<typeof parseAuditRows> | undefined;
    if (includeAudit && actor.role === 'admin') {
      const auditData = await getSheetData(SHEET_STRATEGIC_AUDIT, !refresh);
      auditLog = parseAuditRows(auditData);
      if (riderCode) {
        const target = normalizeRiderCodeForPerformance(riderCode);
        auditLog = auditLog.filter((e) => e.riderCode === target);
      }
    }

    return NextResponse.json({
      success: true,
      data: profiles,
      meta: {
        total: profiles.length,
        role: actor.role,
        scoped: Boolean(actor.supervisorScope),
      },
      auditLog,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'حدث خطأ';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const resolved = await resolveStrategicProfileActor(request);
    if ('error' in resolved) return resolved.error;
    const { actor } = resolved;

    const body = await request.json();
    const riderCode = normalizeRiderCodeForPerformance(body.riderCode);
    if (!riderCode) {
      return NextResponse.json({ success: false, error: 'كود الطيار مطلوب' }, { status: 400 });
    }

    const existing = (
      await loadRiderStrategicProfiles({ supervisorCodes: actor.supervisorScope, riderCode, refresh: true })
    )[0];
    if (!existing) {
      return NextResponse.json({ success: false, error: 'الطيار غير موجود أو خارج نطاق صلاحيتك' }, { status: 404 });
    }

    const deny = assertCanEditRider(actor, existing.activationOwnerCode);
    if (deny) return deny;

    const updated = await upsertRiderStrategicProfile(
      riderCode,
      {
        actualJoinDate: body.actualJoinDate,
        riderType: body.riderType,
        dailyTargetHours: body.dailyTargetHours,
        currentStatus: body.currentStatus,
        supervisorNotes: body.supervisorNotes,
        lastFollowUpDate: body.lastFollowUpDate,
      },
      { code: actor.code, name: actor.name },
      'manual'
    );

    invalidateStrategicRiderCaches();

    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'حدث خطأ';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
