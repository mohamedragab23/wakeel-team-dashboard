import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { getAllRiders, getAllSupervisors, updateRider } from '@/lib/adminService';
import { buildMetadataCompletionAudit } from '@/lib/strategicOps/metadataCompletionAudit';
import { assertAdminApiAccess } from '@/lib/adminFeatureAccess';
import { getSupervisorCodesInAdminDataScope } from '@/lib/adminZoneScope';
import { validateAssignmentMetadata } from '@/lib/riderMetadata';
import { riderCodesMatch } from '@/lib/riderCodeUtils';

export const dynamic = 'force-dynamic';

type AuthUser = {
  role?: string;
  code?: string;
  name?: string;
};

function unauthorized() {
  return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
}

async function resolveScopedRider(decoded: AuthUser, riderCode: string) {
  const code = String(riderCode ?? '').trim();
  if (!code) {
    return { error: NextResponse.json({ success: false, error: 'كود المندوب مطلوب' }, { status: 400 }) };
  }

  const allRiders = await getAllRiders(false);
  const rider = allRiders.find((r) => riderCodesMatch(r.code, code));
  if (!rider) {
    return { error: NextResponse.json({ success: false, error: 'المندوب غير موجود' }, { status: 404 }) };
  }

  const riderSupervisor = String(rider.supervisorCode ?? '').trim();

  if (decoded.role === 'supervisor') {
    const supCode = String(decoded.code ?? '').trim();
    if (riderSupervisor !== supCode) {
      return {
        error: NextResponse.json(
          { success: false, error: 'لا يمكنك تعديل بيانات مندوب خارج فريقك' },
          { status: 403 }
        ),
      };
    }
    return { rider };
  }

  if (decoded.role === 'admin') {
    const deny = assertAdminApiAccess(decoded, 'strategic_ops');
    if (deny) return { error: deny };

    const allowed = await getSupervisorCodesInAdminDataScope(decoded);
    if (allowed && riderSupervisor && !allowed.has(riderSupervisor)) {
      return {
        error: NextResponse.json(
          { success: false, error: 'لا تملك صلاحية على هذا المندوب' },
          { status: 403 }
        ),
      };
    }
    return { rider };
  }

  return { error: unauthorized() };
}

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

export async function PATCH(request: NextRequest) {
  try {
    const token = extractBearerToken(request);
    if (!token) return unauthorized();

    const decoded = verifyToken(token) as AuthUser | null;
    if (!decoded || !['supervisor', 'admin'].includes(String(decoded.role))) {
      return unauthorized();
    }

    const body = await request.json();
    const { riderCode, joinDate, contractType } = body as {
      riderCode?: string;
      joinDate?: string;
      contractType?: string;
    };

    const scope = await resolveScopedRider(decoded, String(riderCode ?? ''));
    if (scope.error) return scope.error;
    const rider = scope.rider!;

    const mergedJoinDate = String(joinDate ?? rider.joinDate ?? '').trim();
    const mergedContractType = String(contractType ?? rider.contractType ?? '').trim();

    const metadataCheck = validateAssignmentMetadata({
      joinDate: mergedJoinDate,
      contractType: mergedContractType,
    });
    if (!metadataCheck.ok) {
      return NextResponse.json({ success: false, error: metadataCheck.error }, { status: 400 });
    }

    const result = await updateRider(String(rider.code).trim(), {
      joinDate: metadataCheck.joinDate,
      contractType: metadataCheck.contractType,
      contractEndDate: metadataCheck.contractEndDate,
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error || 'فشل التحديث' }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: 'تم حفظ بيانات المندوب بنجاح',
      data: {
        riderCode: rider.code,
        joinDate: metadataCheck.joinDate,
        contractType: metadataCheck.contractType,
        contractEndDate: metadataCheck.contractEndDate,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'حدث خطأ';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
