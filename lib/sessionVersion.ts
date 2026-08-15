/**
 * Session version / revocation for JWT invalidation on password/role/security changes.
 * Redis when configured; in-memory fallback (tests + local without Redis).
 * Tokens carry `sv`; mismatch ⇒ session invalid.
 *
 * Keep this module free of googleSheets / next/headers so it never enters client bundles.
 */

import { redisGet, redisIncr, redisSet } from '@/lib/upstashRest';

const memoryStore = new Map<string, number>();

export type SessionPrincipalRole = 'admin' | 'supervisor' | 'recruitment_manager';

function normalizeLoginCode(role: SessionPrincipalRole, code: string): string {
  const raw = String(code || '')
    .replace(/\uFEFF/g, '')
    .trim();
  if (role === 'supervisor') {
    return raw.replace(/^0+(?=\d)/, '');
  }
  return raw.toLowerCase();
}

export function sessionVersionKey(role: SessionPrincipalRole, code: string): string {
  return `wakeel:session_version:${role}:${normalizeLoginCode(role, code)}`;
}

export function __resetSessionVersionMemoryForTests() {
  memoryStore.clear();
}

export async function getSessionVersion(
  role: SessionPrincipalRole,
  code: string
): Promise<number> {
  const key = sessionVersionKey(role, code);
  const fromRedis = await redisGet(key);
  if (fromRedis != null && fromRedis !== '') {
    const n = Number(fromRedis);
    if (Number.isFinite(n) && n >= 0) {
      memoryStore.set(key, Math.trunc(n));
      return Math.trunc(n);
    }
  }
  return memoryStore.get(key) ?? 0;
}

export async function bumpSessionVersion(
  role: SessionPrincipalRole,
  code: string
): Promise<number> {
  const key = sessionVersionKey(role, code);
  const incr = await redisIncr(key);
  if (typeof incr === 'number' && Number.isFinite(incr) && incr > 0) {
    memoryStore.set(key, Math.trunc(incr));
    return Math.trunc(incr);
  }
  const next = (memoryStore.get(key) ?? 0) + 1;
  memoryStore.set(key, next);
  await redisSet(key, String(next), 60 * 60 * 24 * 365);
  return next;
}

/**
 * Invalidate every JWT principal key for this login code
 * (admin / recruitment_manager / supervisor) so role switches cannot leave old sessions alive.
 */
export async function revokeAllSessionsForLoginCode(code: string): Promise<{
  admin: number;
  recruitment_manager: number;
  supervisor: number;
}> {
  const admin = await bumpSessionVersion('admin', code);
  const recruitment_manager = await bumpSessionVersion('recruitment_manager', code);
  const supervisor = await bumpSessionVersion('supervisor', code);
  return { admin, recruitment_manager, supervisor };
}

export type JwtSessionClaims = {
  role?: string;
  code?: string;
  sv?: number;
};

/**
 * Returns null when valid; error message when revoked/mismatched.
 * Missing `sv` on token is treated as 0 (pre-revocation tokens).
 */
export async function assertSessionVersionValid(
  decoded: JwtSessionClaims | null | undefined
): Promise<string | null> {
  if (!decoded?.code || !decoded?.role) return 'جلسة غير صالحة';
  const role = decoded.role as SessionPrincipalRole;
  if (role !== 'admin' && role !== 'supervisor' && role !== 'recruitment_manager') {
    return 'جلسة غير صالحة';
  }
  const tokenSv = Number(decoded.sv ?? 0);
  const current = await getSessionVersion(role, decoded.code);
  if (!Number.isFinite(tokenSv) || Math.trunc(tokenSv) !== current) {
    return 'انتهت صلاحية الجلسة — سجّل الدخول مجددًا بعد تغيير كلمة المرور أو الصلاحيات';
  }
  return null;
}
