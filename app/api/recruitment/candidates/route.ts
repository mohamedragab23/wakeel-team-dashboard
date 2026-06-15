/**
 * API المرشحين: قائمة وإنشاء
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { assertRecruitmentApiAccess, actorFromJwt } from '@/lib/recruitment/recruitmentAuth';
import { createCandidate, listCandidates } from '@/lib/recruitment/recruitmentService';
import type { CandidateFilters, PipelineStatus } from '@/lib/recruitment/types';

export const dynamic = 'force-dynamic';

function filtersFromSearchParams(sp: URLSearchParams): CandidateFilters {
  return {
    q: sp.get('q') || undefined,
    contactStatus: sp.get('contactStatus') || undefined,
    lectureAttendance: sp.get('lectureAttendance') || undefined,
    activationStatus: sp.get('activationStatus') || undefined,
    equipmentStatus: sp.get('equipmentStatus') || undefined,
    assignmentStatus: sp.get('assignmentStatus') || undefined,
    finalAssignedSupervisorCode: sp.get('finalAssignedSupervisorCode') || undefined,
    zone: sp.get('zone') || undefined,
    governorate: sp.get('governorate') || undefined,
    hiringDecision: sp.get('hiringDecision') || undefined,
    pipelineStatus: (sp.get('pipelineStatus') as PipelineStatus) || undefined,
    dateFrom: sp.get('dateFrom') || undefined,
    dateTo: sp.get('dateTo') || undefined,
    appliedDateFrom: sp.get('appliedDateFrom') || undefined,
    appliedDateTo: sp.get('appliedDateTo') || undefined,
  };
}

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }
    const decoded = verifyToken(token);
    const denied = assertRecruitmentApiAccess(decoded);
    if (denied) return denied;

    const { searchParams } = new URL(request.url);
    const filters = filtersFromSearchParams(searchParams);
    const limitRaw = searchParams.get('limit');
    const offsetRaw = searchParams.get('offset');
    const limit = limitRaw ? Math.min(500, Math.max(1, parseInt(limitRaw, 10) || 0)) : undefined;
    const offset = offsetRaw ? Math.max(0, parseInt(offsetRaw, 10) || 0) : undefined;
    const data = await listCandidates(filters, { limit, offset });
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'حدث خطأ';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }
    const decoded = verifyToken(token);
    const denied = assertRecruitmentApiAccess(decoded);
    if (denied) return denied;

    const body = await request.json();
    const actor = actorFromJwt(decoded);
    if (!body.fullName?.trim() || !body.phone?.trim()) {
      return NextResponse.json(
        { success: false, error: 'الاسم ورقم الهاتف مطلوبان' },
        { status: 400 }
      );
    }
    if (!body.vehicleType || !body.workedBefore || !body.governorate?.trim() || !body.zone?.trim()) {
      return NextResponse.json(
        { success: false, error: 'وسيلة العمل/المحافظة/الزون وحالة الخبرة السابقة مطلوبة' },
        { status: 400 }
      );
    }

    const candidate = await createCandidate(
      {
        fullName: body.fullName,
        phone: body.phone,
        jobAd: body.jobAd || 'غير محدد',
        appliedDate: body.appliedDate,
        vehicleType: body.vehicleType,
        workedBefore: body.workedBefore,
        governorate: body.governorate,
        zone: body.zone,
        assignedSupervisorCode: body.assignedSupervisorCode,
        hiringDecision: body.hiringDecision,
        notHiredReason: body.notHiredReason,
        lecturePlannedDate: body.lecturePlannedDate,
        lectureConfirmed: body.lectureConfirmed,
        activationConfirmed: body.activationConfirmed,
        equipmentNotReceivedReason: body.equipmentNotReceivedReason,
        equipmentExpectedDate: body.equipmentExpectedDate,
        contactStatus: body.contactStatus,
        notes: body.notes,
        isLegacy: body.isLegacy,
      },
      actor.code,
      actor.name
    );

    return NextResponse.json({ success: true, data: candidate });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'حدث خطأ';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
