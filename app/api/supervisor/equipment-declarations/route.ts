import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import {
  createSupervisorEquipmentDeclaration,
  mapUiStatusToSupervisor,
} from '@/lib/equipmentDeductions/supervisorDeclarations';
import { listPayoutCycles } from '@/lib/payoutCycles/store';
import {
  assertRiderOnSupervisorRosterFromBundle,
  findLiabilityInBundle,
  findPayoutCycleInCacheOrBundle,
  invalidateAfterSupervisorDeclarationSave,
  loadSupervisorDeclarationSheetsBundle,
} from '@/lib/equipmentDeductions/supervisorDeclarationHydration';
import {
  isSheetsQuotaError,
  toSafeSheetsUserError,
} from '@/lib/googleSheetsBatchRead';

export const dynamic = 'force-dynamic';

/**
 * Save authoritative supervisor declaration.
 * Does NOT mutate liability unless body.applyToLiability === true (admin/controlled path).
 * Prefers short-TTL batch cache for cycle + ACL + liability — avoids cold multi-sheet reload.
 */
export async function POST(request: NextRequest) {
  const token = extractBearerToken(request);
  if (!token) {
    return NextResponse.json({ success: false, error: 'غير مصرح' }, { status: 401 });
  }
  const decoded = verifyToken(token) as {
    role?: string;
    code?: string;
    name?: string;
  } | null;
  if (!decoded || decoded.role !== 'supervisor') {
    return NextResponse.json({ success: false, error: 'المشرفون فقط' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const cycleId = String(body.cycleId || '').trim();
    if (!cycleId) {
      return NextResponse.json({ success: false, error: 'حدد دورة القبض' }, { status: 400 });
    }

    const supervisorCode = decoded.code || '';
    let bundle = null as Awaited<
      ReturnType<typeof loadSupervisorDeclarationSheetsBundle>
    >['bundle'] | null;
    try {
      const loaded = await loadSupervisorDeclarationSheetsBundle();
      bundle = loaded.bundle;
    } catch {
      bundle = null;
    }

    let cycle = findPayoutCycleInCacheOrBundle(cycleId, bundle || undefined);
    if (!cycle) {
      const cycles = await listPayoutCycles({});
      cycle = cycles.find((c) => c.cycleId === cycleId) || null;
    }
    if (!cycle) {
      return NextResponse.json({ success: false, error: 'دورة القبض غير موجودة' }, { status: 404 });
    }

    const uiStatus = String(body.paymentStatus || 'UNPAID').trim() as
      | 'UNPAID'
      | 'PARTIALLY_PAID'
      | 'PAID';

    const missingOutcomeRaw = String(body.missingLiabilityOutcome || '').trim();
    const missingLiabilityOutcome =
      missingOutcomeRaw === 'OWES' ||
      missingOutcomeRaw === 'PARTIAL' ||
      missingOutcomeRaw === 'FULLY_PAID' ||
      missingOutcomeRaw === 'NO_EQUIPMENT' ||
      missingOutcomeRaw === 'DATA_ERROR'
        ? missingOutcomeRaw
        : null;

    const riderCode = String(body.riderCode || '').trim();
    const equipmentIssueId = String(body.equipmentIssueId || '').trim() || undefined;

    let preloaded:
      | {
          riderOnRoster: boolean;
          originalLiabilityMilli: number;
          equipmentIssueId?: string;
          missingLiability: boolean;
          skipPriorDeclarationLookup: true;
        }
      | undefined;

    if (bundle) {
      const onRoster = assertRiderOnSupervisorRosterFromBundle({
        bundle,
        supervisorCode,
        riderCode,
      });
      const issue = findLiabilityInBundle(bundle, equipmentIssueId, riderCode);
      preloaded = {
        riderOnRoster: onRoster,
        originalLiabilityMilli: issue?.originalLiabilityMilli ?? 0,
        equipmentIssueId: issue?.equipmentIssueId || equipmentIssueId,
        missingLiability: !issue,
        skipPriorDeclarationLookup: true,
      };
    }

    const result = await createSupervisorEquipmentDeclaration({
      riderCode,
      riderName: String(body.riderName || '').trim(),
      supervisorCode,
      supervisorName: decoded.name || decoded.code || '',
      cycle,
      paymentStatus: mapUiStatusToSupervisor(uiStatus),
      declaredPaidEgp:
        body.declaredPaidEgp == null || body.declaredPaidEgp === ''
          ? null
          : Number(body.declaredPaidEgp),
      notes: String(body.notes || '').trim(),
      equipmentIssueId,
      applyToLiability: body.applyToLiability === true,
      missingLiabilityOutcome,
      preloaded,
    });

    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    invalidateAfterSupervisorDeclarationSave();

    return NextResponse.json({
      success: true,
      declaration: result.declaration,
      liabilityMutated: result.liabilityMutated,
      declaredPaidMilli: result.declaration.declaredPaidMilli,
      declaredPaidEgp: result.declaration.declaredPaidMilli / 1000,
      message: result.liabilityMutated
        ? 'تم حفظ الإقرار وتطبيق التسوية على العهدة'
        : 'تم حفظ الإفادة النهائية (بدون تعديل رصيد العهدة تلقائياً)',
    });
  } catch (error: unknown) {
    const safe = toSafeSheetsUserError(error);
    console.error('[supervisor/equipment-declarations POST]', {
      quota: isSheetsQuotaError(error),
      message: error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200),
    });
    return NextResponse.json(
      { success: false, error: safe },
      { status: isSheetsQuotaError(error) ? 503 : 500 }
    );
  }
}
