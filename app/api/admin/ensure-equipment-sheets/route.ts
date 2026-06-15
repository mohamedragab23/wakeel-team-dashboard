import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { assertAdminApiAccess } from '@/lib/adminFeatureAccess';
import { ensureAllEquipmentSheets } from '@/lib/ensureEquipmentSheets';

export const dynamic = 'force-dynamic';

/** إنشاء/التحقق من تبويبات المعدات في ملف Google Sheets الرئيسي (مدير فقط). */
export async function POST(request: NextRequest) {
  try {
    const token = extractBearerToken(request);
    if (!token) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }
    const decoded = verifyToken(token);
    if (!decoded || decoded.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }

    const eq = assertAdminApiAccess(decoded, 'equipment_requests');
    if (eq) return eq;

    const result = await ensureAllEquipmentSheets();
    return NextResponse.json({
      success: true,
      message: 'تم التأكد من التبويبات (أُنشئت إن لم تكن موجودة).',
      ensured: result.ensured,
    });
  } catch (error: any) {
    console.error('[ensure-equipment-sheets]', error);
    return NextResponse.json(
      { success: false, error: error.message || 'فشل إنشاء التبويبات' },
      { status: 500 }
    );
  }
}
