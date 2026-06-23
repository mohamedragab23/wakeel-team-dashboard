/** Detect stored passwords that are not bcrypt hashes (read-only audit helper). */
export function isLegacyPlainStoredPassword(stored: string | undefined | null): boolean {
  const s = String(stored ?? '').trim();
  if (!s) return false;
  return !s.startsWith('$2');
}

export function legacyPlainPasswordLoginAllowed(): boolean {
  return process.env.PASSWORD_LEGACY_PLAIN_ENABLED === 'true';
}
