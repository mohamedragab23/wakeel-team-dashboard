/**
 * إشعارات داخل الداشبورد لمسؤولي التعيين
 */
import { appendToSheet, getSheetData, updateSheetRow } from '@/lib/googleSheets';
import type { RecruitmentNotification } from './types';
import { NOTIFICATION_HEADERS, SHEET_NOTIFICATIONS } from './types';

function randomId(): string {
  return `n_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** إشعار عند إضافة مرشح جديد */
export async function notifyNewCandidate(candidateName: string, jobAd: string): Promise<void> {
  const message = `مرشح جديد: ${candidateName} — ${jobAd}`;
  await appendToSheet(
    SHEET_NOTIFICATIONS,
    [[randomId(), 'recruitment_manager', '', message, 'false', new Date().toISOString()]],
    false
  );
}

export async function listNotifications(
  userCode: string,
  role: string
): Promise<RecruitmentNotification[]> {
  let data: unknown[][] = [];
  try {
    data = await getSheetData(SHEET_NOTIFICATIONS, false);
  } catch {
    return [];
  }

  const out: RecruitmentNotification[] = [];
  const start = data.length > 0 && String(data[0][0] ?? '').toLowerCase() === 'id' ? 1 : 0;

  for (let i = start; i < data.length; i++) {
    const row = data[i];
    if (!row?.length) continue;
    const targetRole = String(row[1] ?? '').trim();
    const targetUser = String(row[2] ?? '').trim();
    if (targetRole && targetRole !== role && targetRole !== 'recruitment_manager') continue;
    if (targetUser && targetUser !== userCode) continue;

    out.push({
      id: String(row[0] ?? ''),
      targetRole,
      targetUserCode: targetUser,
      message: String(row[3] ?? ''),
      read: String(row[4] ?? '').toLowerCase() === 'true',
      createdAt: String(row[5] ?? ''),
    });
  }

  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function markNotificationRead(notificationId: string): Promise<boolean> {
  const data = await getSheetData(SHEET_NOTIFICATIONS, false);
  const start = data.length > 0 && String(data[0][0] ?? '').toLowerCase() === 'id' ? 1 : 0;

  for (let i = start; i < data.length; i++) {
    if (String(data[i][0] ?? '').trim() === notificationId) {
      const row = [...data[i]];
      row[4] = 'true';
      return updateSheetRow(SHEET_NOTIFICATIONS, i + 1, row);
    }
  }
  return false;
}

export async function ensureNotificationsSheet(): Promise<void> {
  const { ensureSheetExists } = await import('@/lib/googleSheets');
  await ensureSheetExists(SHEET_NOTIFICATIONS, [...NOTIFICATION_HEADERS]);
}
