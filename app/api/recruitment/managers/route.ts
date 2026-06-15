import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { adminFeatureAllowed, parseLimitedFeatures } from '@/lib/adminFeatureAccess';
import { getSheetData } from '@/lib/googleSheets';
import { ADMIN_SHEET_TAB_CANDIDATES, parseAdminsSheetDataMatrix } from '@/lib/adminsSheetParser';
import { RECRUITMENT_MANAGER_PERMISSION } from '@/lib/authConstants';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const token = extractBearerToken(request);
    if (!token) return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    const decoded = verifyToken(token);
    if (decoded?.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'هذه العملية متاحة للأدمن فقط' }, { status: 403 });
    }
    const limited = parseLimitedFeatures(decoded.permissions);
    if (limited !== null && !adminFeatureAllowed(decoded.permissions, 'recruitment')) {
      return NextResponse.json({ success: false, error: 'لا تملك صلاحية التعيينات' }, { status: 403 });
    }

    let adminsData: unknown[][] = [];
    for (const sheetName of ADMIN_SHEET_TAB_CANDIDATES) {
      const data = await getSheetData(sheetName, false, `${sheetName}!A:ZZ`);
      if (data.length > 0) {
        adminsData = data;
        break;
      }
    }
    if (!adminsData.length) {
      return NextResponse.json({ success: true, data: [] });
    }

    const { admins } = parseAdminsSheetDataMatrix(adminsData);
    const managers = admins
      .filter((a) => String(a.permissions || '').trim().toLowerCase() === RECRUITMENT_MANAGER_PERMISSION)
      .map((a) => ({ code: a.code, name: a.name || a.code }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ar'));

    return NextResponse.json({ success: true, data: managers });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'حدث خطأ';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
