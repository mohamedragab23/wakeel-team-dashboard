import * as XLSX from 'xlsx';
import { ZONE_OPTIONS } from '@/lib/zones';

export type LegacyEmployeeRow = {
  employee_id: string;
  employee_name: string;
  contract_name: string;
  city: string;
  supervisors: string;
};

export type LegacyShiftRow = {
  employee_id: string;
  shift_status: string;
  planned_start_date: string; // YYYY-MM-DD
  planned_end_date: string; // YYYY-MM-DD (optional)
  planned_start_time: string; // HH:MM
  planned_end_time: string; // HH:MM
};

export type LegacyJoinedRow = LegacyEmployeeRow & {
  planned_start_date: string;
  planned_start_time: string;
  planned_end_time: string;
  shift_hours: number;
};

export type LegacyCityPivotRow = {
  city: string;
  HQ: number;
  assigned: number;
  unassigned: number;
  pct: number;
};

function norm(v: any): string {
  return String(v ?? '').trim();
}

function normalizeEmployeeId(v: any): string {
  if (v == null) return '';
  // If Excel gave a numeric type, keep it as an integer string.
  if (typeof v === 'number' && Number.isFinite(v)) {
    // Handle large IDs safely for typical employee id ranges.
    const asInt = Math.trunc(v);
    return String(asInt);
  }
  const s = norm(v);
  if (!s) return '';
  // Common Excel/Pandas artifact: "12345.0"
  if (/^\d+\.0+$/.test(s)) return s.replace(/\.0+$/, '');
  // Scientific notation (rare but can happen): "1.2345E+4"
  if (/^\d+(\.\d+)?e\+\d+$/i.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) return String(Math.trunc(n));
  }
  return s;
}

function normLower(v: any): string {
  return norm(v).toLowerCase();
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function toLocalIsoDate(d: Date): string {
  // IMPORTANT: do not use toISOString() (UTC) -> causes day shift.
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function parseExcelOrStringDateToIso(value: any): string {
  if (value == null || value === '') return '';

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return toLocalIsoDate(value);
  }

  const s = norm(value);
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // Excel serial day number
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n) && n > 20000) {
      const dc = XLSX.SSF.parse_date_code(n);
      if (dc?.y && dc?.m && dc?.d) return `${dc.y}-${pad2(dc.m)}-${pad2(dc.d)}`;
    }
  }

  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return toLocalIsoDate(d);
  return '';
}

export function parseTimeToHHMM(value: any): string {
  if (value == null || value === '') return '';

  // Excel time fraction
  if (typeof value === 'number' && Number.isFinite(value)) {
    const totalSeconds = Math.floor(value * 24 * 60 * 60);
    const hh = Math.floor(totalSeconds / 3600) % 24;
    const mm = Math.floor((totalSeconds % 3600) / 60);
    return `${pad2(hh)}:${pad2(mm)}`;
  }

  const s = norm(value);
  if (!s) return '';

  // If it looks like a Date string, use Date hours/minutes
  const asDate = new Date(s);
  if (!Number.isNaN(asDate.getTime()) && /(\d{1,2}:\d{2})/.test(s)) {
    return `${pad2(asDate.getHours())}:${pad2(asDate.getMinutes())}`;
  }

  // Common formats: 10:00, 10:00:00, 10:00 AM, 2026-01-01 10:00:00
  const m = s.match(/(\d{1,2})\s*:\s*(\d{2})(?:\s*:\s*\d{2})?\s*(am|pm)?/i);
  if (!m) return '';
  let hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return '';
  const ampm = (m[3] || '').toLowerCase();
  if (ampm) {
    hh = hh % 12;
    if (ampm === 'pm') hh += 12;
  }
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return '';
  return `${pad2(hh)}:${pad2(mm)}`;
}

export function calcShiftHours(startHHMM: string, endHHMM: string): number {
  const toMinutes = (t: string): number | null => {
    const s = norm(t);
    const m = s.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
    return hh * 60 + mm;
  };
  const sm = toMinutes(startHHMM);
  const em = toMinutes(endHHMM);
  if (sm == null || em == null) return 0;
  let diff = em - sm;
  if (diff < 0) diff += 24 * 60;
  return Math.round((diff / 60) * 100) / 100;
}

