/**
 * Admin Opening Balance / Equipment Reconciliation (FLOW A).
 * GET list + POST preview | persist (pilot allowlist only).
 */
import { NextRequest, NextResponse } from 'next/server';
import { extractBearerToken } from '@/lib/requestAuth';
import { verifyToken } from '@/lib/auth';
import { assertAdminApiAccess } from '@/lib/adminFeatureAccess';
import { getSheetData } from '@/lib/googleSheets';
import {
  appendLiabilityIssue,
  getByDeliveryRowRef,
  listIssues,
} from '@/lib/equipmentLiability/store';
import { openingMigrationKey } from '@/lib/equipmentLiability/openingBalance';
import {
  buildOpeningPreview,
  formToOpeningInput,
  isOpeningMigrationIssue,
  parseLiveRidersFromSheet,
  resolveReconciliationStatus,
  riderOpeningDiagnostic,
  type OpeningPreviewFormInput,
} from '@/lib/equipmentLiability/openingReconciliationUi';
import { defaultOpeningCatalogFromApprovedDefaults } from '@/lib/equipmentLiability/openingBalance';
import {
  isRiderOnOpeningPilotAllowlist,
  isSrs014OpeningBalanceWriteEnabled,
  parseOpeningPilotAllowlist,
  runControlledOpeningPilotPersist,
} from '@/lib/equipmentLiability/openingPilot';
import { assertConfirmOpeningProductionWrite } from '@/lib/equipmentLiability/openingPilotAllowlist';
import { loadAdminEquipmentPricingFromSheets } from '@/lib/equipmentPricing/loadAdminPricing';
import {
  isAutoEquipmentDeductionsEnabled,
  isSrs014FinancialApplyEnabled,
} from '@/lib/srs014Flags';
import { normalizeRiderCodeForPerformance } from '@/lib/riderCodeUtils';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function loadCatalogMilli() {
  const loaded = await loadAdminEquipmentPricingFromSheets();
  if (loaded.ok) {
    return {
      motorcycleBagMilli: loaded.pricing.motorcycleBagMilli,
      bicycleBagMilli: loaded.pricing.bicycleBagMilli,
      shirtMilli: loaded.pricing.shirtMilli,
      securityFeeMilli: loaded.pricing.securityFeeMilli,
      jacketMilli: loaded.pricing.jacketMilli,
      helmetMilli: loaded.pricing.helmetMilli,
      source: 'admin_sheet' as const,
    };
  }
  return {
    ...defaultOpeningCatalogFromApprovedDefaults(),
    source: 'approved_defaults_reference' as const,
  };
}

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
  const access = assertAdminApiAccess(decoded, 'equipment_liability');
  if (access) return { error: access };
  return { decoded };
}

function safetyFlags() {
  return {
    financialApplyEnabled: isSrs014FinancialApplyEnabled(),
    autoRequestEnabled: isAutoEquipmentDeductionsEnabled(),
    openingBalanceWriteEnabled: isSrs014OpeningBalanceWriteEnabled(),
    pilotAllowlist: parseOpeningPilotAllowlist(),
    productionWritesEnabled: isSrs014OpeningBalanceWriteEnabled(),
  };
}

