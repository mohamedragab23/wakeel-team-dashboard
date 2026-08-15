/**
 * FINAL RBAC + SECURITY ACCEPTANCE AUDIT (read-only).
 * Exercises assertAdminApiAccess / recruitment / session / FA gates.
 * No Sheets writes. No Financial Apply. No deploy.
 */
import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { NextResponse } from 'next/server';
import { isGrantingAdmin, adminFeatureAllowed } from '@/lib/adminFeatureAccess';
import { assertAdminApiAccess } from '@/lib/adminApiAccess';
import { buildPermissionsForOperationalRole } from '@/lib/operationalRoles';
import {
  assertRecruitmentApiAccess,
  assertRecruitmentLegacyAdminOnly,
  hasRecruitmentAccess,
} from '@/lib/recruitment/recruitmentAuth';
import {
  __resetSessionVersionMemoryForTests,
  assertSessionVersionValid,
  bumpSessionVersion,
  getSessionVersion,
  revokeAllSessionsForLoginCode,
} from '@/lib/sessionVersion';
import {
  validateActivationPatch,
  validateEquipmentHandoverPatch,
  validateLectureAttendancePatch,
} from '@/lib/recruitment/phaseB';
import { defaultCandidateFields, type Candidate } from '@/lib/recruitment/types';
import {
  isAutoEquipmentDeductionsEnabled,
  isSrs014FinancialApplyEnabled,
} from '@/lib/srs014Flags';
import { isPasswordHashed } from '@/lib/passwordUtils';

function cand(p: Partial<Candidate> = {}): Candidate {
  return {
    id: 'audit',
    ...defaultCandidateFields({ fullName: 'A', phone: '01000000000' }, 'a'),
    ...p,
  };
}

async function statusOf(
  res: NextResponse | null
): Promise<number | null> {
  return res ? res.status : null;
}

function jwt(
  role: string,
  code: string,
  permissions: string,
  sv = 0
) {
  return { role, code, permissions, sv, name: code };
}

describe('ACCEPTANCE A — RECRUITMENT_MANAGER', () => {
  beforeEach(() => __resetSessionVersionMemoryForTests());

  it('A1 new workflow validations enforced', () => {
    const e = cand();
    assert.match(
      String(validateLectureAttendancePatch(e, { lectureAttendance: 'حضر' })),
      /تاريخ/
    );
    assert.match(
      String(validateLectureAttendancePatch(e, { lectureAttendance: 'لم يحضر' })),
      /سبب/
    );
    assert.match(
      String(
        validateActivationPatch(e, {
          activationStatus: 'مفعل - تم القبول',
          riderCode: '12345',
        })
      ),
      /تاريخ التفعيل/
    );
    assert.match(
      String(validateActivationPatch(e, { activationStatus: 'مرفوض' })),
      /سبب عدم التفعيل/
    );
    assert.match(
      String(validateEquipmentHandoverPatch(e, { equipmentStatus: 'تم الاستلام' })),
      /تاريخ استلام/
    );
    assert.match(
      String(validateEquipmentHandoverPatch(e, { equipmentStatus: 'لم يستلم' })),
      /سبب عدم الاستلام/
    );
  });

  it('A2 legacy bulk/reactivate APIs reject recruitment_manager (403)', () => {
    const denied = assertRecruitmentLegacyAdminOnly({
      role: 'recruitment_manager',
      code: 'rm',
    });
    assert.equal(denied?.status, 403);
    assert.equal(
      assertRecruitmentLegacyAdminOnly({ role: 'admin', code: 'a', permissions: '' }),
      null
    );
  });

  it('A3 recruitment_manager cannot call admin equipment/finance APIs (role gate)', async () => {
    const rm = jwt('recruitment_manager', 'rm1', 'recruitment_manager', 0);
    assert.equal(await statusOf(await assertAdminApiAccess(rm, 'equipment_liability')), 401);
    assert.equal(await statusOf(await assertAdminApiAccess(rm, 'deductions_reconcile')), 401);
    assert.equal(await statusOf(await assertAdminApiAccess(rm, 'supervisors')), 401);
    assert.equal(hasRecruitmentAccess(rm), true);
    assert.equal(await statusOf(await assertRecruitmentApiAccess(rm)), null);
  });
});

