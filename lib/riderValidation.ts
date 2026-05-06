import { getSheetData } from '@/lib/googleSheets';

function normalizeName(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Ensures rider exists and belongs to supervisor; name must match sheet if provided.
 */
export async function assertSupervisorRider(
  riderCode: string,
  riderName: string,
  supervisorCode: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const codeT = riderCode?.toString().trim();
  const nameT = riderName?.toString().trim();
  const supT = supervisorCode?.toString().trim();

  if (!codeT) {
    return { ok: false, error: 'كود المندوب مطلوب' };
  }

  const riders = await getSheetData('المناديب', false);
  for (let i = 1; i < riders.length; i++) {
    const row = riders[i];
    if (!row?.[0] || row[0].toString().trim() !== codeT) continue;

    const sup = row[3]?.toString().trim() || '';
    if (sup !== supT) {
      return { ok: false, error: 'هذا المندوب غير تابع لهذا المشرف في النظام' };
    }

    const sheetName = row[1]?.toString().trim() || '';
    if (nameT && sheetName) {
      if (normalizeName(sheetName) !== normalizeName(nameT)) {
        return {
          ok: false,
          error: `اسم المندوب في النظام: "${sheetName}" — يجب إدخال الاسم كما هو بالضبط في التطبيق`,
        };
      }
    }

    return { ok: true };
  }

  return { ok: false, error: 'كود المندوب غير موجود في ورقة المناديب' };
}
