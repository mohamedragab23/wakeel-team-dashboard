import crypto from 'crypto';
import { getJwtSecret } from '@/lib/jwtConfig';

export function signPhotoId(photoId: string): string {
  return crypto.createHmac('sha256', getJwtSecret()).update(photoId).digest('hex').slice(0, 32);
}

export function verifyPhotoSignature(photoId: string, sig: string | null | undefined): boolean {
  if (!sig || !photoId) return false;
  const expected = signPhotoId(photoId);
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  } catch {
    return false;
  }
}

export function appendPhotoSignatureToUrl(baseUrl: string, photoId: string): string {
  const sig = signPhotoId(photoId);
  const sep = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${sep}sig=${sig}`;
}
