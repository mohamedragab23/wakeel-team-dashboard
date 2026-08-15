/**
 * Admin-only: link existing Candidate → authoritative live riderCode.
 * Explicit confirmation required. No fuzzy merge. No Liability / money.
 */
import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { assertRecruitmentApiAccess, actorFromJwt } from '@/lib/recruitment/recruitmentAuth';
import { resolveRouteId } from '@/lib/recruitment/routeParams';
import { linkCandidateToAuthoritativeRiderCode } from '@/lib/recruitment/linkRiderCode';

export const dynamic = 'force-dynamic';

type RouteCtx = { params: Promise<{ id: string }> | { id: string } };

export async function POST(request: NextRequest, ctx: RouteCtx) {
  try {
    const token = extractBearerToken(request);
    if (!token) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }
    const decoded = verifyToken(token);
    const denied = assertRecruitmentApiAccess(decoded);
    if (denied) return denied;

    if (decoded.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'ربط كود المندوب متاح للأدمن فقط' },
        { status: 403 }
      );
    }

    const id = await resolveRouteId(ctx.params);
    const body = await request.json();
    const actor = actorFromJwt(decoded);

    const result = await linkCandidateToAuthoritativeRiderCode({
      candidateId: id,
      riderCode: String(body.riderCode ?? ''),
      confirmRiderCode: String(body.confirmRiderCode ?? ''),
      confirmLiveRiderExists: body.confirmLiveRiderExists === true,
      confirmOverwriteExistingCode: body.confirmOverwriteExistingCode === true,
      actor: { ...actor, role: String(decoded.role || '') },
    });

    if (!result.ok) {
      const status =
        result.code === 'FORBIDDEN'
          ? 403
          : result.code === 'CANDIDATE_NOT_FOUND'
            ? 404
            : 400;
      return NextResponse.json(
        { success: false, code: result.code, error: result.error },
        { status }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        candidateId: result.candidate.id,
        riderCode: result.candidate.riderCode,
        previousRiderCode: result.previousRiderCode,
        liveRiderNameSnapshot: result.liveRiderNameSnapshot,
      },
      financialSideEffects: result.financialSideEffects,
      note: 'Linked riderCode only. Security / activation / Ops supervisor / Liability unchanged.',
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'حدث خطأ';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
