import Papa from 'papaparse';

export function parseCsvToMatrix(
  text: string,
  opts?: { defval?: unknown }
): unknown[][] {
  const defval = opts?.defval ?? '';
  const parsed = Papa.parse<string[]>(text, {
    header: false,
    skipEmptyLines: false,
  });
  const rows = (parsed.data || []) as unknown[][];
  return rows.map((row) => {
    const cells = Array.isArray(row) ? row : [];
    return cells.map((cell) => (cell == null || cell === '' ? defval : cell));
  });
}
