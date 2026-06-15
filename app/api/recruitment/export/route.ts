import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { assertRecruitmentApiAccess } from '@/lib/recruitment/recruitmentAuth';
import { listCandidates } from '@/lib/recruitment/recruitmentService';
import { candidatesToExcelBuffer } from '@/lib/recruitment/recruitmentExport';
import type { PipelineStatus } from '@/lib/recruitment/types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const token = extractBearerToken(request);
    if (!token) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }
    const decoded = verifyToken(token);
    const denied = assertRecruitmentApiAccess(decoded);
    if (denied) return denied;

    const { searchParams } = new URL(request.url);
    const pipelineStatus = searchParams.get('pipelineStatus') as PipelineStatus | null;
    const candidates = await listCandidates({
      pipelineStatus: pipelineStatus || undefined,
      q: searchParams.get('q') || undefined,
    });

    const buf = candidatesToExcelBuffer(candidates);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="candidates-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'حدث خطأ';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
