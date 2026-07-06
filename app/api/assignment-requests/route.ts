/**
 * Assignment Requests API
 * Handles creation, listing, and approval of assignment requests
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { getSheetData, appendToSheet, updateSheetRow, ensureSheetExists } from '@/lib/googleSheets';
import { updateRider, addRider, getAllSupervisors } from '@/lib/adminService';
import { isAllowedZone, ZONE_OPTIONS } from '@/lib/zones';
import { assertLimitedAdminSupervisorZoneAccess, filterRowsBySupervisorInZoneScope } from '@/lib/adminZoneScope';
import { assertAdminApiAccess } from '@/lib/adminFeatureAccess';
import { invalidateRiderWorkflowCaches } from '@/lib/cacheInvalidation';
import { findRiderInSheet } from '@/lib/riderCodeUtils';
import { validateAssignmentMetadata } from '@/lib/riderMetadata';
import {
  appendWorkflowMetadataToRow,
  extractWorkflowMetadataFromRow,
  WORKFLOW_METADATA_HEADERS,
  type WorkflowRequestMetadata,
} from '@/lib/workflowRequestMetadata';

export const dynamic = 'force-dynamic';

const STATUS_VALUES = new Set(['pending', 'approved', 'rejected']);

function parseAssignmentRow(row: any[]) {
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
  const metadata = extractWorkflowMetadataFromRow(row, hasZone);
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
    ...metadata,
  };
}

async function applyApprovedRiderMetadata(input: {
  riderCode: string;
  riderName: string;
  zone: string;
  supervisorCode: string;
  metadata: WorkflowRequestMetadata;
}) {
  const ridersData = await getSheetData('المناديب', false);
  const match = findRiderInSheet(ridersData, input.riderCode);
  const riderPayload = {
    joinDate: input.metadata.joinDate,
    contractType: input.metadata.contractType,
    contractEndDate: input.metadata.contractEndDate,
  };

  if (match) {
    const result = await updateRider(match.actualCode, {
      supervisorCode: input.supervisorCode,
      name: input.riderName,
      region: input.zone,
      status: 'نشط',
      ...riderPayload,
    });
    if (!result.success) {
      throw new Error(result.error || 'فشل تعيين المندوب للمشرف');
    }
    return;
  }

  const result = await addRider({
    code: input.riderCode,
    name: input.riderName,
    region: input.zone || '',
    supervisorCode: input.supervisorCode,
    phone: '',
    status: 'نشط',
    ...riderPayload,
  });
  if (!result.success) {
    throw new Error(result.error || 'فشل إضافة المندوب');
  }
}

// Get all assignment requests (admin only) or requests for a supervisor
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
    const status = searchParams.get('status'); // 'pending', 'approved', 'rejected', or null for all

    // Get all assignment requests from Google Sheets
    let allRequests: any[] = [];
    try {
      const requestsData = await getSheetData('طلبات_التعيين', false);
      // Skip header row
      for (let i = 1; i < requestsData.length; i++) {
        const row = requestsData[i];
        if (row.length >= 5 && row[0]) {
          const parsed = parseAssignmentRow(row);
          allRequests.push({ id: i, ...parsed }); // Row number as ID
        }
      }
    } catch (error) {
      // Sheet might not exist yet, return empty array
      console.log('Assignment requests sheet not found, returning empty array');
    }

    // Filter based on role
    if (decoded.role === 'supervisor') {
      // Supervisors can only see their own requests
      allRequests = allRequests.filter((req) => req.supervisorCode === decoded.code);
    }
    allRequests = await filterRowsBySupervisorInZoneScope(decoded, allRequests);

    // Filter by status if provided
    if (status) {
      allRequests = allRequests.filter((req) => req.status === status);
    }

    return NextResponse.json({
      success: true,
      data: allRequests,
    });
  } catch (error: any) {
    console.error('Get assignment requests error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'حدث خطأ' },
      { status: 500 }
    );
  }
}

// Create a new assignment request (supervisor / recruitment manager / admin)
export async function POST(request: NextRequest) {
  try {
    const token = extractBearerToken(request);

    if (!token) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }

    const decoded = verifyToken(token);
    if (
      !decoded ||
      !['supervisor', 'recruitment_manager', 'admin'].includes(String(decoded.role || ''))
    ) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }

    const body = await request.json();
    const { riderCode, riderName, zone, joinDate, contractType } = body;

    let requestSupervisorCode = '';
    let requestSupervisorName = '';
    if (decoded.role === 'supervisor') {
      requestSupervisorCode = decoded.code?.toString().trim() || '';
      requestSupervisorName = decoded.name?.toString().trim() || '';
    } else {
      requestSupervisorCode = String(body.supervisorCode || '').trim();
      if (!requestSupervisorCode) {
        return NextResponse.json(
          { success: false, error: 'اختيار المشرف مطلوب عند إنشاء الطلب بواسطة الإدارة/مسؤول التعيينات' },
          { status: 400 }
        );
      }
      const supervisors = await getAllSupervisors(false);
      const targetSupervisor = supervisors.find((s) => s.code?.toString().trim() === requestSupervisorCode);
      if (!targetSupervisor) {
        return NextResponse.json({ success: false, error: 'المشرف المحدد غير موجود' }, { status: 400 });
      }
      requestSupervisorName = targetSupervisor.name || requestSupervisorCode;
    }

    if (!riderCode || !riderName || !zone || !joinDate || !contractType) {
      return NextResponse.json(
        { success: false, error: 'كود المندوب واسم المندوب والزون وتاريخ الانضمام ونوع العقد مطلوبة' },
        { status: 400 }
      );
    }

    const metadataCheck = validateAssignmentMetadata({
      joinDate: String(joinDate),
      contractType: String(contractType),
    });
    if (!metadataCheck.ok) {
      return NextResponse.json({ success: false, error: metadataCheck.error }, { status: 400 });
    }
    if (!isAllowedZone(zone)) {
      return NextResponse.json(
        { success: false, error: `الزون غير صحيحة. القيم المتاحة: ${ZONE_OPTIONS.join(' / ')}` },
        { status: 400 }
      );
    }

    // Check if rider already exists and is assigned to another supervisor
    try {
      const ridersData = await getSheetData('المناديب', false);
      const riderCodeTrimmed = riderCode?.toString().trim();
      
      for (let i = 1; i < ridersData.length; i++) {
        const row = ridersData[i];
        if (row.length >= 1 && row[0]?.toString().trim() === riderCodeTrimmed) {
          const existingSupervisorCode = row[3]?.toString().trim() || '';
          if (existingSupervisorCode && existingSupervisorCode !== '') {
            return NextResponse.json(
              { success: false, error: 'المندوب معين بالفعل لمشرف آخر' },
              { status: 400 }
            );
          }
          // Rider exists but not assigned - can be assigned
          break;
        }
      }
    } catch (error: any) {
      console.error('[AssignmentRequest] Error checking existing riders:', error);
      // Continue - might be a new rider
    }

    // Ensure the assignment requests sheet exists
    try {
      await ensureSheetExists('طلبات_التعيين', [
        'كود المشرف',
        'اسم المشرف',
        'كود المندوب',
        'اسم المندوب',
        'الزون',
        'الحالة',
        'تاريخ الطلب',
        'تاريخ الموافقة',
        'تمت الموافقة بواسطة',
        ...WORKFLOW_METADATA_HEADERS,
      ]);
    } catch (error: any) {
      console.error('[AssignmentRequest] Error ensuring sheet exists:', error);
      return NextResponse.json(
        { success: false, error: `فشل إنشاء ورقة طلبات التعيين: ${error.message}` },
        { status: 500 }
      );
    }

    // Check if there's already a pending request for this rider by this supervisor
    try {
      const requestsData = await getSheetData('طلبات_التعيين', false);
      const supervisorCodeTrimmed = requestSupervisorCode;
      const riderCodeTrimmed = riderCode?.toString().trim();
      
      for (let i = 1; i < requestsData.length; i++) {
        const row = requestsData[i];
        const parsed = parseAssignmentRow(row);
        if (
          row.length >= 5 &&
          parsed.supervisorCode === supervisorCodeTrimmed &&
          parsed.riderCode === riderCodeTrimmed &&
          parsed.status === 'pending'
        ) {
          console.log(`[AssignmentRequest] Pending request already exists for rider ${riderCodeTrimmed}`);
          return NextResponse.json(
            { success: false, error: 'يوجد طلب تعيين قائم بالفعل لهذا المندوب' },
            { status: 400 }
          );
        }
      }
    } catch (error: any) {
      console.error('[AssignmentRequest] Error checking existing requests:', error);
      // Continue - sheet might be empty
    }

    // Create the request in Google Sheets
    const requestDate = new Date().toISOString().split('T')[0];
    const requestData = appendWorkflowMetadataToRow(
      [
        requestSupervisorCode,
        requestSupervisorName,
        riderCode?.toString().trim() || '',
        riderName?.toString().trim() || '',
        zone?.toString().trim() || '',
        'pending',
        requestDate,
        '',
        '',
      ],
      {
        contractType: metadataCheck.contractType,
        joinDate: metadataCheck.joinDate,
        contractEndDate: metadataCheck.contractEndDate,
      }
    );

    console.log(`[AssignmentRequest] Appending request data:`, requestData);
    
    try {
      await appendToSheet('طلبات_التعيين', [requestData], false);
      console.log(`[AssignmentRequest] Successfully appended request to sheet`);
    } catch (error: any) {
      console.error('[AssignmentRequest] Error appending to sheet:', error);
      return NextResponse.json(
        { success: false, error: `فشل حفظ الطلب: ${error.message || 'خطأ غير معروف'}` },
        { status: 500 }
      );
    }

    // إشعار الإدمن عبر Telegram
    const { sendAdminTelegramNotificationSafe } = await import('@/lib/adminTelegramNotifier');
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : 'http://localhost:3000';
    
    sendAdminTelegramNotificationSafe({
      type: 'assignment_request',
      supervisorName: requestSupervisorName,
      supervisorCode: requestSupervisorCode,
      riderName: riderName?.toString().trim() || '',
      riderCode: riderCode?.toString().trim() || '',
      zone: zone?.toString().trim() || '',
      contractType: metadataCheck.contractType,
      requestDate,
      url: `${baseUrl}/admin/assignment-requests`,
    }).catch((error) => {
      console.error('[AssignmentRequest] Failed to send Telegram notification:', error);
    });

    return NextResponse.json({
      success: true,
      message: 'تم إرسال طلب التعيين بنجاح',
      data: {
        supervisorCode: requestSupervisorCode,
        riderCode: riderCode?.toString().trim(),
        riderName: riderName?.toString().trim(),
        zone: zone?.toString().trim(),
        status: 'pending',
        requestDate,
      },
    });
  } catch (error: any) {
    console.error('[AssignmentRequest] Create assignment request error:', error);
    console.error('[AssignmentRequest] Error stack:', error.stack);
    return NextResponse.json(
      { success: false, error: error.message || 'حدث خطأ في إنشاء الطلب' },
      { status: 500 }
    );
  }
}

// Approve or reject an assignment request (admin only)
export async function PUT(request: NextRequest) {
  try {
    const token = extractBearerToken(request);

    if (!token) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }

    const decoded = verifyToken(token);
    if (!decoded || decoded.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'غير مصرح - المدير فقط' }, { status: 401 });
    }

    const denyPut = assertAdminApiAccess(decoded, 'assignment_requests');
    if (denyPut) return denyPut;

    const body = await request.json();
    const { requestId, action, contractEndDate: adminContractEndOverride } = body;
    // action: 'approve' or 'reject'
    
    console.log(`[AssignmentRequest] Received request:`, {
      requestId,
      action,
    });

    if (!requestId || !action) {
      return NextResponse.json(
        { success: false, error: 'معرف الطلب والإجراء مطلوبان' },
        { status: 400 }
      );
    }

    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json(
        { success: false, error: 'الإجراء يجب أن يكون approve أو reject' },
        { status: 400 }
      );
    }

    // Get the request from Google Sheets
    const requestsData = await getSheetData('طلبات_التعيين', false);
    const rowIndex = parseInt(requestId);

    if (rowIndex < 1 || rowIndex >= requestsData.length) {
      return NextResponse.json({ success: false, error: 'الطلب غير موجود' }, { status: 404 });
    }

    const row = requestsData[rowIndex];
    const parsedRow = parseAssignmentRow(row);
    if (row.length < 5 || parsedRow.status !== 'pending') {
      return NextResponse.json(
        { success: false, error: 'الطلب غير صالح أو تمت معالجته بالفعل' },
        { status: 400 }
      );
    }

    const supervisorCode = parsedRow.supervisorCode;
    const riderCode = parsedRow.riderCode;
    const riderName = parsedRow.riderName;
    const zone = parsedRow.zone;
    const zoneDeny = await assertLimitedAdminSupervisorZoneAccess(decoded, supervisorCode);
    if (zoneDeny) return zoneDeny;
    const status = action === 'approve' ? 'approved' : 'rejected';
    const approvalDate = new Date().toISOString().split('T')[0];
    const approvedBy = decoded.name || decoded.code;

    console.log(`[AssignmentRequest] Processing ${action} for request ID ${requestId}`);
    console.log(`[AssignmentRequest] Supervisor: ${supervisorCode}, Rider: ${riderCode}`);

    if (action === 'approve') {
      try {
        let metadata: WorkflowRequestMetadata = {
          contractType: parsedRow.contractType,
          joinDate: parsedRow.joinDate,
          contractEndDate: parsedRow.contractEndDate,
        };

        if (!metadata.joinDate || !metadata.contractType) {
          return NextResponse.json(
            { success: false, error: 'الطلب يفتقد بيانات العقد أو تاريخ الانضمام — يرجى رفض الطلب وإعادة إرساله' },
            { status: 400 }
          );
        }

        if (adminContractEndOverride) {
          const overrideCheck = validateAssignmentMetadata({
            joinDate: metadata.joinDate,
            contractType: metadata.contractType,
            contractEndDate: String(adminContractEndOverride),
            allowCustomEndDate: true,
          });
          if (!overrideCheck.ok) {
            return NextResponse.json({ success: false, error: overrideCheck.error }, { status: 400 });
          }
          metadata = {
            contractType: overrideCheck.contractType,
            joinDate: overrideCheck.joinDate,
            contractEndDate: overrideCheck.contractEndDate,
          };
        } else if (!metadata.contractEndDate) {
          const auto = validateAssignmentMetadata({
            joinDate: metadata.joinDate,
            contractType: metadata.contractType,
          });
          if (!auto.ok) {
            return NextResponse.json({ success: false, error: auto.error }, { status: 400 });
          }
          metadata.contractEndDate = auto.contractEndDate;
        }

        await applyApprovedRiderMetadata({
          riderCode,
          riderName,
          zone,
          supervisorCode,
          metadata,
        });
      } catch (error: any) {
        console.error('[AssignmentRequest] Error processing rider (before sheet update):', error);
        return NextResponse.json(
          { success: false, error: error.message || 'فشل معالجة المندوب — لم يتم تسجيل الموافقة' },
          { status: 500 }
        );
      }
    }

    const updatedRow = [...row];
    if (parsedRow.hasZone) {
      updatedRow[5] = status;
      updatedRow[7] = approvalDate;
      updatedRow[8] = approvedBy;
    } else {
      updatedRow[4] = status;
      updatedRow[6] = approvalDate;
      updatedRow[7] = approvedBy;
    }

    await updateSheetRow('طلبات_التعيين', rowIndex + 1, updatedRow);

    if (action === 'approve') {
      await invalidateRiderWorkflowCaches({
        newSupervisorCode: supervisorCode,
        extraSheets: ['طلبات_التعيين'],
      });
    } else {
      await invalidateRiderWorkflowCaches({ extraSheets: ['طلبات_التعيين'], notify: false });
    }

    return NextResponse.json({
      success: true,
      message: action === 'approve' 
        ? 'تمت الموافقة على الطلب وتعيين المندوب للمشرف'
        : 'تم رفض الطلب',
      data: {
        requestId,
        status,
        approvalDate,
        approvedBy,
      },
    });
  } catch (error: any) {
    console.error('Update assignment request error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'حدث خطأ في معالجة الطلب' },
      { status: 500 }
    );
  }
}

