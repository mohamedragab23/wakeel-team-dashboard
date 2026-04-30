import { getSheetData, ensureSheetExists, updateSheetRange } from '@/lib/googleSheets';

function norm(v: any): string {
  return String(v ?? '').trim();
}

function normHeader(v: any): string {
  return norm(v).toLowerCase().replace(/\s+/g, '_');
}

export type RoosterSession = {
  cookie: string;
  updatedAt?: string;
};

/**
 * Reads the Rooster session cookie from the main Google Sheet (tab: "config").
 *
 * Structure:
 * - A1: rooster_cookie
 * - A2: <cookie string>
 * - B1 (optional): updated_at
 * - B2 (optional): <any timestamp>
 */
export async function getRoosterSessionFromSheet(): Promise<RoosterSession | null> {
  const sheetName = process.env.ROOSTER_COOKIE_SHEET?.trim() || 'config';
  const matrix = await getSheetData(sheetName, false);
  if (!matrix?.length) return null;

  const headers = (matrix[0] || []).map(normHeader);
  const idxCookie = headers.findIndex((h) => h === 'rooster_cookie' || h === 'cookie' || h === 'rooster');
  const idxUpdated = headers.findIndex((h) => h === 'updated_at' || h === 'updated' || h === 'last_update');

  const row = matrix[1] || [];
  const cookie = idxCookie >= 0 ? norm(row[idxCookie]) : norm(row[0]);
  const updatedAt = idxUpdated >= 0 ? norm(row[idxUpdated]) : undefined;

  if (!cookie) return null;
  return { cookie, updatedAt: updatedAt || undefined };
}

/**
 * Optional helper: write the cookie into the sheet (tab: "config").
 * Not required if you prefer pasting it manually in Google Sheets UI.
 */
export async function setRoosterCookieInSheet(cookie: string, updatedAt: string = new Date().toISOString()): Promise<boolean> {
  const sheetName = process.env.ROOSTER_COOKIE_SHEET?.trim() || 'config';
  await ensureSheetExists(sheetName, ['rooster_cookie', 'updated_at']);
  return updateSheetRange(sheetName, 'A2:B2', [[cookie, updatedAt]]);
}