/** RFC4180-style split: commas inside "quotes" do not break columns. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && c === ',') {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += c;
  }
  out.push(cur.trim());
  return out.map((s) => s.replace(/^"|"$/g, ''));
}

export function parseCsvToObjects(text: string): { headers: string[]; rows: Record<string, any>[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (!lines.length) return { headers: [], rows: [] };
  const headers = splitCsvLine(lines[0]);
  const rows: Record<string, any>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const obj: Record<string, any> = {};
    for (let j = 0; j < headers.length; j++) obj[headers[j]] = cols[j] ?? '';
    rows.push(obj);
  }
  return { headers, rows };
}

export function parseXlsxToObjects(buf: ArrayBuffer): { headers: string[]; rows: Record<string, any>[] } {
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) return { headers: [], rows: [] };
  const raw = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });
  const headers = raw.length ? Object.keys(raw[0] || {}) : [];
  return { headers, rows: raw };
}

function normalizeHeader(h: string): string {
  return norm(h).toLowerCase().replace(/\s+/g, ' ').trim();
}

// Mirrors shift-automation-master column_mapping in DataSanitizer.process_shift_file
const SHIFT_COLUMN_MAPPING: Record<string, keyof LegacyShiftRow | 'employee_name' | 'contract_name' | 'city' | 'shift_id'> = {
  'employee id': 'employee_id',
  employee: 'employee_id',
  'emp id': 'employee_id',
  'shift status': 'shift_status',
  'planned start date': 'planned_start_date',
  'planned end date': 'planned_end_date',
  'planned start time': 'planned_start_time',
  'planned end time': 'planned_end_time',
};

export function sanitizeShiftObjectsLikeLegacy(input: { headers: string[]; rows: Record<string, any>[] }): LegacyShiftRow[] {
  // Build header map: raw header -> canonical key
  const headerToKey = new Map<string, keyof LegacyShiftRow>();
  const allowedKeys = new Set<keyof LegacyShiftRow>([
    'employee_id',
    'shift_status',
    'planned_start_date',
    'planned_end_date',
    'planned_start_time',
    'planned_end_time',
  ]);
  for (const h of input.headers || []) {
    const nh = normalizeHeader(h);
    const mapped = SHIFT_COLUMN_MAPPING[nh];
    if (mapped && allowedKeys.has(mapped as keyof LegacyShiftRow)) headerToKey.set(h, mapped as keyof LegacyShiftRow);
  }

  const out: LegacyShiftRow[] = [];
  for (const r of input.rows || []) {
    const row: LegacyShiftRow = {
      employee_id: '',
      shift_status: '',
      planned_start_date: '',
      planned_end_date: '',
      planned_start_time: '',
      planned_end_time: '',
    };

    for (const [rawHeader, k] of headerToKey.entries()) {
      const v = r[rawHeader];
      if (k === 'planned_start_date' || k === 'planned_end_date') {
        row[k] = parseExcelOrStringDateToIso(v);
      } else if (k === 'planned_start_time' || k === 'planned_end_time') {
        row[k] = parseTimeToHHMM(v);
      } else {
        row[k] = k === 'employee_id' ? normalizeEmployeeId(v) : norm(v);
      }
    }

    // Legacy (shift-automation-master) uses planned_start_date as-is for scoping.

    // Basic validation (legacy requires employee_id + shift_status + planned_start_date)
    if (!row.employee_id || !row.shift_status || !row.planned_start_date) continue;
    out.push(row);
  }
  return out;
}

export function preprocessShiftsLikeLegacy(rows: LegacyShiftRow[]): LegacyShiftRow[] {
  // Legacy keeps only EVALUATED + PUBLISHED (booking scope)
  const valid = new Set(['EVALUATED', 'PUBLISHED']);
  const filtered = rows.filter((r) => valid.has(norm(r.shift_status).toUpperCase()));

  // Legacy dedupe: one per employee_id per day; keeps the earliest start time (sort planned_start_time)
  const grouped: Record<string, LegacyShiftRow[]> = {};
  for (const r of filtered) {
    const key = `${r.planned_start_date}__${norm(r.employee_id)}`;
    grouped[key] = grouped[key] || [];
    grouped[key].push(r);
  }

  const out: LegacyShiftRow[] = [];
  for (const key of Object.keys(grouped)) {
    const list = grouped[key];
    list.sort((a, b) => norm(a.planned_start_time).localeCompare(norm(b.planned_start_time)));
    out.push(list[0]);
  }

  // Keep stable order by date then employee id
  out.sort(
    (a, b) =>
      norm(a.planned_start_date).localeCompare(norm(b.planned_start_date)) ||
      norm(a.employee_id).localeCompare(norm(b.employee_id))
  );
  return out;
}

/**
 * Keep Wakeel employees in Alexandria, Mansoura, or Greater Cairo (all other ZONE_OPTIONS + cairo/giza).
 * Cairo export files use many sub-areas (Heliopolis, Nasr city, Ain shams, …) in the HQ sheet — not the literal "cairo".
 */
