import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { appendToSheet, ensureSheetExists, getSheetData, updateSheetRow } from '@/lib/googleSheets';
import { addRider, getAllRiders, updateRider } from '@/lib/adminService';
import { isAllowedZone, ZONE_OPTIONS } from '@/lib/zones';
import {
  assertLimitedAdminSupervisorZoneAccess,
  filterRowsBySupervisorInZoneScope,
} from '@/lib/adminZoneScope';
import { normalizeRiderCodeForPerformance } from '@/lib/dataFilter';
import { assertAdminApiAccess } from '@/lib/adminFeatureAccess';
import { invalidateRiderWorkflowCaches } from '@/lib/cacheInvalidation';

export const dynamic = 'force-dynamic';

const STATUS_VALUES = new Set(['pending', 'approved', 'rejected']);

function parseReactivationRow(row: any[]) {
  const supervisorCode = row[0]?.toString().trim() || '';
  const supervisorName = row[1]?.toString().trim() || '';
  const riderCode = row[2]?.toString().trim() || '';
  const riderName = row[3]?.toString().trim() || '';
  const maybe = row[4]?.toString().trim() || '';
  const hasZone = maybe !== '' && !STATUS_VALUES.has(maybe);
  const zone = hasZone ? maybe : '';
  const status = (hasZone ? row[5] : row[4])?.toString().trim() || 'pending';
  const requestDate = (hasZone ? row[6] : row[5])?.toString().trim() || '';
  const approvalDate = (hasZone ? row[7] : row[6])?.toString().trim() || '';
  const approvedBy = (hasZone ? row[8] : row[7])?.toString().trim() || '';
  return {
    supervisorCode,
    supervisorName,
    riderCode,
    riderName,
    zone,
    status,
    requestDate,
    approvalDate,
    approvedBy,
    hasZone,
  };
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

    if (decoded.role === 'admin') {
      const deny = assertAdminApiAccess(decoded, 'assignment_requests');
      if (deny) return deny;
    } else if (decoded.role !== 'supervisor') {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    let allRequests: any[] = [];
    try {
      const rows = await getSheetData('طلبات_إعادة_التفعيل', false);
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row.length >= 5 && row[0]) {
          allRequests.push({ id: i, ...parseReactivationRow(row) });
        }
      }
    } catch {
      // sheet might not exist yet
    }

    if (decoded.role === 'supervisor') {
      allRequests = allRequests.filter((r) => r.supervisorCode === decoded.code);
    }
    allRequests = await filterRowsBySupervisorInZoneScope(decoded, allRequests);

    if (status) {
      allRequests = allRequests.filter((r) => r.status === status);
    }

    return NextResponse.json({ success: true, data: allRequests });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'حدث خطأ' },
      { status: 500 }
    );
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
      return NextResponse.json(
        { success: false, error: 'غير مصرح - المشرفين فقط' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const riderCode = String(body?.riderCode ?? '').trim();
    const riderName = String(body?.riderName ?? '').trim();
    const zone = String(body?.zone ?? '').trim();

    if (!riderCode || !riderName || !zone) {
      return NextResponse.json(
        { success: false, error: 'كود المندوب واسم المندوب والزون مطلوبة' },
        { status: 400 }
      );
    }
    if (!isAllowedZone(zone)) {
      return NextResponse.json(
        { success: false, error: `الزون غير صحيحة. القيم المتاحة: ${ZONE_OPTIONS.join(' / ')}` },
        { status: 400 }
      );
    }

    await ensureSheetExists('طلبات_إعادة_التفعيل', [
      'كود المشرف',
      'اسم المشرف',
      'كود المندوب',
      'اسم المندوب',
      'الزون',
      'الحالة',
      'تاريخ الطلب',
      'تاريخ الموافقة',
      'تمت الموافقة بواسطة',
    ]);

    const reqRows = await getSheetData('طلبات_إعادة_التفعيل', false);
    for (let i = 1; i < reqRows.length; i++) {
      const parsed = parseReactivationRow(reqRows[i] || []);
      if (
        parsed.supervisorCode === String(decoded.code ?? '').trim() &&
        normalizeRiderCodeForPerformance(parsed.riderCode) ===
          normalizeRiderCodeForPerformance(riderCode) &&
        parsed.status === 'pending'
      ) {
        return NextResponse.json(
          { success: false, error: 'يوجد طلب إعادة تفعيل قائم بالفعل لهذا المندوب' },
          { status: 400 }
        );
      }
    }

    const requestDate = new Date().toISOString().split('T')[0];
    await appendToSheet(
      'طلبات_إعادة_التفعيل',
      [
        [
          String(decoded.code ?? '').trim(),
          String(decoded.name ?? '').trim(),
          riderCode,
          riderName,
          zone,
          'pending',
          requestDate,
          '',
          '',
        ],
      ],
      false
    );

    return NextResponse.json({
      success: true,
      message: 'تم إرسال طلب إعادة التفعيل بنجاح',
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'حدث خطأ في إنشاء الطلب' },
      { status: 500 }
    );
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
      return NextResponse.json(
        { success: false, error: 'غير مصرح - المدير فقط' },
        { status: 401 }
      );
    }
    const deny = assertAdminApiAccess(decoded, 'assignment_requests');
    if (deny) return deny;

    const body = await request.json();
    const requestId = parseInt(String(body?.requestId ?? ''), 10);
    const action = String(body?.action ?? '').trim();

    if (!requestId || (action !== 'approve' && action !== 'reject')) {
      return NextResponse.json(
        { success: false, error: 'معرف الطلب والإجراء مطلوبان' },
        { status: 400 }
      );
    }

    const rows = await getSheetData('طلبات_إعادة_التفعيل', false);
    if (requestId < 1 || requestId >= rows.length) {
      return NextResponse.json({ success: false, error: 'الطلب غير موجود' }, { status: 404 });
    }

    const row = rows[requestId];
    const parsed = parseReactivationRow(row);
    if (parsed.status !== 'pending') {
      return NextResponse.json(
        { success: false, error: 'الطلب غير صالح أو تمت معالجته بالفعل' },
        { status: 400 }
      );
    }

    const zoneDeny = await assertLimitedAdminSupervisorZoneAccess(
      decoded,
      parsed.supervisorCode
    );
    if (zoneDeny) return zoneDeny;

    const status = action === 'approve' ? 'approved' : 'rejected';
    const approvalDate = new Date().toISOString().split('T')[0];
    const approvedBy = String(decoded.name ?? decoded.code ?? '').trim();

    if (action === 'approve') {
      const targetNorm = normalizeRiderCodeForPerformance(parsed.riderCode);
      const allRiders = await getAllRiders(false);
      const existing = allRiders.find(
        (r) => normalizeRiderCodeForPerformance(r.code) === targetNorm
      );

      if (existing) {
        const up = await updateRider(existing.code, {
          supervisorCode: parsed.supervisorCode,
          name: parsed.riderName || existing.name,
          region: parsed.zone || existing.region,
          status: 'نشط',
        });
        if (!up.success) {
          return NextResponse.json(
            { success: false, error: up.error || 'فشل إعادة تعيين المندوب — لم يتم تسجيل الموافقة' },
            { status: 500 }
          );
        }
      } else {
        const add = await addRider({
          code: parsed.riderCode,
          name: parsed.riderName,
          region: parsed.zone || '',
          supervisorCode: parsed.supervisorCode,
          phone: '',
          joinDate: new Date().toISOString().split('T')[0],
          status: 'نشط',
        });
        if (!add.success) {
          return NextResponse.json(
            { success: false, error: add.error || 'فشل إضافة المندوب — لم يتم تسجيل الموافقة' },
            { status: 500 }
          );
        }
      }
    }

    const updated = [...row];
    if (parsed.hasZone) {
      updated[5] = status;
      updated[7] = approvalDate;
      updated[8] = approvedBy;
    } else {
      updated[4] = status;
      updated[6] = approvalDate;
      updated[7] = approvedBy;
    }
    await updateSheetRow('طلبات_إعادة_التفعيل', requestId + 1, updated);

    if (action === 'approve') {
      await invalidateRiderWorkflowCaches({
        newSupervisorCode: parsed.supervisorCode,
        extraSheets: ['طلبات_إعادة_التفعيل'],
      });
    } else {
      await invalidateRiderWorkflowCaches({
        extraSheets: ['طلبات_إعادة_التفعيل'],
        notify: false,
      });
    }

    return NextResponse.json({
      success: true,
      message: action === 'approve' ? 'تمت الموافقة على إعادة التفعيل' : 'تم رفض الطلب',
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'حدث خطأ في معالجة الطلب' },
      { status: 500 }
    );
  }
}

