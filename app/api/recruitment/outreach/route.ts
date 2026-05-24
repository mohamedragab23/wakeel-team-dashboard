import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { assertRecruitmentApiAccess, actorFromJwt } from '@/lib/recruitment/recruitmentAuth';
import { createOutreachLead, listOutreachLeads } from '@/lib/recruitment/recruitmentService';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    const decoded = verifyToken(token);
    const denied = assertRecruitmentApiAccess(decoded);
    if (denied) return denied;

    const leads = await listOutreachLeads();
    return NextResponse.json({ success: true, data: leads });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'حدث خطأ';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    const decoded = verifyToken(token);
    const denied = assertRecruitmentApiAccess(decoded);
    if (denied) return denied;

    const body = await request.json();
    const actor = actorFromJwt(decoded);
    if (!body.fullName?.trim() || !body.phone?.trim()) {
      return NextResponse.json({ success: false, error: 'الاسم والهاتف مطلوبان' }, { status: 400 });
    }
    const lead = await createOutreachLead(
      {
        fullName: body.fullName,
        phone: body.phone,
        vehicleType: body.vehicleType,
        workedBefore: body.workedBefore,
        governorate: body.governorate,
        zone: body.zone,
        jobAd: body.jobAd,
        assignedSupervisorCode: body.assignedSupervisorCode,
        hiringDecision: body.hiringDecision,
        notHiredReason: body.notHiredReason,
        lecturePlannedDate: body.lecturePlannedDate,
        notes: body.notes,
      },
      actor
    );

    return NextResponse.json({ success: true, data: lead });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'حدث خطأ';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

