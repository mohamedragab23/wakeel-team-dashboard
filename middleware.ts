import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Allow public routes
  const pathname = request.nextUrl.pathname;
  const publicRoutes = ['/', '/api/auth/login', '/api/auth/verify', '/api/health/google-sheets', '/api/cron/rooster-sync'];
  const isPublicRoute =
    publicRoutes.some((route) => pathname === route || pathname === `${route}/`) ||
    pathname.startsWith('/api/cron/');

  if (isPublicRoute) {
    return NextResponse.next();
  }

  // For API routes, check token in header
  if (pathname.startsWith('/api/')) {
    const token = request.headers.get('authorization')?.replace('Bearer ', '').trim();

    // Allow auth routes without token
    if (pathname.startsWith('/api/auth/')) {
      return NextResponse.next();
    }

    // Check if token exists - let the API route handle validation
    if (!token) {
      console.log('[Middleware] No token for:', pathname);
      return NextResponse.json({ success: false, error: 'غير مصرح - يرجى تسجيل الدخول' }, { status: 401 });
    }
    
    // Token exists, let the API route validate it
    console.log('[Middleware] Token present for:', pathname);
  }

  return NextResponse.next();
}

/**
 * لا يمرّ الوسيط على:
 * - /api/* (كل الـ API تتحقق من التوكن داخل المسار نفسه عند الحاجة)
 * - أصول Next الثابتة
 * يقلل تعارضات مع طلبات التطوير (POST تسجيل الدخول، إلخ).
 */
export const config = {
  matcher: [
    '/((?!api/|_next/static|_next/image|_next/webpack-hmr|favicon.ico|icon|.*\\.(?:ico|png|jpg|jpeg|gif|webp|svg)$).*)',
  ],
};

