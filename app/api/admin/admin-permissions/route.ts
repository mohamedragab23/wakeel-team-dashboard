import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { RECRUITMENT_MANAGER_PERMISSION } from '@/lib/authConstants';
import { appendToSheet, getSheetData, updateSheetRow } from '@/lib/googleSheets';
import { ADMIN_SHEET_TAB_CANDIDATES, parseAdminsSheetDataMatrix } from '@/lib/adminsSheetParser';
import {
  ALL_ADMIN_FEATURE_KEYS,
  LIMITED_PREFIX,
  isGrantingAdmin,
  normalizeAdminDataZone,
  type AdminFeatureKey,
} from '@/lib/adminFeatureAccess';
import {
  buildPermissionsForOperationalRole,
  isOperationalRoleId,
  OPERATIONAL_ROLE_IDS,
  OPERATIONAL_ROLE_LABELS_AR,
  parseOperationalRoleFromPermissions,
} from '@/lib/operationalRoles';
import { revokeAllSessionsForLoginCode } from '@/lib/sessionVersion';
import { appendAuditLog } from '@/lib/auditLog';
import { hashPassword } from '@/lib/passwordUtils';
import {
  isAccountDisabledPermissions,
  stripAccountDisabledMarker,
} from '@/lib/accountDisable';
import {
  ensureAdminsOrgColumns,
  syncAdminHierarchyAfterSave,
} from '@/lib/orgDashboardSync';

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
    const token = extractBearerToken(request);
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
      adminPositionRaw: a.adminPositionRaw,
      linkedSupervisorCode: a.linkedSupervisorCode,
      operationalRole: parseOperationalRoleFromPermissions(
        stripAccountDisabledMarker(a.permissions)
      ),
      accountDisabled: isAccountDisabledPermissions(a.permissions),
    }));

    return NextResponse.json({
      success: true,
      data: {
        sheetName: loaded.sheetName,
        admins,
        featureKeys: ALL_ADMIN_FEATURE_KEYS,
        operationalRoles: OPERATIONAL_ROLE_IDS.map((id) => ({
          id,
          labelAr: OPERATIONAL_ROLE_LABELS_AR[id],
        })),
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
  if (low === RECRUITMENT_MANAGER_PERMISSION) return RECRUITMENT_MANAGER_PERMISSION;
  if (low === 'all' || low === '*') return 'all';
  // Allow role:EQUIPMENT_MANAGER|limited:... packs
  if (/^\s*role:[A-Z0-9_]+\|/i.test(s)) {
    const limitedPart = s.replace(/^\s*role:[A-Z0-9_]+\|/i, '').trim();
    if (!limitedPart.toLowerCase().startsWith(LIMITED_PREFIX)) {
      throw new Error('صيغة الدور يجب أن تتضمن limited:بعد role:');
    }
    // Validate limited segment via recursive normalize of limited-only part
    return `${s.match(/^\s*role:[A-Z0-9_]+/i)![0]}|${normalizePermissionsInput(limitedPart)}`;
  }
  if (!low.startsWith(LIMITED_PREFIX)) {
    throw new Error('صيغة الصلاحيات يجب أن تكون فارغة (وصول كامل) أو all أو limited:ميزة1,ميزة2 أو دور تشغيلي');
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
    const token = extractBearerToken(request);
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
      if (body?.operationalRole != null && String(body.operationalRole).trim()) {
        const roleId = String(body.operationalRole).trim().toUpperCase();
        if (!isOperationalRoleId(roleId)) {
          return NextResponse.json({ success: false, error: 'دور تشغيلي غير معروف' }, { status: 400 });
        }
        permissions = buildPermissionsForOperationalRole(roleId);
      } else {
        permissions = normalizePermissionsInput(body?.permissions);
      }
    } catch (e: any) {
      return NextResponse.json({ success: false, error: e?.message || 'صلاحيات غير صالحة' }, { status: 400 });
    }

    const dzInput =
      Array.isArray(body?.dataZones) ? body.dataZones : body?.dataZone != null ? body.dataZone : '';
    const dataZone = normalizeAdminDataZone(dzInput);
    const adminPosition = String(body?.adminPosition ?? body?.adminPositionRaw ?? '').trim();
    let linkedSupervisorCode = String(body?.linkedSupervisorCode ?? '').trim();
    const autoCreateSupervisorRows = body?.autoCreateSupervisorRows !== false;
    const useAdminCodeAsLink =
      body?.useAdminCodeAsLink === true && !linkedSupervisorCode && adminPosition;
    if (useAdminCodeAsLink) linkedSupervisorCode = targetCode;

    if (!targetCode) {
      return NextResponse.json({ success: false, error: 'كود الأدمن المستهدف مطلوب' }, { status: 400 });
    }

    const loaded = await loadAdminsSheet();
    if (!loaded) {
      return NextResponse.json({ success: false, error: 'تعذر قراءة ورقة الأدمن' }, { status: 500 });
    }

    let { admins: parsed, columns } = parseAdminsSheetDataMatrix(loaded.rows);
    columns = await ensureAdminsOrgColumns(loaded.sheetName, loaded.rows);
    const target = parsed.find((a) => a.code === targetCode);
    if (!target) {
      return NextResponse.json({ success: false, error: 'الأدمن غير موجود' }, { status: 404 });
    }

    const foundRow = target.sheetRow1Based;
    const row = [...(loaded.rows[foundRow - 1] || [])];
    const maxCol = Math.max(
      columns.permCol,
      columns.nameCol,
      columns.passCol,
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
      return NextResponse.json({ success: false, error: 'فشل حفظ التعديل' }, { status: 500 });
    }

    const prevPerm = target.permissions;
    const nextRole = parseOperationalRoleFromPermissions(permissions);
    const prevRole = parseOperationalRoleFromPermissions(
      stripAccountDisabledMarker(prevPerm)
    );
    const revoked = await revokeAllSessionsForLoginCode(targetCode);
    void appendAuditLog({
      domain: 'auth',
      action: 'role_changed',
      entityType: 'admin_user',
      entityCode: targetCode,
      actorCode: String(decoded.code || ''),
      actorName: String(decoded.name || ''),
      before: { permissions: prevPerm, operationalRole: prevRole },
      after: {
        permissions,
        operationalRole: nextRole,
        sessions_revoked: true,
        sessionVersions: revoked,
      },
    }).catch(() => undefined);

    let syncResult = {
      created: [] as string[],
      updated: [] as string[],
      skipped: [] as string[],
      zoneManagersLinked: [] as string[],
      zoneManagersSkipped: [] as string[],
    };
    if (linkedSupervisorCode) {
      const isRegional = adminPosition.includes('منطقة');
      syncResult = await syncAdminHierarchyAfterSave({
        linkedSupervisorCode,
        adminPosition,
        displayName: target.name,
        supervisorPassword: target.password,
        autoCreateMissing: autoCreateSupervisorRows,
        regionalManagerSupervisorCode: isRegional
          ? String(body?.regionalManagerSupervisorCode ?? targetCode).trim()
          : undefined,
        syncZoneManagersToRegional: body?.syncZoneManagersToRegional !== false,
      });
    }

    return NextResponse.json({
      success: true,
      message: 'تم الحفظ. على المستخدم تسجيل الخروج والدخول مجدداً ليُطبَّق التحديث.',
      sync: syncResult,
    });
  } catch (error: any) {
    console.error('[admin-permissions PUT]', error);
    return NextResponse.json({ success: false, error: error?.message || 'حدث خطأ' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = extractBearerToken(request);
    if (!token) return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });

    const decoded = verifyToken(token);
    if (!decoded || decoded.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }
    if (!isGrantingAdmin(decoded)) {
      return NextResponse.json({ success: false, error: 'لا تملك صلاحية إضافة أدمن' }, { status: 403 });
    }

    const body = await request.json();
    const code = String(body?.code ?? '').trim();
    const name = String(body?.name ?? '').trim();
    const password = String(body?.password ?? '').trim();
    let permissions: string;
    try {
      if (body?.operationalRole != null && String(body.operationalRole).trim()) {
        const roleId = String(body.operationalRole).trim().toUpperCase();
        if (!isOperationalRoleId(roleId)) {
          return NextResponse.json({ success: false, error: 'دور تشغيلي غير معروف' }, { status: 400 });
        }
        permissions = buildPermissionsForOperationalRole(roleId);
      } else {
        permissions = normalizePermissionsInput(body?.permissions);
      }
    } catch (e: any) {
      return NextResponse.json({ success: false, error: e?.message || 'صلاحيات غير صالحة' }, { status: 400 });
    }

    const dzInput =
      Array.isArray(body?.dataZones) ? body.dataZones : body?.dataZone != null ? body.dataZone : '';
    const dataZone = normalizeAdminDataZone(dzInput);
    const adminPosition = String(body?.adminPosition ?? '').trim();
    let linkedSupervisorCode = String(body?.linkedSupervisorCode ?? '').trim();
    const autoCreateSupervisorRows = body?.autoCreateSupervisorRows !== false;
    if (body?.useAdminCodeAsLink === true && !linkedSupervisorCode && adminPosition) {
      linkedSupervisorCode = code;
    }

    if (!code || !name || !password) {
      return NextResponse.json(
        { success: false, error: 'الكود والاسم وكلمة المرور مطلوبة' },
        { status: 400 }
      );
    }

    const loaded = await loadAdminsSheet();
    if (!loaded) {
      return NextResponse.json({ success: false, error: 'تعذر قراءة ورقة الأدمن' }, { status: 500 });
    }

    let { columns } = parseAdminsSheetDataMatrix(loaded.rows);
    columns = await ensureAdminsOrgColumns(loaded.sheetName, loaded.rows);
    const { admins: parsed } = parseAdminsSheetDataMatrix(loaded.rows);
    if (parsed.some((a) => a.code === code)) {
      return NextResponse.json({ success: false, error: 'كود الأدمن موجود مسبقاً' }, { status: 400 });
    }

    const maxCol = Math.max(
      columns.codeCol,
      columns.nameCol,
      columns.passCol,
      columns.permCol,
      columns.zoneCol,
      columns.positionCol >= 0 ? columns.positionCol : -1,
      columns.linkedSupervisorCol >= 0 ? columns.linkedSupervisorCol : -1
    );
    const row: string[] = [];
    while (row.length <= maxCol) row.push('');
    row[columns.codeCol] = code;
    row[columns.nameCol] = name;
    row[columns.passCol] = await hashPassword(password);
    row[columns.permCol] = permissions;
    row[columns.zoneCol] = dataZone;
    if (columns.positionCol >= 0) row[columns.positionCol] = adminPosition;
    if (columns.linkedSupervisorCol >= 0) row[columns.linkedSupervisorCol] = linkedSupervisorCode;

    const ok = await appendToSheet(loaded.sheetName, [row], false);
    if (!ok) {
      return NextResponse.json({ success: false, error: 'فشل إضافة الأدمن' }, { status: 500 });
    }

    void appendAuditLog({
      domain: 'auth',
      action: 'user_created',
      entityType: 'admin_user',
      entityCode: code,
      actorCode: String(decoded.code || ''),
      actorName: String(decoded.name || ''),
      after: {
        name,
        permissions,
        operationalRole: parseOperationalRoleFromPermissions(permissions),
        passwordStoredHashed: true,
      },
    }).catch(() => undefined);

    let syncResult = {
      created: [] as string[],
      updated: [] as string[],
      skipped: [] as string[],
      zoneManagersLinked: [] as string[],
      zoneManagersSkipped: [] as string[],
    };
    if (linkedSupervisorCode) {
      const isRegional = adminPosition.includes('منطقة');
      syncResult = await syncAdminHierarchyAfterSave({
        linkedSupervisorCode,
        adminPosition,
        displayName: name,
        supervisorPassword: password,
        autoCreateMissing: autoCreateSupervisorRows,
        regionalManagerSupervisorCode: isRegional
          ? String(body?.regionalManagerSupervisorCode ?? code).trim()
          : undefined,
        syncZoneManagersToRegional: body?.syncZoneManagersToRegional !== false,
      });
    }

    return NextResponse.json({
      success: true,
      message: 'تم إنشاء حساب الأدمن. يمكنه تسجيل الدخول فوراً.',
      sync: syncResult,
    });
  } catch (error: any) {
    console.error('[admin-permissions POST]', error);
    return NextResponse.json({ success: false, error: error?.message || 'حدث خطأ' }, { status: 500 });
  }
}
