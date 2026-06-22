import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { assertAdminApiAccess } from '@/lib/adminFeatureAccess';
import { buildStrategicOpsReport } from '@/lib/strategicOps/buildReport';
import {
  adminScopeHasSupervisorCode,
  getSupervisorCodesInAdminDataScope,
} from '@/lib/adminZoneScope';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

function parseOptionalNum(v: string | null): number | undefined {
  if (v === null || v.trim() === '') return undefined;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : undefined;
}

export async function GET(request: NextRequest) {
  try {
    const token = extractBearerToken(request);
    if (!token) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }

    const decoded = verifyToken(token) as {
      role?: string;
      permissions?: string;
      dataZone?: string;
      linkedSupervisorCode?: string;
    } | null;

    if (!decoded || decoded.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }

    const denied = assertAdminApiAccess(decoded, 'strategic_ops');
    if (denied) return denied;

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const zone = searchParams.get('zone') || 'all';
    let supervisorCode = searchParams.get('supervisorCode') || 'all';

    if (!startDate || !endDate) {
      return NextResponse.json(
        { success: false, error: 'المطلوب: startDate و endDate (YYYY-MM-DD)' },
        { status: 400 }
      );
    }

    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T23:59:59');
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
      return NextResponse.json({ success: false, error: 'نطاق تاريخ غير صالح' }, { status: 400 });
    }

    const allowed = await getSupervisorCodesInAdminDataScope(decoded);
    if (allowed && supervisorCode !== 'all' && !adminScopeHasSupervisorCode(allowed, supervisorCode)) {
      return NextResponse.json({ success: false, error: 'المشرف خارج نطاق صلاحياتك' }, { status: 403 });
    }

    if (allowed && supervisorCode === 'all') {
      // Zone-limited admins: if only one supervisor in scope, no change; filtering happens in report by supervisors list
    }

    const report = await buildStrategicOpsReport({
      startDate,
      endDate,
      zone,
      supervisorCode,
      allowedSupervisorCodes: allowed ?? null,
      talabatBenchmark: {
        active: parseOptionalNum(searchParams.get('talabatActive')),
        noShow: parseOptionalNum(searchParams.get('talabatNoShow')),
        hours: parseOptionalNum(searchParams.get('talabatHours')),
        achievement: parseOptionalNum(searchParams.get('talabatAchievement')),
      },
    });

    if (allowed) {
      report.supervisorPerformance.rows = report.supervisorPerformance.rows.filter((s) =>
        adminScopeHasSupervisorCode(allowed, s.code)
      );
      report.supervisorRisk.rows = report.supervisorRisk.rows.filter((s) =>
        adminScopeHasSupervisorCode(allowed, s.code)
      );
      if (report.supervisorPerformance.bestSupervisor && !adminScopeHasSupervisorCode(allowed, report.supervisorPerformance.bestSupervisor.code)) {
        report.supervisorPerformance.bestSupervisor = report.supervisorPerformance.rows[0] ?? null;
      }
      if (report.supervisorPerformance.worstSupervisor && !adminScopeHasSupervisorCode(allowed, report.supervisorPerformance.worstSupervisor.code)) {
        const rows = report.supervisorPerformance.rows;
        report.supervisorPerformance.worstSupervisor = rows.length ? rows[rows.length - 1] : null;
      }
    }

    return NextResponse.json({ success: true, data: report });
  } catch (error: unknown) {
    console.error('[Strategic Ops API]', error);
    const msg = error instanceof Error ? error.message : 'حدث خطأ';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