export function filterEmployeesWakeel3Cities(employees: LegacyEmployeeRow[]): LegacyEmployeeRow[] {
  const normKey = (s: any) =>
    normLower(s)
      .replace(/[\s\-_]+/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, ''); // drop punctuation, keep letters/numbers (handles hidden chars)

  const coastalNorms = new Set(['alexandria', 'mansoura']);
  const cairoAreaFragments = new Set<string>();
  for (const z of ZONE_OPTIONS) {
    if (z === 'Alexandria' || z === 'Mansoura') continue;
    const full = normKey(z);
    if (full.length >= 4) cairoAreaFragments.add(full);
    for (const part of z.split(/[\s,_-]+/)) {
      const pk = normKey(part);
      if (pk.length >= 4) cairoAreaFragments.add(pk);
    }
  }
  for (const extra of ['cairo', 'giza']) {
    cairoAreaFragments.add(extra);
  }

  const matchesCoastal = (city: string) =>
    Array.from(coastalNorms).some((c) => city === c || city.includes(c));
  const matchesCairoArea = (city: string) => {
    if (!city) return false;
    return Array.from(cairoAreaFragments).some((frag) => {
      if (frag.length < 4) return false;
      if (city.includes(frag)) return true;
      if (city.length >= 6 && frag.includes(city)) return true;
      return false;
    });
  };

  return employees.filter((e) => {
    const contract = normKey(e.contract_name);
    const city = normKey(e.city);
    const isWakeel = contract === 'wakeel' || contract.includes('wakeel');
    if (!isWakeel) return false;
    if (matchesCoastal(city)) return true;
    return matchesCairoArea(city);
  });
}

export function filterEmployeesForViewer(
  employees: LegacyEmployeeRow[],
  decoded: { role?: string; name?: string; code?: string } | null,
  opts?: { allowedSupervisorNames?: Set<string> | null }
): LegacyEmployeeRow[] {
  if (!decoded) return employees;
  if (decoded.role === 'admin') {
    const allow = opts?.allowedSupervisorNames;
    if (allow && allow.size > 0) {
      return employees.filter((e) => allow.has(norm(e.supervisors)));
    }
    return employees;
  }
  // For supervisors: match by name OR code
  const viewerName = normLower(decoded.name || '');
  const viewerCode = normLower(decoded.code || '');
  return employees.filter((e) => {
    const sup = normLower(e.supervisors);
    return sup === viewerName || sup === viewerCode;
  });
}

