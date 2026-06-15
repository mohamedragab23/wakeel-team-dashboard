import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { adminHasPermission } from '@/lib/adminPermissions';
import {
  appendToSheet,
  ensureSheetExists,
  getSheetData,
  updateSheetRow,
} from '@/lib/googleSheets';
import { SHEET_EQUIPMENT_DELIVERY } from '@/lib/equipmentSheetConstants';
import { assertSupervisorRider } from '@/lib/riderValidation';
import { applyMainInventoryDelta } from '@/lib/mainInventoryService';
import { isAllowedZone, ZONE_OPTIONS } from '@/lib/zones';
import { assertLimitedAdminSupervisorZoneAccess, filterRowsBySupervisorInZoneScope } from '@/lib/adminZoneScope';
import { saveEquipmentPhotoAndGetUrl } from '@/lib/equipmentPhotoStorage';

export const dynamic = 'force-dynamic';

const HEADERS = [
  'كود_المشرف',
  'اسم_المشرف',
  'كود_المندوب',
  'اسم_المندوب',
  'الزون',
  'نوع_التسليم',
  'باوتش_موتوسيكل',
  'باوتش_عجلة',
  'تيشرت',
  'جاكيت',
  'خوذة',
  'صورة_base64',
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

function parseDeliveryRows(data: any[][]): any[] {
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
      deliveryType: row[5]?.toString().trim() ?? '',
      motorcyclePouch: Number(row[6]) || 0,
      bicyclePouch: Number(row[7]) || 0,
      tshirt: Number(row[8]) || 0,
      jacket: Number(row[9]) || 0,
      helmet: Number(row[10]) || 0,
      photoData: row[11]?.toString() ?? '',
      status: (row[12]?.toString().trim() || 'pending') as string,
      requestDate: row[13]?.toString().trim() ?? '',
      approvalDate: row[14]?.toString().trim() ?? '',
      approvedBy: row[15]?.toString().trim() ?? '',
      rejectReason: row[16]?.toString().trim() ?? '',
    });
  }
  return out;
}

