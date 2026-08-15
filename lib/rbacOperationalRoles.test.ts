/**
 * Operational RBAC + session revocation (no Sheets / FA mutations).
 */
import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  ACCOUNTING_MANAGER_FEATURES,
  EQUIPMENT_MANAGER_FEATURES,
  FOLLOW_UP_SUPERVISOR_FEATURES,
  buildPermissionsForOperationalRole,
  parseOperationalRoleFromPermissions,
  roleAllowsFeature,
} from '@/lib/operationalRoles';
import { adminFeatureAllowed, filterAdminMenuForPermissions } from '@/lib/adminFeatureAccess';
import { hasRecruitmentAccess, assertRecruitmentLegacyAdminOnly } from '@/lib/recruitment/recruitmentAuth';
import {
  __resetSessionVersionMemoryForTests,
  assertSessionVersionValid,
  bumpSessionVersion,
  getSessionVersion,
  revokeAllSessionsForLoginCode,
} from '@/lib/sessionVersion';
import {
  isAccountDisabledPermissions,
  markAccountDisabled,
  stripAccountDisabledMarker,
} from '@/lib/accountDisable';
import { isSrs014FinancialApplyEnabled } from '@/lib/srs014Flags';
import { isPasswordHashed } from '@/lib/passwordUtils';

describe('RBAC — operational role packs', () => {
  it('equipment manager has equipment_liability and not supervisors/FA features', () => {
    const perms = buildPermissionsForOperationalRole('EQUIPMENT_MANAGER');
    assert.equal(parseOperationalRoleFromPermissions(perms), 'EQUIPMENT_MANAGER');
    assert.equal(adminFeatureAllowed(perms, 'equipment_liability'), true);
    assert.equal(adminFeatureAllowed(perms, 'equipment_finance'), true);
    assert.equal(adminFeatureAllowed(perms, 'deductions_reconcile'), false);
    assert.equal(adminFeatureAllowed(perms, 'supervisors'), false);
    assert.equal(adminFeatureAllowed(perms, 'recruitment'), false);
    assert.ok(EQUIPMENT_MANAGER_FEATURES.includes('equipment_liability'));
    assert.ok(!EQUIPMENT_MANAGER_FEATURES.includes('salaries'));
  });

  it('follow-up supervisor has live_riders / comments only — not equipment/finance', () => {
    const perms = buildPermissionsForOperationalRole('FOLLOW_UP_SUPERVISOR');
    assert.equal(parseOperationalRoleFromPermissions(perms), 'FOLLOW_UP_SUPERVISOR');
    assert.equal(adminFeatureAllowed(perms, 'live_riders'), true);
    assert.equal(adminFeatureAllowed(perms, 'rider_comments'), true);
    assert.equal(adminFeatureAllowed(perms, 'equipment_liability'), false);
    assert.equal(adminFeatureAllowed(perms, 'deductions_reconcile'), false);
    assert.equal(adminFeatureAllowed(perms, 'supervisors'), false);
    assert.ok(FOLLOW_UP_SUPERVISOR_FEATURES.includes('live_riders'));
  });

  it('accounting manager has finance features — not equipment admin / user admin', () => {
    const perms = buildPermissionsForOperationalRole('ACCOUNTING_MANAGER');
    assert.equal(parseOperationalRoleFromPermissions(perms), 'ACCOUNTING_MANAGER');
    assert.equal(adminFeatureAllowed(perms, 'deductions_reconcile'), true);
    assert.equal(adminFeatureAllowed(perms, 'salaries'), true);
    assert.equal(adminFeatureAllowed(perms, 'payroll_ledger'), true);
    assert.equal(adminFeatureAllowed(perms, 'equipment_liability'), false);
    assert.equal(adminFeatureAllowed(perms, 'supervisors'), false);
    assert.equal(adminFeatureAllowed(perms, 'recruitment'), false);
    assert.ok(ACCOUNTING_MANAGER_FEATURES.includes('deductions_reconcile'));
    assert.ok(!ACCOUNTING_MANAGER_FEATURES.includes('equipment_liability'));
  });

  it('recruitment manager sentinel is recognized; no equipment/finance features via hasRecruitmentAccess', () => {
    const perms = buildPermissionsForOperationalRole('RECRUITMENT_MANAGER');
    assert.equal(parseOperationalRoleFromPermissions(perms), 'RECRUITMENT_MANAGER');
    assert.equal(
      hasRecruitmentAccess({ role: 'recruitment_manager', permissions: perms }),
      true
    );
    assert.equal(
      hasRecruitmentAccess({
        role: 'admin',
        permissions: buildPermissionsForOperationalRole('EQUIPMENT_MANAGER'),
      }),
      false
    );
    assert.equal(roleAllowsFeature('RECRUITMENT_MANAGER', 'recruitment'), true);
    assert.equal(roleAllowsFeature('RECRUITMENT_MANAGER', 'equipment_liability'), false);
  });

  it('menu filtering hides finance from equipment manager and equipment from accounting', () => {
    const eqMenu = filterAdminMenuForPermissions(
      buildPermissionsForOperationalRole('EQUIPMENT_MANAGER')
    );
    assert.ok(eqMenu.some((m) => m.feature === 'equipment_liability'));
    assert.ok(!eqMenu.some((m) => m.feature === 'deductions_reconcile'));
    assert.ok(!eqMenu.some((m) => m.feature === 'supervisors'));

    const acMenu = filterAdminMenuForPermissions(
      buildPermissionsForOperationalRole('ACCOUNTING_MANAGER')
    );
    assert.ok(acMenu.some((m) => m.feature === 'deductions_reconcile'));
    assert.ok(!acMenu.some((m) => m.feature === 'equipment_liability'));
  });

  it('recruitment_manager is denied legacy archive/bulk APIs', () => {
    const denied = assertRecruitmentLegacyAdminOnly({
      role: 'recruitment_manager',
      code: 'rm1',
    });
    assert.ok(denied);
    assert.equal(denied!.status, 403);
    assert.equal(
      assertRecruitmentLegacyAdminOnly({ role: 'admin', code: 'a1', permissions: '' }),
      null
    );
  });

  it('Financial Apply remains OFF (role packs do not enable it)', () => {
    assert.equal(isSrs014FinancialApplyEnabled(), false);
  });
});

