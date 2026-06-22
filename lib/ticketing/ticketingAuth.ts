import { NextResponse } from 'next/server';
import { adminFeatureAllowed, parseLimitedFeatures } from '@/lib/adminFeatureAccess';

export type JwtUser = {
  role?: string;
  code?: string;
  name?: string;
  permissions?: string;
};

export function hasTicketingAccess(decoded: JwtUser | null): boolean {
  if (!decoded?.role) return false;
  if (decoded.role === 'supervisor') return true;
  if (decoded.role === 'admin') {
    const limited = parseLimitedFeatures(decoded.permissions);
    if (limited === null) return true;
    return limited.includes('ticketing');
  }
  return false;
}

export function hasTicketingAdminAccess(decoded: JwtUser | null): boolean {
  if (!decoded || decoded.role !== 'admin') return false;
  const limited = parseLimitedFeatures(decoded.permissions);
  if (limited === null) return true;
  return limited.includes('ticketing');
}

export function assertTicketingApiAccess(decoded: JwtUser | null): NextResponse | null {
  if (!decoded?.role) {
    return NextResponse.json({ success: false, error: 'غير مصرح - يرجى تسجيل الدخول' }, { status: 401 });
  }
  if (!hasTicketingAccess(decoded)) {
    return NextResponse.json({ success: false, error: 'لا تملك صلاحية نظام التذاكر' }, { status: 403 });
  }
  return null;
}

export function assertTicketingAdminApiAccess(decoded: JwtUser | null): NextResponse | null {
  const base = assertTicketingApiAccess(decoded);
  if (base) return base;
  if (!hasTicketingAdminAccess(decoded)) {
    return NextResponse.json({ success: false, error: 'هذه العملية للأدمن فقط' }, { status: 403 });
  }
  return null;
}

export function actorFromJwt(decoded: JwtUser): { role: string; code: string; name: string } {
  return {
    role: String(decoded.role ?? ''),
    code: String(decoded.code ?? ''),
    name: String(decoded.name ?? decoded.code ?? ''),
  };
}

export function isSupervisor(decoded: JwtUser): boolean {
  return decoded.role === 'supervisor';
}
