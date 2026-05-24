/**
 * صلاحيات API نظام التعيين
 */
import { NextResponse } from 'next/server';
import { adminFeatureAllowed, parseLimitedFeatures } from '@/lib/adminFeatureAccess';

export type JwtUser = {
  role?: string;
  code?: string;
  name?: string;
  permissions?: string;
};

/** هل المستخدم يملك صلاحية التعيين؟ */
export function hasRecruitmentAccess(decoded: JwtUser | null): boolean {
  if (!decoded) return false;
  if (decoded.role === 'recruitment_manager') return true;
  if (decoded.role !== 'admin') return false;
  const limited = parseLimitedFeatures(decoded.permissions);
  if (limited === null) return true; // أدمن كامل
  return limited.includes('recruitment');
}

/** للـ API: 401/403 أو null إذا مسموح */
export function assertRecruitmentApiAccess(decoded: JwtUser | null): NextResponse | null {
  if (!decoded?.role) {
    return NextResponse.json({ success: false, error: 'غير مصرح - يرجى تسجيل الدخول' }, { status: 401 });
  }
  if (!hasRecruitmentAccess(decoded)) {
    return NextResponse.json({ success: false, error: 'لا تملك صلاحية إدارة التعيين' }, { status: 403 });
  }
  return null;
}

/** سجل النشاط — أدمن فقط */
export function assertAdminActivityLogAccess(decoded: JwtUser | null): NextResponse | null {
  if (!decoded || decoded.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'سجل النشاط متاح للأدمن فقط' }, { status: 403 });
  }
  if (decoded.role === 'admin' && parseLimitedFeatures(decoded.permissions) !== null) {
    if (!adminFeatureAllowed(decoded.permissions, 'recruitment')) {
      return NextResponse.json({ success: false, error: 'لا تملك صلاحية عرض سجل النشاط' }, { status: 403 });
    }
  }
  return null;
}

export function actorFromJwt(decoded: JwtUser): { code: string; name: string } {
  return {
    code: String(decoded.code ?? ''),
    name: String(decoded.name ?? decoded.code ?? ''),
  };
}
