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
    if (role === 'admin') {
      result = await authenticateAdmin(code, password);
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