export async function GET(request: NextRequest) {
  const a = auth(request);
  if ('error' in a && a.error) return a.error;

  try {
    const liveData = await getSheetData('المناديب', false);
    const riders = parseLiveRidersFromSheet(liveData);
    let issues: Awaited<ReturnType<typeof listIssues>> = [];
    try {
      issues = await listIssues({});
    } catch {
      issues = [];
    }

    const openingByRider = new Map<string, (typeof issues)[0]>();
    const openOtherByRider = new Set<string>();
    for (const issue of issues) {
      const code = normalizeRiderCodeForPerformance(issue.riderCode);
      if (!code) continue;
      if (isOpeningMigrationIssue(issue)) {
        if (!openingByRider.has(code)) openingByRider.set(code, issue);
      } else if (issue.status === 'open') {
        openOtherByRider.add(code);
      }
    }

    const q = (request.nextUrl.searchParams.get('q') || '').trim().toLowerCase();
    const focus = normalizeRiderCodeForPerformance(
      request.nextUrl.searchParams.get('riderCode') || ''
    );

    const rows = riders
      .filter((r) => {
        if (focus && r.riderCode !== focus) return false;
        if (!q) return true;
        return (
          r.riderCode.includes(q) ||
          r.name.toLowerCase().includes(q) ||
          r.zone.toLowerCase().includes(q) ||
          r.supervisorCode.toLowerCase().includes(q)
        );
      })
      .map((r) => {
        const opening = openingByRider.get(r.riderCode) || null;
        const hasOtherOpen = openOtherByRider.has(r.riderCode);
        const reconciliationStatus = resolveReconciliationStatus({
          rider: r,
          openingIssue: opening,
          hasOtherOpenLiability: hasOtherOpen,
        });
        return {
          ...r,
          reconciliationStatus,
          migrationKey: openingMigrationKey(r.riderCode),
          openingIssueId: opening?.equipmentIssueId || null,
          openingOutstandingMilli: opening?.outstandingMilli ?? null,
          identityReady: true,
          reconciliationDataComplete: false,
          candidateRequired: false,
          onPilotAllowlist: isRiderOnOpeningPilotAllowlist(r.riderCode),
        };
      });

    const diagnostic4811093 = riderOpeningDiagnostic({
      riderCode: '4811093',
      liveRiderExists: riders.some((r) => r.riderCode === '4811093'),
      openingIssue: openingByRider.get('4811093') || null,
    });

    return NextResponse.json({
      success: true,
      mode: 'READ_ONLY_LIST',
      ...safetyFlags(),
      flow: 'FLOW_A_OPENING_BALANCE',
      count: rows.length,
      riders: rows,
      diagnostic4811093: {
        ...diagnostic4811093,
        openingLiability: openingByRider.has('4811093') ? 'EXISTS' : 'NONE',
      },
      note: 'Persist requires write flag + pilot allowlist + explicit POST action=persist. FA/Auto REQUEST remain OFF.',
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'فشل تحميل المناديب';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const a = auth(request);
  if ('error' in a && a.error) return a.error;
  const actor = a.decoded!;

  try {
    const body = (await request.json()) as OpeningPreviewFormInput & {
      action?: string;
      confirmPersist?: boolean;
      CONFIRM_OPENING_PRODUCTION_WRITE?: string | boolean;
    };
    const action = body.action || 'preview';

    if (action !== 'preview' && action !== 'persist') {
      return NextResponse.json(
        { success: false, error: 'إجراء غير معروف', code: 'UNKNOWN_ACTION' },
        { status: 400 }
      );
    }

    const catalogBundle = await loadCatalogMilli();
    const { source: catalogSource, ...catalog } = catalogBundle;
    const preview = buildOpeningPreview(body, catalog);
    if (!preview.ok) {
      return NextResponse.json(
        { success: false, code: preview.code, error: preview.error },
        { status: 400 }
      );
    }

    let issues: Awaited<ReturnType<typeof listIssues>> = [];
    try {
      issues = await listIssues({});
    } catch {
      issues = [];
    }
    const code = normalizeRiderCodeForPerformance(body.riderCode);
    const existingOpening = issues.find(
      (i) =>
        normalizeRiderCodeForPerformance(i.riderCode) === code && isOpeningMigrationIssue(i)
    );
    const otherOpen = issues.find(
      (i) =>
        normalizeRiderCodeForPerformance(i.riderCode) === code &&
        i.status === 'open' &&
        !isOpeningMigrationIssue(i)
    );

    if (action === 'preview') {
      if (existingOpening) {
        return NextResponse.json({
          success: true,
          mode: 'DRY_RUN_PREVIEW',
          alreadyMigrated: true,
          preview,
          catalogSource,
          blockPersist: true,
          message: 'المندوب مُرحَّل بالفعل (OPENING) — لا يُسمح بإنشاء Opening جديد',
          existingOpeningIssueId: existingOpening.equipmentIssueId,
          ...safetyFlags(),
          productionWrite: false,
        });
      }
      if (otherOpen) {
        return NextResponse.json(
          {
            success: false,
            code: 'OPEN_LIABILITY_EXISTS',
            error: 'توجد عهدة مفتوحة أخرى للمندوب — حالة CONFLICT',
            mode: 'DRY_RUN_PREVIEW',
            preview,
            productionWrite: false,
            ...safetyFlags(),
          },
          { status: 409 }
        );
      }

      return NextResponse.json({
        success: true,
        mode: 'DRY_RUN_PREVIEW',
        alreadyMigrated: false,
        preview,
        catalogSource,
        catalogReferenceEgp: {
          motorcycleBag: catalog.motorcycleBagMilli / 100,
          bicycleBag: catalog.bicycleBagMilli / 100,
          shirt: catalog.shirtMilli / 100,
          security: catalog.securityFeeMilli / 100,
          jacket: catalog.jacketMilli / 100,
          helmet: catalog.helmetMilli / 100,
        },
        persistAllowed:
          isSrs014OpeningBalanceWriteEnabled() &&
          parseOpeningPilotAllowlist().length === 1 &&
          isRiderOnOpeningPilotAllowlist(body.riderCode),
        onPilotAllowlist: isRiderOnOpeningPilotAllowlist(body.riderCode),
        pilotAllowlistExactOne: parseOpeningPilotAllowlist().length === 1,
        ...safetyFlags(),
        productionWrite: false,
        note: 'Preview only unless action=persist with confirmPersist + allowlist.',
      });
    }

    // ---- persist (pilot) ----
    if (!code) {
      return NextResponse.json(
        {
          success: false,
          code: 'RIDER_CODE_MISSING',
          error: 'riderCode مطلوب — STOP بدون كتابة',
          ...safetyFlags(),
        },
        { status: 400 }
      );
    }
    if (body.confirmPersist !== true) {
      return NextResponse.json(
        {
          success: false,
          code: 'CONFIRM_PERSIST_REQUIRED',
          error: 'يلزم confirmPersist=true بعد معاينة صريحة',
          ...safetyFlags(),
        },
        { status: 400 }
      );
    }
    const confirmWrite = assertConfirmOpeningProductionWrite(
      body.CONFIRM_OPENING_PRODUCTION_WRITE
    );
    if (!confirmWrite.ok) {
      return NextResponse.json(
        {
          success: false,
          code: confirmWrite.code,
          error: confirmWrite.error,
          ...safetyFlags(),
          productionOpeningLiabilitiesCreated: 0,
        },
        { status: 400 }
      );
    }
    if (code === '4811093') {
      return NextResponse.json(
        {
          success: false,
          code: 'DIAGNOSTIC_RIDER_BLOCKED',
          error: '4811093 للقراءة فقط',
          ...safetyFlags(),
        },
        { status: 403 }
      );
    }

    const mapped = formToOpeningInput(body);
    if ('ok' in mapped && mapped.ok === false) {
      return NextResponse.json(
        { success: false, code: mapped.code, error: mapped.error },
        { status: 400 }
      );
    }

    const input = {
      ...(mapped as Exclude<ReturnType<typeof formToOpeningInput>, { ok: false }>),
      actorCode: actor.code || 'admin',
      actorName: actor.name || 'admin',
    };

    const liveData = await getSheetData('المناديب', false);
    const liveRiders = parseLiveRidersFromSheet(liveData);
    const liveSet = new Set(liveRiders.map((r) => r.riderCode));

    const result = await runControlledOpeningPilotPersist(input, catalog, {
      liveRiderExists: (rc) => liveSet.has(normalizeRiderCodeForPerformance(rc)),
      findByMigrationKey: async (key) => getByDeliveryRowRef(key),
      hasOpenAssignmentLiability: async (rc) => {
        const norm = normalizeRiderCodeForPerformance(rc);
        const all = await listIssues({});
        return all.some(
          (i) =>
            normalizeRiderCodeForPerformance(i.riderCode) === norm &&
            i.status === 'open' &&
            !isOpeningMigrationIssue(i)
        );
      },
      persistIssue: appendLiabilityIssue,
      countByMigrationKey: async (key) => {
        const all = await listIssues({});
        return all.filter((i) => String(i.deliveryRowRef || '') === key).length;
      },
    });

    if (!result.ok) {
      const status =
        result.code === 'CONCURRENT_WRITE_BUSY'
          ? 409
          : result.code === 'OPEN_LIABILITY_EXISTS'
            ? 409
            : result.code === 'RIDER_NOT_ON_PILOT_ALLOWLIST' ||
                result.code === 'DIAGNOSTIC_RIDER_BLOCKED' ||
                result.code === 'PRODUCTION_WRITE_DISABLED' ||
                result.code === 'PILOT_ALLOWLIST_EMPTY'
              ? 403
              : 400;
      return NextResponse.json(
        {
          success: false,
          code: result.code,
          error: result.error,
          busy: result.busy || false,
          ...safetyFlags(),
          walletMutations: 0,
          financialLedgerMutations: 0,
        },
        { status }
      );
    }

    return NextResponse.json({
      success: true,
      mode: 'PERSISTED',
      created: result.created,
      duplicateAttempt: result.duplicateAttempt,
      issue: result.issue,
      verification: result.verification,
      expectedDryRun: result.expectedDryRun,
      auditAction: result.auditAction,
      preview,
      catalogSource,
      financialSideEffects: result.financialSideEffects,
      ...safetyFlags(),
      walletMutations: 0,
      financialLedgerMutations: 0,
      firstFinancialTransaction: 'NOT_EXECUTED',
      note: 'Opening Liability persisted (FLOW A). FA / Auto REQUEST / payroll untouched.',
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'فشل العملية';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
