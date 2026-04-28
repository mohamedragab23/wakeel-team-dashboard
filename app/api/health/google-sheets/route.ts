import { NextResponse } from 'next/server';
import { getMainSpreadsheetId, getSheetsClientFor } from '@/lib/googleSheetsAuth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function safeBool(v: any) {
  return !!(v && String(v).trim());
}

async function tryReadTab(tab: string) {
  const spreadsheetId = getMainSpreadsheetId();
  try {
    const sheets = await getSheetsClientFor('main');
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${tab}!A1:Z5`,
      majorDimension: 'ROWS',
      valueRenderOption: 'FORMATTED_VALUE',
    });
    const values = res.data.values || [];
    return { ok: true as const, tab, rows: values.length, sample: values.slice(0, 2) };
  } catch (e: any) {
    return {
      ok: false as const,
      tab,
      error: e?.message || String(e),
      code: e?.code,
      status: e?.status,
      errors: e?.errors,
    };
  }
}

export async function GET() {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim() || process.env.GOOGLE_SHEETS_007SUP_SPREADSHEET_ID?.trim();
  const hasMainJson =
    safeBool(process.env.GOOGLE_SHEETS_007SUP_CREDENTIALS_JSON) || safeBool(process.env.GOOGLE_CREDENTIALS_JSON);
  const hasClassic = safeBool(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) && safeBool(process.env.GOOGLE_PRIVATE_KEY);

  const tabsToProbe = ['Admins', 'admins', 'admin', 'Admin', 'المشرفين'];
  const results = await Promise.all(tabsToProbe.map(tryReadTab));

  return NextResponse.json({
    ok: true,
    env: {
      hasSpreadsheetId: !!spreadsheetId,
      spreadsheetIdPreview: spreadsheetId ? `${spreadsheetId.slice(0, 6)}…${spreadsheetId.slice(-6)}` : null,
      hasMainJson,
      hasClassic,
      hasJwtSecret: safeBool(process.env.JWT_SECRET),
    },
    mainSpreadsheetIdUsed: getMainSpreadsheetId(),
    probes: results,
  });
}

