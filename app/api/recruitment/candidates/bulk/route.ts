import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { assertRecruitmentApiAccess, actorFromJwt } from '@/lib/recruitment/recruitmentAuth';
import { bulkImportCandidates } from '@/lib/recruitment/recruitmentService';
import type { CandidateInput } from '@/lib/recruitment/types';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const token = extractBearerToken(request);
    if (!token) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }
    const decoded = verifyToken(token);
    const denied = assertRecruitmentApiAccess(decoded);
    if (denied) return denied;

    const body = await request.json();
    const rows = (body.rows || []) as CandidateInput[];
    const isLegacy = Boolean(body.isLegacy);

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ success: false, error: 'لا توجد صفوف للاستيراد' }, { status: 400 });
    }

    const actor = actorFromJwt(decoded);
    const result = await bulkImportCandidates(rows, actor.code, actor.name, isLegacy);
    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'حدث خطأ';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
