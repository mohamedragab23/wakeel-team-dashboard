import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { getAllSupervisors, addSupervisor, updateSupervisor, deleteSupervisor } from '@/lib/adminService';
import { assertAdminApiAccess, assertAdminSupervisorsReadAccess } from '@/lib/adminFeatureAccess';
import {
  assertLimitedAdminSupervisorZoneAccess,
  filterSupervisorsForAdminDataScope,
} from '@/lib/adminZoneScope';
import {
  normalizeSupervisorCode,
  parseLinkedSupervisorRootCodes,
} from '@/lib/orgHierarchy';
import {
  adminScopeHasSupervisorCode,
  getSupervisorCodesInAdminDataScope,
} from '@/lib/adminZoneScope';
import { redactSupervisorRowForViewer } from '@/lib/adminSalaryRedaction';
import { ensureSupervisorsOrgColumns } from '@/lib/supervisorsSheetSetup';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }

    const decoded = verifyToken(token);
    if (!decoded || decoded.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }

    const readDenied = assertAdminSupervisorsReadAccess(decoded);
    if (readDenied) return readDenied;

    // Force fresh data by clearing cache first if requested
    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get('refresh') === 'true';
    
    if (forceRefresh) {
      const { cache, CACHE_KEYS } = await import('@/lib/cache');
      cache.clear('admin:supervisors');
      cache.clear(CACHE_KEYS.sheetData('المشرفين'));
    }

    const allSupervisors = await getAllSupervisors(false);
    const managerOptions = allSupervisors
      .filter((s) => {
        const r = s.orgRole ?? 'supervisor';
        return r === 'zone_manager' || r === 'regional_manager';
      })
      .map((s) => redactSupervisorRowForViewer(decoded, s));

    let supervisors = await filterSupervisorsForAdminDataScope(decoded, allSupervisors);
    supervisors = supervisors.map((s) => redactSupervisorRowForViewer(decoded, s));

    const allowed = await getSupervisorCodesInAdminDataScope(decoded);
    let pickerManagers = managerOptions;
    if (allowed) {
      pickerManagers = managerOptions.filter((m) =>
        adminScopeHasSupervisorCode(allowed, String(m.code ?? ''))
      );
      for (const r of parseLinkedSupervisorRootCodes(String(decoded.linkedSupervisorCode ?? ''))) {
        const found = managerOptions.find(
          (m) => normalizeSupervisorCode(m.code) === normalizeSupervisorCode(r)
        );
        if (
          found &&
          !pickerManagers.some(
            (m) => normalizeSupervisorCode(m.code) === normalizeSupervisorCode(found.code)
          )
        ) {
          pickerManagers.push(found);
        }
      }
    }

    console.log(`[GET /api/admin/supervisors] Returning ${supervisors.length} supervisors`);

    return NextResponse.json({
      success: true,
      data: supervisors,
      managerOptions: pickerManagers,
    });
  } catch (error: any) {
    console.error(`[GET /api/admin/supervisors] Error:`, error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }

    const decoded = verifyToken(token);
    if (!decoded || decoded.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }

    const w = assertAdminApiAccess(decoded, 'supervisors');
    if (w) return w;

    const body = await request.json();
    console.log(`[POST /api/admin/supervisors] Adding supervisor:`, body);
    await ensureSupervisorsOrgColumns();
    const result = await addSupervisor(body);
    console.log(`[POST /api/admin/supervisors] Result:`, result);

    if (result.success) {
      // Clear cache to ensure fresh data on next GET
      const { cache, CACHE_KEYS } = await import('@/lib/cache');
      cache.clear('admin:supervisors');
      cache.clear(CACHE_KEYS.sheetData('المشرفين'));
      
      return NextResponse.json(result);
    } else {
      return NextResponse.json(result, { status: 400 });
    }
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }

    const decoded = verifyToken(token);
    if (!decoded || decoded.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }

    const w2 = assertAdminApiAccess(decoded, 'supervisors');
    if (w2) return w2;

    const body = await request.json();
    const { code, ...updates } = body;

    if (!code) {
      return NextResponse.json({ success: false, error: 'كود المشرف مطلوب' }, { status: 400 });
    }

    const scopeDenied = await assertLimitedAdminSupervisorZoneAccess(decoded, code);
    if (scopeDenied) return scopeDenied;

    await ensureSupervisorsOrgColumns();
    const result = await updateSupervisor(code, updates);

    if (result.success) {
      const { cache, CACHE_KEYS } = await import('@/lib/cache');
      cache.clear('admin:supervisors');
      cache.clear(CACHE_KEYS.sheetData('المشرفين'));
      return NextResponse.json(result);
    } else {
      return NextResponse.json(result, { status: 400 });
    }
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }

    const decoded = verifyToken(token);
    if (!decoded || decoded.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }

    const w3 = assertAdminApiAccess(decoded, 'supervisors');
    if (w3) return w3;

    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');

    if (!code) {
      return NextResponse.json({ success: false, error: 'كود المشرف مطلوب' }, { status: 400 });
    }

    const result = await deleteSupervisor(code);

    if (result.success) {
      return NextResponse.json(result);
    } else {
      return NextResponse.json(result, { status: 400 });
    }
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

