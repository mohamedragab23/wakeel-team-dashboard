import type { NextRequest } from 'next/server';

export const AUTH_COOKIE_NAME = 'wakeel_auth_token';

/** Extract JWT from Authorization header or httpOnly cookie. */
export function extractBearerToken(request: NextRequest | Request): string | null {
  const header = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  if (header) return header;

  const cookies = (request as NextRequest).cookies;
  if (cookies?.get) {
    const fromCookie = cookies.get(AUTH_COOKIE_NAME)?.value?.trim();
    if (fromCookie) return fromCookie;
  }

  return null;
}
