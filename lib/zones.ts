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

/**
 * Parses admin scope cell: one zone, or several separated by | ; newline or comma.
 * Stored canonically as pipe-separated allowed zones only.
 */
export function parseAdminAllowedZonesList(v: unknown): ZoneOption[] {
  if (Array.isArray(v)) {
    v = (v as unknown[]).map((x) => String(x ?? '').trim()).filter(Boolean).join('|');
  }
  const s = String(v ?? '').trim();
  if (!s) return [];

  const chunks = s
    .split(/[|;\n\r]+/)
    .map((x) => x.trim())
    .filter(Boolean);

  const tokens: string[] = [];
  for (const c of chunks) {
    if (isAllowedZone(c)) {
      tokens.push(c);
      continue;
    }
    for (const part of c.split(',').map((x) => x.trim()).filter(Boolean)) {
      tokens.push(part);
    }
  }

  const out: ZoneOption[] = [];
  const seen = new Set<string>();
  for (const t of tokens) {
    if (!isAllowedZone(t) || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/** Canonical string for sheet / JWT (empty = no restriction). */
export function serializeAdminAllowedZones(zones: Iterable<string>): string {
  const list = parseAdminAllowedZonesList(Array.from(zones).join('|'));
  return list.join('|');
}

