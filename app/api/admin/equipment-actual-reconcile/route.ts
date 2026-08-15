/**
 * Admin API — record Actual Talabat payroll deduction against equipment REQUEST.
 * Updates liability amountDeducted / outstanding only. No Financial Apply / wallet / ledger.
 */
import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { assertAdminApiAccess } from '@/lib/adminApiAccess';
import {
  appendToSheet,
  ensureHeaderRow,
  ensureSheetExists,
  getSheetDataOrThrow,
  updateSheetRow,
} from '@/lib/googleSheets';
import { reconcileActualPayrollDeduction } from '@/lib/equipmentDeductions/actualPayrollReconcile';
import { createSheetsActualReconcileStore } from '@/lib/equipmentDeductions/actualReconcileStore';
import {
  createSheetsObligationLedgerStore,
  findPersistedByDeductionId,
  listPersistedObligations,
} from '@/lib/equipmentDeductions/requestPersistence';
import {
  buildEquipmentRequestExportRow,
  equipmentRequestExportCsvHeader,
  equipmentRequestExportRowToCsv,
} from '@/lib/equipmentDeductions/requestExportView';
import { getById, updateBalance } from '@/lib/equipmentLiability/store';
import {
  isAutoEquipmentDeductionsEnabled,
  isSrs014FinancialApplyEnabled,
} from '@/lib/srs014Flags';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function auth(request: NextRequest) {
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

function safetyFlags() {
  return {
    financialApplyEnabled: isSrs014FinancialApplyEnabled(),
    autoRequestEnabled: isAutoEquipmentDeductionsEnabled(),
    walletMutations: false,
    ledgerMoneyMutations: false,
    payrollExecution: false,
  };
}

async function buildDeps() {
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
  return {
    obligationStore,
    actualStore,
    deps: {
      obligationStore,
      getLiabilityById: getById,
      updateLiabilityBalance: updateBalance,
      findByIdempotencyKey: (key: string) => actualStore.findByIdempotencyKey(key),
      persistReconcileRecord: (record: Parameters<typeof actualStore.append>[0]) =>
        actualStore.append(record),
    },
  };
}

/** GET — export REQUEST vs ACTUAL rows (CSV or JSON). */
export async function GET(request: NextRequest) {
  const a = await auth(request);
  if ('error' in a && a.error) return a.error;

  try {
    const { obligationStore, actualStore } = await buildDeps();
    const persisted = await listPersistedObligations(obligationStore);
    const equipmentOnly = persisted.filter(
      (p) => p.obligation.reason === 'معدات' && p.obligation.equipmentIssueId
    );
    const rows = [];
    for (const p of equipmentOnly) {
      const actual = await actualStore.findLatestByDeductionId(p.obligation.deductionId);
      const issue = p.obligation.equipmentIssueId
        ? await getById(p.obligation.equipmentIssueId)
        : null;
      rows.push(
        buildEquipmentRequestExportRow({
          obligation: p.obligation,
          issue,
          riderName: issue?.riderNameSnapshot,
          requestDate: String(p.row[0] ?? ''),
          actual,
          outstandingBeforeMilli: actual?.previousOutstandingMilli ?? issue?.outstandingMilli,
        })
      );
    }

    const format = (request.nextUrl.searchParams.get('format') || 'json').toLowerCase();
    if (format === 'csv') {
      const lines = [
        equipmentRequestExportCsvHeader(),
        ...rows.map((r) => equipmentRequestExportRowToCsv(r)),
      ];
      return new NextResponse(lines.join('\n'), {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="equipment-request-actual-export.csv"',
        },
      });
    }

    return NextResponse.json({
      success: true,
      safety: safetyFlags(),
      columns: [
        'requestedAmount',
        'actualDeductedAmount',
        'requestStatus',
        'actualStatus',
      ],
      rows,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg, safety: safetyFlags() }, { status: 500 });
  }
}

/** POST — apply Actual payroll reconcile (liability only). */
export async function POST(request: NextRequest) {
  const a = await auth(request);
  if ('error' in a && a.error) return a.error;
  const decoded = a.decoded!;

  try {
    const body = (await request.json()) as {
      deductionId?: string;
      actualDeductedMilli?: number;
      /** EGP convenience — converted to milli if milli not provided. */
      actualDeductedEgp?: number;
      actualDeductionDate?: string;
      talabatReference?: string;
      evidenceNote?: string;
      operatorConfirmation?: boolean;
    };

    const actualMilli =
      body.actualDeductedMilli != null
        ? Number(body.actualDeductedMilli)
        : body.actualDeductedEgp != null
          ? Math.round(Number(body.actualDeductedEgp) * 100)
          : NaN;

    const { obligationStore, deps } = await buildDeps();
    const existing = body.deductionId
      ? await findPersistedByDeductionId(obligationStore, body.deductionId)
      : null;

    const result = await reconcileActualPayrollDeduction(
      {
        deductionId: String(body.deductionId || ''),
        actualDeductedMilli: actualMilli,
        actualDeductionDate: String(body.actualDeductionDate || new Date().toISOString().slice(0, 10)),
        talabatReference: String(body.talabatReference || ''),
        evidenceNote: body.evidenceNote,
        operatorConfirmation: body.operatorConfirmation === true,
        actorCode: String(decoded?.code || 'admin'),
        actorName: String(decoded?.name || 'admin'),
      },
      deps
    );

    if (!result.ok) {
      return NextResponse.json(
        {
          success: false,
          code: result.code,
          error: result.error,
          safety: safetyFlags(),
          requestedAmountImmutable: existing?.obligation.originalAmount ?? null,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      created: result.created,
      duplicate: result.duplicate,
      record: result.record,
      obligation: {
        deductionId: result.obligation.deductionId,
        requestedAmountMilli: result.obligation.originalAmount,
        paidAmountMilli: result.obligation.paidAmount,
        remainingAmountMilli: result.obligation.remainingAmount,
        status: result.obligation.status,
      },
      liability: {
        equipmentIssueId: result.issue.equipmentIssueId,
        outstandingMilli: result.issue.outstandingMilli,
        amountDeductedMilli: result.issue.amountDeductedMilli,
        settlementPaidMilli: result.issue.settlementPaidMilli,
        status: result.issue.status,
      },
      financialSideEffects: result.financialSideEffects,
      safety: safetyFlags(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg, safety: safetyFlags() }, { status: 500 });
  }
}
