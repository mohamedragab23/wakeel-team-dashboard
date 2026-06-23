import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { isCronAuthorized } from '@/lib/cronAuth';
import { getMainSpreadsheetId, getSheetsClientFor } from '@/lib/googleSheetsAuth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function safeBool(v: unknown) {
  return !!(v && String(v).trim());
}

function isAuthorized(request: NextRequest): boolean {
  if (process.env.NODE_ENV !== 'production') return true;
  if (isCronAuthorized(request)) return true;

  const token = extractBearerToken(request);
  if (!token) return false;
  const decoded = verifyToken(token);
  return !!(decoded && decoded.role === 'admin');
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
    return { ok: true as const, tab, rows: values.length };
  } catch (e: any) {
    return {
      ok: false as const,
      tab,
      error: e?.message || String(e),
    };
  }
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
  }

  const spreadsheetId =
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim() ||
    process.env.GOOGLE_SHEETS_007SUP_SPREADSHEET_ID?.trim();
  const hasMainJson =
    safeBool(process.env.GOOGLE_SHEETS_007SUP_CREDENTIALS_JSON) ||
    safeBool(process.env.GOOGLE_CREDENTIALS_JSON);
  const hasClassic =
    safeBool(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) && safeBool(process.env.GOOGLE_PRIVATE_KEY);

  const tabsToProbe = ['Admins', 'admins', 'admin', 'Admin', 'المشرفين'];
  const results = await Promise.all(tabsToProbe.map(tryReadTab));

  return NextResponse.json({
    ok: true,
    env: {
      hasSpreadsheetId: !!spreadsheetId,
      hasMainJson,
      hasClassic,
      hasJwtSecret: safeBool(process.env.JWT_SECRET),
    },
    probes: results,
  });
}
