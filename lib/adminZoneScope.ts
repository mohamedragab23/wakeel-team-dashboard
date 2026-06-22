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
import {
  buildDescendantSupervisorCodesMulti,
  normalizeSupervisorCode,
  parseLinkedSupervisorRootCodes,
  resolveSupervisorCodeInSheet,
  buildSupervisorCodeIndex,
} from '@/lib/orgHierarchy';

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
 * تصفية حسب نطاق الأدمن المحدود.
 * عند وجود ربط شجرة (linkedSupervisorCode): الشجرة هي مصدر الحقيقة — لا يُستبعد مشرف
 * لأن عمود زونه مختلف عن مدير الزون (كان يسبب «عدم ربط كامل»).
 * الزونات تُستخدم وحدها فقط إن لم يُربط جذر شجرة.
 */
export async function getSupervisorCodesInAdminDataScope(
  decoded: AdminDataScopeJwt
): Promise<Set<string> | null> {
  if (!decoded || decoded.role !== 'admin') return null;
  if (parseLimitedFeatures(decoded.permissions) === null) return null;

  const sups = await getAllSupervisors(false);
  const index = buildSupervisorCodeIndex(sups);

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

  const rootsRaw = parseLinkedSupervisorRootCodes(String(decoded.linkedSupervisorCode ?? ''));
  const roots = rootsRaw
    .map((r) => resolveSupervisorCodeInSheet(r, index))
    .filter((r): r is string => Boolean(r));

  let treeFiltered: Set<string> | null = null;
  if (roots.length > 0) {
    const tree = buildDescendantSupervisorCodesMulti(sups, roots);
    treeFiltered = tree.size > 0 ? tree : null;
  }

  if (!zoneFiltered && !treeFiltered) return null;

  if (treeFiltered) return treeFiltered;
  return zoneFiltered;
}

/** هل الكود ضمن نطاق الأدمن (بعد التطبيع)؟ */
export function adminScopeHasSupervisorCode(allowed: Set<string> | null, code: string): boolean {
  if (!allowed) return true;
  const c = String(code ?? '').trim();
  if (allowed.has(c)) return true;
  const n = normalizeSupervisorCode(c);
  for (const a of allowed) {
    if (normalizeSupervisorCode(a) === n) return true;
  }
  return false;
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
  if (!adminScopeHasSupervisorCode(allowed, code)) {
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
  return list.filter((s) => adminScopeHasSupervisorCode(allowed, String(s.code ?? '').trim()));
}

/** صفوف فيها supervisorCode — تقييد حسب نطاق الأدمن المحدود. */
export async function filterRowsBySupervisorInZoneScope<
  T extends { supervisorCode?: string }
>(decoded: AdminDataScopeJwt, rows: T[]): Promise<T[]> {
  if (decoded.role !== 'admin') return rows;
  const allowed = await getSupervisorCodesInAdminDataScope(decoded);
  if (!allowed) return rows;
  return rows.filter((r) => adminScopeHasSupervisorCode(allowed, String(r.supervisorCode ?? '').trim()));
}

/** Block limited-scope admins from system-wide performance writes (sync, import apply, clear, delete-day). */
export function assertLimitedAdminGlobalWriteDenied(decoded: AdminDataScopeJwt): NextResponse | null {
  if (!isLimitedAdminDataScopeActive(decoded)) return null;
  return NextResponse.json(
    {
      success: false,
      error:
        'هذه العملية تؤثر على بيانات على مستوى النظام ولا تتوفر لحساب الأدمن المحدود. تواصل مع المدير العام.',
      code: 'GLOBAL_WRITE_DENIED_FOR_LIMITED_ADMIN',
    },
    { status: 403 }
  );
}

/** Reject rider bulk upload when any row targets a supervisor outside the admin scope. */
export async function assertRiderUploadRowsInAdminScope(
  decoded: AdminDataScopeJwt,
  riders: Array<{ supervisorCode?: string }>
): Promise<NextResponse | null> {
  if (!isLimitedAdminDataScopeActive(decoded)) return null;
  const allowed = await getSupervisorCodesInAdminDataScope(decoded);
  if (!allowed) return null;
  const outOfScope = riders.filter(
    (r) => !adminScopeHasSupervisorCode(allowed, String(r.supervisorCode ?? '').trim())
  );
  if (outOfScope.length === 0) return null;
  return NextResponse.json(
    {
      success: false,
      error: `لا يمكن رفع ${outOfScope.length} مندوب خارج نطاق صلاحياتك`,
      code: 'RIDER_OUT_OF_ZONE_SCOPE',
    },
    { status: 403 }
  );
}

/** Keep performance upload rows whose rider belongs to a supervisor in admin scope. */
export async function filterPerformanceRowsByAdminScope(
  decoded: AdminDataScopeJwt,
  performanceRows: any[][],
  riderToSupervisor: Map<string, string>
): Promise<{ rows: any[][]; skipped: number; denied: NextResponse | null }> {
  if (!isLimitedAdminDataScopeActive(decoded)) {
    return { rows: performanceRows, skipped: 0, denied: null };
  }
  const allowed = await getSupervisorCodesInAdminDataScope(decoded);
  if (!allowed) return { rows: performanceRows, skipped: 0, denied: null };

  const kept: any[][] = [];
  let skipped = 0;
  for (const row of performanceRows) {
    const riderCode = String(row?.[1] ?? '').trim();
    const sup = riderToSupervisor.get(riderCode) ?? '';
    if (adminScopeHasSupervisorCode(allowed, sup)) {
      kept.push(row);
    } else {
      skipped++;
    }
  }

  if (kept.length === 0) {
    return {
      rows: [],
      skipped,
      denied: NextResponse.json(
        {
          success: false,
          error: 'جميع صفوف الأداء خارج نطاق صلاحياتك',
          code: 'PERFORMANCE_OUT_OF_ZONE_SCOPE',
        },
        { status: 403 }
      ),
    };
  }

  return { rows: kept, skipped, denied: null };
}