describe('ACCEPTANCE B — EQUIPMENT_MANAGER', () => {
  beforeEach(() => __resetSessionVersionMemoryForTests());

  it('B1 allows equipment APIs; denies salaries/accounting/recruitment/user admin features', async () => {
    const perms = buildPermissionsForOperationalRole('EQUIPMENT_MANAGER');
    const u = jwt('admin', 'eq1', perms, 0);
    assert.equal(await statusOf(await assertAdminApiAccess(u, 'equipment_liability')), null);
    assert.equal(await statusOf(await assertAdminApiAccess(u, 'equipment_finance')), null);
    assert.equal(await statusOf(await assertAdminApiAccess(u, 'equipment_requests')), null);
    assert.equal(await statusOf(await assertAdminApiAccess(u, 'main_inventory')), null);

    assert.equal(await statusOf(await assertAdminApiAccess(u, 'salaries')), 403);
    assert.equal(await statusOf(await assertAdminApiAccess(u, 'deductions_reconcile')), 403);
    assert.equal(await statusOf(await assertAdminApiAccess(u, 'debts')), 403);
    assert.equal(await statusOf(await assertAdminApiAccess(u, 'payroll_ledger')), 403);
    assert.equal(await statusOf(await assertAdminApiAccess(u, 'recruitment')), 403);
    assert.equal(await statusOf(await assertAdminApiAccess(u, 'supervisors')), 403);
    assert.equal(isGrantingAdmin(u), false);
    assert.equal(hasRecruitmentAccess(u), false);
  });
});

describe('ACCEPTANCE C — FOLLOW_UP_SUPERVISOR', () => {
  beforeEach(() => __resetSessionVersionMemoryForTests());

  it('C1 allows follow-up APIs; denies equipment/finance/recruitment/user admin', async () => {
    const perms = buildPermissionsForOperationalRole('FOLLOW_UP_SUPERVISOR');
    const u = jwt('admin', 'fu1', perms, 0);
    assert.equal(await statusOf(await assertAdminApiAccess(u, 'live_riders')), null);
    assert.equal(await statusOf(await assertAdminApiAccess(u, 'rider_comments')), null);
    assert.equal(await statusOf(await assertAdminApiAccess(u, 'riders')), null);

    assert.equal(await statusOf(await assertAdminApiAccess(u, 'equipment_liability')), 403);
    assert.equal(await statusOf(await assertAdminApiAccess(u, 'equipment_finance')), 403);
    assert.equal(await statusOf(await assertAdminApiAccess(u, 'salaries')), 403);
    assert.equal(await statusOf(await assertAdminApiAccess(u, 'deductions_reconcile')), 403);
    assert.equal(await statusOf(await assertAdminApiAccess(u, 'recruitment')), 403);
    assert.equal(await statusOf(await assertAdminApiAccess(u, 'supervisors')), 403);
    assert.equal(isGrantingAdmin(u), false);
  });
});

describe('ACCEPTANCE D — ACCOUNTING_MANAGER', () => {
  beforeEach(() => __resetSessionVersionMemoryForTests());

  it('D1 allows accounting APIs; denies equipment/recruitment/user admin; FA flag OFF', async () => {
    const perms = buildPermissionsForOperationalRole('ACCOUNTING_MANAGER');
    const u = jwt('admin', 'ac1', perms, 0);
    assert.equal(await statusOf(await assertAdminApiAccess(u, 'salaries')), null);
    assert.equal(await statusOf(await assertAdminApiAccess(u, 'deductions_reconcile')), null);
    assert.equal(await statusOf(await assertAdminApiAccess(u, 'payroll_ledger')), null);
    assert.equal(await statusOf(await assertAdminApiAccess(u, 'debts')), null);

    assert.equal(await statusOf(await assertAdminApiAccess(u, 'equipment_liability')), 403);
    assert.equal(await statusOf(await assertAdminApiAccess(u, 'equipment_requests')), 403);
    assert.equal(await statusOf(await assertAdminApiAccess(u, 'recruitment')), 403);
    assert.equal(await statusOf(await assertAdminApiAccess(u, 'supervisors')), 403);
    assert.equal(isGrantingAdmin(u), false);
    assert.equal(isSrs014FinancialApplyEnabled(), false);
    // Can pass deductions_reconcile gate but FA remains globally OFF
    assert.equal(adminFeatureAllowed(perms, 'deductions_reconcile'), true);
  });
});

describe('ACCEPTANCE E — ADMIN_FULL', () => {
  beforeEach(() => __resetSessionVersionMemoryForTests());

  it('E1 full admin retains feature access; FA still OFF', async () => {
    const u = jwt('admin', 'root', '', 0);
    assert.equal(isGrantingAdmin(u), true);
    assert.equal(await statusOf(await assertAdminApiAccess(u, 'equipment_liability')), null);
    assert.equal(await statusOf(await assertAdminApiAccess(u, 'salaries')), null);
    assert.equal(await statusOf(await assertAdminApiAccess(u, 'recruitment')), null);
    assert.equal(await statusOf(await assertAdminApiAccess(u, 'supervisors')), null);
    assert.equal(await statusOf(await assertAdminApiAccess(u, 'deductions_reconcile')), null);
    assert.equal(isSrs014FinancialApplyEnabled(), false);
  });
});

