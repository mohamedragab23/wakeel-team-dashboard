/**
 * Central JWT secret — production must set JWT_SECRET explicitly.
 */
const FALLBACK_DEV_SECRET = 'dev-only-secret-change-in-production';

export function isJwtSecretConfigured(): boolean {
  return Boolean(process.env.JWT_SECRET?.trim());
}

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (secret) return secret;

  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set in production');
  }

  return FALLBACK_DEV_SECRET;
}

export function assertJwtSecretConfigured(): void {
  if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET?.trim()) {
    throw new Error('JWT_SECRET must be set in production');
  }
}
