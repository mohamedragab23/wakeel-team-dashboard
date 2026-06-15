/**
 * Termination Requests API
 * Handles creation, listing, and approval of termination requests
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { extractBearerToken } from '@/lib/requestAuth';
import { getSupervisorRiders } from '@/lib/dataService';
import { appendToSheet, getSheetData, updateSheetRow, ensureSheetExists } from '@/lib/googleSheets';
import { updateRider } from '@/lib/adminService';
import { getSupervisorPerformanceFiltered } from '@/lib/dataFilter';
import { computeWorkDaysByRider, type PerformanceRecord } from '@/lib/riderPerformanceAggregate';
import {
  assertLimitedAdminSupervisorZoneAccess,
  filterRowsBySupervisorInZoneScope,
} from '@/lib/adminZoneScope';
import { assertAdminApiAccess } from '@/lib/adminFeatureAccess';
import { invalidateRiderWorkflowCaches } from '@/lib/cacheInvalidation';
import { tryAcquireApprovalLock, releaseApprovalLock } from '@/lib/approvalLock';
import { terminationPostSchema, terminationPutSchema } from '@/lib/validators/common';
import { randomBytes } from 'crypto';

export const dynamic = 'force-dynamic';

const STABLE_ID_COL = 10;

function makeStableRequestId(): string {
  return `tr-${Date.now()}-${randomBytes(3).toString('hex')}`;
}

function findTerminationRowIndex(rows: any[][], requestId: string | number): number {
  const asNum = parseInt(String(requestId), 10);
  if (!isNaN(asNum) && asNum >= 1 && asNum < rows.length) {
    return asNum;
  }
  const idStr = String(requestId).trim();
  for (let i = 1; i < rows.length; i++) {
    const stable = rows[i][STABLE_ID_COL]?.toString().trim();
    if (stable && stable === idStr) return i;
  }
  return -1;
}

function safeNum(v: any): number {
  const n = typeof v === 'number' ? v : parseFloat((v ?? '').toString().replace(/[, ]+/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

function parseSheetDateValueToMs(v: any): number {
  if (!v) return 0;
  if (v instanceof Date) return v.getTime();
  const s = v.toString().trim();
  if (!s) return 0;
  // Prefer ISO-ish (YYYY-MM-DD) and common strings. Fallback: try Date().
  const d = /^\d{4}-\d{2}-\d{2}/.test(s) ? new Date(`${s}T00:00:00`) : new Date(s);
  return Number.isFinite(d.getTime()) ? d.getTime() : 0;
}

function normalizeRiderCodeMatch(code: any): string {
  const s = (code ?? '').toString().trim();
  if (!s) return '';
  return s.replace(/^0+/, '') || '0';
}

function filterPerfForRider(perf: PerformanceRecord[], riderCode: string): PerformanceRecord[] {
  const t = (riderCode ?? '').toString().trim();
  const nt = normalizeRiderCodeMatch(t);
  return perf.filter((p) => {
    const c = (p.riderCode ?? '').toString().trim();
    return c === t || normalizeRiderCodeMatch(c) === nt;
  });
}

function aggregateRiderPeriodStats(perf: PerformanceRecord[]) {
  let orders = 0;
  let hours = 0;
  let breakM = 0;
  let delayM = 0;
  let accSum = 0;
  let accCnt = 0;
  let latestDebt = 0;
  let latestDebtMs = 0;

  for (const p of perf) {
    orders += p.orders || 0;
    hours += Number(p.hours) || 0;
    breakM += Number(p.break) || 0;
    delayM += Number(p.delay) || 0;
    const acceptanceStr = p.acceptance?.toString() || '0';
    let acceptanceNum = parseFloat(acceptanceStr.replace('%', '').replace('٪', '')) || 0;
    if (acceptanceNum > 0 && acceptanceNum <= 1) acceptanceNum *= 100;
    if (acceptanceNum > 0) {
      accSum += acceptanceNum;
      accCnt += 1;
    }
    const d = new Date((p.date ?? '').toString().split('T')[0] + 'T12:00:00');
    const ms = d.getTime();
    if (Number.isFinite(ms) && ms >= latestDebtMs) {
      latestDebtMs = ms;
      latestDebt = Number(p.debt) || 0;
    }
  }

  const codeSet = new Set(perf.map((r) => (r.riderCode ?? '').toString().trim()).filter(Boolean));
  const workDaysMap = computeWorkDaysByRider(perf, codeSet);
  let workDays = 0;
  for (const v of workDaysMap.values()) workDays += v;

  return {
    orders,
    hours,
    break: breakM,
    delay: delayM,
    avgAcceptance: accCnt > 0 ? Math.round((accSum / accCnt) * 100) / 100 : 0,
    records: perf.length,
    workDays,
    /** آخر مديونية مسجلة في البيانات اليومية ضمن الفترة */
    debtAtEndOfPeriod: latestDebtMs > 0 ? latestDebt : null as number | null,
  };
}

