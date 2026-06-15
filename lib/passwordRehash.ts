import { hashPassword, isPasswordHashed } from '@/lib/passwordUtils';
import { getSheetData, updateSheetRange } from '@/lib/googleSheets';
import { normalizeSupervisorCodeForMatch } from '@/lib/dataFilter';
import { ADMIN_SHEET_TAB_CANDIDATES } from '@/lib/adminsSheetParser';

/** Upgrade plain-text password to bcrypt in sheet (non-blocking, best-effort). */
export async function rehashSupervisorPasswordIfNeeded(
  code: string,
  plainPassword: string,
  storedPassword: string
): Promise<void> {
  if (isPasswordHashed(storedPassword)) return;
  try {
    const hashed = await hashPassword(plainPassword);
    const rows = await getSheetData('المشرفين', false);
    for (let i = 1; i < rows.length; i++) {
      const rowCode = rows[i][0]?.toString().trim() || '';
      if (normalizeSupervisorCodeForMatch(rowCode) !== normalizeSupervisorCodeForMatch(code)) continue;
      const updated = [...rows[i]];
      updated[4] = hashed;
      await updateSheetRange('المشرفين', `A${i + 1}:Z${i + 1}`, [updated]);
      break;
    }
  } catch (e) {
    console.warn('[passwordRehash] supervisor rehash failed:', e);
  }
}

export async function rehashAdminPasswordIfNeeded(
  code: string,
  plainPassword: string,
  storedPassword: string
): Promise<void> {
  if (isPasswordHashed(storedPassword)) return;
  try {
    const hashed = await hashPassword(plainPassword);
    for (const tab of ADMIN_SHEET_TAB_CANDIDATES) {
      const rows = await getSheetData(tab, false, `${tab}!A:ZZ`);
      if (rows.length < 2) continue;
      for (let i = 1; i < rows.length; i++) {
        const rowCode = rows[i][0]?.toString().trim() || '';
        if (rowCode !== code) continue;
        const updated = [...rows[i]];
        if (updated.length > 2) updated[2] = hashed;
        await updateSheetRange(tab, `A${i + 1}:ZZ${i + 1}`, [updated]);
        return;
      }
    }
  } catch (e) {
    console.warn('[passwordRehash] admin rehash failed:', e);
  }
}
