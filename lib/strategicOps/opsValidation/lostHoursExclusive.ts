/**
 * SRS-008 §5 — Exclusive lost-hours category per rider-day (zero double-count).
 * Priority: highest certainty / most specific status first.
 */

export const LOST_HOURS_CATEGORIES = [
  'medical',
  'vacation',
  'no_show',
  'suspended',
  'inactive',
  'rejected',
  'termination',
  'not_booked',
  'low_hours',
  'missing_shift',
  'other',
] as const;

export type LostHoursCategory = (typeof LOST_HOURS_CATEGORIES)[number];

/** Lower index = higher priority (wins exclusive assignment). */
const PRIORITY: LostHoursCategory[] = [
  'termination',
  'medical',
  'vacation',
  'suspended',
  'rejected',
  'no_show',
  'inactive',
  'not_booked',
  'missing_shift',
  'low_hours',
  'other',
];

export type DayFlags = Partial<Record<LostHoursCategory, boolean>>;

/**
 * Assign exactly one category when multiple flags are true.
 * Medical + No Show same day → medical only.
 */
export function assignExclusiveLostHoursCategory(flags: DayFlags): LostHoursCategory | null {
  const active = PRIORITY.filter((c) => flags[c] === true);
  return active[0] ?? null;
}

export function countAssignedCategories(flags: DayFlags): number {
  return assignExclusiveLostHoursCategory(flags) ? 1 : 0;
}
