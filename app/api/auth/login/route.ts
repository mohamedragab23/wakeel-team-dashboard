import { NextRequest, NextResponse } from 'next/server';
import { authenticateSupervisor, authenticateAdmin } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rateLimit';
import { AUTH_COOKIE_NAME } from '@/lib/requestAuth';
import { loginBodySchema } from '@/lib/validators/common';

export async function POST(request: NextRequest) {
  try {
    const raw = await request.json();
    const parsed = loginBodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message || 'بيانات غير صالحة' },
        { status: 400 }
      );
    }

    const { code, password, role } = parsed.data;

    const clientIp =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';
    const rateKey = `login:${clientIp}:${String(code).trim()}`;
    const limited = checkRateLimit(rateKey, 10, 15 * 60 * 1000);
    if (!limited.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: `محاولات كثيرة. حاول مرة أخرى بعد ${limited.retryAfterSec} ثانية`,
        },
        { status: 429 }
      );
    }

    let result;
    if (role === 'admin' || role === 'recruitment_manager') {
      result = await authenticateAdmin(code, password);
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
      const { token, ...sessionPayload } = result;
      const response = NextResponse.json(sessionPayload);
      if (token) {
        response.cookies.set(AUTH_COOKIE_NAME, token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 7 * 24 * 60 * 60,
          path: '/',
        });
      }
      return response;
    }

    return NextResponse.json(result, { status: 401 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: 'حدث خطأ في النظام: ' + error.message },
      { status: 500 }
    );
  }
}