export async function GET(request: NextRequest) {
  try {
    const token = extractBearerToken(request);
    if (!token) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }
    const decoded = verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    // أي مدير يمكنه الاطلاع والتنبيهات؛ الموافقة/الرفض تبقى لمن لديه صلاحية equipment.

    let data: any[][] = [];
    try {
      data = await getSheetData(SHEET_EQUIPMENT_DELIVERY, false);
    } catch {
      data = [];
    }

    let list = parseDeliveryRows(data);
    if (decoded.role === 'supervisor') {
      const code = decoded.code?.toString().trim();
      list = list.filter((r) => r.supervisorCode === code);
    }
    list = await filterRowsBySupervisorInZoneScope(decoded, list);
    if (status) {
      list = list.filter((r) => r.status === status);
    }

    return NextResponse.json({ success: true, data: list });
  } catch (error: any) {
    console.error('[equipment-deliveries GET]', error);
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
    if (!decoded || decoded.role !== 'supervisor') {
      return NextResponse.json({ success: false, error: 'المشرفون فقط يمكنهم إرسال طلب تسليم' }, { status: 401 });
    }

    const body = await request.json();
    const {
      riderCode,
      riderName,
      zone,
      deliveryType,
      motorcyclePouch,
      bicyclePouch,
      tshirt,
      jacket,
      helmet,
      photoData,
    } = body;

    if (!riderCode || !riderName || !zone || !deliveryType) {
      return NextResponse.json(
        { success: false, error: 'كود المندوب والاسم والزون ونوع التسليم مطلوبة' },
        { status: 400 }
      );
    }
    if (!isAllowedZone(zone)) {
      return NextResponse.json(
        { success: false, error: `الزون غير صحيحة. القيم المتاحة: ${ZONE_OPTIONS.join(' / ')}` },
        { status: 400 }
      );
    }

    const typeNorm = String(deliveryType).trim();
    if (typeNorm !== 'تعيين' && typeNorm !== 'تبديل') {
      return NextResponse.json(
        { success: false, error: 'نوع التسليم يجب أن يكون: تعيين أو تبديل' },
        { status: 400 }
      );
    }

    const m = Math.max(0, Number(motorcyclePouch) || 0);
    const b = Math.max(0, Number(bicyclePouch) || 0);
    const t = Math.max(0, Number(tshirt) || 0);
    const j = Math.max(0, Number(jacket) || 0);
    const h = Math.max(0, Number(helmet) || 0);
    if (m + b + t + j + h <= 0) {
      return NextResponse.json({ success: false, error: 'أدخل كمية واحدة على الأقل من المعدات' }, { status: 400 });
    }

    const riderCheck = await assertSupervisorRider(
      riderCode,
      riderName,
      decoded.code?.toString().trim() || ''
    );
    if (!riderCheck.ok) {
      return NextResponse.json({ success: false, error: riderCheck.error }, { status: 400 });
    }

    let photo = '';
    if (photoData) {
      try {
        photo = await saveEquipmentPhotoAndGetUrl(String(photoData), {
          supervisorCode: decoded.code?.toString().trim() || '',
          riderCode: riderCode?.toString().trim() || '',
        });
      } catch (uploadErr: any) {
        return NextResponse.json(
          { success: false, error: uploadErr.message || 'فشل رفع الصورة' },
          { status: 400 }
        );
      }
    }

    await ensureSheetExists(SHEET_EQUIPMENT_DELIVERY, HEADERS);

    const requestDate = new Date().toISOString().split('T')[0];
    const row = [
      decoded.code?.toString().trim() || '',
      decoded.name?.toString().trim() || '',
      riderCode?.toString().trim(),
      riderName?.toString().trim(),
      zone?.toString().trim(),
      typeNorm,
      m,
      b,
      t,
      j,
      h,
      photo,
      'pending',
      requestDate,
      '',
      '',
      '',
    ];

    await appendToSheet(SHEET_EQUIPMENT_DELIVERY, [row], false);

    return NextResponse.json({
      success: true,
      message: 'تم إرسال طلب التسليم. سيتم إشعار المدير للمراجعة من صفحة طلبات المعدات.',
    });
  } catch (error: any) {
    console.error('[equipment-deliveries POST]', error);
    return NextResponse.json({ success: false, error: error.message || 'حدث خطأ' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const token = extractBearerToken(request);
    if (!token) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }
    const decoded = verifyToken(token);
    if (!decoded || decoded.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }
    if (!adminHasPermission(decoded, 'equipment')) {
      return NextResponse.json({ success: false, error: 'لا تملك صلاحية الموافقة على طلبات المعدات' }, { status: 403 });
    }

    const body = await request.json();
    const { requestId, action, rejectReason } = body;
    if (requestId === undefined || requestId === null || !action) {
      return NextResponse.json({ success: false, error: 'معرف الطلب والإجراء مطلوبان' }, { status: 400 });
    }
    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json({ success: false, error: 'الإجراء يجب أن يكون approve أو reject' }, { status: 400 });
    }

    const data = await getSheetData(SHEET_EQUIPMENT_DELIVERY, false);
    const rowIndex = parseInt(String(requestId), 10);
    if (rowIndex < 1 || rowIndex >= data.length) {
      return NextResponse.json({ success: false, error: 'الطلب غير موجود' }, { status: 404 });
    }

    const row = data[rowIndex];
    if (!row || (row[12]?.toString().trim() || 'pending') !== 'pending') {
      return NextResponse.json({ success: false, error: 'الطلب غير قيد الانتظار' }, { status: 400 });
    }

    const supCode = row[0]?.toString().trim() || '';
    const zoneDeny = await assertLimitedAdminSupervisorZoneAccess(decoded, supCode);
    if (zoneDeny) return zoneDeny;

    const approvalDate = new Date().toISOString().split('T')[0];
    const approvedBy = decoded.name || decoded.code || '';

    if (action === 'approve') {
      const delta = {
        motorcyclePouch: -Math.max(0, Number(row[6]) || 0),
        bicyclePouch: -Math.max(0, Number(row[7]) || 0),
        tshirt: -Math.max(0, Number(row[8]) || 0),
        jacket: -Math.max(0, Number(row[9]) || 0),
        helmet: -Math.max(0, Number(row[10]) || 0),
      };
      const inv = await applyMainInventoryDelta(delta);
      if (!inv.ok) {
        return NextResponse.json({ success: false, error: inv.error }, { status: 400 });
      }
    }

    const status = action === 'approve' ? 'approved' : 'rejected';
    const updated = padRow([...row], 17);
    updated[12] = status;
    updated[13] = updated[13] || row[13] || '';
    updated[14] = approvalDate;
    updated[15] = approvedBy;
    updated[16] = action === 'reject' ? (rejectReason || '').toString() : '';

    await updateSheetRow(SHEET_EQUIPMENT_DELIVERY, rowIndex + 1, updated);

    return NextResponse.json({
      success: true,
      message: action === 'approve' ? 'تمت الموافقة وخصم الكميات من المخزون الرئيسي' : 'تم رفض الطلب',
    });
  } catch (error: any) {
    console.error('[equipment-deliveries PUT]', error);
    return NextResponse.json({ success: false, error: error.message || 'حدث خطأ' }, { status: 500 });
  }
}
