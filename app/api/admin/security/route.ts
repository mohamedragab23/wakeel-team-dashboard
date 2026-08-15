/**
 * Admin security actions: password reset / username change / deactivate with full session revocation.
 * Never logs plaintext passwords. Does not enable Financial Apply.
 */
import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { isGrantingAdmin } from '@/lib/adminFeatureAccess';
import { ADMIN_SHEET_TAB_CANDIDATES, parseAdminsSheetDataMatrix } from '@/lib/adminsSheetParser';
import { getSheetData, updateSheetRow } from '@/lib/googleSheets';
import { hashPassword } from '@/lib/passwordUtils';
import { revokeAllSessionsForLoginCode } from '@/lib/sessionVersion';
import { appendAuditLog } from '@/lib/auditLog';
import { updateSupervisor } from '@/lib/adminService';
import {
  isAccountDisabledPermissions,
  markAccountDisabled,
  stripAccountDisabledMarker,
} from '@/lib/accountDisable';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function loadAdminsSheet() {
  for (const name of ADMIN_SHEET_TAB_CANDIDATES) {
    const data = await getSheetData(name, false, `${name}!A:ZZ`);
    if (data.length > 0) return { sheetName: name, rows: data };
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const token = extractBearerToken(request);
    if (!token) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }
    const decoded = verifyToken(token) as {
      role?: string;
      code?: string;
      name?: string;
      permissions?: string;
      sv?: number;
    } | null;
    if (!decoded || decoded.role !== 'admin' || !isGrantingAdmin(decoded)) {
      return NextResponse.json(
        { success: false, error: 'إدارة الحسابات للأدمن الكامل فقط' },
        { status: 403 }
      );
    }

    const body = (await request.json()) as {
      action?: string;
      targetType?: 'admin' | 'supervisor';
      targetCode?: string;
      newPassword?: string;
      newUsername?: string;
      newCode?: string;
    };

    const action = String(body.action || '').trim();
    const targetType = body.targetType === 'supervisor' ? 'supervisor' : 'admin';
    const targetCode = String(body.targetCode || '').trim();
    if (!targetCode) {
      return NextResponse.json({ success: false, error: 'targetCode مطلوب' }, { status: 400 });
    }

    if (action === 'reset_password') {
      const newPassword = String(body.newPassword || '');
      if (newPassword.length < 6) {
        return NextResponse.json(
          { success: false, error: 'كلمة المرور يجب ألا تقل عن 6 أحرف' },
          { status: 400 }
        );
      }
      const hashed = await hashPassword(newPassword);

      if (targetType === 'supervisor') {
        const r = await updateSupervisor(targetCode, { password: hashed } as never);
        if (!r.success) {
          return NextResponse.json({ success: false, error: r.error || 'فشل' }, { status: 400 });
        }
        const revoked = await revokeAllSessionsForLoginCode(targetCode);
        void appendAuditLog({
          domain: 'auth',
          action: 'password_reset',
          entityType: 'supervisor',
          entityCode: targetCode,
          actorCode: String(decoded.code || ''),
          actorName: String(decoded.name || ''),
          after: { sessions_revoked: true, sessionVersions: revoked },
        }).catch(() => undefined);
        return NextResponse.json({
          success: true,
          message: 'تم تغيير كلمة مرور المشرف وإبطال كل الجلسات',
        });
      }

      const loaded = await loadAdminsSheet();
      if (!loaded) {
        return NextResponse.json({ success: false, error: 'تعذر قراءة ورقة الأدمن' }, { status: 500 });
      }
      const { admins, columns } = parseAdminsSheetDataMatrix(loaded.rows);
      const target = admins.find((a) => a.code === targetCode);
      if (!target) {
        return NextResponse.json({ success: false, error: 'المستخدم غير موجود' }, { status: 404 });
      }
      const row = [...(loaded.rows[target.sheetRow1Based - 1] || [])];
      while (row.length <= columns.passCol) row.push('');
      row[columns.passCol] = hashed;
      const ok = await updateSheetRow(loaded.sheetName, target.sheetRow1Based, row);
      if (!ok) {
        return NextResponse.json({ success: false, error: 'فشل الحفظ' }, { status: 500 });
      }
      const revoked = await revokeAllSessionsForLoginCode(targetCode);
      void appendAuditLog({
        domain: 'auth',
        action: 'password_reset',
        entityType: 'admin_user',
        entityCode: targetCode,
        actorCode: String(decoded.code || ''),
        actorName: String(decoded.name || ''),
        after: { sessions_revoked: true, sessionVersions: revoked },
      }).catch(() => undefined);
      return NextResponse.json({
        success: true,
        message: 'تم تغيير كلمة المرور وإبطال كل الجلسات',
        sessionVersions: revoked,
      });
    }

    if (action === 'deactivate' || action === 'reactivate') {
      if (targetType !== 'admin') {
        return NextResponse.json(
          { success: false, error: 'تعطيل/تفعيل حسابات الأدمن فقط من هذا المسار' },
          { status: 400 }
        );
      }
      const loaded = await loadAdminsSheet();
      if (!loaded) {
        return NextResponse.json({ success: false, error: 'تعذر قراءة ورقة الأدمن' }, { status: 500 });
      }
      const { admins, columns } = parseAdminsSheetDataMatrix(loaded.rows);
      const target = admins.find((a) => a.code === targetCode);
      if (!target) {
        return NextResponse.json({ success: false, error: 'المستخدم غير موجود' }, { status: 404 });
      }
      const wasDisabled = isAccountDisabledPermissions(target.permissions);
      if (action === 'deactivate' && wasDisabled) {
        return NextResponse.json({ success: true, message: 'الحساب معطّل مسبقاً' });
      }
      if (action === 'reactivate' && !wasDisabled) {
        return NextResponse.json({ success: true, message: 'الحساب نشط مسبقاً' });
      }
      const nextPerm =
        action === 'deactivate'
          ? markAccountDisabled(target.permissions)
          : stripAccountDisabledMarker(target.permissions);
      const row = [...(loaded.rows[target.sheetRow1Based - 1] || [])];
      while (row.length <= columns.permCol) row.push('');
      row[columns.permCol] = nextPerm;
      const ok = await updateSheetRow(loaded.sheetName, target.sheetRow1Based, row);
      if (!ok) {
        return NextResponse.json({ success: false, error: 'فشل الحفظ' }, { status: 500 });
      }
      const revoked = await revokeAllSessionsForLoginCode(targetCode);
      void appendAuditLog({
        domain: 'auth',
        action: action === 'deactivate' ? 'user_deactivated' : 'user_reactivated',
        entityType: 'admin_user',
        entityCode: targetCode,
        actorCode: String(decoded.code || ''),
        actorName: String(decoded.name || ''),
        before: { permissions: target.permissions },
        after: { permissions: nextPerm, sessions_revoked: true, sessionVersions: revoked },
      }).catch(() => undefined);
      return NextResponse.json({
        success: true,
        message:
          action === 'deactivate'
            ? 'تم تعطيل الحساب وإبطال كل الجلسات'
            : 'تم إعادة تفعيل الحساب وإبطال الجلسات السابقة',
        sessionVersions: revoked,
      });
    }

    if (action === 'change_username' || action === 'change_code') {
      const newCode = String(body.newCode || body.newUsername || '').trim();
      if (!newCode) {
        return NextResponse.json({ success: false, error: 'الكود الجديد مطلوب' }, { status: 400 });
      }
      if (targetType === 'supervisor') {
        const r = await updateSupervisor(targetCode, { code: newCode } as never);
        if (!r.success) {
          return NextResponse.json({ success: false, error: r.error || 'فشل' }, { status: 400 });
        }
        await revokeAllSessionsForLoginCode(targetCode);
        await revokeAllSessionsForLoginCode(newCode);
        void appendAuditLog({
          domain: 'auth',
          action: 'username_changed',
          entityType: 'supervisor',
          entityCode: newCode,
          actorCode: String(decoded.code || ''),
          actorName: String(decoded.name || ''),
          before: { code: targetCode },
          after: { code: newCode, sessions_revoked: true },
        }).catch(() => undefined);
        return NextResponse.json({ success: true, message: 'تم تغيير كود المشرف وإبطال الجلسات' });
      }

      const loaded = await loadAdminsSheet();
      if (!loaded) {
        return NextResponse.json({ success: false, error: 'تعذر قراءة ورقة الأدمن' }, { status: 500 });
      }
      const { admins, columns } = parseAdminsSheetDataMatrix(loaded.rows);
      if (admins.some((a) => a.code === newCode && a.code !== targetCode)) {
        return NextResponse.json({ success: false, error: 'الكود الجديد مستخدم' }, { status: 400 });
      }
      const target = admins.find((a) => a.code === targetCode);
      if (!target) {
        return NextResponse.json({ success: false, error: 'المستخدم غير موجود' }, { status: 404 });
      }
      const row = [...(loaded.rows[target.sheetRow1Based - 1] || [])];
      while (row.length <= columns.codeCol) row.push('');
      row[columns.codeCol] = newCode;
      const ok = await updateSheetRow(loaded.sheetName, target.sheetRow1Based, row);
      if (!ok) {
        return NextResponse.json({ success: false, error: 'فشل الحفظ' }, { status: 500 });
      }
      await revokeAllSessionsForLoginCode(targetCode);
      const revoked = await revokeAllSessionsForLoginCode(newCode);
      void appendAuditLog({
        domain: 'auth',
        action: 'username_changed',
        entityType: 'admin_user',
        entityCode: newCode,
        actorCode: String(decoded.code || ''),
        actorName: String(decoded.name || ''),
        before: { code: targetCode },
        after: { code: newCode, sessions_revoked: true, sessionVersions: revoked },
      }).catch(() => undefined);
      return NextResponse.json({
        success: true,
        message: 'تم تغيير اسم المستخدم وإبطال كل الجلسات',
      });
    }

    return NextResponse.json({ success: false, error: 'إجراء غير معروف' }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
