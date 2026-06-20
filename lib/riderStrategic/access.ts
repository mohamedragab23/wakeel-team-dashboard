import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { extractBearerToken } from '@/lib/requestAuth';
import { assertAdminApiAccess } from '@/lib/adminFeatureAccess';
import { getSupervisorCodesInAdminDataScope } from '@/lib/adminZoneScope';

export type StrategicProfileActor = {
  role: 'admin' | 'supervisor';
  code: string;
  name: string;
  supervisorScope: Set<string> | null;
};

export async function resolveStrategicProfileActor(
  request: Request
): Promise<{ actor: StrategicProfileActor } | { error: NextResponse }> {
  const token = extractBearerToken(request);
  if (!token) {
    return { error: NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 }) };
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return { error: NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 }) };
  }

  const role = String(decoded.role ?? '');
  if (role === 'supervisor') {
    const code = String(decoded.code ?? '').trim();
    if (!code) {
      return { error: NextResponse.json({ success: false, error: 'كود المشرف غير معروف' }, { status: 403 }) };
    }
    return {
      actor: {
        role: 'supervisor',
        code,
        name: String(decoded.name ?? code),
        supervisorScope: new Set([code]),
      },
    };
  }

  if (role === 'admin') {
    const deny = assertAdminApiAccess(decoded, 'rider_strategic_profiles');
    if (deny) return { error: deny };

    const scope = await getSupervisorCodesInAdminDataScope(decoded);
    return {
      actor: {
        role: 'admin',
        code: String(decoded.code ?? 'admin'),
        name: String(decoded.name ?? 'Admin'),
        supervisorScope: scope,
      },
    };
  }

  return { error: NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 403 }) };
}

import { normalizeSupervisorCodeForMatch } from '@/lib/dataFilter';

export function assertCanEditRider(
  actor: StrategicProfileActor,
  supervisorCode: string
): NextResponse | null {
  if (actor.role === 'admin' && !actor.supervisorScope) return null;
  const target = normalizeSupervisorCodeForMatch(supervisorCode);
  if (actor.supervisorScope) {
    for (const code of actor.supervisorScope) {
      if (normalizeSupervisorCodeForMatch(code) === target) return null;
    }
  }
  return NextResponse.json(
    { success: false, error: 'لا تملك صلاحية تعديل هذا الطيار' },
    { status: 403 }
  );
}
