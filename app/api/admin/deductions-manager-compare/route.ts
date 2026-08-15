/**
 * SRS-014 Manager Compare path (SAFE):
 * Excel → compare → persisted evidence → optional allocation foundation.
 *
 * NEVER enables financial apply / wallet / ledger mutation.
 * Legacy `/api/admin/deductions-reconcile` remains available unchanged.
 */

import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { assertAdminApiAccess } from '@/lib/adminFeatureAccess';
import { adminHasPermission } from '@/lib/adminPermissions';
import {
  DEDUCTION_CYCLE_LABELS,
  type DeductionCycleKey,
} from '@/lib/equipmentSheetConstants';
import { aggregateAdminByRider, parseAdminExcelRows, periodFromForm } from '@/lib/deductionsReconcile';
import { createSheetsEvidenceApplyStore } from '@/lib/equipmentDeductions/evidenceApplySheets';
import { runManagerCompareOrchestration } from '@/lib/equipmentDeductions/managerCompareOrchestration';
import {
  createSheetsObligationLedgerStore,
  listPersistedObligations,
} from '@/lib/equipmentDeductions/requestPersistence';
import {
  appendToSheet,
  ensureHeaderRow,
  ensureSheetExists,
  getSheetDataOrThrow,
  updateSheetRow,
} from '@/lib/googleSheets';
import { isSrs014FinancialApplyEnabled } from '@/lib/srs014Flags';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CYCLE_KEYS = new Set<string>(Object.keys(DEDUCTION_CYCLE_LABELS));

export async function POST(request: NextRequest) {
  try {
    const token = extractBearerToken(request);
    if (!token) {
      return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
    }
    const decoded = verifyToken(token);
    if (!decoded || decoded.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'المديرون فقط' }, { status: 401 });
    }

    const dr = assertAdminApiAccess(decoded, 'deductions_reconcile');
    if (dr) return dr;
    if (!adminHasPermission(decoded, 'deductions_verify')) {
      return NextResponse.json(
        {
          success: false,
          error:
            'لا تملك صلاحية مقارنة الاستقطاعات. أضف: deductions_verify أو استقطاعات_ادمن',
        },
        { status: 403 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ success: false, error: 'لم يتم إرفاق ملف' }, { status: 400 });
    }

    const cycleRaw = (formData.get('deductionCycle') ?? '').toString().trim();
    if (!CYCLE_KEYS.has(cycleRaw)) {
      return NextResponse.json({ success: false, error: 'حدد دورة الاستقطاع' }, { status: 400 });
    }
    const cycleKey = cycleRaw as DeductionCycleKey;

    const monthNum = parseInt((formData.get('month') ?? '').toString().trim(), 10);
    const yearNum = parseInt((formData.get('year') ?? '').toString().trim(), 10);
    if (Number.isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      return NextResponse.json({ success: false, error: 'حدد الشهر' }, { status: 400 });
    }
    if (Number.isNaN(yearNum) || yearNum < 2020 || yearNum > 2100) {
      return NextResponse.json({ success: false, error: 'حدد السنة' }, { status: 400 });
    }

    const completeCycleConfirmed =
      String(formData.get('completeCycleConfirmed') || '').toLowerCase() === 'true' ||
      String(formData.get('completeCycleConfirmed') || '') === '1';
    const runAllocation =
      String(formData.get('runAllocation') || '').toLowerCase() === 'true' ||
      String(formData.get('runAllocation') || '') === '1';
    const payoutCycleId = String(formData.get('payoutCycleId') || '').trim();

    const { cycleLabel, monthLabel, yearNum: y } = periodFromForm(cycleKey, monthNum, yearNum);

    const buf = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buf, { type: 'buffer', cellDates: true });
    const firstSheet = workbook.SheetNames[0];
    if (!firstSheet) {
      return NextResponse.json({ success: false, error: 'الملف فارغ' }, { status: 400 });
    }
    const sheet = workbook.Sheets[firstSheet];
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    const { rows: adminRows, errors: parseErrors } = parseAdminExcelRows(json);
    if (adminRows.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'لم يُستورد أي صف صالح من شيت المدير',
          details: parseErrors.slice(0, 25),
        },
        { status: 400 }
      );
    }

    const admMap = aggregateAdminByRider(adminRows);
    const adminWalletByRiderEgp = new Map<string, number>();
    for (const [riderId, agg] of admMap) {
      adminWalletByRiderEgp.set(riderId, agg.walletSum);
    }

    const obligationStore = await createSheetsObligationLedgerStore({
      ensureSheetExists,
      ensureHeaderRow,
      getSheetDataOrThrow,
      appendToSheet,
      updateSheetRow,
    });
    const persisted = await listPersistedObligations(obligationStore);
    // Scope: open obligations for this calendar year (cycle labels are Arabic).
    // Prefer matching currentCycleId / originalCycleId when payoutCycleId provided.
    const obligations = persisted
      .map((r) => r.obligation)
      .filter((o) => {
        if (o.status === 'cancelled' || o.status === 'replaced') return false;
        if (payoutCycleId) {
          return (
            o.currentCycleId === payoutCycleId || o.originalCycleId === payoutCycleId
          );
        }
        return true;
      });

    const evidenceStore = await createSheetsEvidenceApplyStore();
    const result = await runManagerCompareOrchestration({
      evidenceStore,
      cycleScope: {
        cycleId: payoutCycleId || undefined,
        cycleLabel,
        monthLabel,
        year: y,
      },
      adminWalletByRiderEgp,
      obligations,
      completeCycleConfirmed,
      runAllocation,
      actor: {
        code: String((decoded as { code?: string }).code || 'admin'),
        name: String((decoded as { name?: string }).name || 'admin'),
      },
      decoded,
      parseErrorCount: parseErrors.length,
    });

    return NextResponse.json({
      success: true,
      path: 'srs014-manager-compare',
      financialApplyEnabled: isSrs014FinancialApplyEnabled(),
      financialMutation: false,
      message:
        'مقارنة SRS-014: Evidence/Allocation فقط — لا خصم مالي (Financial Apply مقفول).',
      dualGateOk: result.dualGateOk,
      fileValidationStatus: result.compare.fileValidationStatus,
      completeCycleConfirmed: result.compare.completeCycleConfirmed,
      evidenceIdentityKey: result.compare.evidenceIdentityKey,
      reconcileBatchId: result.compare.reconcileBatchId,
      allocationReady: result.compare.allocationReady,
      evidencePersisted: result.evidencePersisted,
      evidenceOutcome: result.evidenceOutcome,
      allocationOutcome: result.allocationOutcome,
      allocatedTotalMilli: result.allocatedTotalMilli,
      surplusMilli: result.surplusMilli,
      anomalyActualExceedsRequested: result.anomalyActualExceedsRequested,
      lineCount: result.compare.lines.length,
      linesPreview: result.compare.lines.slice(0, 50).map((l) => ({
        riderCode: l.riderCode,
        requestedMilli: l.requestedMilli,
        remainingMilli: l.remainingMilli,
        actualMilli: l.actualMilli,
        deltaMilli: l.deltaMilli,
      })),
      parseWarnings: parseErrors.length ? parseErrors.slice(0, 20) : undefined,
      financialSideEffects: result.financialSideEffects,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[deductions-manager-compare]', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
