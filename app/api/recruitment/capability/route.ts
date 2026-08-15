import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { assertRecruitmentApiAccess } from '@/lib/recruitment/recruitmentAuth';
import { isRecruitmentV2Enabled } from '@/lib/srs014Flags';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const token = extractBearerToken(request);
  if (!token) {
    return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
  }
  const decoded = verifyToken(token);
  const denied = await assertRecruitmentApiAccess(decoded);
  if (denied) return denied;

  return NextResponse.json({
    success: true,
    recruitmentV2Enabled: isRecruitmentV2Enabled(),
  });
}
