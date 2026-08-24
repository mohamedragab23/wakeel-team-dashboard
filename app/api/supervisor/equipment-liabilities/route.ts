import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { isEquipmentLedgerEnabled, SRS014_FLAG_OFF_BODY } from '@/lib/srs014Flags';
import { listSupervisorEquipmentDesk } from '@/lib/equipmentLiability/paymentProposals';
import { buildFreshDeclarationQueue } from '@/lib/equipmentDeductions/exceptionQueues';
import { listIssues } from '@/lib/equipmentLiability/store';
import { getSheetData } from '@/lib/googleSheets';
import { listPayoutCycles } from '@/lib/payoutCycles/store';
import {
  cycleLabelForPayout,
  monthLabelForPayout,
} from '@/lib/equipmentDeductions/operationalEngine';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const token = extractBearerToken(request);
  if (!token) return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
  const decoded = verifyToken(token) as { role?: string; code?: string } | null;
  if (!decoded || decoded.role !== 'supervisor') {
    return NextResponse.json({ success: false, error: 'غير مصرح — للمشرفين فقط' }, { status: 401 });
  }
  if (!isEquipmentLedgerEnabled()) {
    return NextResponse.json(SRS014_FLAG_OFF_BODY, { status: 503 });
  }

  try {
    const supervisorCode = decoded.code || '';
    const desk = await listSupervisorEquipmentDesk(supervisorCode);

    // Enrich with W1/W2 evidence from full declaration-queue builder (READ-ONLY).
    let evidenceByRider = new Map<
      string,
      ReturnType<typeof buildFreshDeclarationQueue>[number]
    >();
    try {
      const cycles = await listPayoutCycles({ year: 2026, month: 8 });
      const ordered = [...cycles]
        .filter((c) => !c.isClosing)
        .sort((a, b) => a.startDate.localeCompare(b.startDate));
      const evidenceCycles = ordered.slice(0, 2).map((c) => ({
        cycleLabel: cycleLabelForPayout(c),
        monthLabel: monthLabelForPayout(c),
        year: c.year,
      }));
      const [liabilities, requestRows, actualRows] = await Promise.all([
        listIssues({}),
        getSheetData('الاستقطاعات', false),
        getSheetData('الاستقطاعات_الفعلية', false),
      ]);
      const queue = buildFreshDeclarationQueue({
        roster: desk.rows.map((r) => ({
          riderCode: r.riderCode,
          riderName: r.riderName,
          supervisorCode,
        })),
        liabilities,
        requestRows: requestRows || [],
        actualRows: actualRows || [],
        evidenceCycles,
        supervisorCode,
      });
      evidenceByRider = new Map(
        queue.map((q) => [String(q.riderCode).replace(/\s+/g, ''), q] as const)
      );
    } catch {
      /* evidence enrichment best-effort */
    }

    const rows = desk.rows.map((r) => {
      const ev = evidenceByRider.get(String(r.riderCode).replace(/\s+/g, ''));
      return {
        ...r,
        securityPaidUpfront: ev?.securityPaidUpfront ?? null,
        w1RequestEgp: ev?.w1?.requestEgp ?? null,
        w1RawWalletEgp: ev?.w1?.rawWalletEgp ?? null,
        w1ActualEgp: ev?.w1?.actualAbsEgp ?? null,
        w2RequestEgp: ev?.w2?.requestEgp ?? null,
        w2RawWalletEgp: ev?.w2?.rawWalletEgp ?? null,
        w2ActualEgp: ev?.w2?.actualAbsEgp ?? null,
        sheetActualTotalEgp:
          ev?.w1 || ev?.w2
            ? (ev?.w1?.actualAbsEgp || 0) + (ev?.w2?.actualAbsEgp || 0)
            : null,
        warnings: ev?.warnings || (r.hasLiability ? [] : ['MISSING_LIABILITY_NEEDS_SUPERVISOR_REVIEW']),
        needsFreshDeclaration: true,
      };
    });

    return NextResponse.json({
      success: true,
      rows,
      rosterRiderCount: desk.rosterRiderCount,
      liabilityCount: desk.liabilityCount,
      declarationQueueCount: rows.length,
      message:
        'الإفادة النهائية عن حالة سداد عهدة المندوب — ابدأ من الصفر. حفظ الإقرار لا يعدّل الرصيد تلقائياً.',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'حدث خطأ';
    console.error('[supervisor/equipment-liabilities GET]', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
