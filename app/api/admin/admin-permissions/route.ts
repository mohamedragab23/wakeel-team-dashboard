import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { getSheetData, updateSheetRow } from '@/lib/googleSheets';
import {
  ALL_ADMIN_FEATURE_KEYS,
  LIMITED_PREFIX,
  isGrantingAdmin,
  normalizeAdminDataZone,
  type AdminFeatureKey,
} from '@/lib/adminFeatureAccess';
import { isAllowedZone } from '@/lib/zones';

export const dynamic = 'force-dynamic';

const ADMIN_SHEET_CANDIDATES = ['Admins', 'Admin', 'admins', 'admin', 'الأدمن', 'الادمن'];

async function loadAdminsSheet(): Promise<{ sheetName: string; rows: any[][] } | null> {
  for (const name of ADMIN_SHEET_CANDIDATES) {
    const data = await getSheetData(name);
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

    const admins = [];
    for (let i = 1; i < loaded.rows.length; i++) {
      const row = loaded.rows[i];
      const code = row[0]?.toString().trim();
      if (!code) continue;
      admins.push({
        rowIndex1Based: i + 1,
        code,
        name: row[1]?.toString().trim() || '',
        permissions: row[3]?.toString().trim() ?? '',
        dataZone: row[4]?.toString().trim() ?? '',
      });
    }

    return NextResponse.json({
      success: true,
      data: { sheetName: loaded.sheetName, admins, featureKeys: ALL_ADMIN_FEATURE_KEYS },
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

    const dzRaw = body?.dataZone != null ? String(body.dataZone).trim() : '';
    const dataZone = dzRaw && isAllowedZone(dzRaw) ? normalizeAdminDataZone(dzRaw) : '';

    if (!targetCode) {
      return NextResponse.json({ success: false, error: 'كود الأدمن المستهدف مطلوب' }, { status: 400 });
    }

    const loaded = await loadAdminsSheet();
    if (!loaded) {
      return NextResponse.json({ success: false, error: 'تعذر قراءة ورقة الأدمن' }, { status: 500 });
    }

    let foundRow = -1;
    for (let i = 1; i < loaded.rows.length; i++) {
      const code = loaded.rows[i][0]?.toString().trim();
      if (code === targetCode) {
        foundRow = i + 1;
        break;
      }
    }
    if (foundRow < 0) {
      return NextResponse.json({ success: false, error: 'الأدمن غير موجود' }, { status: 404 });
    }

    const row = [...(loaded.rows[foundRow - 1] || [])];
    while (row.length < 5) row.push('');
    row[3] = permissions;
    row[4] = dataZone;

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
