/**
 * إعدادات حدود خصم المعدات للمشرفين
 * كميات المعدات المسموح خصمها لكل مشرف (صناديق دراجات، تيشرتات، قبعات، إلخ)
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { assertAdminApiAccess } from '@/lib/adminFeatureAccess';
import { getAllSupervisors } from '@/lib/adminService';
import { assertLimitedAdminSupervisorZoneAccess, filterSupervisorsForAdminDataScope } from '@/lib/adminZoneScope';
import { redactSupervisorRowForViewer } from '@/lib/adminSalaryRedaction';
import {
  readEquipmentLimits,
  writeEquipmentLimits,
  normalizeLimits,
  type SupervisorLimits,
} from '@/lib/equipmentLimitsStore';

export const dynamic = 'force-dynamic';

// GET - قائمة المشرفين مع حدود كل مشرف
export async function GET(request: NextRequest) {
  try {
    const token = extractBearerToken(request);
    if (!token) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }

    const decoded = verifyToken(token);
    if (!decoded || decoded.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }

    const el = assertAdminApiAccess(decoded, 'equipment_limits');
    if (el) return el;

    let supervisors = await getAllSupervisors(false);
    supervisors = await filterSupervisorsForAdminDataScope(decoded, supervisors);
    const stored = await readEquipmentLimits();

    const list = supervisors.map((sup) => {
      const r = redactSupervisorRowForViewer(decoded, sup);
      return {
        code: r.code,
        name: r.name,
        region: r.region,
        limits: normalizeLimits(stored[sup.code] as any),
      };
    });

    return NextResponse.json({ success: true, data: { supervisors: list } });
  } catch (error: any) {
    console.error('[Equipment Limits GET]', error);
    return NextResponse.json({ success: false, error: error?.message || 'حدث خطأ' }, { status: 500 });
  }
}

// POST - حفظ حدود خصم المعدات
export async function POST(request: NextRequest) {
  try {
    const token = extractBearerToken(request);
    if (!token) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }

    const decoded = verifyToken(token);
    if (!decoded || decoded.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }

    const el2 = assertAdminApiAccess(decoded, 'equipment_limits');
    if (el2) return el2;

    const body = await request.json();
    const limits = body.limits as Record<string, Partial<SupervisorLimits>> | undefined;
    if (!limits || typeof limits !== 'object') {
      return NextResponse.json({ success: false, error: 'المطلوب: limits ككائن' }, { status: 400 });
    }

    const existing = await readEquipmentLimits();
    const merged: Record<string, SupervisorLimits> = { ...existing };

    for (const [code, val] of Object.entries(limits)) {
      if (!code || typeof val !== 'object') continue;
      const zLim = await assertLimitedAdminSupervisorZoneAccess(decoded, code.trim());
      if (zLim) return zLim;
      const existingNorm = normalizeLimits(existing[code] as any);
      merged[code] = {
        motorcycleBox: Math.max(0, Math.floor(Number(val.motorcycleBox)) || 0),
        bicycleBox: Math.max(0, Math.floor(Number(val.bicycleBox)) || 0),
        tshirt: Math.max(0, Math.floor(Number(val.tshirt)) || 0),
        jacket: Math.max(0, Math.floor(Number(val.jacket)) || 0),
        helmet: Math.max(0, Math.floor(Number(val.helmet)) || 0),
      };
      // إذا لم يرسل العميل حقولاً، احتفظ بالقيم المخزنة
      if (val.motorcycleBox === undefined && val.bicycleBox === undefined && val.tshirt === undefined && val.jacket === undefined && val.helmet === undefined) {
        merged[code] = existingNorm;
      }
    }

    const saved = await writeEquipmentLimits(merged);
    if (!saved) {
      return NextResponse.json({ success: false, error: 'فشل حفظ الإعدادات' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'تم حفظ حدود خصم المعدات بنجاح' });
  } catch (error: any) {
    console.error('[Equipment Limits POST]', error);
    return NextResponse.json({ success: false, error: error?.message || 'حدث خطأ' }, { status: 500 });
  }
}
