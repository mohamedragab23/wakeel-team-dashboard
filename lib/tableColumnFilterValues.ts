/** Normalize cell display for Excel-style value filters (unique list keys). */
export function cellToFilterLabel(cell: string | number | null | undefined): string {
  if (cell === null || cell === undefined) return '(فارغ)';
  const s = String(cell).trim();
  return s === '' ? '(فارغ)' : s;
}

export function distinctFilterValues(labels: string[], max = 400): string[] {
  const set = new Set<string>();
  for (const l of labels) set.add(l);
  const arr = Array.from(set);
  arr.sort((a, b) => a.localeCompare(b, 'ar', { numeric: true }));
  if (arr.length > max) return arr.slice(0, max);
  return arr;
}