describe('ACCEPTANCE F — SESSION REVOCATION', () => {
  beforeEach(() => __resetSessionVersionMemoryForTests());

  it('F1 password/role/disable equivalent: revoke invalidates old sv for admin', async () => {
    const code = 'sess_admin';
    assert.equal(await assertSessionVersionValid({ role: 'admin', code, sv: 0 }), null);
    await revokeAllSessionsForLoginCode(code);
    assert.match(
      String(await assertSessionVersionValid({ role: 'admin', code, sv: 0 })),
      /انتهت صلاحية الجلسة/
    );
    const cur = await getSessionVersion('admin', code);
    assert.equal(await assertSessionVersionValid({ role: 'admin', code, sv: cur }), null);
  });

  it('F2 recruitment_manager + supervisor principals revoked', async () => {
    const code = 'sess_multi';
    await bumpSessionVersion('recruitment_manager', code);
    await bumpSessionVersion('supervisor', code);
    const oldR = await getSessionVersion('recruitment_manager', code);
    const oldS = await getSessionVersion('supervisor', code);
    await revokeAllSessionsForLoginCode(code);
    assert.match(
      String(
        await assertSessionVersionValid({
          role: 'recruitment_manager',
          code,
          sv: oldR,
        })
      ),
      /انتهت صلاحية الجلسة/
    );
    assert.match(
      String(await assertSessionVersionValid({ role: 'supervisor', code, sv: oldS })),
      /انتهت صلاحية الجلسة/
    );
  });

  it('F3 assertAdminApiAccess rejects stale sv', async () => {
    const perms = buildPermissionsForOperationalRole('EQUIPMENT_MANAGER');
    const code = 'sess_eq';
    const u0 = jwt('admin', code, perms, 0);
    assert.equal(await statusOf(await assertAdminApiAccess(u0, 'equipment_liability')), null);
    await revokeAllSessionsForLoginCode(code);
    assert.equal(await statusOf(await assertAdminApiAccess(u0, 'equipment_liability')), 401);
    const cur = await getSessionVersion('admin', code);
    assert.equal(
      await statusOf(await assertAdminApiAccess(jwt('admin', code, perms, cur), 'equipment_liability')),
      null
    );
  });

  it('F4 no plaintext password hashing contract', () => {
    assert.equal(isPasswordHashed('plainpassword'), false);
    assert.equal(isPasswordHashed('$2a$10$abcdefghijklmnopqrstuv'), true);
  });
});

describe('ACCEPTANCE G — PRIVILEGE ESCALATION MATRIX', () => {
  beforeEach(() => __resetSessionVersionMemoryForTests());

  it('G1 cross-role API denials', async () => {
    const eq = jwt(
      'admin',
      'g_eq',
      buildPermissionsForOperationalRole('EQUIPMENT_MANAGER'),
      0
    );
    const fu = jwt(
      'admin',
      'g_fu',
      buildPermissionsForOperationalRole('FOLLOW_UP_SUPERVISOR'),
      0
    );
    const ac = jwt(
      'admin',
      'g_ac',
      buildPermissionsForOperationalRole('ACCOUNTING_MANAGER'),
      0
    );
    const rm = jwt('recruitment_manager', 'g_rm', 'recruitment_manager', 0);

    assert.equal(await statusOf(await assertAdminApiAccess(rm, 'equipment_liability')), 401);
    assert.equal(await statusOf(await assertAdminApiAccess(eq, 'deductions_reconcile')), 403);
    assert.equal(await statusOf(await assertAdminApiAccess(fu, 'equipment_liability')), 403);
    assert.equal(await statusOf(await assertAdminApiAccess(fu, 'salaries')), 403);
    assert.equal(await statusOf(await assertRecruitmentApiAccess(ac)), 403);
    assert.equal(await statusOf(await assertRecruitmentApiAccess(eq)), 403);
    assert.equal(isGrantingAdmin(eq), false);
    assert.equal(isGrantingAdmin(fu), false);
    assert.equal(isGrantingAdmin(ac), false);
    assert.equal(isGrantingAdmin(rm), false);
    assert.equal(isSrs014FinancialApplyEnabled(), false);
  });
});

describe('ACCEPTANCE H — SAFETY FLAGS (no production mutation)', () => {
  it('H1 FA OFF; Auto REQUEST default OFF', () => {
    assert.equal(isSrs014FinancialApplyEnabled(), false);
    assert.equal(isAutoEquipmentDeductionsEnabled(), false);
  });
});
