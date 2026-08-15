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
import {
  assertContactsExceptionPermission,
  assertOpsAssignmentPermission,
  validateRecruitmentV2Activation,
} from '@/lib/recruitment/recruitmentV2';
import { isRecruitmentV2Enabled } from '@/lib/srs014Flags';
import { appendAuditLog } from '@/lib/auditLog';

export const dynamic = 'force-dynamic';

type RouteCtx = { params: Promise<{ id: string }> | { id: string } };

const RECRUITMENT_MANAGER_ALLOWED_FIELDS: (keyof Candidate)[] = [
  'hiringDecision',
  'notHiredReason',
  'lecturePlannedDate',
  'lectureConfirmed',
  'lectureAttendance',
  'lectureDate',
  'lectureAbsenceReason',
  'activationConfirmed',
  'activationStatus',
  'activationDate',
  'activationNotActivatedReason',
  'riderCode',
  'equipmentStatus',
  'equipmentDate',
  'equipmentNotReceivedReason',
  'equipmentExpectedDate',
  'contactStatus',
  'contactDate',
  'assignedManager',
  'notes',
  'phoneSecondary',
  'nationalId',
  'detailedAddress',
  'age',
  'studentStatus',
  'fullName',
  'phone',
  'zone',
  'governorate',
  'vehicleType',
  'workedBefore',
  'securityInquiryPayment',
  // Ops assignment intentionally omitted when V2 ON (stripped below).
  'assignmentNote',
  'finalAssignedSupervisorCode',
];

function sanitizeRecruitmentManagerPatch(
  body: Record<string, unknown>,
  v2On: boolean
): Partial<Candidate> {
  const out: Partial<Candidate> = {};
  for (const key of RECRUITMENT_MANAGER_ALLOWED_FIELDS) {
    if (key in body && body[key] !== undefined) {
      (out as Record<string, unknown>)[key] = body[key];
    }
  }
  if (v2On) {
    // Phase B: Recruitment Manager cannot assign/reassign Ops Supervisor.
    delete (out as Record<string, unknown>).finalAssignedSupervisorCode;
    delete (out as Record<string, unknown>).assignedAt;
    delete (out as Record<string, unknown>).assignmentStatus;
  }
  return out;
}

function validateSequentialUpdate(existing: Candidate, patch: Partial<Candidate>): string | null {
  const next: Candidate = { ...existing, ...patch };
  const lectureDone = next.lectureConfirmed === 'مؤكد' || next.lectureAttendance === 'حضر';
  const activationDone =
    next.activationConfirmed === 'مؤكد' || next.activationStatus === 'مفعل - تم القبول';

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
    const v2On = isRecruitmentV2Enabled();
    const patch = isAdmin
      ? (body as Partial<Candidate>)
      : sanitizeRecruitmentManagerPatch(body, v2On);

    // Security fee is managed via PATCH .../security-fee (freeze logic).
    delete (patch as Record<string, unknown>).securityInquiryPayment;

    if (!isAdmin && Object.keys(patch).length === 0) {
      return NextResponse.json(
        { success: false, error: 'هذه العملية تتطلب صلاحية تعديل الأدمن' },
        { status: 403 }
      );
    }

    const opsErr = assertOpsAssignmentPermission(String(decoded.role || ''), patch, existing);
    if (opsErr) {
      return NextResponse.json({ success: false, error: opsErr }, { status: 403 });
    }

    const exceptionErr = assertContactsExceptionPermission(
      String(decoded.role || ''),
      patch,
      existing
    );
    if (exceptionErr) {
      return NextResponse.json({ success: false, error: exceptionErr }, { status: 403 });
    }

    if (v2On && isAdmin && patch.contactsExceptionApproved === true && !existing.contactsExceptionApproved) {
      patch.contactsExceptionBy = patch.contactsExceptionBy || decoded.code || 'admin';
      patch.contactsExceptionAt = patch.contactsExceptionAt || new Date().toISOString();
    }

    const sequentialError = validateSequentialUpdate(existing, patch);
    if (sequentialError) {
      return NextResponse.json({ success: false, error: sequentialError }, { status: 400 });
    }

    // Phase B lecture/activation/riderCode rules always apply (even when V2 flag is OFF).
    // Prevents confirm-only activation without an authoritative riderCode.
    {
      const { validateLectureAttendancePatch, validateActivationPatch } = await import(
        '@/lib/recruitment/phaseB'
      );
      const lectureErr = validateLectureAttendancePatch(existing, patch);
      if (lectureErr) {
        return NextResponse.json({ success: false, error: lectureErr }, { status: 400 });
      }
      const activationErr = validateActivationPatch(existing, patch);
      if (activationErr) {
        return NextResponse.json({ success: false, error: activationErr }, { status: 400 });
      }
    }

    if (v2On) {
      const v2Error = await validateRecruitmentV2Activation(id, existing, patch);
      if (v2Error) {
        return NextResponse.json({ success: false, error: v2Error }, { status: 400 });
      }
    }

    const actor = actorFromJwt(decoded);
    const updated = await updateCandidate(id, patch, actor);
    if (!updated) {
      return NextResponse.json({ success: false, error: 'المرشح غير موجود' }, { status: 404 });
    }

    if (
      v2On &&
      isAdmin &&
      patch.contactsExceptionApproved === true &&
      !existing.contactsExceptionApproved
    ) {
      void appendAuditLog({
        domain: 'recruitment',
        action: 'contacts_exception_approved',
        entityType: 'candidate',
        entityCode: id,
        actorCode: actor.code,
        actorName: actor.name,
        before: {
          contactsExceptionApproved: false,
        },
        after: {
          contactsExceptionApproved: true,
          contactsExceptionBy: updated.contactsExceptionBy,
          contactsExceptionAt: updated.contactsExceptionAt,
          contactsExceptionReason: updated.contactsExceptionReason ? '[set]' : '',
        },
      }).catch((err) => console.error('[recruitment] exception audit failed', err));
    }

    if (v2On) {
      void appendAuditLog({
        domain: 'recruitment',
        action: 'candidate_updated',
        entityType: 'candidate',
        entityCode: id,
        actorCode: actor.code,
        actorName: actor.name,
        before: { updatedAt: existing.updatedAt },
        after: { updatedAt: updated.updatedAt, fields: Object.keys(patch) },
      }).catch(() => undefined);
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'حدث خطأ';
    const status =
      /مسجّل مسبقاً|مستخدم بالفعل|لا يمكن تفعيل|مطلوب|غير صالح|غير صالحة|أدمن فقط/.test(msg)
        ? 400
        : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
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
