/**
 * Admin deductions applied to supervisor salary (sheet: خصومات_الإدارة).
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { assertAdminApiAccess } from '@/lib/adminFeatureAccess';
import { assertLimitedAdminSupervisorZoneAccess, getSupervisorCodesInZoneScope } from '@/lib/adminZoneScope';
import { appendToSheet, getSheetData } from '@/lib/googleSheets';

export const dynamic = 'force-dynamic';

const SHEET_ADMIN_DEDUCTIONS = 'خصومات_الإدارة';

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }
    const decoded = verifyToken(token);
    if (!decoded || decoded.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }
    const sal = assertAdminApiAccess(decoded, 'salaries');
    if (sal) return sal;

    const { searchParams } = new URL(request.url);
    const supervisorCode = searchParams.get('supervisorCode')?.trim();
    const allowedCodes = await getSupervisorCodesInZoneScope(decoded);
    if (supervisorCode && allowedCodes && !allowedCodes.has(supervisorCode)) {
      return NextResponse.json(
        { success: false, error: 'لا تملك صلاحية على خصومات مشرفين خارج الزونات المحددة لك' },
        { status: 403 }
      );
    }
    const data = await getSheetData(SHEET_ADMIN_DEDUCTIONS, false);
    const rows: { supervisorCode: string; date: string; reason: string; amount: number; createdBy?: string }[] = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row?.[0]) continue;
      const code = row[0].toString().trim();
      if (allowedCodes && !allowedCodes.has(code)) continue;
      if (supervisorCode && code !== supervisorCode) continue;
      rows.push({
        supervisorCode: code,
        date: row[1]?.toString() || '',
        reason: row[2]?.toString() || '',
        amount: Number(row[3]?.toString() || '0') || 0,
        createdBy: row[4]?.toString().trim() || undefined,
      });
    }
    return NextResponse.json({ success: true, data: rows.reverse().slice(0, 200) });
  } catch (error: any) {
    console.error('admin-deductions GET:', error);
    return NextResponse.json({ success: false, error: error.message || 'خطأ' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }
    const decoded = verifyToken(token);
    if (!decoded || decoded.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }
    const sal = assertAdminApiAccess(decoded, 'salaries');
    if (sal) return sal;

    const body = await request.json();
    const supervisorCode = (body.supervisorCode ?? '').toString().trim();
    const zoneDeny = await assertLimitedAdminSupervisorZoneAccess(decoded, supervisorCode);
    if (zoneDeny) return zoneDeny;
    const reason = (body.reason ?? '').toString().trim() || 'خصم إداري';
    const amount = Number(body.amount);
    const dateStr = (body.date ?? '').toString().trim();

    if (!supervisorCode) {
      return NextResponse.json({ success: false, error: 'كود المشرف مطلوب' }, { status: 400 });
    }
    if (!dateStr) {
      return NextResponse.json({ success: false, error: 'التاريخ مطلوب' }, { status: 400 });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ success: false, error: 'المبلغ يجب أن يكون أكبر من صفر' }, { status: 400 });
    }

    const adminLabel = [decoded.name, decoded.code].filter(Boolean).join(' / ') || 'admin';

    const ok = await appendToSheet(
      SHEET_ADMIN_DEDUCTIONS,
      [[supervisorCode, dateStr, reason, amount, adminLabel]],
      false
    );
    if (!ok) {
      return NextResponse.json(
        { success: false, error: 'تعذر حفظ الخصم. تأكد من وجود تبويب خصومات_الإدارة في الملف.' },
        { status: 500 }
      );
    }
    return NextResponse.json({ success: true, message: 'تم تسجيل الخصم' });
  } catch (error: any) {
    console.error('admin-deductions POST:', error);
    return NextResponse.json({ success: false, error: error.message || 'خطأ' }, { status: 500 });
  }
}
