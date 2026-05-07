export const ZONE_OPTIONS = [
  'Ain shams',
  'Alexandria',
  'El rehab city',
  'Heliopolis',
  'Mansoura',
  'Nasr city',
  'Tagammoa golden square',
] as const;

export type ZoneOption = (typeof ZONE_OPTIONS)[number];

export function isAllowedZone(v: unknown): v is ZoneOption {
  const s = String(v ?? '').trim();
  return (ZONE_OPTIONS as readonly string[]).includes(s);
}

