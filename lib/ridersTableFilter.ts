import type { AbsenceFilterState, NumFilterState, TextFilterState } from '@/components/RidersExcelColumnMenu';

export type RiderRowForFilter = {
  code: string;
  name: string;
  hours: number;
  break: number;
  delay: number;
  absence: string;
  orders: number;
  acceptance: number;
  debt: number;
  date?: string | null;
  workDays?: number;
};

export type RiderColumnFilters = {
  code: TextFilterState;
  name: TextFilterState;
  date: TextFilterState;
  workDays: NumFilterState;
  hours: NumFilterState;
  break: NumFilterState;
  delay: NumFilterState;
  orders: NumFilterState;
  acceptance: NumFilterState;
  debt: NumFilterState;
  absence: AbsenceFilterState;
};

export type RiderSortState = { col: string | null; dir: 'asc' | 'desc' };

export const RIDER_NUM_FILTER_KEYS = ['workDays', 'hours', 'break', 'delay', 'orders', 'acceptance', 'debt'] as const;
export type RiderNumFilterKey = (typeof RIDER_NUM_FILTER_KEYS)[number];

function parseNum(s: string): number | null {
  const t = s.trim();
  if (t === '') return null;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

export function applyTextFilter(cell: string, f: TextFilterState): boolean {
  if (f.op === 'none') return true;
  const c = (cell ?? '').toString().toLowerCase();
  const v = f.value.trim().toLowerCase();
  switch (f.op) {
    case 'contains':
      return v === '' || c.includes(v);
    case 'equals':
      return c === v;
    case 'startsWith':
      return v === '' || c.startsWith(v);
    case 'endsWith':
      return v === '' || c.endsWith(v);
    case 'notContains':
      return v === '' || !c.includes(v);
    default:
      return true;
  }
}

export function applyNumScalar(n: number, f: NumFilterState): boolean {
  if (f.op === 'none' || f.op === 'top10' || f.op === 'bottom10') return true;
  const x = parseNum(f.value);
  const y = parseNum(f.value2);
  switch (f.op) {
    case 'equals':
      return x !== null && n === x;
    case 'notEquals':
      return x !== null && n !== x;
    case 'gt':
      return x !== null && n > x;
    case 'gte':
      return x !== null && n >= x;
    case 'lt':
      return x !== null && n < x;
    case 'lte':
      return x !== null && n <= x;
    case 'between': {
      if (x === null || y === null) return true;
      const lo = Math.min(x, y);
      const hi = Math.max(x, y);
      return n >= lo && n <= hi;
    }
    default:
      return true;
  }
}

export function applyAbsenceFilter(cell: string, f: AbsenceFilterState): boolean {
  if (f.op === 'none') return true;
  return (cell ?? '').toString().trim() === f.value;
}

function getRankFilter(filters: RiderColumnFilters): {
  key: RiderNumFilterKey;
  mode: 'top' | 'bottom';
  n: number;
} | null {
  for (const key of RIDER_NUM_FILTER_KEYS) {
    const f = filters[key];
    if (f.op === 'top10') {
      const n = Math.max(1, Math.floor(parseNum(f.value) ?? 10));
      return { key, mode: 'top', n };
    }
    if (f.op === 'bottom10') {
      const n = Math.max(1, Math.floor(parseNum(f.value) ?? 10));
      return { key, mode: 'bottom', n };
    }
  }
  return null;
}

function getNum(r: RiderRowForFilter, key: RiderNumFilterKey): number {
  switch (key) {
    case 'workDays':
      return Number.isFinite(r.workDays) ? Number(r.workDays) : 0;
    case 'hours':
      return Number(r.hours) || 0;
    case 'break':
      return Number(r.break) || 0;
    case 'delay':
      return Number(r.delay) || 0;
    case 'orders':
      return Number(r.orders) || 0;
    case 'acceptance':
      return Number(r.acceptance) || 0;
    case 'debt':
      return Number(r.debt) || 0;
    default:
      return 0;
  }
}

export function compareRiderRows(a: RiderRowForFilter, b: RiderRowForFilter, col: string, dir: 'asc' | 'desc'): number {
  const m = dir === 'asc' ? 1 : -1;
  switch (col) {
    case 'code':
      return m * (a.code || '').localeCompare(b.code || '', 'ar', { numeric: true });
    case 'name':
      return m * (a.name || '').localeCompare(b.name || '', 'ar', { numeric: true });
    case 'date':
      return m * String(a.date ?? '').localeCompare(String(b.date ?? ''), 'ar', { numeric: true });
    case 'workDays':
      return m * ((Number(a.workDays) || 0) - (Number(b.workDays) || 0));
    case 'hours':
      return m * ((Number(a.hours) || 0) - (Number(b.hours) || 0));
    case 'break':
      return m * ((Number(a.break) || 0) - (Number(b.break) || 0));
    case 'delay':
      return m * ((Number(a.delay) || 0) - (Number(b.delay) || 0));
    case 'absence':
      return m * (a.absence || '').localeCompare(b.absence || '', 'ar');
    case 'orders':
      return m * ((Number(a.orders) || 0) - (Number(b.orders) || 0));
    case 'acceptance':
      return m * ((Number(a.acceptance) || 0) - (Number(b.acceptance) || 0));
    case 'debt':
      return m * ((Number(a.debt) || 0) - (Number(b.debt) || 0));
    default:
      return 0;
  }
}

export function applyRiderTableFilters(
  rows: RiderRowForFilter[],
  filters: RiderColumnFilters,
  sort: RiderSortState
): RiderRowForFilter[] {
  let out = rows.filter((r) => {
    if (!applyTextFilter((r.code ?? '').toString(), filters.code)) return false;
    if (!applyTextFilter((r.name ?? '').toString(), filters.name)) return false;
    if (!applyTextFilter(String(r.date ?? ''), filters.date)) return false;
    if (!applyNumScalar(Number.isFinite(r.workDays) ? Number(r.workDays) : 0, filters.workDays)) return false;
    if (!applyNumScalar(Number(r.hours) || 0, filters.hours)) return false;
    if (!applyNumScalar(Number(r.break) || 0, filters.break)) return false;
    if (!applyNumScalar(Number(r.delay) || 0, filters.delay)) return false;
    if (!applyAbsenceFilter((r.absence ?? '').toString(), filters.absence)) return false;
    if (!applyNumScalar(Number(r.orders) || 0, filters.orders)) return false;
    if (!applyNumScalar(Number(r.acceptance) || 0, filters.acceptance)) return false;
    if (!applyNumScalar(Number(r.debt) || 0, filters.debt)) return false;
    return true;
  });

  const rank = getRankFilter(filters);
  if (rank) {
    const sorted = [...out].sort((a, b) => {
      const va = getNum(a, rank.key);
      const vb = getNum(b, rank.key);
      return rank.mode === 'top' ? vb - va : va - vb;
    });
    const take = Math.min(rank.n, sorted.length);
    out = sorted.slice(0, take);
  }

  if (sort.col) {
    out = [...out].sort((a, b) => compareRiderRows(a, b, sort.col!, sort.dir));
  }

  return out;
}