export function buildEmployeesFromAllSheet(matrix: any[][]): LegacyEmployeeRow[] {
  if (!matrix?.length) return [];
  const headers = (matrix[0] || []).map((h) => norm(h));
  const idxId = headers.findIndex((h) => normLower(h) === 'employee_id' || normLower(h) === 'employee id' || normLower(h) === 'كود المندوب' || normLower(h) === 'رقم المندوب');
  const idxName = headers.findIndex((h) => normLower(h) === 'employee_name' || normLower(h) === 'employee name' || normLower(h) === 'اسم المندوب' || normLower(h) === 'الاسم');
  const idxContract = headers.findIndex((h) => normLower(h) === 'contract_name' || normLower(h) === 'contract name' || normLower(h) === 'العقد' || normLower(h) === 'نوع العقد');
  const idxCity = headers.findIndex((h) => normLower(h) === 'city' || normLower(h) === 'المحافظة' || normLower(h) === 'المدينة');
  const idxSup = headers.findIndex((h) => 
    normLower(h) === 'supervisors' || 
    normLower(h) === 'supervisor' || 
    normLower(h) === 'كود المشرف' || 
    normLower(h) === 'المشرف' || 
    normLower(h) === 'اسم المشرف' ||
    normLower(h) === 'supervisor_code' ||
    normLower(h) === 'supervisor code'
  );

  const out: LegacyEmployeeRow[] = [];
  const seen = new Set<string>();
  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r] || [];
    const employee_id = idxId >= 0 ? normalizeEmployeeId(row[idxId]) : '';
    if (!employee_id) continue;
    if (seen.has(employee_id)) continue;
    seen.add(employee_id);
    out.push({
      employee_id,
      employee_name: idxName >= 0 ? norm(row[idxName]) : '',
      contract_name: idxContract >= 0 ? norm(row[idxContract]) : '',
      city: idxCity >= 0 ? norm(row[idxCity]) : '',
      supervisors: idxSup >= 0 ? norm(row[idxSup]) : '',
    });
  }
  return out;
}

export function listAvailableDates(rows: LegacyShiftRow[]): string[] {
  const set = new Set(rows.map((r) => norm(r.planned_start_date)).filter(Boolean));
  return Array.from(set).sort();
}

export function pickDatesUsed(params: {
  availableDates: string[];
  selectedDates: string[];
  rangeStart: string;
  rangeEnd: string;
}): string[] {
  const { availableDates, selectedDates, rangeStart, rangeEnd } = params;
  if (selectedDates?.length) {
    const ds = new Set(selectedDates);
    return availableDates.filter((d) => ds.has(d));
  }
  const s = norm(rangeStart);
  const e = norm(rangeEnd);
  if (s && e) return availableDates.filter((d) => d >= s && d <= e);
  return availableDates;
}

export function joinShiftsWithEmployees(shiftRows: LegacyShiftRow[], employees: LegacyEmployeeRow[]): LegacyJoinedRow[] {
  const empById = new Map<string, LegacyEmployeeRow>();
  for (const e of employees) empById.set(norm(e.employee_id), e);

  const out: LegacyJoinedRow[] = [];
  for (const s of shiftRows) {
    const emp = empById.get(norm(s.employee_id));
    if (!emp) continue;
    out.push({
      ...emp,
      planned_start_date: s.planned_start_date,
      planned_start_time: s.planned_start_time,
      planned_end_time: s.planned_end_time,
      shift_hours: calcShiftHours(s.planned_start_time, s.planned_end_time),
    });
  }
  return out;
}

export function computeCityPivotForDate(
  employees: LegacyEmployeeRow[],
  joinedForDate: LegacyJoinedRow[]
): LegacyCityPivotRow[] {
  const hqByCity = new Map<string, number>();
  const idsByCity = new Map<string, Set<string>>();
  for (const e of employees) {
    const city = norm(e.city) || '—';
    hqByCity.set(city, (hqByCity.get(city) || 0) + 1);
    idsByCity.set(city, idsByCity.get(city) || new Set<string>());
    idsByCity.get(city)!.add(norm(e.employee_id));
  }

  const assignedSet = new Set(joinedForDate.map((r) => norm(r.employee_id)).filter(Boolean));
  const out: LegacyCityPivotRow[] = [];
  for (const [city, HQ] of Array.from(hqByCity.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    const ids = idsByCity.get(city) || new Set<string>();
    let assigned = 0;
    for (const id of assignedSet) if (ids.has(id)) assigned += 1;
    const unassigned = Math.max(0, HQ - assigned);
    const pct = HQ > 0 ? (assigned / HQ) * 100 : 0;
    out.push({ city, HQ, assigned, unassigned, pct: Math.round(pct * 100) / 100 });
  }
  return out;
}

