import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (pathname === '/' || pathname === '') {
    return NextResponse.next();
  }

  // API auth is enforced inside each route handler (Bearer header + httpOnly cookie).
  // Blocking here caused 401s when the edge layer could not read the session reliably.
  if (pathname.startsWith('/api/')) {
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
