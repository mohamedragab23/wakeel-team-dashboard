import { getSheetData, ensureSheetExists, updateSheetRow } from '@/lib/googleSheets';

function safeNum(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[, ]+/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

export async function syncTerminationDebtsFromPerformanceRows(performanceRows: unknown[][]) {
  const debtByRider = new Map<string, number>();
  for (const r of performanceRows) {
    const code = (r?.[1] ?? '').toString().trim();
    if (!code) continue;
    debtByRider.set(code, safeNum(r?.[8]));
  }
  if (debtByRider.size === 0) return { updated: 0 };

  await ensureSheetExists('طلبات_الإقالة', [
    'كود المشرف',
    'اسم المشرف',
    'كود المندوب',
    'اسم المندوب',
    'سبب الإقالة',
    'الحالة',
    'تاريخ الطلب',
    'تاريخ الموافقة',
    'تمت الموافقة بواسطة',
    'المديونية',
  ]);

  let data: unknown[][] = [];
  try {
    data = await getSheetData('طلبات_الإقالة', false);
  } catch {
    return { updated: 0 };
  }
  if (!data || data.length <= 1) return { updated: 0 };

  const header = data[0] || [];
  if ((header?.[9] ?? '').toString().trim() !== 'المديونية') {
    const newHeader = [...header];
    while (newHeader.length < 9) newHeader.push('');
    if (newHeader.length === 9) newHeader.push('المديونية');
    else newHeader[9] = 'المديونية';
    await updateSheetRow('طلبات_الإقالة', 1, newHeader);
    data[0] = newHeader;
  }

  let updated = 0;
  for (let i = 1; i < data.length; i++) {
    const row = data[i] || [];
    const riderCode = (row[2] ?? '').toString().trim();
    if (!riderCode) continue;
    const nextDebt = debtByRider.get(riderCode);
    if (nextDebt === undefined) continue;
    const curDebt = safeNum(row[9]);
    if (curDebt === nextDebt) continue;
    const updatedRow = [...row];
    while (updatedRow.length < 10) updatedRow.push('');
    updatedRow[9] = nextDebt;
    await updateSheetRow('طلبات_الإقالة', i + 1, updatedRow);
    updated++;
  }
  return { updated };
}
