import {
  RIDER_STATUS_OPTIONS,
  RIDER_TYPE_OPTIONS,
  type RiderStrategicEditableFields,
  type RiderTypeOption,
  type RiderStatusOption,
} from './types';
import { normalizeRiderCodeForPerformance } from '@/lib/riderCodeUtils';

export type BulkImportRow = {
  riderCode: string;
  fields: RiderStrategicEditableFields;
  rowNumber: number;
  errors: string[];
};

export type BulkImportResult = {
  success: boolean;
  processed: number;
  updated: number;
  errors: Array<{ row: number; riderCode: string; message: string }>;
};

function parseIsoDateCell(v: unknown): string {
  if (!v) return '';
  if (v instanceof Date && !isNaN(v.getTime())) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(s)) {
    const parts = s.split('/');
    if (parts.length === 3) {
      const [d, m, y] = parts;
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
  }
  return s;
}

function findColumnIndex(headers: string[], keywords: string[]): number {
  const lower = headers.map((h) => String(h ?? '').trim().toLowerCase());
  for (let i = 0; i < lower.length; i++) {
    if (keywords.some((k) => lower[i].includes(k))) return i;
  }
  return -1;
}

export function parseBulkStrategicExcel(rows: unknown[][]): BulkImportRow[] {
  if (!rows.length) return [];

  const headerRow = rows[0].map((c) => String(c ?? '').trim());
  const isHeader =
    findColumnIndex(headerRow, ['كود', 'code']) >= 0 ||
    findColumnIndex(headerRow, ['انضمام', 'join']) >= 0;

  const start = isHeader ? 1 : 0;
  const headers = isHeader ? headerRow : ['كود الطيار', 'تاريخ الانضمام الفعلي', 'نوع الطيار', 'التارجت اليومي', 'حالة الطيار', 'ملاحظات المشرف', 'تاريخ آخر متابعة'];

  const codeIdx = findColumnIndex(headers, ['كود', 'code', 'مندوب', 'طيار']);
  const joinIdx = findColumnIndex(headers, ['انضمام', 'join']);
  const typeIdx = findColumnIndex(headers, ['نوع', 'type']);
  const targetIdx = findColumnIndex(headers, ['تارجت', 'target', 'هدف']);
  const statusIdx = findColumnIndex(headers, ['حالة', 'status']);
  const notesIdx = findColumnIndex(headers, ['ملاحظ', 'note']);
  const followIdx = findColumnIndex(headers, ['متابعة', 'follow']);

  const results: BulkImportRow[] = [];

  for (let i = start; i < rows.length; i++) {
    const row = rows[i];
    if (!row?.length) continue;

    const get = (idx: number) => (idx >= 0 ? row[idx] : undefined);
    const riderCode = normalizeRiderCodeForPerformance(get(codeIdx >= 0 ? codeIdx : 0));
    const errors: string[] = [];

    if (!riderCode) {
      errors.push('كود الطيار مطلوب');
    }

    const actualJoinDate = parseIsoDateCell(get(joinIdx >= 0 ? joinIdx : 1));
    if (!actualJoinDate) errors.push('تاريخ الانضمام الفعلي إلزامي');

    const riderTypeRaw = String(get(typeIdx >= 0 ? typeIdx : 2) ?? '').trim();
    let riderType: RiderTypeOption | '' = '';
    if (riderTypeRaw) {
      const match = RIDER_TYPE_OPTIONS.find(
        (t) => t.toLowerCase() === riderTypeRaw.toLowerCase() || t === riderTypeRaw
      );
      if (match) riderType = match;
      else errors.push(`نوع الطيار غير صالح: ${riderTypeRaw}`);
    }

    const dailyTargetHours = parseFloat(String(get(targetIdx >= 0 ? targetIdx : 3) ?? '').replace(/,/g, '')) || 0;

    const statusRaw = String(get(statusIdx >= 0 ? statusIdx : 4) ?? '').trim();
    let currentStatus: RiderStatusOption | '' = '';
    if (statusRaw) {
      const match = RIDER_STATUS_OPTIONS.find((s) => s === statusRaw);
      if (match) currentStatus = match;
      else errors.push(`حالة الطيار غير صالحة: ${statusRaw}`);
    }

    const supervisorNotes = String(get(notesIdx >= 0 ? notesIdx : 5) ?? '').trim();
    const lastFollowUpDate = parseIsoDateCell(get(followIdx >= 0 ? followIdx : 6));

    results.push({
      riderCode,
      rowNumber: i + 1,
      errors,
      fields: {
        actualJoinDate,
        riderType,
        dailyTargetHours,
        currentStatus,
        supervisorNotes,
        lastFollowUpDate,
      },
    });
  }

  return results;
}

export const BULK_TEMPLATE_HEADERS = [
  'كود الطيار',
  'تاريخ الانضمام الفعلي',
  'نوع الطيار',
  'التارجت اليومي',
  'حالة الطيار',
  'ملاحظات المشرف',
  'تاريخ آخر متابعة',
];