async function buildLatestDebtMapForRiders(riderCodes: Set<string>): Promise<Map<string, number>> {
  const debtByRider = new Map<string, { ms: number; debt: number }>();
  if (riderCodes.size === 0) return new Map();

  let daily: any[][] = [];
  try {
    daily = await getSheetData('البيانات اليومية');
  } catch {
    return new Map();
  }

  for (let i = 1; i < daily.length; i++) {
    const row = daily[i] || [];
    const code = (row[1] ?? '').toString().trim();
    if (!code || !riderCodes.has(code)) continue;
    const ms = parseSheetDateValueToMs(row[0]);
    const debt = safeNum(row[8]);
    const cur = debtByRider.get(code);
    if (!cur || ms >= cur.ms) {
      debtByRider.set(code, { ms, debt });
    }
  }

  const out = new Map<string, number>();
  for (const code of riderCodes) out.set(code, debtByRider.get(code)?.debt ?? 0);
  return out;
}

// Get all termination requests (admin only) or requests for a supervisor
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
      const deny = assertAdminApiAccess(decoded, 'termination_requests');
      if (deny) return deny;
    } else if (decoded.role !== 'supervisor') {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status'); // 'pending', 'approved', 'rejected', or null for all

    // Get all termination requests from Google Sheets
    let allRequests: any[] = [];
    let riderCodesForDebt = new Set<string>();
    try {
      const requestsData = await getSheetData('طلبات_الإقالة', false);
      // Skip header row
      for (let i = 1; i < requestsData.length; i++) {
        const row = requestsData[i];
        if (row.length >= 6 && row[0]) {
          const riderCode = row[2]?.toString().trim() || '';
          if (riderCode) riderCodesForDebt.add(riderCode);
          allRequests.push({
            id: i,
            stableRequestId: row[STABLE_ID_COL]?.toString().trim() || '',
            supervisorCode: row[0]?.toString().trim(),
            supervisorName: row[1]?.toString().trim(),
            riderCode,
            riderName: row[3]?.toString().trim(),
            reason: row[4]?.toString().trim(),
            status: row[5]?.toString().trim() || 'pending',
            requestDate: row[6]?.toString().trim() || '',
            approvalDate: row[7]?.toString().trim() || '',
            approvedBy: row[8]?.toString().trim() || '',
            debt: row[9] !== undefined ? safeNum(row[9]) : undefined,
          });
        }
      }
    } catch (error) {
      // Sheet might not exist yet, return empty array
      console.log('Termination requests sheet not found, returning empty array');
    }

    // Fill missing debt values from latest performance (البيانات اليومية)
    const missingDebtCodes = new Set(
      allRequests
        .filter((r) => r && (r.debt === undefined || r.debt === null) && r.riderCode)
        .map((r) => (r.riderCode ?? '').toString().trim())
        .filter(Boolean)
    );
    if (missingDebtCodes.size > 0) {
      const latestDebt = await buildLatestDebtMapForRiders(missingDebtCodes);
      allRequests = allRequests.map((r) => ({
        ...r,
        debt: r.debt !== undefined && r.debt !== null ? r.debt : (latestDebt.get((r.riderCode ?? '').toString().trim()) ?? 0),
      }));
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

    // Optional: أداء المندوب ضمن فترة يحددها المستخدم (للمشرف والمدير)
    const statsFrom = searchParams.get('statsFrom');
    const statsTo = searchParams.get('statsTo');
    if (statsFrom && statsTo && /^\d{4}-\d{2}-\d{2}$/.test(statsFrom) && /^\d{4}-\d{2}-\d{2}$/.test(statsTo)) {
      const startD = new Date(statsFrom + 'T00:00:00');
      const endD = new Date(statsTo + 'T23:59:59');
      if (!isNaN(startD.getTime()) && !isNaN(endD.getTime()) && startD <= endD) {
        const perfBySupervisor = new Map<string, PerformanceRecord[]>();

        const getPerfForSupervisor = async (supCode: string) => {
          const key = (supCode ?? '').toString().trim();
          if (!key) return [] as PerformanceRecord[];
          let cached = perfBySupervisor.get(key);
          if (!cached) {
            const rows = await getSupervisorPerformanceFiltered(key, startD, endD);
            cached = rows as PerformanceRecord[];
            perfBySupervisor.set(key, cached);
          }
          return cached;
        };

        const uniqueSupervisors = [
          ...new Set(
            allRequests
              .map((r: any) => (r.supervisorCode ?? '').toString().trim())
              .filter(Boolean)
          ),
        ];
        await Promise.all(uniqueSupervisors.map((sup) => getPerfForSupervisor(sup)));

        allRequests = allRequests.map((req: any) => {
            const sup = (req.supervisorCode ?? '').toString().trim();
            const riderCode = (req.riderCode ?? '').toString().trim();
            if (!sup || !riderCode) return { ...req, periodStats: null };

            const perf = perfBySupervisor.get(sup) || [];
            const sub = filterPerfForRider(perf, riderCode);
            if (sub.length === 0) {
              return {
                ...req,
                periodStats: {
                  orders: 0,
                  hours: 0,
                  break: 0,
                  delay: 0,
                  avgAcceptance: 0,
                  records: 0,
                  workDays: 0,
                  debtAtEndOfPeriod: null as number | null,
                },
              };
            }
            return { ...req, periodStats: aggregateRiderPeriodStats(sub) };
          });
      }
    }

    return NextResponse.json({
      success: true,
      data: allRequests,
    });
  } catch (error: any) {
    console.error('Get termination requests error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'حدث خطأ' },
      { status: 500 }
    );
  }
}

