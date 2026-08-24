import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { assertAdminApiAccess } from '@/lib/adminApiAccess';
import {
  buildEquipmentDryRunPreview,
  cycleLabelForPayout,
  monthLabelForPayout,
} from '@/lib/equipmentDeductions/operationalEngine';
import {
  buildMissingLiabilityQueue,
  buildSheetVsLedgerQueue,
  buildFreshDeclarationQueue,
} from '@/lib/equipmentDeductions/exceptionQueues';
import { listSupervisorEquipmentDeclarations } from '@/lib/equipmentDeductions/supervisorDeclarations';
import { getSheetData } from '@/lib/googleSheets';
import { listIssues } from '@/lib/equipmentLiability/store';
import { listPayoutCycles } from '@/lib/payoutCycles/store';
import { getAllAssignedRiders } from '@/lib/dataService';
import { milliemesToEgp } from '@/lib/money';
import { isSrs014FinancialApplyEnabled } from '@/lib/srs014Flags';

export const dynamic = 'force-dynamic';

/** READ-ONLY next-cycle equipment dry-run + calibrated exception queues. */
export async function GET(request: NextRequest) {
  const token = extractBearerToken(request);
  if (!token) {
    return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
  }
  const decoded = verifyToken(token);
  const access = await assertAdminApiAccess(decoded, 'equipment_liability');
  if (access) return access;

  try {
    const { searchParams } = new URL(request.url);
    const year = Number(searchParams.get('year') || 2026);
    const month = Number(searchParams.get('month') || 8);
    const cycleId = String(searchParams.get('cycleId') || '').trim();

    const cycles = await listPayoutCycles({ year, month });
    const ordered = [...cycles].sort((a, b) => a.startDate.localeCompare(b.startDate));
    const nonClosing = ordered.filter((c) => !c.isClosing);
    const target =
      (cycleId && ordered.find((c) => c.cycleId === cycleId)) ||
      nonClosing.find((c) => c.status === 'active') ||
      nonClosing.slice(-1)[0] ||
      null;
    if (!target) {
      return NextResponse.json({ success: false, error: 'لا توجد دورة هدف' }, { status: 404 });
    }

    const prior = nonClosing.filter(
      (c) => c.cycleId !== target.cycleId && c.startDate < target.startDate
    );
    const evidenceCycles = nonClosing.slice(0, 2).map((c) => ({
      cycleLabel: cycleLabelForPayout(c),
      monthLabel: monthLabelForPayout(c),
      year: c.year,
      cycleId: c.cycleId,
    }));

    const [liabilities, declarations, requestRows, actualRows, rosterRiders] =
      await Promise.all([
        listIssues({}),
        listSupervisorEquipmentDeclarations({ cycleId: target.cycleId }).catch(() => []),
        getSheetData('الاستقطاعات', false),
        getSheetData('الاستقطاعات_الفعلية', false),
        getAllAssignedRiders(false),
      ]);

    const roster = rosterRiders.map((r) => ({
      riderCode: r.code,
      riderName: r.name,
      supervisorCode: r.supervisorCode,
    }));

    const preview = buildEquipmentDryRunPreview({
      targetCycle: target,
      priorCycles: prior,
      liabilities,
      declarations,
      requestRows: requestRows || [],
      actualRows: actualRows || [],
      roster,
      evidenceCycles,
    });

    const missingLiability = buildMissingLiabilityQueue({
      roster,
      liabilities,
      requestRows: requestRows || [],
      actualRows: actualRows || [],
      evidenceCycles,
    });
    const sheetVsLedger = buildSheetVsLedgerQueue({
      liabilities,
      requestRows: requestRows || [],
      actualRows: actualRows || [],
      evidenceCycles,
    });
    const declarationQueue = buildFreshDeclarationQueue({
      roster,
      liabilities,
      requestRows: requestRows || [],
      actualRows: actualRows || [],
      evidenceCycles,
    });

    return NextResponse.json({
      success: true,
      mode: 'READ_ONLY_DRY_RUN',
      financialApplyEnabled: isSrs014FinancialApplyEnabled(),
      preview: {
        cycle: preview.cycle,
        summary: preview.summary,
        summaryEgp: {
          greenCount: preview.summary.greenCount,
          redCount: preview.summary.redCount,
          yellowCount: preview.summary.yellowCount,
          totalEquipmentBaseEgp: milliemesToEgp(preview.summary.totalEquipmentBaseMilli),
          totalCarryForwardEgp: milliemesToEgp(preview.summary.totalCarryForwardMilli),
          totalEquipmentRequestEgp: milliemesToEgp(
            preview.summary.totalEquipmentRequestMilli
          ),
          totalManualV2Egp: milliemesToEgp(preview.summary.totalManualV2Milli),
          totalCombinedRequestEgp: milliemesToEgp(
            preview.summary.totalCombinedRequestMilli
          ),
          ridersWithDeductions: preview.summary.ridersWithDeductions,
        },
        manualV2: {
          rowsIncluded: preview.manualV2Analysis.stats.includedCount,
          totalEgp: preview.manualV2Analysis.manualV2TotalEgp,
          byReason: preview.manualV2Analysis.manualV2ByReason,
          bySupervisor: preview.manualV2Analysis.manualV2BySupervisor,
          excludedCount: preview.manualV2Analysis.stats.excludedCount,
          excludedSample: preview.manualV2Analysis.manualV2ExcludedRows.slice(0, 50),
          includedSample: preview.manualV2Analysis.manualV2RowsIncluded.slice(0, 50),
        },
      },
      exceptionQueues: {
        missingLiabilityCount: missingLiability.length,
        sheetVsLedgerCount: sheetVsLedger.length,
        missingLiability: missingLiability.slice(0, 100),
        sheetVsLedger: sheetVsLedger.slice(0, 100),
      },
      declarationQueue: {
        total: declarationQueue.length,
        sample: declarationQueue.slice(0, 50),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'حدث خطأ';
    console.error('[admin/equipment-dry-run-preview GET]', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
