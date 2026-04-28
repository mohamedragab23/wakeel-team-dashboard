import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Allow public routes
  const publicRoutes = ['/', '/api/auth/login', '/api/auth/verify'];
  const isPublicRoute = publicRoutes.some((route) => request.nextUrl.pathname === route);

  if (isPublicRoute) {
    return NextResponse.next();
  }

  // For API routes, check token in header
  if (request.nextUrl.pathname.startsWith('/api/')) {
    const token = request.headers.get('authorization')?.replace('Bearer ', '').trim();

    // Allow auth routes without token
    if (request.nextUrl.pathname.startsWith('/api/auth/')) {
      return NextResponse.next();
    }

    // Check if token exists - let the API route handle validation
    if (!token) {
      console.log('[Middleware] No token for:', request.nextUrl.pathname);
      return NextResponse.json({ success: false, error: 'غير مصرح - يرجى تسجيل الدخول' }, { status: 401 });
    }
    
    // Token exists, let the API route validate it
    console.log('[Middleware] Token present for:', request.nextUrl.pathname);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};

