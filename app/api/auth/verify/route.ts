import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { assertSessionVersionValid } from '@/lib/sessionVersion';
import { parseOperationalRoleFromPermissions } from '@/lib/operationalRoles';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const token = extractBearerToken(request);
  if (!token) {
    return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return NextResponse.json({ success: false, error: 'انتهت الجلسة - يرجى تسجيل الدخول' }, { status: 401 });
  }

  const svErr = await assertSessionVersionValid(decoded);
  if (svErr) {
    return NextResponse.json({ success: false, error: svErr }, { status: 401 });
  }

  return NextResponse.json({
    success: true,
    code: decoded.code,
    name: decoded.name,
    role: decoded.role,
    permissions: decoded.permissions,
    dataZone: decoded.dataZone,
    adminOrgRole: decoded.adminOrgRole,
    linkedSupervisorCode: decoded.linkedSupervisorCode,
    operationalRole: parseOperationalRoleFromPermissions(decoded.permissions),
    sv: decoded.sv ?? 0,
  });
}
