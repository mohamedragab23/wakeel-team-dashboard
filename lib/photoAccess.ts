import crypto from 'crypto';
import { getJwtSecret } from '@/lib/jwtConfig';

/** Default signed photo URL lifetime (24h). */
export const PHOTO_SIG_DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

function hmacPhotoPayload(photoId: string, expUnixSec: number): string {
  return crypto
    .createHmac('sha256', getJwtSecret())
    .update(`${photoId}:${expUnixSec}`)
    .digest('hex')
    .slice(0, 32);
}

/**
 * Sign a photo id with an absolute expiry (unix seconds).
 * Optional `nowMs` / `ttlMs` support deterministic tests.
 */
export function signPhotoId(
  photoId: string,
  opts?: { ttlMs?: number; nowMs?: number }
): { sig: string; exp: number } {
  const ttlMs = opts?.ttlMs ?? PHOTO_SIG_DEFAULT_TTL_MS;
  const nowMs = opts?.nowMs ?? Date.now();
  const exp = Math.floor((nowMs + ttlMs) / 1000);
  const sig = hmacPhotoPayload(photoId, exp);
  return { sig, exp };
}

/**
 * Verify HMAC signature + expiry.
 * Requires both `sig` and `exp` query params (legacy sig-only URLs are rejected).
 * At the exact expiry second the signature is still valid (`nowSec <= exp`).
 */
export function verifyPhotoSignature(
  photoId: string,
  sig: string | null | undefined,
  expRaw?: string | number | null,
  nowMs: number = Date.now()
): boolean {
  if (!sig || !photoId || expRaw === undefined || expRaw === null || expRaw === '') {
    return false;
  }
  const exp = typeof expRaw === 'number' ? expRaw : Number(expRaw);
  if (!Number.isFinite(exp) || exp <= 0) return false;

  const nowSec = Math.floor(nowMs / 1000);
  if (nowSec > exp) return false;

  const expected = hmacPhotoPayload(photoId, exp);
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(String(sig));
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function appendPhotoSignatureToUrl(baseUrl: string, photoId: string): string {
  const { sig, exp } = signPhotoId(photoId);
  const sep = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${sep}sig=${sig}&exp=${exp}`;
}
