import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { assertAdminApiAccess } from '@/lib/adminFeatureAccess';
import { adminHasPermission } from '@/lib/adminPermissions';
import { readMainInventory, writeMainInventory, type MainInventoryCounts } from '@/lib/mainInventoryService';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const token = extractBearerToken(request);
    if (!token) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }
    const decoded = verifyToken(token);
    if (!decoded || decoded.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }

    const m0 = assertAdminApiAccess(decoded, 'main_inventory');
    if (m0) return m0;

    const data = await readMainInventory();
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('[main-inventory GET]', error);
    return NextResponse.json({ success: false, error: error.message || 'حدث خطأ' }, { status: 500 });
  }
}

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

    const m1 = assertAdminApiAccess(decoded, 'main_inventory');
    if (m1) return m1;

    if (!adminHasPermission(decoded, 'inventory')) {
      return NextResponse.json(
        { success: false, error: 'لا تملك صلاحية تعديل المخزون الرئيسي (inventory في عمود صلاحيات الأدمن)' },
        { status: 403 }
      );
    }

    const body = (await request.json()) as MainInventoryCounts;
    const counts: MainInventoryCounts = {
      motorcyclePouch: Math.max(0, Number(body.motorcyclePouch) || 0),
      bicyclePouch: Math.max(0, Number(body.bicyclePouch) || 0),
      tshirt: Math.max(0, Number(body.tshirt) || 0),
      jacket: Math.max(0, Number(body.jacket) || 0),
      helmet: Math.max(0, Number(body.helmet) || 0),
    };

    const ok = await writeMainInventory(counts);
    if (!ok) {
      return NextResponse.json({ success: false, error: 'فشل حفظ المخزون' }, { status: 500 });
    }
    return NextResponse.json({ success: true, message: 'تم حفظ المخزون الرئيسي', data: counts });
  } catch (error: any) {
    console.error('[main-inventory POST]', error);
    return NextResponse.json({ success: false, error: error.message || 'حدث خطأ' }, { status: 500 });
  }
}
