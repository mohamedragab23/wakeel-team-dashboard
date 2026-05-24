import { NextRequest, NextResponse } from 'next/server';
import { authenticateSupervisor, authenticateAdmin } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code, password, role } = body;

    if (!code || !password) {
      return NextResponse.json(
        { success: false, error: 'يرجى إدخال الكود وكلمة المرور' },
        { status: 400 }
      );
    }

    let result;
    // مسؤول التعيينات يستخدم نفس شيت Admins مع صلاحية recruitment_manager
    if (role === 'admin' || role === 'recruitment_manager') {
      result = await authenticateAdmin(code, password);
      // إن اختار المستخدم «مسؤول تعيينات» لكن الحساب ليس recruitment_manager
      if (
        result.success &&
        role === 'recruitment_manager' &&
        result.role !== 'recruitment_manager'
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              'هذا الحساب ليس مسجلاً كمسؤول تعيينات. في شيت Admins ضع recruitment_manager في عمود الصلاحيات.',
          },
          { status: 401 }
        );
      }
      // إن سجّل كأدمن لكن الحساب recruitment_manager فقط
      if (
        result.success &&
        role === 'admin' &&
        result.role === 'recruitment_manager'
      ) {
        return NextResponse.json(
          {
            success: false,
            error: 'هذا الحساب مخصص لمسؤول التعيينات. اختر نوع المستخدم «مسؤول التعيينات».',
          },
          { status: 401 }
        );
      }
    } else {
      result = await authenticateSupervisor(code, password);
    }

    if (result.success) {
      return NextResponse.json(result);
    } else {
      return NextResponse.json(result, { status: 401 });
    }
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: 'حدث خطأ في النظام: ' + error.message },
      { status: 500 }
    );
  }
}