// Create a new termination request (supervisor only)
export async function POST(request: NextRequest) {
  try {
    const token = extractBearerToken(request);

    if (!token) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }

    const decoded = verifyToken(token);
    if (!decoded || decoded.role !== 'supervisor') {
      return NextResponse.json({ success: false, error: 'غير مصرح - المشرفين فقط' }, { status: 401 });
    }

    const body = await request.json();
    const parsedBody = terminationPostSchema.safeParse(body);
    if (!parsedBody.success) {
      return NextResponse.json(
        { success: false, error: parsedBody.error.errors[0]?.message || 'بيانات غير صالحة' },
        { status: 400 }
      );
    }
    const { riderCode, reason } = parsedBody.data;

    // Verify that the rider is assigned to this supervisor
    console.log(`[TerminationRequest] Supervisor ${decoded.code} requesting termination for rider ${riderCode}`);
    const riders = await getSupervisorRiders(decoded.code);
    console.log(`[TerminationRequest] Found ${riders.length} riders for supervisor ${decoded.code}`);
    
    // Trim riderCode for comparison
    const riderCodeTrimmed = riderCode?.toString().trim();
    const rider = riders.find((r) => r.code?.toString().trim() === riderCodeTrimmed);

    if (!rider) {
      console.log(`[TerminationRequest] Rider ${riderCodeTrimmed} not found for supervisor ${decoded.code}`);
      console.log(`[TerminationRequest] Available riders: ${riders.map(r => r.code).join(', ')}`);
      return NextResponse.json(
        { success: false, error: 'المندوب غير معين لك' },
        { status: 400 }
      );
    }
    
    console.log(`[TerminationRequest] Rider found: ${rider.name} (${rider.code})`);

    // Ensure the termination requests sheet exists
    try {
      await ensureSheetExists('طلبات_الإقالة', [
        'كود المشرف',
        'اسم المشرف',
        'كود المندوب',
        'اسم المندوب',
        'سبب الإقالة',
        'الحالة',
        'تاريخ الطلب',
        'تاريخ الموافقة',
        'تمت الموافقة بواسطة',
        'المديونية',
        'معرف_الطلب',
      ]);
    } catch (error: any) {
      console.error('[TerminationRequest] Error ensuring sheet exists:', error);
      return NextResponse.json(
        { success: false, error: `فشل إنشاء ورقة طلبات الإقالة: ${error.message}` },
        { status: 500 }
      );
    }

    // Check if there's already a pending request for this rider
    try {
      const requestsData = await getSheetData('طلبات_الإقالة', false);
      const supervisorCodeTrimmed = decoded.code?.toString().trim();
      const riderCodeTrimmed = riderCode?.toString().trim();
      
      for (let i = 1; i < requestsData.length; i++) {
        const row = requestsData[i];
        if (
          row.length >= 6 &&
          row[0]?.toString().trim() === supervisorCodeTrimmed &&
          row[2]?.toString().trim() === riderCodeTrimmed &&
          row[5]?.toString().trim() === 'pending'
        ) {
          console.log(`[TerminationRequest] Pending request already exists for rider ${riderCodeTrimmed}`);
          return NextResponse.json(
            { success: false, error: 'يوجد طلب إقالة قائم بالفعل لهذا المندوب' },
            { status: 400 }
          );
        }
      }
    } catch (error: any) {
      console.error('[TerminationRequest] Error checking existing requests:', error);
      // Continue - sheet might be empty
    }

    // Create the request in Google Sheets
    const requestDate = new Date().toISOString().split('T')[0];
    // Best-effort: pull latest debt for that rider from daily data (if available)
    let debtValue = 0;
    try {
      const latestDebtMap = await buildLatestDebtMapForRiders(new Set([riderCode?.toString().trim() || '']));
      debtValue = latestDebtMap.get(riderCode?.toString().trim() || '') ?? 0;
    } catch {
      debtValue = 0;
    }
    const stableId = makeStableRequestId();
    const requestData = [
      decoded.code?.toString().trim() || '',
      decoded.name?.toString().trim() || '',
      riderCode?.toString().trim() || '',
      rider.name?.toString().trim() || '',
      reason?.toString().trim() || '',
      'pending',
      requestDate,
      '',
      '',
      debtValue,
      stableId,
    ];

    console.log(`[TerminationRequest] Appending request data:`, requestData);
    
    try {
      await appendToSheet('طلبات_الإقالة', [requestData], false);
      console.log(`[TerminationRequest] Successfully appended request to sheet`);
    } catch (error: any) {
      console.error('[TerminationRequest] Error appending to sheet:', error);
      return NextResponse.json(
        { success: false, error: `فشل حفظ الطلب: ${error.message || 'خطأ غير معروف'}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'تم إرسال طلب الإقالة بنجاح',
      data: {
        supervisorCode: decoded.code,
        riderCode: riderCode?.toString().trim(),
        riderName: rider.name,
        reason: reason?.toString().trim(),
        status: 'pending',
        requestDate,
      },
    });
  } catch (error: any) {
    console.error('[TerminationRequest] Create termination request error:', error);
    console.error('[TerminationRequest] Error stack:', error.stack);
    return NextResponse.json(
      { success: false, error: error.message || 'حدث خطأ في إنشاء الطلب' },
      { status: 500 }
    );
  }
}

// Approve or reject a termination request (admin only)
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

    const denyAccess = assertAdminApiAccess(decoded, 'termination_requests');
    if (denyAccess) return denyAccess;

    const body = await request.json();
    const parsedPut = terminationPutSchema.safeParse(body);
    if (!parsedPut.success) {
      return NextResponse.json(
        { success: false, error: parsedPut.error.errors[0]?.message || 'بيانات غير صالحة' },
        { status: 400 }
      );
    }
    const { requestId, action, newSupervisorCode, deleteRider } = parsedPut.data;

    const lockKey = `termination:${requestId}:${action}`;
    if (!tryAcquireApprovalLock(lockKey)) {
      return NextResponse.json(
        { success: false, error: 'الطلب قيد المعالجة حالياً — حاول مرة أخرى' },
        { status: 409 }
      );
    }

    try {
      const requestsData = await getSheetData('طلبات_الإقالة', false);
      const rowIndex = findTerminationRowIndex(requestsData, requestId);

      if (rowIndex < 1) {
        return NextResponse.json({ success: false, error: 'الطلب غير موجود' }, { status: 404 });
      }

      const row = requestsData[rowIndex];
      if (row.length < 6 || row[5]?.toString().trim() !== 'pending') {
        return NextResponse.json(
          { success: false, error: 'الطلب غير صالح أو تمت معالجته بالفعل' },
          { status: 400 }
        );
      }

      const supervisorCode = row[0]?.toString().trim();
      const riderCode = row[2]?.toString().trim();
      const zoneDeny = await assertLimitedAdminSupervisorZoneAccess(decoded, supervisorCode);
      if (zoneDeny) return zoneDeny;
      if (action === 'approve' && newSupervisorCode && String(newSupervisorCode).trim() !== '') {
        const denyNew = await assertLimitedAdminSupervisorZoneAccess(
          decoded,
          String(newSupervisorCode).trim()
        );
        if (denyNew) return denyNew;
      }

      // Re-read pending status immediately before mutation (double-approval guard)
      const freshData = await getSheetData('طلبات_الإقالة', false);
      const freshRow = freshData[rowIndex];
      if (!freshRow || freshRow[5]?.toString().trim() !== 'pending') {
        return NextResponse.json(
          { success: false, error: 'تمت معالجة الطلب بالفعل' },
          { status: 409 }
        );
      }

      const status = action === 'approve' ? 'approved' : 'rejected';
      const approvalDate = new Date().toISOString().split('T')[0];
      const approvedBy = decoded.name || decoded.code;

      if (action === 'approve') {
        try {
          if (deleteRider === true) {
            const { deleteRider: deleteRiderFunc } = await import('@/lib/adminService');
            const result = await deleteRiderFunc(riderCode, true);
            if (!result.success) throw new Error(result.error || 'فشل حذف المندوب');
          } else if (newSupervisorCode && newSupervisorCode.trim() !== '') {
            const result = await updateRider(riderCode, {
              supervisorCode: newSupervisorCode.trim(),
            });
            if (!result.success) throw new Error(result.error || 'فشل تعيين المندوب للمشرف الجديد');
          } else {
            const result = await updateRider(riderCode.trim(), {
              supervisorCode: '',
              status: 'مُقال',
            });
            if (!result.success) throw new Error(result.error || 'فشل إزالة تعيين المندوب');
          }
        } catch (error: any) {
          return NextResponse.json(
            { success: false, error: error.message || 'فشل معالجة المندوب — لم يتم تسجيل الموافقة' },
            { status: 500 }
          );
        }
      }

      const updatedRow = [...freshRow];
      updatedRow[5] = status;
      updatedRow[7] = approvalDate;
      updatedRow[8] = approvedBy;

      await updateSheetRow('طلبات_الإقالة', rowIndex + 1, updatedRow);

      if (action === 'approve') {
        await invalidateRiderWorkflowCaches({
          oldSupervisorCode: supervisorCode,
          newSupervisorCode: newSupervisorCode?.trim() || '',
          extraSheets: ['طلبات_الإقالة'],
        });
      } else {
        await invalidateRiderWorkflowCaches({ extraSheets: ['طلبات_الإقالة'], notify: false });
      }

      return NextResponse.json({
        success: true,
        message:
          action === 'approve'
            ? deleteRider === true
              ? 'تمت الموافقة على الطلب وحذف المندوب تماماً'
              : newSupervisorCode && newSupervisorCode.trim() !== ''
                ? 'تمت الموافقة على الطلب وتعيين المندوب لمشرف آخر'
                : 'تمت الموافقة على الطلب وإزالة تعيين المندوب'
            : 'تم رفض الطلب',
        data: { requestId, status, approvalDate, approvedBy },
      });
    } finally {
      releaseApprovalLock(lockKey);
    }
  } catch (error: any) {
    console.error('Update termination request error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'حدث خطأ في معالجة الطلب' },
      { status: 500 }
    );
  }
}
