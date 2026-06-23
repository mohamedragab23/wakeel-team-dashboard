import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { applySecurityHeaders } from '@/lib/securityHeaders';
import { generateRequestId, REQUEST_ID_HEADER } from '@/lib/requestTrace';

export function middleware(request: NextRequest) {
  const requestId = request.headers.get(REQUEST_ID_HEADER)?.trim() || generateRequestId();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(REQUEST_ID_HEADER, requestId);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set(REQUEST_ID_HEADER, requestId);

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
