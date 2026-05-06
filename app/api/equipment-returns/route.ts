import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { adminHasPermission } from '@/lib/adminPermissions';
import {
  appendToSheet,
  ensureSheetExists,
  getSheetData,
  updateSheetRow,
} from '@/lib/googleSheets';
import { SHEET_EQUIPMENT_RETURN } from '@/lib/equipmentSheetConstants';
import { assertSupervisorRider } from '@/lib/riderValidation';
import { applyMainInventoryDelta } from '@/lib/mainInventoryService';
import { validateEquipmentReturnAgainstDeliveries } from '@/lib/equipmentReturnValidation';

export const dynamic = 'force-dynamic';

const HEADERS = [
  'كود_المشرف',
  'اسم_المشرف',
  'كود_المندوب',
  'اسم_المندوب',
  'الزون',
  'باوتش_موتوسيكل',
  'باوتش_عجلة',
  'تيشرت',
  'جاكيت',
  'خوذة',
  'الحالة',
  'تاريخ_الطلب',
  'تاريخ_المعالجة',
  'معالج_بواسطة',
  'سبب_الرفض',
];

function padRow(row: any[], len: number): any[] {
  const r = [...row];
  while (r.length < len) r.push('');
  return r;
}

function parseReturnRows(data: any[][]): any[] {
  const out: any[] = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row?.[0] && !row?.[2]) continue;
    out.push({
      id: i,
      supervisorCode: row[0]?.toString().trim() ?? '',
      supervisorName: row[1]?.toString().trim() ?? '',
      riderCode: row[2]?.toString().trim() ?? '',
      riderName: row[3]?.toString().trim() ?? '',
      zone: row[4]?.toString().trim() ?? '',
      motorcyclePouch: Number(row[5]) || 0,
      bicyclePouch: Number(row[6]) || 0,
      tshirt: Number(row[7]) || 0,
      jacket: Number(row[8]) || 0,
      helmet: Number(row[9]) || 0,
      status: (row[10]?.toString().trim() || 'pending') as string,
      requestDate: row[11]?.toString().trim() ?? '',
      approvalDate: row[12]?.toString().trim() ?? '',
      approvedBy: row[13]?.toString().trim() ?? '',
      rejectReason: row[14]?.toString().trim() ?? '',
    });
  }
  return out;
}

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }
    const decoded = verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }

    // أي مدير يمكنه الاطلاع؛ المعالجة تبقى لمن لديه صلاحية equipment.

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    let data: any[][] = [];
    try {
      data = await getSheetData(SHEET_EQUIPMENT_RETURN, false);
    } catch {
      data = [];
    }

    let list = parseReturnRows(data);
    if (decoded.role === 'supervisor') {
      const code = decoded.code?.toString().trim();
      list = list.filter((r) => r.supervisorCode === code);
    }
    if (status) {
      list = list.filter((r) => r.status === status);
    }

    return NextResponse.json({ success: true, data: list });
  } catch (error: any) {
    console.error('[equipment-returns GET]', error);
    return NextResponse.json({ success: false, error: error.message || 'حدث خطأ' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }
    const decoded = verifyToken(token);
    if (!decoded || decoded.role !== 'supervisor') {
      return NextResponse.json({ success: false, error: 'المشرفون فقط يمكنهم إرسال طلب استرجاع' }, { status: 401 });
    }

    const body = await request.json();
    const { riderCode, riderName, zone, motorcyclePouch, bicyclePouch, tshirt, jacket, helmet } = body;

    if (!riderCode || !riderName || !zone) {
      return NextResponse.json(
        { success: false, error: 'كود المندوب والاسم والزون مطلوبة' },
        { status: 400 }
      );
    }

    const m = Math.max(0, Number(motorcyclePouch) || 0);
    const b = Math.max(0, Number(bicyclePouch) || 0);
    const t = Math.max(0, Number(tshirt) || 0);
    const j = Math.max(0, Number(jacket) || 0);
    const h = Math.max(0, Number(helmet) || 0);
    if (m + b + t + j + h <= 0) {
      return NextResponse.json({ success: false, error: 'أدخل كمية واحدة على الأقل' }, { status: 400 });
    }

    const riderCheck = await assertSupervisorRider(
      riderCode,
      riderName,
      decoded.code?.toString().trim() || ''
    );
    if (!riderCheck.ok) {
      return NextResponse.json({ success: false, error: riderCheck.error }, { status: 400 });
    }

    const v = await validateEquipmentReturnAgainstDeliveries(
      decoded.code?.toString().trim() || '',
      riderCode?.toString().trim(),
      {
        motorcyclePouch: m,
        bicyclePouch: b,
        tshirt: t,
        jacket: j,
        helmet: h,
      }
    );
    if (!v.ok) {
      return NextResponse.json({ success: false, error: v.error }, { status: 400 });
    }

    await ensureSheetExists(SHEET_EQUIPMENT_RETURN, HEADERS);

    const requestDate = new Date().toISOString().split('T')[0];
    const row = [
      decoded.code?.toString().trim() || '',
      decoded.name?.toString().trim() || '',
      riderCode?.toString().trim(),
      riderName?.toString().trim(),
      zone?.toString().trim(),
      m,
      b,
      t,
      j,
      h,
      'pending',
      requestDate,
      '',
      '',
      '',
    ];

    await appendToSheet(SHEET_EQUIPMENT_RETURN, [row], false);

    const hint =
      v.mode === 'admin_review'
        ? ' لا يوجد لهذا المندوب سجل تسليم في الشيت أو لا يوجد تسليم معتمد بعد؛ سيراجع المدير الطلب يدوياً.'
        : '';

    return NextResponse.json({
      success: true,
      message: `تم إرسال طلب الاسترجاع. سيظهر للمدير في لوحة التحكم وصفحة طلبات المعدات.${hint}`,
      reviewMode: v.mode,
    });
  } catch (error: any) {
    console.error('[equipment-returns POST]', error);
    return NextResponse.json({ success: false, error: error.message || 'حدث خطأ' }, { status: 500 });
  }
}

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
    if (!adminHasPermission(decoded, 'equipment')) {
      return NextResponse.json({ success: false, error: 'لا تملك صلاحية الموافقة على الاسترجاع' }, { status: 403 });
    }

    const body = await request.json();
    const { requestId, action, rejectReason } = body;
    if (requestId === undefined || requestId === null || !action) {
      return NextResponse.json({ success: false, error: 'معرف الطلب والإجراء مطلوبان' }, { status: 400 });
    }
    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json({ success: false, error: 'الإجراء يجب أن يكون approve أو reject' }, { status: 400 });
    }

    const data = await getSheetData(SHEET_EQUIPMENT_RETURN, false);
    const rowIndex = parseInt(String(requestId), 10);
    if (rowIndex < 1 || rowIndex >= data.length) {
      return NextResponse.json({ success: false, error: 'الطلب غير موجود' }, { status: 404 });
    }

    const row = data[rowIndex];
    if (!row || (row[10]?.toString().trim() || 'pending') !== 'pending') {
      return NextResponse.json({ success: false, error: 'الطلب غير قيد الانتظار' }, { status: 400 });
    }

    const approvalDate = new Date().toISOString().split('T')[0];
    const approvedBy = decoded.name || decoded.code || '';

    if (action === 'approve') {
      const delta = {
        motorcyclePouch: Math.max(0, Number(row[5]) || 0),
        bicyclePouch: Math.max(0, Number(row[6]) || 0),
        tshirt: Math.max(0, Number(row[7]) || 0),
        jacket: Math.max(0, Number(row[8]) || 0),
        helmet: Math.max(0, Number(row[9]) || 0),
      };
      const inv = await applyMainInventoryDelta(delta);
      if (!inv.ok) {
        return NextResponse.json({ success: false, error: inv.error }, { status: 400 });
      }
    }

    const status = action === 'approve' ? 'approved' : 'rejected';
    const updated = padRow([...row], 15);
    updated[10] = status;
    updated[11] = updated[11] || row[11] || '';
    updated[12] = approvalDate;
    updated[13] = approvedBy;
    updated[14] = action === 'reject' ? (rejectReason || '').toString() : '';

    await updateSheetRow(SHEET_EQUIPMENT_RETURN, rowIndex + 1, updated);

    return NextResponse.json({
      success: true,
      message: action === 'approve' ? 'تمت الموافقة وإرجاع الكميات للمخزون الرئيسي' : 'تم رفض الطلب',
    });
  } catch (error: any) {
    console.error('[equipment-returns PUT]', error);
    return NextResponse.json({ success: false, error: error.message || 'حدث خطأ' }, { status: 500 });
  }
}
