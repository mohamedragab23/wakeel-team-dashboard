/**
 * POST multipart Talabat Wallet/Salaries Excel → Actual reconcile + next-cycle REQUEST.
 * ACTUAL = Applaied Deduction on Wallet only. FA / wallet exec / ledger OFF.
 */
import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { assertAdminApiAccess } from '@/lib/adminFeatureAccess';
import {
  appendToSheet,
  ensureHeaderRow,
  ensureSheetExists,
  getSheetDataOrThrow,
  updateSheetRow,
} from '@/lib/googleSheets';
import { createSheetsActualReconcileStore } from '@/lib/equipmentDeductions/actualReconcileStore';
import {
  computeWalletFileBatchId,
  pickNextEligibleCycle,
  runTalabatWalletReconcileBatch,
} from '@/lib/equipmentDeductions/talabatWalletReconcile';
import { TALABAT_WALLET_SOURCE_COLUMNS } from '@/lib/equipmentDeductions/talabatWalletSource';
import { createSheetsObligationLedgerStore } from '@/lib/equipmentDeductions/requestPersistence';
import { getById, listOpenIssues, updateBalance } from '@/lib/equipmentLiability/store';
import { listPayoutCycles } from '@/lib/payoutCycles/store';
import {
  isAutoEquipmentDeductionsEnabled,
  isSrs014FinancialApplyEnabled,
} from '@/lib/srs014Flags';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function auth(request: NextRequest) {
  const token = extractBearerToken(request);
  if (!token) {
    return { error: NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 }) };
  }
  const decoded = verifyToken(token) as {
    role?: string;
    permissions?: string;
    code?: string;
    name?: string;
  } | null;
  const access = await assertAdminApiAccess(decoded, 'equipment_liability');
  if (access) return { error: access };
  return { decoded };
}

export async function GET() {
  return NextResponse.json({
    success: true,
    sourceColumns: TALABAT_WALLET_SOURCE_COLUMNS,
    mapping: {
      REQUESTED_AMOUNT: TALABAT_WALLET_SOURCE_COLUMNS.requested,
      ACTUAL_AMOUNT: TALABAT_WALLET_SOURCE_COLUMNS.actual,
      internalActualField: 'actualWalletDeductionMilli',
    },
    safety: {
      financialApplyEnabled: isSrs014FinancialApplyEnabled(),
      autoRequestEnabled: isAutoEquipmentDeductionsEnabled(),
      walletMutationsByUs: false,
      ledgerMoneyMutations: false,
      payrollExecution: false,
    },
  });
}

export async function POST(request: NextRequest) {
  const a = auth(request);
  if ('error' in a && a.error) return a.error;
  const decoded = a.decoded!;

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ success: false, error: 'لم يُرفق ملف المحفظة' }, { status: 400 });
    }

    const cycleId = String(formData.get('cycleId') || '').trim();
    if (!cycleId) {
      return NextResponse.json({ success: false, error: 'cycleId مطلوب' }, { status: 400 });
    }

    const operatorConfirmation =
      String(formData.get('operatorConfirmation') || '').toLowerCase() === 'true' ||
      String(formData.get('operatorConfirmation') || '') === '1';
    if (!operatorConfirmation) {
      return NextResponse.json(
        { success: false, error: 'يلزم تأكيد أن الملف نتيجة Talabat فعلية' },
        { status: 400 }
      );
    }

    const actualDeductionDate = String(
      formData.get('actualDeductionDate') || new Date().toISOString().slice(0, 10)
    );

    const buf = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buf, { type: 'buffer', cellDates: true });
    const firstSheet = workbook.SheetNames[0];
    if (!firstSheet) {
      return NextResponse.json({ success: false, error: 'الملف فارغ' }, { status: 400 });
    }
    const sheet = workbook.Sheets[firstSheet];
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

    const cycles = await listPayoutCycles();
    const walletCycle = cycles.find((c) => c.cycleId === cycleId);
    if (!walletCycle) {
      return NextResponse.json({ success: false, error: 'الدورة غير موجودة' }, { status: 400 });
    }
    const nextCycle = pickNextEligibleCycle(cycles, walletCycle);

    const obligationStore = await createSheetsObligationLedgerStore({
      ensureSheetExists,
      ensureHeaderRow,
      getSheetDataOrThrow,
      appendToSheet,
      updateSheetRow,
    });
    const actualStore = await createSheetsActualReconcileStore({
      ensureSheetExists,
      ensureHeaderRow,
      getSheetDataOrThrow,
      appendToSheet,
    });

    const batchId = computeWalletFileBatchId({ cycleId, fileBytes: buf });

    const result = await runTalabatWalletReconcileBatch(
      json,
      {
        obligationStore,
        getLiabilityById: getById,
        updateLiabilityBalance: updateBalance,
        findByIdempotencyKey: (key) => actualStore.findByIdempotencyKey(key),
        persistReconcileRecord: (record) => actualStore.append(record),
        listOpenLiabilities: listOpenIssues,
        findBatchById: async (id) => {
          const hit = await actualStore.findByIdempotencyKey(id);
          return Boolean(hit);
        },
        persistBatchId: async (id) => {
          await actualStore.append({
            reconcileId: `batch_${Date.now()}`,
            idempotencyKey: id,
            deductionId: '__wallet_batch__',
            equipmentIssueId: '',
            riderCode: '',
            cycleId,
            requestedAmountMilli: 0,
            actualDeductedMilli: 0,
            previousOutstandingMilli: 0,
            newOutstandingMilli: 0,
            amountDeductedDelta: 0,
            talabatReference: id,
            actualDeductionDate,
            actorCode: String(decoded?.code || 'admin'),
            actorName: String(decoded?.name || 'admin'),
            createdAt: new Date().toISOString(),
            notes: 'wallet_file_batch_marker',
            status: 'APPLIED',
          });
        },
        allCycles: cycles,
        walletCycle,
        nextCycle,
        actor: {
          code: String(decoded?.code || 'admin'),
          name: String(decoded?.name || 'admin'),
        },
        actualDeductionDate,
        operatorConfirmation: true,
      },
      { batchId }
    );

    return NextResponse.json({
      success: result.ok || result.duplicateBatch || result.applied.length > 0,
      ...result,
      nextCycleId: nextCycle?.cycleId ?? null,
      message: result.duplicateBatch
        ? 'ملف مكرر — لم يُطبَّق مرة أخرى'
        : `طُبّق ${result.applied.length} · استثناءات ${result.exceptions.length} · طلبات الدورة التالية ${result.nextCyclePrep.filter((n) => n.outcome === 'created' || n.outcome === 'queued').length}`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        success: false,
        error: msg,
        safety: {
          financialApplyEnabled: isSrs014FinancialApplyEnabled(),
          walletMutationsByUs: false,
          ledgerMoneyMutations: false,
          payrollExecution: false,
        },
      },
      { status: 500 }
    );
  }
}
