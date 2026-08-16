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

    // إشعار الإدمن عبر Telegram
    const { sendAdminTelegramNotificationSafe } = await import('@/lib/adminTelegramNotifier');
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : 'http://localhost:3000';
    
    const items = [];
    if (m > 0) items.push({ name: 'باوتش موتوسيكل', quantity: m });
    if (b > 0) items.push({ name: 'باوتش عجلة', quantity: b });
    if (t > 0) items.push({ name: 'تيشرت', quantity: t });
    if (j > 0) items.push({ name: 'جاكيت', quantity: j });
    if (h > 0) items.push({ name: 'خوذة', quantity: h });
    
    sendAdminTelegramNotificationSafe({
      type: 'equipment_delivery',
      supervisorName: decoded.name?.toString().trim() || '',
      supervisorCode: decoded.code?.toString().trim() || '',
      riderName: riderName?.toString().trim() || '',
      riderCode: riderCode?.toString().trim() || '',
      items,
      requestDate,
      url: `${baseUrl}/admin/equipment-requests`,
    }).catch((error) => {
      console.error('[EquipmentDelivery] Failed to send Telegram notification:', error);
    });

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
    const { requestId, action, rejectReason, adminOverride } = body;
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

    const status = action === 'approve' ? 'approved' : 'rejected';
    const updated = padRow([...row], 18);
    updated[12] = status;
    updated[13] = updated[13] || row[13] || '';
    updated[14] = approvalDate;
    updated[15] = approvedBy;
    updated[16] = action === 'reject' ? (rejectReason || '').toString() : '';

    let equipmentIssueId = '';

    if (action === 'approve') {
      const { isEquipmentLedgerEnabled } = await import('@/lib/srs014Flags');
      const ledgerOn = isEquipmentLedgerEnabled();

      if (ledgerOn) {
        // Phase C + swap rules: economics depend on deliveryType (تعيين vs تبديل).
        const {
          createLiabilityFromDelivery,
          createShirtSwapLiabilityFromDelivery,
        } = await import('@/lib/equipmentLiability/store');
        const { PHASE_C_ERROR_AR } = await import('@/lib/equipmentLiability/phaseCGates');
        const { resolveDeliveryEconomicIntent } = await import(
          '@/lib/equipmentLiability/swapRules'
        );
        const motorcyclePouch = Math.max(0, Number(row[6]) || 0);
        const bicyclePouch = Math.max(0, Number(row[7]) || 0);
        const tshirtQty = Math.max(0, Number(row[8]) || 0);
        const deliveryType = row[5]?.toString().trim() || '';
        const bagType = motorcyclePouch > 0 ? 'motorcycle' : 'bicycle';
        const riderCode = row[2]?.toString().trim() || '';
        // Free shirt override: notes column may contain marker (auditable convention).
        const notes = String(row[11] ?? '');
        const adminFreeShirtOverride =
          /FREE_SHIRT_SWAP|تبديل_تيشيرت_مجاني/i.test(notes);

        const economic = resolveDeliveryEconomicIntent({
          deliveryType,
          motorcyclePouch,
          bicyclePouch,
          tshirtQty,
          adminFreeShirtOverride,
        });

        const baseInput = {
          deliveryRowRef: String(rowIndex),
          riderCode,
          riderNameSnapshot: row[3]?.toString().trim() || '',
          zoneSnapshot: row[4]?.toString().trim() || '',
          supervisorCodeSnapshot: row[0]?.toString().trim() || '',
          supervisorNameSnapshot: row[1]?.toString().trim() || '',
          issueDate: approvalDate,
          bagType: bagType as 'motorcycle' | 'bicycle',
          jacketHeld: Math.max(0, Number(row[9]) || 0) > 0,
          helmetHeld: Math.max(0, Number(row[10]) || 0) > 0,
          ...(adminOverride?.operatorConfirmation
            ? {
                adminOverride: {
                  operatorConfirmation: true as const,
                  securityStatus:
                    adminOverride.securityStatus === 'PAID' ? ('PAID' as const) : ('NOT_PAID' as const),
                  activationDate: String(adminOverride.activationDate || '').trim() || undefined,
                },
              }
            : {}),
        };

        if (economic.kind === 'assignment_create_liability') {
          const liability = await createLiabilityFromDelivery(baseInput, {
            code: decoded.code || 'admin',
            name: approvedBy,
          });
          if (!liability.ok) {
            return NextResponse.json(
              {
                success: false,
                error: liability.error || PHASE_C_ERROR_AR.LIABILITY_CREATE_FAILED,
                code: liability.code,
              },
              { status: liability.code === 'LOCK_BUSY' ? 409 : 400 }
            );
          }
          equipmentIssueId = liability.issue.equipmentIssueId;
          updated[17] = equipmentIssueId;
        } else if (economic.kind === 'swap_shirt_charge_create_liability') {
          const liability = await createShirtSwapLiabilityFromDelivery(
            { ...baseInput, shirtQty: economic.shirtQty },
            { code: decoded.code || 'admin', name: approvedBy }
          );
          if (!liability.ok) {
            return NextResponse.json(
              {
                success: false,
                error: liability.error || PHASE_C_ERROR_AR.LIABILITY_CREATE_FAILED,
                code: liability.code,
                economicKind: economic.kind,
              },
              { status: liability.code === 'LOCK_BUSY' ? 409 : 400 }
            );
          }
          equipmentIssueId = liability.issue.equipmentIssueId;
          updated[17] = equipmentIssueId;
        }
        // Bag-free / free-shirt override / noop: inventory-only — no new liability.

        // Persist approval only after liability exists (no false approved financial state).
        await updateSheetRow(SHEET_EQUIPMENT_DELIVERY, rowIndex + 1, updated);

        const delta = {
          motorcyclePouch: -Math.max(0, Number(row[6]) || 0),
          bicyclePouch: -Math.max(0, Number(row[7]) || 0),
          tshirt: -Math.max(0, Number(row[8]) || 0),
          jacket: -Math.max(0, Number(row[9]) || 0),
          helmet: -Math.max(0, Number(row[10]) || 0),
        };
        const inv = await applyMainInventoryDelta(delta);
        if (!inv.ok) {
          return NextResponse.json({
            success: true,
            message:
              'تمت الموافقة وإنشاء عهدة المعدات، لكن فشل خصم المخزون: ' + (inv.error || ''),
            equipmentIssueId,
            inventoryError: inv.error,
          });
        }

        return NextResponse.json({
          success: true,
          message: 'تمت الموافقة وخصم الكميات من المخزون الرئيسي',
          equipmentIssueId,
        });
      }

      // Legacy path (ledger flag OFF): inventory then approve — unchanged behavior.
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

    await updateSheetRow(SHEET_EQUIPMENT_DELIVERY, rowIndex + 1, updated);

    return NextResponse.json({
      success: true,
      message: action === 'approve' ? 'تمت الموافقة وخصم الكميات من المخزون الرئيسي' : 'تم رفض الطلب',
      equipmentIssueId: equipmentIssueId || undefined,
    });
  } catch (error: any) {
    console.error('[equipment-deliveries PUT]', error);
    return NextResponse.json({ success: false, error: error.message || 'حدث خطأ' }, { status: 500 });
  }
}
