import { normalizeRiderCodeForPerformance } from '@/lib/riderCodeUtils';

export type RiderCommentsActor = {
  role?: string;
  code?: string;
};

/**
 * Authorization for GET ?riderCode= on /api/rider-comments.
 * Admin: any rider. Supervisor: only riders in ownedRiderCodes. Others: deny.
 */
export function canAccessRiderCommentsByRiderCode(
  actor: RiderCommentsActor,
  riderCode: string,
  ownedRiderCodes: Iterable<string>
): boolean {
  if (actor.role === 'admin') return true;
  if (actor.role !== 'supervisor') return false;

  const want = normalizeRiderCodeForPerformance(riderCode);
  if (!want) return false;

  for (const code of ownedRiderCodes) {
    if (normalizeRiderCodeForPerformance(code) === want) return true;
  }
  return false;
}
