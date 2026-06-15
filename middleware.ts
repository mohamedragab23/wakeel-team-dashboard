import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { AUTH_COOKIE_NAME, extractBearerToken } from '@/lib/requestAuth';

const PUBLIC_API_PREFIXES = [
  '/api/auth/login',
  '/api/auth/verify',
  '/api/health',
  '/api/cron/',
];

function isPublicApi(pathname: string): boolean {
  return PUBLIC_API_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (pathname === '/' || pathname === '') {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/')) {
    if (isPublicApi(pathname)) {
      return NextResponse.next();
    }
    // Signed equipment photo URLs work without session token
    if (pathname.startsWith('/api/equipment-photos/') && request.nextUrl.searchParams.get('sig')) {
      return NextResponse.next();
    }
    const token = extractBearerToken(request);
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'غير مصرح - يرجى تسجيل الدخول' },
        { status: 401 }
      );
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/',
    '/api/:path*',
    '/((?!_next/static|_next/image|_next/webpack-hmr|favicon.ico|icon|.*\\.(?:ico|png|jpg|jpeg|gif|webp|svg)$).*)',
  ],
};

export { AUTH_COOKIE_NAME };
