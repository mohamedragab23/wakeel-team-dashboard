/**
 * تقييد مدير الزون/المنطقة على API فقط — يستورد adminService (Google Sheets).
 * لا تستورد هذا الملف من مكوّنات العميل (مثل Layout) لتفادي سحب googleapis إلى المتصفح.
 */

import { NextResponse } from 'next/server';
import { getAllSupervisors } from '@/lib/adminService';
import { parseAdminAllowedZonesList, supervisorZonesOverlapAllowed } from '@/lib/zones';
import {
  isLimitedAdminDataScopeActive,
  isLimitedAdminZoneScopeActive,
  parseLimitedFeatures,
} from '@/lib/adminFeatureAccess';
import { buildDescendantSupervisorCodes } from '@/lib/orgHierarchy';

export type AdminDataScopeJwt = {
  role?: string;
  permissions?: string;
  dataZone?: string;
  adminOrgRole?: string;
  linkedSupervisorCode?: string;
};

/** تصفية بالزون فقط (واجهات بسيطة لا تحتاج شجرة). */
export function filterSupervisorsForZoneScopedAdmin<T extends { region?: string }>(
  decoded: { role?: string; permissions?: string; dataZone?: string },
  list: T[]
): T[] {
  if (!isLimitedAdminZoneScopeActive(decoded)) return list;
  const scopeZones = parseAdminAllowedZonesList(decoded.dataZone);
  return list.filter((s) => supervisorZonesOverlapAllowed(s.region, scopeZones));
}

/**
 * تصفية حسب نطاق الأدمن المحدود: تقاطع (زونات JWT) ∩ (أحفاد كود الشيت المربوط) إن وُجد.
 * يرجع null إذا لم يُطبَّق تقييد (أدمن كامل الصلاحيات، أو أدمن محدود بلا زون ولا ربط — السلوك السابق).
 */
export async function getSupervisorCodesInAdminDataScope(
  decoded: AdminDataScopeJwt
): Promise<Set<string> | null> {
  if (!decoded || decoded.role !== 'admin') return null;
  if (parseLimitedFeatures(decoded.permissions) === null) return null;

  const sups = await getAllSupervisors(false);

  const byZoneList = parseAdminAllowedZonesList(decoded.dataZone);
  const zoneFiltered =
    byZoneList.length > 0
      ? new Set(
          sups
            .filter((s) => supervisorZonesOverlapAllowed(s.region, byZoneList))
            .map((s) => String(s.code ?? '').trim())
            .filter(Boolean)
        )
      : null;

  const linked = String(decoded.linkedSupervisorCode ?? '').trim();
  const treeFiltered = linked ? buildDescendantSupervisorCodes(sups, linked) : null;

  if (!zoneFiltered && !treeFiltered) return null;

  if (zoneFiltered && treeFiltered) {
    return new Set([...zoneFiltered].filter((c) => treeFiltered.has(c)));
  }
  return zoneFiltered ?? treeFiltered;
}

/** @deprecated استخدم getSupervisorCodesInAdminDataScope — الاسم القديم للتوافق. */
export async function getSupervisorCodesInZoneScope(
  decoded: AdminDataScopeJwt
): Promise<Set<string> | null> {
  return getSupervisorCodesInAdminDataScope(decoded);
}

export async function assertLimitedAdminSupervisorZoneAccess(
  decoded: AdminDataScopeJwt,
  supervisorCode: string
): Promise<NextResponse | null> {
  if (!isLimitedAdminDataScopeActive(decoded)) return null;
  const code = String(supervisorCode ?? '').trim();
  if (!code) {
    return NextResponse.json({ success: false, error: 'كود المشرف مطلوب' }, { status: 400 });
  }
  const allowed = await getSupervisorCodesInAdminDataScope(decoded);
  if (!allowed) return null;
  if (!allowed.has(code)) {
    return NextResponse.json(
      { success: false, error: 'لا تملك صلاحية على مشرفين خارج النطاق المحدد لك' },
      { status: 403 }
    );
  }
  return null;
}

export async function filterSupervisorsForAdminDataScope<T extends { code?: string; region?: string }>(
  decoded: AdminDataScopeJwt,
  list: T[]
): Promise<T[]> {
  if (!isLimitedAdminDataScopeActive(decoded)) return list;
  const allowed = await getSupervisorCodesInAdminDataScope(decoded);
  if (!allowed) return list;
  return list.filter((s) => allowed.has(String(s.code ?? '').trim()));
}

/** صفوف فيها supervisorCode — تقييد حسب نطاق الأدمن المحدود. */
export async function filterRowsBySupervisorInZoneScope<
  T extends { supervisorCode?: string }
>(decoded: AdminDataScopeJwt, rows: T[]): Promise<T[]> {
  if (decoded.role !== 'admin') return rows;
  const allowed = await getSupervisorCodesInAdminDataScope(decoded);
  if (!allowed) return rows;
  return rows.filter((r) => allowed.has(String(r.supervisorCode ?? '').trim()));
}
