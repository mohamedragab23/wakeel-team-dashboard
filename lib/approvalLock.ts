/**
 * In-memory lock per request ID (per serverless instance).
 * Reduces double-approval races when two admins act simultaneously.
 */

const locks = new Map<string, number>();
const LOCK_MS = 30_000;

export function tryAcquireApprovalLock(key: string): boolean {
  const now = Date.now();
  const existing = locks.get(key);
  if (existing && now - existing < LOCK_MS) return false;
  locks.set(key, now);
  return true;
}

export function releaseApprovalLock(key: string): void {
  locks.delete(key);
}
