import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';

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

  return NextResponse.json({
    success: true,
    code: decoded.code,
    name: decoded.name,
    role: decoded.role,
    permissions: decoded.permissions,
    dataZone: decoded.dataZone,
    adminOrgRole: decoded.adminOrgRole,
    linkedSupervisorCode: decoded.linkedSupervisorCode,
  });
}
