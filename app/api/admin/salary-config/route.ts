/**
 * API route for admin to configure supervisor salary settings
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { updateSupervisor } from '@/lib/adminService';

export const dynamic = 'force-dynamic';

export async function PUT(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }

    const decoded = verifyToken(token);
    if (!decoded || decoded.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }

    const body = await request.json();
    const { supervisorCode, salaryType, salaryAmount, commissionFormula } = body;

    if (!supervisorCode) {
      return NextResponse.json({ success: false, error: 'كود المشرف مطلوب' }, { status: 400 });
    }

    const result = await updateSupervisor(supervisorCode, {
      salaryType,
      salaryAmount,
      commissionFormula,
    });

    if (result.success) {
      return NextResponse.json({ success: true, message: 'تم تحديث إعدادات الراتب بنجاح' });
    }

    return NextResponse.json({ success: false, error: result.error || 'فشل التحديث' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || 'حدث خطأ' }, { status: 500 });
  }
}

