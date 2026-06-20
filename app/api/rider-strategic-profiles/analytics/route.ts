import { NextRequest, NextResponse } from 'next/server';
import { loadRiderStrategicProfiles } from '@/lib/riderStrategic/riderStrategicService';
import { buildRiderStrategicAnalytics } from '@/lib/riderStrategic/analytics';
import { resolveStrategicProfileActor } from '@/lib/riderStrategic/access';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const resolved = await resolveStrategicProfileActor(request);
    if ('error' in resolved) return resolved.error;
    const { actor } = resolved;

    const refresh = new URL(request.url).searchParams.get('refresh') === 'true';
    const profiles = await loadRiderStrategicProfiles({
      supervisorCodes: actor.supervisorScope,
      refresh,
    });

    const analytics = buildRiderStrategicAnalytics(profiles);

    return NextResponse.json({ success: true, data: analytics });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'حدث خطأ';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
