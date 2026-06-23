import bcrypt from 'bcryptjs';
import { legacyPlainPasswordLoginAllowed } from '@/lib/passwordMigrationSafety';
import { logStructured } from '@/lib/requestTrace';

const BCRYPT_PREFIX = '$2';

/** Verify password — bcrypt only by default. Legacy plain-text requires PASSWORD_LEGACY_PLAIN_ENABLED=true. */
export async function verifyPassword(stored: string, input: string): Promise<boolean> {
  const storedNorm = (stored ?? '').trim();
  const inputNorm = (input ?? '').trim();
  if (!storedNorm || !inputNorm) return false;

  if (storedNorm.startsWith(BCRYPT_PREFIX)) {
    try {
      return await bcrypt.compare(inputNorm, storedNorm);
    } catch {
      return false;
    }
  }

  if (legacyPlainPasswordLoginAllowed()) {
    logStructured('warn', 'legacy_plain_password_login', { action: 'verify' });
    return storedNorm === inputNorm;
  }

  logStructured('warn', 'legacy_plain_password_rejected', {
    action: 'verify',
    hint: 'Set PASSWORD_LEGACY_PLAIN_ENABLED=true temporarily or rehash password to bcrypt',
  });
  return false;
}

/** Hash password for storage (optional migration tool). */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain.trim(), 10);
}

export function isPasswordHashed(stored: string): boolean {
  return (stored ?? '').trim().startsWith(BCRYPT_PREFIX);
}
