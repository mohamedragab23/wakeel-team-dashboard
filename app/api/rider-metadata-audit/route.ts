import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { getAllRiders, getAllSupervisors } from '@/lib/adminService';
import { buildMetadataCompletionAudit } from '@/lib/strategicOps/metadataCompletionAudit';
import { assertAdminApiAccess } from '@/lib/adminFeatureAccess';
import { getSupervisorCodesInAdminDataScope } from '@/lib/adminZoneScope';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const token = extractBearerToken(request);
    if (!token) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }

    const decoded = verifyToken(token) as {
      role?: string;
      code?: string;
      name?: string;
    } | null;

    if (!decoded || !['supervisor', 'admin'].includes(String(decoded.role))) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }

    if (decoded.role === 'admin') {
      const deny = assertAdminApiAccess(decoded, 'strategic_ops');
      if (deny) return deny;
    }

    const { searchParams } = new URL(request.url);
    const supervisorCodeFilter = searchParams.get('supervisorCode');

    const [allRiders, supervisors] = await Promise.all([
      getAllRiders(false),
      getAllSupervisors(false),
    ]);

    let riders = allRiders;
    if (decoded.role === 'supervisor') {
      const supCode = String(decoded.code ?? '').trim();
      riders = riders.filter((r) => String(r.supervisorCode ?? '').trim() === supCode);
    } else {
      const allowed = await getSupervisorCodesInAdminDataScope(decoded);
      if (allowed) {
        riders = riders.filter((r) => allowed.has(String(r.supervisorCode ?? '').trim()));
      }
      if (supervisorCodeFilter && supervisorCodeFilter !== 'all') {
        riders = riders.filter(
          (r) => String(r.supervisorCode ?? '').trim() === supervisorCodeFilter.trim()
        );
      }
    }

    const supervisorNameByCode = new Map(
      supervisors.map((s) => [String(s.code ?? '').trim(), s.name || String(s.code ?? '').trim()])
    );

    const audit = buildMetadataCompletionAudit(riders, supervisorNameByCode);

    return NextResponse.json({
      success: true,
      data: {
        generatedAt: new Date().toISOString(),
        scope:
          decoded.role === 'supervisor'
            ? { supervisorCode: decoded.code, supervisorName: decoded.name }
            : { supervisorCode: supervisorCodeFilter || 'all' },
        audit,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'حدث خطأ';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
