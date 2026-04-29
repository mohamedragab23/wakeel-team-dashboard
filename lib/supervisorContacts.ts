import { getSheetData } from '@/lib/googleSheets';

export type SupervisorContact = {
  name: string;
  email?: string;
  phoneE164?: string; // +2010...
  telegramChatId?: string; // numeric string
};

function norm(v: any): string {
  return String(v ?? '').trim();
}

function normHeader(v: any): string {
  return norm(v).toLowerCase().replace(/\s+/g, ' ').trim();
}

function toE164Maybe(raw: string): string | undefined {
  const s = norm(raw);
  if (!s) return undefined;
  if (s.startsWith('+') && /^\+\d{8,15}$/.test(s)) return s;
  // Accept Egyptian mobile numbers like 01xxxxxxxxx
  if (/^01\d{9}$/.test(s)) return `+2${s}`;
  // Accept 201xxxxxxxxx
  if (/^201\d{9}$/.test(s)) return `+${s}`;
  return undefined;
}

export async function getSupervisorContacts(): Promise<SupervisorContact[]> {
  const matrix = await getSheetData('المشرفين', false);
  if (!matrix?.length) return [];

  const headers = (matrix[0] || []).map((h) => normHeader(h));
  const idxName = headers.findIndex((h) => h === 'الاسم' || h === 'name');
  const idxEmail = headers.findIndex((h) => h === 'البريد' || h === 'البريد الإلكتروني' || h === 'email');
  const idxPhone = headers.findIndex((h) => h === 'phone' || h === 'رقم' || h === 'رقم الهاتف' || h === 'whatsapp');
  const idxTelegram = headers.findIndex((h) => h === 'telegram' || h === 'telegram chat id' || h === 'telegram_chat_id');

  const out: SupervisorContact[] = [];
  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r] || [];
    const name = idxName >= 0 ? norm(row[idxName]) : norm(row[1]); // fallback column B
    if (!name) continue;

    const email = idxEmail >= 0 ? norm(row[idxEmail]) : norm(row[3]); // fallback column D
    const phoneE164 = idxPhone >= 0 ? toE164Maybe(norm(row[idxPhone])) : undefined;
    const telegramChatId = idxTelegram >= 0 ? norm(row[idxTelegram]) : undefined;

    out.push({
      name,
      email: email || undefined,
      phoneE164,
      telegramChatId: telegramChatId || undefined,
    });
  }

  return out;
}

