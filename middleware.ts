import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { applySecurityHeaders } from '@/lib/securityHeaders';

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const isProduction = process.env.NODE_ENV === 'production';
  return applySecurityHeaders(response, isProduction);
}

export const config = {
  matcher: [
    '/',
    '/api/:path*',
    '/((?!_next/static|_next/image|_next/webpack-hmr|favicon.ico|icon|.*\\.(?:ico|png|jpg|jpeg|gif|webp|svg)$).*)',
  ],
};
