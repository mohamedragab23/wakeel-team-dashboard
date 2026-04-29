/**
 * Upload API - Write-First Architecture
 * Processes Excel files and writes to Google Sheets FIRST
 * Client-side can cache in IndexedDB for performance
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { readExcelFromBuffer } from '@/lib/excelProcessorServer';
import { processRidersExcel, processPerformanceExcel } from '@/lib/excelProcessor';
import { bulkAddRiders, getAllRiders } from '@/lib/adminService';
import { appendToSheet, getSheetData, updateSheetRow, ensureSheetExists } from '@/lib/googleSheets';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60; // 60 seconds for large file processing

function safeNum(v: any): number {
  const n = typeof v === 'number' ? v : parseFloat((v ?? '').toString().replace(/[, ]+/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

function toLocalIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function normalizeAnyDateToIso(v: any): string | null {
  if (!v) return null;
  if (v instanceof Date && Number.isFinite(v.getTime())) return toLocalIsoDate(v);
  const s = String(v).trim();
  if (!s) return null;
  // Already ISO
  const mIso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (mIso) return `${mIso[1]}-${mIso[2]}-${mIso[3]}`;
  // M/D/YYYY or D/M/YYYY (best-effort)
  const mSlash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (mSlash) {
    const a = parseInt(mSlash[1], 10);
    const b = parseInt(mSlash[2], 10);
    const y = parseInt(mSlash[3], 10);
    // If first part > 12 assume D/M/YYYY else assume M/D/YYYY
    const month = a > 12 ? b : a;
    const day = a > 12 ? a : b;
    const d = new Date(y, month - 1, day);
    return Number.isFinite(d.getTime()) ? toLocalIsoDate(d) : null;
  }
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? toLocalIsoDate(d) : null;
}

async function performanceDateExists(dateIso: string): Promise<boolean> {
  try {
    const sheet = await getSheetData('البيانات اليومية', false);
    for (let i = 1; i < sheet.length; i++) {
      const row = sheet[i] || [];
      const iso = normalizeAnyDateToIso(row[0]);
      if (iso === dateIso) return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function syncTerminationDebtsFromPerformanceRows(performanceRows: any[][]) {
  // performanceRows shape: [date, riderCode, hours, break, delay, absence, orders, acceptance, debt]
  const debtByRider = new Map<string, number>();
  for (const r of performanceRows) {
    const code = (r?.[1] ?? '').toString().trim();
    if (!code) continue;
    const debt = safeNum(r?.[8]);
    debtByRider.set(code, debt);
  }
  if (debtByRider.size === 0) return { updated: 0 };

  // Ensure sheet exists (headers include debt as last column)
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
  ]);

  let data: any[][] = [];
  try {
    data = await getSheetData('طلبات_الإقالة', false);
  } catch {
    return { updated: 0 };
  }
  if (!data || data.length <= 1) return { updated: 0 };

  // Best-effort: if header missing debt column, extend header
  const header = data[0] || [];
  if ((header?.[9] ?? '').toString().trim() !== 'المديونية') {
    const newHeader = [...header];
    while (newHeader.length < 9) newHeader.push('');
    if (newHeader.length === 9) newHeader.push('المديونية');
    else newHeader[9] = 'المديونية';
    await updateSheetRow('طلبات_الإقالة', 1, newHeader);
    data[0] = newHeader;
  }

  let updated = 0;
  for (let i = 1; i < data.length; i++) {
    const row = data[i] || [];
    const riderCode = (row[2] ?? '').toString().trim();
    if (!riderCode) continue;
    const nextDebt = debtByRider.get(riderCode);
    if (nextDebt === undefined) continue;
    const curDebt = safeNum(row[9]);
    if (curDebt === nextDebt) continue;
    const updatedRow = [...row];
    while (updatedRow.length < 10) updatedRow.push('');
    updatedRow[9] = nextDebt;
    await updateSheetRow('طلبات_الإقالة', i + 1, updatedRow);
    updated++;
  }
  return { updated };
}

export async function POST(request: NextRequest) {
  try {
    // Get token from header
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '').trim();

    if (!token) {
      console.error('[Upload API] ❌ No token provided');
      return NextResponse.json({ 
        success: false, 
        error: 'غير مصرح - لم يتم توفير رمز المصادقة. يرجى تسجيل الدخول مرة أخرى.' 
      }, { status: 401 });
    }
    
    const decoded = verifyToken(token);
    
    if (!decoded) {
      console.error('[Upload API] ❌ Token verification failed');
      return NextResponse.json({ 
        success: false, 
        error: 'غير مصرح - رمز المصادقة غير صحيح أو منتهي الصلاحية. يرجى تسجيل الدخول مرة أخرى.' 
      }, { status: 401 });
    }

    if (decoded.role !== 'admin') {
      console.error('[Upload API] ❌ Access denied - role:', decoded.role);
      return NextResponse.json({ 
        success: false, 
        error: 'غير مصرح - يجب أن تكون مسجلاً كمدير للوصول إلى هذه الصفحة.' 
      }, { status: 401 });
    }

    // Support both JSON (new method) and FormData (legacy)
    const contentType = request.headers.get('content-type') || '';
    let rawData: any[][];
    let type: string;
    let adminSelectedDate: string | undefined;
    let chunkIndex: number | undefined;
    let totalChunks: number | undefined;
    let isLastChunk: boolean | undefined;

    if (contentType.includes('application/json')) {
      // New method: JSON data (processed on client-side, may be chunked)
      const body = await request.json() as any;
      type = body.type;
      rawData = body.data;
      adminSelectedDate = body.performanceDate;
      chunkIndex = body.chunkIndex;
      totalChunks = body.totalChunks;
      isLastChunk = body.isLastChunk;
      
      if (!type) {
        return NextResponse.json({ success: false, error: 'نوع الملف مطلوب' }, { status: 400 });
      }

      if (!rawData || !Array.isArray(rawData)) {
        return NextResponse.json({ success: false, error: 'بيانات غير صحيحة' }, { status: 400 });
      }

      // Log chunk info if it's a chunked upload
      if (totalChunks && totalChunks > 1) {
        console.log(`[Upload API] Received chunk ${(chunkIndex || 0) + 1}/${totalChunks}: ${rawData.length} rows`);
      } else {
        console.log(`[Upload API] Received JSON data: ${type}, ${rawData.length} rows`);
      }
    } else {
      // Legacy method: FormData with file
      const formData = await request.formData();
      const file = formData.get('file') as File;
      type = formData.get('type') as string;
      adminSelectedDate = formData.get('performanceDate')?.toString();

      if (!file) {
        return NextResponse.json({ success: false, error: 'لم يتم اختيار ملف' }, { status: 400 });
      }

      if (!type) {
        return NextResponse.json({ success: false, error: 'نوع الملف مطلوب' }, { status: 400 });
      }

      // Read Excel file
      const arrayBuffer = await file.arrayBuffer();
      rawData = await readExcelFromBuffer(arrayBuffer);
    }

    if (type === 'riders') {
      // Step 1: Process Excel
      const processed = processRidersExcel(rawData);

      if (!processed.success) {
        return NextResponse.json(
          {
            success: false,
            error: 'أخطاء في معالجة الملف',
            errors: processed.errors,
            warnings: processed.warnings,
          },
          { status: 400 }
        );
      }

      // Step 2: Check for duplicates in the file itself (not conflicts with existing)
      // Note: bulkAddRiders will handle updates and reassignments automatically
      // We only check for duplicates within the same file (same rider code appears twice)
      const { checkDuplicateRiders } = await import('@/lib/excelProcessor');
      const duplicateCheck = await checkDuplicateRiders(processed.data, []); // Empty array to only check file duplicates

      // Only fail if there are duplicates within the file itself
      if (duplicateCheck.duplicates.length > 0) {
        return NextResponse.json(
          {
            success: false,
            error: 'تم العثور على تكرارات في الملف',
            errors: duplicateCheck.duplicates.map(d => `${d}: كود مكرر في نفس الملف`),
            warnings: processed.warnings,
          },
          { status: 400 }
        );
      }

      // Step 3: Write to Google Sheets FIRST
      const ridersToAdd = processed.data.map((r) => ({
        code: r.riderCode,
        name: r.riderName,
        region: r.region,
        supervisorCode: r.supervisorCode,
      }));

      const result = await bulkAddRiders(ridersToAdd);

      // Log summary only
      if (result.errors && result.errors.length > 0) {
        console.error(`[Upload] BulkAdd completed: ${result.added} added, ${result.failed} failed, ${result.errors.length} errors`);
      } else {
        console.log(`[Upload] BulkAdd completed: ${result.added} added`);
      }

      return NextResponse.json({
        success: result.failed === 0 || result.added > 0, // Success if no failures OR some were added
        message: result.added > 0 
          ? `تم تعيين ${result.added} مندوب بنجاح${result.failed > 0 ? ` (فشل ${result.failed})` : ''}` 
          : (result.errors.length > 0 
              ? 'لم تتم إضافة أي مندوب - تحقق من الأخطاء' 
              : 'جميع المناديب موجودون بالفعل'),
        added: result.added || 0,
        failed: result.failed || 0,
        total: processed.data.length,
        warnings: processed.warnings,
        errors: result.errors?.slice(0, 20) || [], // Show first 20 errors
      });
    } else if (type === 'performance') {
      // Step 1: Process Excel
      // IMPORTANT: Performance upload should rely on admin-selected date (not the sheet date)
      // If a valid YYYY-MM-DD is provided, we force it for all rows and skip date validation.
      const processed = processPerformanceExcel(rawData, { forcedDate: adminSelectedDate });

      if (!processed.success) {
        console.error('[Upload] Performance file processing failed:', processed.errors);
        return NextResponse.json(
          {
            success: false,
            error: processed.errors.length > 0 
              ? `أخطاء في معالجة الملف: ${processed.errors.slice(0, 3).join(', ')}${processed.errors.length > 3 ? '...' : ''}`
              : 'أخطاء في معالجة الملف',
            errors: processed.errors,
            warnings: processed.warnings,
          },
          { status: 400 }
        );
      }

      if (processed.data.length === 0) {
        return NextResponse.json(
          {
            success: false,
            error: 'لم يتم العثور على بيانات صحيحة في الملف. تأكد من أن الملف يحتوي على بيانات وأن التاريخ في العمود الأول',
            warnings: processed.warnings,
          },
          { status: 400 }
        );
      }

      // Prevent duplicate upload for the same day (check only on first chunk / single upload)
      const dateIso = (processed.data[0]?.date ?? '').toString().trim();
      const isFirstChunk = chunkIndex === undefined || chunkIndex === 0;
      if (isFirstChunk && dateIso) {
        const exists = await performanceDateExists(dateIso);
        if (exists) {
          return NextResponse.json(
            {
              success: false,
              error: `تم رفع ملف الأداء لهذا التاريخ مسبقاً (${dateIso}). احذف أداء هذا اليوم أولاً ثم أعد الرفع.`,
              code: 'PERFORMANCE_DATE_ALREADY_UPLOADED',
              date: dateIso,
            },
            { status: 409 }
          );
        }
      }

      // Step 2: Write to Google Sheets FIRST
      // Use processed date (already forced to admin-selected date if provided)
      const performanceData = processed.data.map((p) => {
        return [
          p.date, // Date in YYYY-MM-DD format
          p.riderCode,
          p.hours,
          p.break,
          p.delay,
          p.absence,
          p.orders,
          p.acceptance,
          p.debt,
        ];
      });

      // Log summary only (not every row)
      const uploadedDates = new Set(performanceData.map(row => row[0]));
      console.log(`[Upload] Writing ${performanceData.length} rows to Google Sheets. Dates: ${Array.from(uploadedDates).slice(0, 5).join(', ')}${uploadedDates.size > 5 ? '...' : ''}`);

      await appendToSheet('البيانات اليومية', performanceData);

      // Sync "المديونية" into طلبات_الإقالة
      try {
        const syncRes = await syncTerminationDebtsFromPerformanceRows(performanceData);
        console.log(`[Upload] Synced termination debts: updated ${syncRes.updated} rows`);
      } catch (e: any) {
        console.warn('[Upload] Failed to sync termination debts:', e?.message || e);
      }

      // Clear cache and notify supervisors only on last chunk
      if (isLastChunk === true || (!totalChunks || totalChunks === 1)) {
        const { invalidateSupervisorCaches, notifySupervisorsOfChange } = await import('@/lib/realtimeSync');
        invalidateSupervisorCaches(); // Clear all caches to force refresh
        notifySupervisorsOfChange('performance');
      }

      return NextResponse.json({
        success: true,
        message: 'تم رفع بيانات الأداء بنجاح',
        rows: performanceData.length,
        warnings: processed.warnings,
      });
    }

    return NextResponse.json({ success: false, error: 'نوع الملف غير مدعوم' }, { status: 400 });
  } catch (error: any) {
    console.error('Upload error:', error);
    
    // Handle specific errors
    if (error.message?.includes('413') || error.message?.includes('Payload Too Large') || error.message?.includes('body size')) {
      return NextResponse.json({ 
        success: false, 
        error: 'حجم الملف كبير جداً. الحد الأقصى المسموح به هو 4 MB. يرجى تقليل حجم الملف أو تقسيمه إلى ملفات أصغر.' 
      }, { status: 413 });
    }
    
    return NextResponse.json({ success: false, error: error.message || 'حدث خطأ' }, { status: 500 });
  }
}

