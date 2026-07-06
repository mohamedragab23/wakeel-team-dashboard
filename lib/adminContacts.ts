import { getSheetData } from '@/lib/googleSheets';
import { parseAdminsSheetDataMatrix } from '@/lib/adminsSheetParser';

export type AdminContact = {
  code: string;
  name: string;
  telegramChatId?: string;
};

function norm(v: any): string {
  return String(v ?? '').trim();
}

function normHeader(v: any): string {
  return norm(v).toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Get admin contacts with Telegram Chat IDs from the Admins sheet.
 * Looks for a column named "telegram", "telegram_chat_id", or similar.
 */
export async function getAdminContacts(): Promise<AdminContact[]> {
  const matrix = await getSheetData('الأدمن', false);
  if (!matrix?.length) {
    // Try alternate sheet names
    const alternateMatrix = await getSheetData('Admins', false).catch(() => null);
    if (!alternateMatrix?.length) return [];
  }

  const headers = (matrix[0] || []).map((h) => normHeader(h));
  const idxTelegram = headers.findIndex(
    (h) =>
      h === 'telegram' ||
      h === 'telegram chat id' ||
      h === 'telegram_chat_id' ||
      h.includes('telegram')
  );

  // Parse admins using existing parser to get code and name
  const { admins, dataStartIndex } = parseAdminsSheetDataMatrix(matrix);

  const out: AdminContact[] = [];
  for (const admin of admins) {
    const rowIndex = admin.sheetRow1Based - 1; // Convert to 0-based
    const row = matrix[rowIndex] || [];
    
    const telegramChatId = idxTelegram >= 0 ? norm(row[idxTelegram]) : undefined;

    out.push({
      code: admin.code,
      name: admin.name,
      telegramChatId: telegramChatId || undefined,
    });
  }

  return out;
}
