/**
 * تقييد مدير الزون على API فقط — يستورد adminService (Google Sheets).
 * لا تستورد هذا الملف من مكوّنات العميل (مثل Layout) لتفادي سحب googleapis إلى المتصفح.
 */

import { NextResponse } from 'next/server';
import { getAllSupervisors } from '@/lib/adminService';
import { parseAdminAllowedZonesList, supervisorZonesOverlapAllowed } from '@/lib/zones';
import { isLimitedAdminZoneScopeActive } from '@/lib/adminFeatureAccess';

export function filterSupervisorsForZoneScopedAdmin<T extends { region?: string }>(
  decoded: { role?: string; permissions?: string; dataZone?: string },
  list: T[]
): T[] {
  if (!isLimitedAdminZoneScopeActive(decoded)) return list;
  const scopeZones = parseAdminAllowedZonesList(decoded.dataZone);
  return list.filter((s) => supervisorZonesOverlapAllowed(s.region, scopeZones));
}

export async function assertLimitedAdminSupervisorZoneAccess(
  decoded: { role?: string; permissions?: string; dataZone?: string },
  supervisorCode: string
): Promise<NextResponse | null> {
  if (!isLimitedAdminZoneScopeActive(decoded)) return null;
  const code = String(supervisorCode ?? '').trim();
  if (!code) {
    return NextResponse.json({ success: false, error: 'كود المشرف مطلوب' }, { status: 400 });
  }
  const sups = await getAllSupervisors(false);
  const s = sups.find((x) => String(x.code ?? '').trim() === code);
  if (!s) {
    return NextResponse.json({ success: false, error: 'المشرف غير موجود' }, { status: 404 });
  }
  const scopeZones = parseAdminAllowedZonesList(decoded.dataZone);
  if (!supervisorZonesOverlapAllowed(s.region, scopeZones)) {
    return NextResponse.json(
      { success: false, error: 'لا تملك صلاحية على مشرفين خارج الزونات المحددة لك' },
      { status: 403 }
    );
  }
  return null;
}

export async function getSupervisorCodesInZoneScope(
  decoded: { role?: string; permissions?: string; dataZone?: string }
): Promise<Set<string> | null> {
  if (!isLimitedAdminZoneScopeActive(decoded)) return null;
  const scopeZones = parseAdminAllowedZonesList(decoded.dataZone);
  const sups = await getAllSupervisors(false);
  return new Set(
    sups
      .filter((s) => supervisorZonesOverlapAllowed(s.region, scopeZones))
      .map((s) => String(s.code ?? '').trim())
      .filter(Boolean)
  );
}
