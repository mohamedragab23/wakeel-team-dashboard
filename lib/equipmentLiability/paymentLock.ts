/**
 * Short-lived Redis NX lock for Equipment Liability Desk cash payments.
 * Fail-open when Redis is not configured (local/dev); sheet idempotency remains.
 */
import { isUpstashConfigured, redisDel, redisGet, redisSet, redisSetNx } from '@/lib/upstashRest';

/** In-flight payment attempt — short TTL (never a 90-day poison lock). */
export const EQUIPMENT_PAYMENT_LOCK_TTL_SECONDS = 45;

const ISSUE_LOCK_PREFIX = 'equipment:liability:payment:issue:';
const IDEM_RESULT_PREFIX = 'equipment:liability:payment:idem:';

/** Cache successful payment results briefly to speed duplicate retries. */
export const EQUIPMENT_PAYMENT_IDEM_TTL_SECONDS = 7 * 24 * 60 * 60;

export function equipmentPaymentIssueLockKey(equipmentIssueId: string): string {
  return `${ISSUE_LOCK_PREFIX}${String(equipmentIssueId || '').trim()}`;
}

export function equipmentPaymentIdempotencyCacheKey(idempotencyKey: string): string {
  return `${IDEM_RESULT_PREFIX}${String(idempotencyKey || '').trim()}`;
}

function newLockToken(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `epl_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export type EquipmentPaymentLock =
  | { ok: true; token: string; release: () => Promise<void> }
  | { ok: false; reason: 'lock_busy' };

export async function acquireEquipmentPaymentLock(
  equipmentIssueId: string
): Promise<EquipmentPaymentLock> {
  const key = equipmentPaymentIssueLockKey(equipmentIssueId);
  const token = newLockToken();

  if (!isUpstashConfigured()) {
    return { ok: true, token, release: async () => undefined };
  }

  const got = await redisSetNx(key, token, EQUIPMENT_PAYMENT_LOCK_TTL_SECONDS);
  if (!got) return { ok: false, reason: 'lock_busy' };

  return {
    ok: true,
    token,
    release: async () => {
      const cur = await redisGet(key);
      if (cur === token) await redisDel(key);
    },
  };
}

export async function getCachedPaymentResult(idempotencyKey: string): Promise<string | null> {
  if (!isUpstashConfigured()) return null;
  return redisGet(equipmentPaymentIdempotencyCacheKey(idempotencyKey));
}

export async function cachePaymentResult(
  idempotencyKey: string,
  payloadJson: string
): Promise<void> {
  if (!isUpstashConfigured()) return;
  await redisSet(
    equipmentPaymentIdempotencyCacheKey(idempotencyKey),
    payloadJson,
    EQUIPMENT_PAYMENT_IDEM_TTL_SECONDS
  );
}
