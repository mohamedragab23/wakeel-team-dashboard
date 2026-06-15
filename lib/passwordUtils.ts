import bcrypt from 'bcryptjs';

const BCRYPT_PREFIX = '$2';

/** Verify password — supports bcrypt hashes and legacy plain-text (backward compatible). */
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

  return storedNorm === inputNorm;
}

/** Hash password for storage (optional migration tool). */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain.trim(), 10);
}

export function isPasswordHashed(stored: string): boolean {
  return (stored ?? '').trim().startsWith(BCRYPT_PREFIX);
}
