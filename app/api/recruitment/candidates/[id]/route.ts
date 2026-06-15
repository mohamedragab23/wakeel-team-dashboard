/**
 * API مرشح واحد: تعديل وحذف
 */
import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { assertRecruitmentApiAccess, actorFromJwt } from '@/lib/recruitment/recruitmentAuth';
import {
  deleteCandidate,
  getCandidateById,
  updateCandidate,
} from '@/lib/recruitment/recruitmentService';
import type { Candidate } from '@/lib/recruitment/types';
import { resolveRouteId } from '@/lib/recruitment/routeParams';

export const dynamic = 'force-dynamic';

type RouteCtx = { params: Promise<{ id: string }> | { id: string } };

const RECRUITMENT_MANAGER_ALLOWED_FIELDS: (keyof Candidate)[] = [
  'hiringDecision',
  'notHiredReason',
  'lecturePlannedDate',
  'lectureConfirmed',
  'lectureAttendance',
  'lectureDate',
  'activationConfirmed',
  'activationStatus',
  'activationDate',
  'equipmentStatus',
  'equipmentDate',
  'equipmentNotReceivedReason',
  'equipmentExpectedDate',
  'contactStatus',
  'contactDate',
  'assignedManager',
  'notes',
  'finalAssignedSupervisorCode',
  'assignmentNote',
];

function sanitizeRecruitmentManagerPatch(body: Record<string, unknown>): Partial<Candidate> {
  const out: Partial<Candidate> = {};
  for (const key of RECRUITMENT_MANAGER_ALLOWED_FIELDS) {
    if (key in body && body[key] !== undefined) {
      (out as Record<string, unknown>)[key] = body[key];
    }
  }
  return out;
}

function validateSequentialUpdate(existing: Candidate, patch: Partial<Candidate>): string | null {
  const next: Candidate = { ...existing, ...patch };
  const lectureDone = next.lectureConfirmed === 'مؤكد' || next.lectureAttendance === 'حضر';
  const activationDone = next.activationConfirmed === 'مؤكد' || next.activationStatus === 'مفعل - تم القبول';

  if (lectureDone && next.hiringDecision !== 'هيشتغل') {
    return 'لا يمكن تأكيد/تسجيل المحاضرة قبل تحديد المرشح أنه "هيشتغل"';
  }
  if (activationDone && !lectureDone) {
    return 'لا يمكن تأكيد/تسجيل التفعيل قبل تأكيد حضور المحاضرة';
  }

  const equipmentTouched =
    patch.equipmentStatus !== undefined ||
    patch.equipmentDate !== undefined ||
    patch.equipmentNotReceivedReason !== undefined ||
    patch.equipmentExpectedDate !== undefined;
  if (equipmentTouched && !activationDone) {
    return 'لا يمكن تعديل حالة المعدات قبل تأكيد التفعيل';
  }

  return null;
}

export async function GET(request: NextRequest, ctx: RouteCtx) {
  try {
    const token = extractBearerToken(request);
    if (!token) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }
    const decoded = verifyToken(token);
    const denied = assertRecruitmentApiAccess(decoded);
    if (denied) return denied;

    const id = await resolveRouteId(ctx.params);
    const candidate = await getCandidateById(id);
    if (!candidate) {
      return NextResponse.json({ success: false, error: 'المرشح غير موجود' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: candidate });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'حدث خطأ';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, ctx: RouteCtx) {
  try {
    const token = extractBearerToken(request);
    if (!token) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }
    const decoded = verifyToken(token);
    const denied = assertRecruitmentApiAccess(decoded);
    if (denied) return denied;

    const id = await resolveRouteId(ctx.params);
    const existing = await getCandidateById(id);
    if (!existing) {
      return NextResponse.json({ success: false, error: 'المرشح غير موجود' }, { status: 404 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const isAdmin = decoded.role === 'admin';
    const patch = isAdmin ? (body as Partial<Candidate>) : sanitizeRecruitmentManagerPatch(body);
    if (!isAdmin && Object.keys(patch).length === 0) {
      return NextResponse.json(
        { success: false, error: 'هذه العملية تتطلب صلاحية تعديل الأدمن' },
        { status: 403 }
      );
    }

    const sequentialError = validateSequentialUpdate(existing, patch);
    if (sequentialError) {
      return NextResponse.json({ success: false, error: sequentialError }, { status: 400 });
    }

    const actor = actorFromJwt(decoded);
    const updated = await updateCandidate(id, patch, actor);
    if (!updated) {
      return NextResponse.json({ success: false, error: 'المرشح غير موجود' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'حدث خطأ';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, ctx: RouteCtx) {
  try {
    const token = extractBearerToken(request);
    if (!token) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }
    const decoded = verifyToken(token);
    const denied = assertRecruitmentApiAccess(decoded);
    if (denied) return denied;

    const id = await resolveRouteId(ctx.params);
    const ok = await deleteCandidate(id);
    if (!ok) {
      return NextResponse.json({ success: false, error: 'المرشح غير موجود' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'حدث خطأ';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