describe('Session revocation — password/role/deactivate equivalent', () => {
  beforeEach(() => {
    __resetSessionVersionMemoryForTests();
  });

  it('password change (bump) invalidates old token sv', async () => {
    const code = 'rbac_user_a';
    assert.equal(await getSessionVersion('admin', code), 0);
    const oldSv = 0;
    assert.equal(
      await assertSessionVersionValid({ role: 'admin', code, sv: oldSv }),
      null
    );
    const next = await bumpSessionVersion('admin', code);
    assert.equal(next, 1);
    const err = await assertSessionVersionValid({ role: 'admin', code, sv: oldSv });
    assert.match(String(err), /انتهت صلاحية الجلسة/);
    assert.equal(
      await assertSessionVersionValid({ role: 'admin', code, sv: next }),
      null
    );
  });

  it('role change revokeAllSessions invalidates admin and recruitment_manager tokens', async () => {
    const code = 'rbac_user_b';
    await bumpSessionVersion('admin', code); // → 1
    await bumpSessionVersion('recruitment_manager', code); // → 1
    const beforeAdmin = await getSessionVersion('admin', code);
    const beforeRec = await getSessionVersion('recruitment_manager', code);
    assert.ok(
      (await assertSessionVersionValid({
        role: 'admin',
        code,
        sv: beforeAdmin,
      })) === null
    );
    assert.ok(
      (await assertSessionVersionValid({
        role: 'recruitment_manager',
        code,
        sv: beforeRec,
      })) === null
    );

    const revoked = await revokeAllSessionsForLoginCode(code);
    assert.ok(revoked.admin > beforeAdmin);
    assert.ok(revoked.recruitment_manager > beforeRec);

    assert.match(
      String(
        await assertSessionVersionValid({ role: 'admin', code, sv: beforeAdmin })
      ),
      /انتهت صلاحية الجلسة/
    );
    assert.match(
      String(
        await assertSessionVersionValid({
          role: 'recruitment_manager',
          code,
          sv: beforeRec,
        })
      ),
      /انتهت صلاحية الجلسة/
    );
  });

  it('deactivation marker + session revoke semantics', async () => {
    const perms = buildPermissionsForOperationalRole('ACCOUNTING_MANAGER');
    const disabled = markAccountDisabled(perms);
    assert.equal(isAccountDisabledPermissions(disabled), true);
    assert.equal(stripAccountDisabledMarker(disabled), perms);
    assert.equal(isAccountDisabledPermissions(perms), false);

    const code = 'rbac_user_c';
    const sv0 = await getSessionVersion('admin', code);
    await revokeAllSessionsForLoginCode(code);
    assert.match(
      String(await assertSessionVersionValid({ role: 'admin', code, sv: sv0 })),
      /انتهت صلاحية الجلسة/
    );
  });
});

describe('Security — password hashing helpers', () => {
  it('plaintext is not treated as hashed', () => {
    assert.equal(isPasswordHashed('secret123'), false);
    assert.equal(isPasswordHashed('$2a$10$abcdefghijklmnopqrstuv'), true);
  });
});
