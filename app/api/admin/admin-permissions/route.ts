import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { getSheetData, updateSheetRow } from '@/lib/googleSheets';
import { ADMIN_SHEET_TAB_CANDIDATES, parseAdminsSheetDataMatrix } from '@/lib/adminsSheetParser';
import {
  ALL_ADMIN_FEATURE_KEYS,
  LIMITED_PREFIX,
  isGrantingAdmin,
  normalizeAdminDataZone,
  type AdminFeatureKey,
} from '@/lib/adminFeatureAccess';

export const dynamic = 'force-dynamic';

async function loadAdminsSheet(): Promise<{ sheetName: string; rows: any[][] } | null> {
  for (const name of ADMIN_SHEET_TAB_CANDIDATES) {
    const data = await getSheetData(name, false, `${name}!A:ZZ`);
    if (data.length > 0) return { sheetName: name, rows: data };
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });

    const decoded = verifyToken(token);
    if (!decoded || decoded.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }
    if (!isGrantingAdmin(decoded)) {
      return NextResponse.json({ success: false, error: 'لا تملك صلاحية إدارة صلاحيات الأدمن' }, { status: 403 });
    }

    const loaded = await loadAdminsSheet();
    if (!loaded) {
      return NextResponse.json({ success: false, error: 'تعذر قراءة ورقة الأدمن' }, { status: 500 });
    }

    const { admins: parsed, columns } = parseAdminsSheetDataMatrix(loaded.rows);
    const admins = parsed.map((a) => ({
      rowIndex1Based: a.sheetRow1Based,
      code: a.code,
      name: a.name,
      permissions: a.permissions,
      dataZone: a.dataZone,
      adminPosition: a.adminPositionRaw,
      linkedSupervisorCode: a.linkedSupervisorCode,
    }));

    return NextResponse.json({
      success: true,
      data: {
        sheetName: loaded.sheetName,
        admins,
        featureKeys: ALL_ADMIN_FEATURE_KEYS,
        columnMap: columns,
        totalRowsInSheet: loaded.rows.length,
        parsedCount: admins.length,
      },
    });
  } catch (error: any) {
    console.error('[admin-permissions GET]', error);
    return NextResponse.json({ success: false, error: error?.message || 'حدث خطأ' }, { status: 500 });
  }
}

function normalizePermissionsInput(v: unknown): string {
  const s = String(v ?? '').trim();
  if (!s) return '';
  const low = s.toLowerCase();
  if (low === 'all' || low === '*') return 'all';
  if (!low.startsWith(LIMITED_PREFIX)) {
    throw new Error('صيغة الصلاحيات يجب أن تكون فارغة (وصول كامل) أو all أو limited:ميزة1,ميزة2');
  }
  const rest = s.slice(LIMITED_PREFIX.length).trim();
  if (!rest) {
    throw new Error('after limited: أضف ميزة واحدة على الأقل');
  }
  const parts = rest
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean) as AdminFeatureKey[];
  const allowed = new Set<string>(ALL_ADMIN_FEATURE_KEYS);
  for (const p of parts) {
    if (!allowed.has(p)) throw new Error(`ميزة غير معروفة: ${p}`);
  }
  const uniq = Array.from(new Set(parts));
  return `${LIMITED_PREFIX}${uniq.join(',')}`;
}

export async function PUT(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });

    const decoded = verifyToken(token);
    if (!decoded || decoded.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }
    if (!isGrantingAdmin(decoded)) {
      return NextResponse.json({ success: false, error: 'لا تملك صلاحية تعديل صلاحيات الأدمن' }, { status: 403 });
    }

    const body = await request.json();
    const targetCode = String(body?.targetCode ?? '').trim();
    let permissions: string;
    try {
      permissions = normalizePermissionsInput(body?.permissions);
    } catch (e: any) {
      return NextResponse.json({ success: false, error: e?.message || 'صلاحيات غير صالحة' }, { status: 400 });
    }

    const dzInput =
      Array.isArray(body?.dataZones) ? body.dataZones : body?.dataZone != null ? body.dataZone : '';
    const dataZone = normalizeAdminDataZone(dzInput);
    const adminPosition = String(body?.adminPosition ?? body?.adminPositionRaw ?? '').trim();
    const linkedSupervisorCode = String(body?.linkedSupervisorCode ?? '').trim();

    if (!targetCode) {
      return NextResponse.json({ success: false, error: 'كود الأدمن المستهدف مطلوب' }, { status: 400 });
    }

    const loaded = await loadAdminsSheet();
    if (!loaded) {
      return NextResponse.json({ success: false, error: 'تعذر قراءة ورقة الأدمن' }, { status: 500 });
    }

    const { admins: parsed, columns } = parseAdminsSheetDataMatrix(loaded.rows);
    const target = parsed.find((a) => a.code === targetCode);
    if (!target) {
      return NextResponse.json({ success: false, error: 'الأدمن غير موجود' }, { status: 404 });
    }

    const foundRow = target.sheetRow1Based;
    const row = [...(loaded.rows[foundRow - 1] || [])];
    const maxCol = Math.max(
      columns.permCol,
      columns.zoneCol,
      columns.positionCol >= 0 ? columns.positionCol : -1,
      columns.linkedSupervisorCol >= 0 ? columns.linkedSupervisorCol : -1,
      row.length - 1
    );
    while (row.length <= maxCol) row.push('');
    row[columns.permCol] = permissions;
    row[columns.zoneCol] = dataZone;
    if (columns.positionCol >= 0) row[columns.positionCol] = adminPosition;
    if (columns.linkedSupervisorCol >= 0) row[columns.linkedSupervisorCol] = linkedSupervisorCode;

    const ok = await updateSheetRow(loaded.sheetName, foundRow, row);
    if (!ok) {
      return NextResponse.json({ success: false, error: 'فشل حفظ التعديل في الشيت' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'تم تحديث الصلاحيات. على المستخدم تسجيل الخروج والدخول مجدداً ليُطبَّق التحديث.',
    });
  } catch (error: any) {
    console.error('[admin-permissions PUT]', error);
    return NextResponse.json({ success: false, error: error?.message || 'حدث خطأ' }, { status: 500 });
  }
}
