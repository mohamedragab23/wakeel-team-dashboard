import { NextRequest, NextResponse } from 'next/server';
import {
  loadRiderStrategicProfiles,
  upsertRiderStrategicProfile,
  invalidateStrategicRiderCaches,
} from '@/lib/riderStrategic/riderStrategicService';
import { resolveStrategicProfileActor, assertCanEditRider } from '@/lib/riderStrategic/access';
import { parseBulkStrategicExcel } from '@/lib/riderStrategic/bulkImport';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const resolved = await resolveStrategicProfileActor(request);
    if ('error' in resolved) return resolved.error;
    const { actor } = resolved;

    const body = await request.json();
    const rows = body.rows as unknown[][];
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ success: false, error: 'لا توجد بيانات للرفع' }, { status: 400 });
    }

    const parsed = parseBulkStrategicExcel(rows);
    const errors: Array<{ row: number; riderCode: string; message: string }> = [];
    let updated = 0;

    const profileIndex = new Map(
      (await loadRiderStrategicProfiles({ supervisorCodes: actor.supervisorScope, refresh: true })).map((p) => [
        p.riderCode,
        p,
      ])
    );

    for (const row of parsed) {
      if (row.errors.length > 0) {
        errors.push({ row: row.rowNumber, riderCode: row.riderCode, message: row.errors.join('؛ ') });
        continue;
      }

      const existing = profileIndex.get(row.riderCode);
      if (!existing) {
        errors.push({ row: row.rowNumber, riderCode: row.riderCode, message: 'الطيار غير موجود أو خارج النطاق' });
        continue;
      }

      const deny = assertCanEditRider(actor, existing.activationOwnerCode);
      if (deny) {
        errors.push({ row: row.rowNumber, riderCode: row.riderCode, message: 'لا تملك صلاحية تعديل هذا الطيار' });
        continue;
      }

      await upsertRiderStrategicProfile(
        row.riderCode,
        row.fields,
        { code: actor.code, name: actor.name },
        'bulk'
      );
      updated += 1;
    }

    invalidateStrategicRiderCaches();

    return NextResponse.json({
      success: errors.length === 0,
      processed: parsed.length,
      updated,
      errors,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'حدث خطأ';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
