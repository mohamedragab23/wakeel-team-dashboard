/**
 * Supervisor → Equipment Manager payment-status / opening-report proposals.
 * Accept updates settlement or creates Opening via createOpeningLiability.
 * No Financial Apply.
 */
import {
  appendToSheet,
  ensureHeaderRow,
  ensureSheetExists,
  getSheetData,
  getSheetDataOrThrow,
  updateSheetRow,
} from '@/lib/googleSheets';
import { appendAuditLog } from '@/lib/auditLog';
import { egpToMilliemes, milliemesToEgp } from '@/lib/money';
import {
  appendLiabilityIssue,
  applySettlementPayment,
  getByDeliveryRowRef,
  getById,
  listIssues,
  listOpenIssues,
  type EquipmentLiabilityIssue,
} from '@/lib/equipmentLiability/store';
import {
  deriveEquipmentPaymentStatus,
  EQUIPMENT_PAYMENT_STATUS_AR,
  type EquipmentPaymentStatus,
} from '@/lib/equipmentLiability/paymentStatus';
import {
  normalizeRiderCodeForPerformance,
  normalizeSupervisorCodeForMatch,
} from '@/lib/dataFilter';
import { getSupervisorRiders } from '@/lib/dataService';
import { sendAdminTelegramNotificationSafe } from '@/lib/adminTelegramNotifier';
import {
  createOpeningLiability,
  defaultOpeningCatalogFromApprovedDefaults,
  openingMigrationKey,
  type OpeningReconciliationInput,
  type OpeningSecurityStatus,
} from '@/lib/equipmentLiability/openingBalance';
import { loadAdminEquipmentPricingFromSheets } from '@/lib/equipmentPricing/loadAdminPricing';

export const SHEET_EQUIPMENT_PAYMENT_PROPOSALS = 'اقتراحات_سداد_المعدات';

export const EQUIPMENT_PAYMENT_PROPOSAL_HEADERS = [
  'proposalId',
  'equipmentIssueId',
  'riderCode',
  'riderName',
  'supervisorCode',
  'supervisorName',
  'proposedPaymentStatus',
  'proposedSettlementPaidEgp',
  'proposedOutstandingNote',
  'status',
  'reviewerCode',
  'reviewerName',
  'reviewerNote',
  'createdAt',
  'reviewedAt',
  'beforeOutstandingMilli',
  'beforeSettlementPaidMilli',
  'afterOutstandingMilli',
  'afterSettlementPaidMilli',
  'proposalKind',
] as const;

export type ProposalWorkflowStatus = 'pending' | 'accepted' | 'rejected' | 'modified_accepted';
export type ProposalKind = 'payment_update' | 'opening_report';

export type EquipmentPaymentProposal = {
  proposalId: string;
  equipmentIssueId: string;
  riderCode: string;
  riderName: string;
  supervisorCode: string;
  supervisorName: string;
  proposedPaymentStatus: EquipmentPaymentStatus;
  proposedSettlementPaidEgp: number | null;
  proposedOutstandingNote: string;
  status: ProposalWorkflowStatus;
  reviewerCode: string;
  reviewerName: string;
  reviewerNote: string;
  createdAt: string;
  reviewedAt: string;
  beforeOutstandingMilli: number;
  beforeSettlementPaidMilli: number;
  afterOutstandingMilli: number | null;
  afterSettlementPaidMilli: number | null;
  proposalKind: ProposalKind;
  sheetRow?: number;
};

export type SupervisorEquipmentDeskRow = {
  riderCode: string;
  riderName: string;
  zone: string;
  hasLiability: boolean;
  equipmentIssueId: string | null;
  status: string;
  paymentStatus: EquipmentPaymentStatus | null;
  paymentStatusAr: string;
  outstandingEgp: number | null;
  amountDeductedEgp: number | null;
  settlementPaidEgp: number | null;
  originalLiabilityEgp: number | null;
};

function cell(row: unknown[], i: number): string {
  return String(row[i] ?? '').trim();
}

function newProposalId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `epp_${crypto.randomUUID()}`;
  }
  return `epp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

async function ensureProposalsSheet(): Promise<void> {
  await ensureSheetExists(SHEET_EQUIPMENT_PAYMENT_PROPOSALS, [
    ...EQUIPMENT_PAYMENT_PROPOSAL_HEADERS,
  ]);
  await ensureHeaderRow(SHEET_EQUIPMENT_PAYMENT_PROPOSALS, [
    ...EQUIPMENT_PAYMENT_PROPOSAL_HEADERS,
  ]);
}

function parseProposalKind(raw: string): ProposalKind {
  return raw === 'opening_report' ? 'opening_report' : 'payment_update';
}

function rowToProposal(row: unknown[], sheetRow: number): EquipmentPaymentProposal | null {
  const proposalId = cell(row, 0);
  if (!proposalId) return null;
  const statusRaw = cell(row, 9) || 'pending';
  const status = (
    ['pending', 'accepted', 'rejected', 'modified_accepted'].includes(statusRaw)
      ? statusRaw
      : 'pending'
  ) as ProposalWorkflowStatus;
  const proposedStatus = cell(row, 6) as EquipmentPaymentStatus;
  const paidEgpRaw = cell(row, 7);
  return {
    proposalId,
    equipmentIssueId: cell(row, 1),
    riderCode: cell(row, 2),
    riderName: cell(row, 3),
    supervisorCode: cell(row, 4),
    supervisorName: cell(row, 5),
    proposedPaymentStatus: (['UNPAID', 'PARTIALLY_PAID', 'PAID'] as string[]).includes(
      proposedStatus
    )
      ? proposedStatus
      : 'UNPAID',
    proposedSettlementPaidEgp: paidEgpRaw === '' ? null : Number(paidEgpRaw),
    proposedOutstandingNote: cell(row, 8),
    status,
    reviewerCode: cell(row, 10),
    reviewerName: cell(row, 11),
    reviewerNote: cell(row, 12),
    createdAt: cell(row, 13),
    reviewedAt: cell(row, 14),
    beforeOutstandingMilli: Math.trunc(Number(cell(row, 15)) || 0),
    beforeSettlementPaidMilli: Math.trunc(Number(cell(row, 16)) || 0),
    afterOutstandingMilli: cell(row, 17) === '' ? null : Math.trunc(Number(cell(row, 17)) || 0),
    afterSettlementPaidMilli:
      cell(row, 18) === '' ? null : Math.trunc(Number(cell(row, 18)) || 0),
    proposalKind: parseProposalKind(cell(row, 19)),
    sheetRow,
  };
}

function proposalToRow(p: EquipmentPaymentProposal): unknown[] {
  return [
    p.proposalId,
    p.equipmentIssueId,
    p.riderCode,
    p.riderName,
    p.supervisorCode,
    p.supervisorName,
    p.proposedPaymentStatus,
    p.proposedSettlementPaidEgp == null ? '' : p.proposedSettlementPaidEgp,
    p.proposedOutstandingNote,
    p.status,
    p.reviewerCode,
    p.reviewerName,
    p.reviewerNote,
    p.createdAt,
    p.reviewedAt,
    p.beforeOutstandingMilli,
    p.beforeSettlementPaidMilli,
    p.afterOutstandingMilli == null ? '' : p.afterOutstandingMilli,
    p.afterSettlementPaidMilli == null ? '' : p.afterSettlementPaidMilli,
    p.proposalKind,
  ];
}

export async function listEquipmentPaymentProposals(filters?: {
  status?: ProposalWorkflowStatus;
  supervisorCode?: string;
}): Promise<EquipmentPaymentProposal[]> {
  await ensureProposalsSheet();
  const data = await getSheetDataOrThrow(SHEET_EQUIPMENT_PAYMENT_PROPOSALS, false);
  const out: EquipmentPaymentProposal[] = [];
  for (let i = 1; i < data.length; i++) {
    const p = rowToProposal(data[i] || [], i + 1);
    if (!p) continue;
    if (filters?.status && p.status !== filters.status) continue;
    if (
      filters?.supervisorCode &&
      normalizeSupervisorCodeForMatch(p.supervisorCode) !==
        normalizeSupervisorCodeForMatch(filters.supervisorCode)
    ) {
      continue;
    }
    out.push(p);
  }
  return out;
}

export function issueToSupervisorView(issue: EquipmentLiabilityIssue) {
  const paymentStatus = deriveEquipmentPaymentStatus({
    settlementPaidMilli: issue.settlementPaidMilli || 0,
    amountDeductedMilli: issue.amountDeductedMilli || 0,
    outstandingMilli: issue.outstandingMilli,
  });
  return {
    equipmentIssueId: issue.equipmentIssueId,
    riderCode: issue.riderCode,
    riderName: issue.riderNameSnapshot,
    zone: issue.zoneSnapshot,
    status: issue.status,
    paymentStatus,
    paymentStatusAr: EQUIPMENT_PAYMENT_STATUS_AR[paymentStatus],
    outstandingEgp: milliemesToEgp(issue.outstandingMilli),
    amountDeductedEgp: milliemesToEgp(issue.amountDeductedMilli),
    settlementPaidEgp: milliemesToEgp(issue.settlementPaidMilli || 0),
    originalLiabilityEgp: milliemesToEgp(issue.originalLiabilityMilli),
    deliveryRowRef: issue.deliveryRowRef,
  };
}

/**
 * Pure roster scope helper — used by list + tests (no Sheets).
 */
export function issueMatchesSupervisorScope(params: {
  riderCode: string;
  supervisorCodeSnapshot: string;
  supervisorCode: string;
  rosterRiderCodes: Iterable<string>;
}): boolean {
  const want = normalizeRiderCodeForPerformance(params.riderCode);
  const roster = new Set(
    [...params.rosterRiderCodes]
      .map((c) => normalizeRiderCodeForPerformance(c))
      .filter(Boolean)
  );
  if (want && roster.size > 0 && roster.has(want)) return true;
  return (
    normalizeSupervisorCodeForMatch(params.supervisorCodeSnapshot) ===
    normalizeSupervisorCodeForMatch(params.supervisorCode)
  );
}

/** @deprecated Prefer listSupervisorEquipmentDesk — kept for callers expecting issues-only. */
export async function listLiabilitiesForSupervisor(
  supervisorCode: string
): Promise<{
  issues: ReturnType<typeof issueToSupervisorView>[];
  rosterRiderCount: number;
}> {
  const riders = await getSupervisorRiders(supervisorCode, false);
  const rosterCodes = riders.map((r) => r.code);
  const all = await listIssues();
  const issues = all
    .filter((i) =>
      issueMatchesSupervisorScope({
        riderCode: i.riderCode,
        supervisorCodeSnapshot: i.supervisorCodeSnapshot,
        supervisorCode,
        rosterRiderCodes: rosterCodes,
      })
    )
    .map(issueToSupervisorView)
    .sort((a, b) => {
      const rank = (p: string) =>
        p === 'UNPAID' ? 0 : p === 'PARTIALLY_PAID' ? 1 : 2;
      const byPay = rank(a.paymentStatus) - rank(b.paymentStatus);
      if (byPay !== 0) return byPay;
      return b.outstandingEgp - a.outstandingEgp;
    });

  return { issues, rosterRiderCount: riders.length };
}

/** Full roster + optional liability join for supervisor desk. */
export async function listSupervisorEquipmentDesk(
  supervisorCode: string
): Promise<{
  rows: SupervisorEquipmentDeskRow[];
  rosterRiderCount: number;
  liabilityCount: number;
}> {
  const riders = await getSupervisorRiders(supervisorCode, false);
  const rosterCodes = riders.map((r) => r.code);
  const all = await listIssues();
  const byRider = new Map<string, EquipmentLiabilityIssue>();
  for (const issue of all) {
    if (
      !issueMatchesSupervisorScope({
        riderCode: issue.riderCode,
        supervisorCodeSnapshot: issue.supervisorCodeSnapshot,
        supervisorCode,
        rosterRiderCodes: rosterCodes,
      })
    ) {
      continue;
    }
    const key = normalizeRiderCodeForPerformance(issue.riderCode);
    const prev = byRider.get(key);
    if (!prev || (issue.status === 'open' && prev.status !== 'open')) {
      byRider.set(key, issue);
    }
  }

  const rows: SupervisorEquipmentDeskRow[] = riders.map((r) => {
    const issue = byRider.get(normalizeRiderCodeForPerformance(r.code));
    if (!issue) {
      return {
        riderCode: r.code,
        riderName: r.name,
        zone: r.region || '',
        hasLiability: false,
        equipmentIssueId: null,
        status: 'لا توجد عهدة',
        paymentStatus: null,
        paymentStatusAr: '—',
        outstandingEgp: null,
        amountDeductedEgp: null,
        settlementPaidEgp: null,
        originalLiabilityEgp: null,
      };
    }
    const view = issueToSupervisorView(issue);
    return {
      riderCode: r.code,
      riderName: r.name || view.riderName,
      zone: r.region || view.zone,
      hasLiability: true,
      equipmentIssueId: view.equipmentIssueId,
      status: view.status,
      paymentStatus: view.paymentStatus,
      paymentStatusAr: view.paymentStatusAr,
      outstandingEgp: view.outstandingEgp,
      amountDeductedEgp: view.amountDeductedEgp,
      settlementPaidEgp: view.settlementPaidEgp,
      originalLiabilityEgp: view.originalLiabilityEgp,
    };
  });

  rows.sort((a, b) => {
    if (a.hasLiability !== b.hasLiability) return a.hasLiability ? -1 : 1;
    const rank = (p: EquipmentPaymentStatus | null) =>
      p === 'UNPAID' ? 0 : p === 'PARTIALLY_PAID' ? 1 : p === 'PAID' ? 2 : 3;
    const byPay = rank(a.paymentStatus) - rank(b.paymentStatus);
    if (byPay !== 0) return byPay;
    return (b.outstandingEgp ?? 0) - (a.outstandingEgp ?? 0);
  });

  return {
    rows,
    rosterRiderCount: riders.length,
    liabilityCount: rows.filter((r) => r.hasLiability).length,
  };
}

async function supervisorOwnsRider(
  supervisorCode: string,
  riderCode: string
): Promise<boolean> {
  const riders = await getSupervisorRiders(supervisorCode, false);
  const want = normalizeRiderCodeForPerformance(riderCode);
  if (!want) return false;
  return riders.some((r) => normalizeRiderCodeForPerformance(r.code) === want);
}

export async function createEquipmentPaymentProposal(input: {
  proposalKind?: ProposalKind;
  equipmentIssueId?: string;
  riderCode?: string;
  riderName?: string;
  proposedPaymentStatus: EquipmentPaymentStatus;
  proposedSettlementPaidEgp?: number | null;
  proposedOutstandingNote?: string;
  supervisorCode: string;
  supervisorName: string;
}): Promise<
  | { ok: true; proposal: EquipmentPaymentProposal }
  | { ok: false; error: string }
> {
  const kind: ProposalKind =
    input.proposalKind === 'opening_report' ? 'opening_report' : 'payment_update';

  let equipmentIssueId = '';
  let riderCode = '';
  let riderName = '';
  let beforeOutstanding = 0;
  let beforeSettlement = 0;

  if (kind === 'payment_update') {
    equipmentIssueId = String(input.equipmentIssueId || '').trim();
    if (!equipmentIssueId) return { ok: false, error: 'معرّف العهدة مطلوب' };
    const issue = await getById(equipmentIssueId);
    if (!issue) return { ok: false, error: 'عهدة المعدات غير موجودة' };
    const owns = await supervisorOwnsRider(input.supervisorCode, issue.riderCode);
    if (!owns) {
      if (
        normalizeSupervisorCodeForMatch(issue.supervisorCodeSnapshot) !==
        normalizeSupervisorCodeForMatch(input.supervisorCode)
      ) {
        return { ok: false, error: 'هذه العهدة ليست ضمن طياريك' };
      }
    }
    riderCode = issue.riderCode;
    riderName = issue.riderNameSnapshot;
    beforeOutstanding = issue.outstandingMilli;
    beforeSettlement = issue.settlementPaidMilli || 0;
  } else {
    riderCode = String(input.riderCode || '').trim();
    riderName = String(input.riderName || '').trim();
    if (!riderCode) return { ok: false, error: 'كود المندوب مطلوب' };
    const owns = await supervisorOwnsRider(input.supervisorCode, riderCode);
    if (!owns) return { ok: false, error: 'المندوب غير تابع لك' };
    const existing = await listIssues({ riderCode });
    if (existing.some((i) => i.status === 'open')) {
      return {
        ok: false,
        error: 'المندوب لديه عهدة مفتوحة — استخدم اقتراح تحديث السداد',
      };
    }
  }

  const proposal: EquipmentPaymentProposal = {
    proposalId: newProposalId(),
    equipmentIssueId,
    riderCode,
    riderName,
    supervisorCode: input.supervisorCode,
    supervisorName: input.supervisorName,
    proposedPaymentStatus: input.proposedPaymentStatus,
    proposedSettlementPaidEgp:
      input.proposedSettlementPaidEgp == null ||
      !Number.isFinite(Number(input.proposedSettlementPaidEgp))
        ? null
        : Number(input.proposedSettlementPaidEgp),
    proposedOutstandingNote: String(input.proposedOutstandingNote || '').trim(),
    status: 'pending',
    reviewerCode: '',
    reviewerName: '',
    reviewerNote: '',
    createdAt: new Date().toISOString(),
    reviewedAt: '',
    beforeOutstandingMilli: beforeOutstanding,
    beforeSettlementPaidMilli: beforeSettlement,
    afterOutstandingMilli: null,
    afterSettlementPaidMilli: null,
    proposalKind: kind,
  };

  await ensureProposalsSheet();
  const ok = await appendToSheet(
    SHEET_EQUIPMENT_PAYMENT_PROPOSALS,
    [proposalToRow(proposal)],
    false
  );
  if (!ok) return { ok: false, error: 'فشل حفظ الاقتراح' };

  void appendAuditLog({
    domain: 'equipment',
    action:
      kind === 'opening_report'
        ? 'equipment_opening_report_proposed'
        : 'equipment_payment_proposal_created',
    entityType: 'equipment_payment_proposal',
    entityCode: proposal.proposalId,
    actorCode: input.supervisorCode,
    actorName: input.supervisorName,
    after: {
      proposalKind: kind,
      equipmentIssueId: proposal.equipmentIssueId,
      riderCode: proposal.riderCode,
      proposedPaymentStatus: proposal.proposedPaymentStatus,
    },
  }).catch(() => undefined);

  void sendAdminTelegramNotificationSafe({
    type: 'system_alert',
    alertTitle:
      kind === 'opening_report'
        ? 'اقتراح فتح عهدة معدات من مشرف'
        : 'اقتراح سداد معدات من مشرف',
    alertMessage: `${input.supervisorName} (${input.supervisorCode}) — مندوب ${proposal.riderCode}: ${EQUIPMENT_PAYMENT_STATUS_AR[proposal.proposedPaymentStatus]}`,
    supervisorName: input.supervisorName,
    supervisorCode: input.supervisorCode,
    riderCode: proposal.riderCode,
    riderName: proposal.riderName,
  }).catch(() => undefined);

  return { ok: true, proposal };
}

export type OpeningAcceptFields = {
  motorcycleBagHeld: boolean;
  bicycleBagHeld: boolean;
  tshirtQuantity: number;
  jacketQuantity: number;
  helmetQuantity: number;
  securityStatus: OpeningSecurityStatus;
  historicalPaidEgp: number;
  operatorConfirmation: boolean;
  zoneSnapshot?: string;
};

async function loadOpeningCatalog() {
  const loaded = await loadAdminEquipmentPricingFromSheets();
  if (loaded.ok) {
    return {
      motorcycleBagMilli: loaded.pricing.motorcycleBagMilli,
      bicycleBagMilli: loaded.pricing.bicycleBagMilli,
      shirtMilli: loaded.pricing.shirtMilli,
      securityFeeMilli: loaded.pricing.securityFeeMilli,
      jacketMilli: loaded.pricing.jacketMilli,
      helmetMilli: loaded.pricing.helmetMilli,
    };
  }
  return defaultOpeningCatalogFromApprovedDefaults();
}

async function acceptOpeningReport(
  proposal: EquipmentPaymentProposal,
  input: {
    reviewerCode: string;
    reviewerName: string;
    reviewerNote: string;
    opening: OpeningAcceptFields;
    action: 'accept' | 'modify_accept';
  }
): Promise<
  | { ok: true; proposal: EquipmentPaymentProposal; issue: EquipmentLiabilityIssue }
  | { ok: false; error: string }
> {
  if (!input.opening?.operatorConfirmation) {
    return { ok: false, error: 'يلزم تأكيد مسؤول المعدات لإنشاء العهدة' };
  }

  const historicalPaidMilli = egpToMilliemes(
    Number.isFinite(input.opening.historicalPaidEgp)
      ? input.opening.historicalPaidEgp
      : proposal.proposedSettlementPaidEgp ?? 0
  );

  const openingInput: OpeningReconciliationInput = {
    riderCode: proposal.riderCode,
    motorcycleBagHeld: Boolean(input.opening.motorcycleBagHeld),
    bicycleBagHeld: Boolean(input.opening.bicycleBagHeld),
    tshirtQuantity: Math.trunc(Number(input.opening.tshirtQuantity) || 0),
    jacketQuantity: Math.trunc(Number(input.opening.jacketQuantity) || 0),
    helmetQuantity: Math.trunc(Number(input.opening.helmetQuantity) || 0),
    securityStatus: input.opening.securityStatus,
    historicalPaidMilli,
    operatorConfirmation: true,
    notes: [proposal.proposedOutstandingNote, input.reviewerNote]
      .filter(Boolean)
      .join(' | '),
    riderNameSnapshot: proposal.riderName,
    zoneSnapshot: String(input.opening.zoneSnapshot || '').trim(),
    supervisorCodeSnapshot: proposal.supervisorCode,
    supervisorNameSnapshot: proposal.supervisorName,
    actorCode: input.reviewerCode,
    actorName: input.reviewerName,
  };

  const liveData = await getSheetData('المناديب', false);
  const liveSet = new Set<string>();
  for (let i = 1; i < liveData.length; i++) {
    const code = normalizeRiderCodeForPerformance(String(liveData[i]?.[0] ?? ''));
    if (code) liveSet.add(code);
  }

  const catalog = await loadOpeningCatalog();
  const created = await createOpeningLiability(
    openingInput,
    catalog,
    {
      liveRiderExists: (rc) => liveSet.has(normalizeRiderCodeForPerformance(rc)),
      findByMigrationKey: async (key) => getByDeliveryRowRef(key),
      hasOpenAssignmentLiability: async (rc) => {
        const open = await listOpenIssues();
        const want = normalizeRiderCodeForPerformance(rc);
        return open.some((i) => normalizeRiderCodeForPerformance(i.riderCode) === want);
      },
      persistIssue: appendLiabilityIssue,
    },
    { persist: true, fromEquipmentManagerProposal: true }
  );

  if (!created.ok) {
    return { ok: false, error: created.error || created.code || 'فشل إنشاء العهدة' };
  }

  const now = new Date().toISOString();
  const updated: EquipmentPaymentProposal = {
    ...proposal,
    equipmentIssueId: created.issue.equipmentIssueId,
    status: input.action === 'modify_accept' ? 'modified_accepted' : 'accepted',
    reviewerCode: input.reviewerCode,
    reviewerName: input.reviewerName,
    reviewerNote: input.reviewerNote,
    reviewedAt: now,
    afterOutstandingMilli: created.issue.outstandingMilli,
    afterSettlementPaidMilli: created.issue.settlementPaidMilli || 0,
    proposedSettlementPaidEgp: milliemesToEgp(created.issue.settlementPaidMilli || 0),
  };
  await updateSheetRow(
    SHEET_EQUIPMENT_PAYMENT_PROPOSALS,
    proposal.sheetRow!,
    proposalToRow(updated)
  );

  void appendAuditLog({
    domain: 'equipment',
    action: 'equipment_opening_report_accepted',
    entityType: 'equipment_payment_proposal',
    entityCode: proposal.proposalId,
    actorCode: input.reviewerCode,
    actorName: input.reviewerName,
    after: {
      equipmentIssueId: created.issue.equipmentIssueId,
      riderCode: created.issue.riderCode,
      outstandingMilli: created.issue.outstandingMilli,
      mode: created.mode,
      migrationKey: openingMigrationKey(created.issue.riderCode),
    },
  }).catch(() => undefined);

  return { ok: true, proposal: updated, issue: created.issue };
}

/**
 * Accept / modify-accept / reject.
 * opening_report → create Opening (EQ fields required).
 * payment_update → settlement apply path.
 */
export async function reviewEquipmentPaymentProposal(input: {
  proposalId: string;
  action: 'accept' | 'reject' | 'modify_accept';
  reviewerCode: string;
  reviewerName: string;
  reviewerNote?: string;
  modifiedSettlementPaidEgp?: number | null;
  modifiedPaymentStatus?: EquipmentPaymentStatus | null;
  opening?: OpeningAcceptFields;
}): Promise<
  | { ok: true; proposal: EquipmentPaymentProposal; issue?: EquipmentLiabilityIssue }
  | { ok: false; error: string }
> {
  const all = await listEquipmentPaymentProposals();
  const proposal = all.find((p) => p.proposalId === input.proposalId);
  if (!proposal || !proposal.sheetRow) {
    return { ok: false, error: 'الاقتراح غير موجود' };
  }
  if (proposal.status !== 'pending') {
    return { ok: false, error: 'تم مراجعة هذا الاقتراح مسبقاً' };
  }

  const now = new Date().toISOString();
  const note = String(input.reviewerNote || '').trim();

  if (input.action === 'reject') {
    const updated: EquipmentPaymentProposal = {
      ...proposal,
      status: 'rejected',
      reviewerCode: input.reviewerCode,
      reviewerName: input.reviewerName,
      reviewerNote: note,
      reviewedAt: now,
    };
    await updateSheetRow(
      SHEET_EQUIPMENT_PAYMENT_PROPOSALS,
      proposal.sheetRow,
      proposalToRow(updated)
    );
    void appendAuditLog({
      domain: 'equipment',
      action: 'equipment_payment_proposal_rejected',
      entityType: 'equipment_payment_proposal',
      entityCode: proposal.proposalId,
      actorCode: input.reviewerCode,
      actorName: input.reviewerName,
      before: { status: 'pending' },
      after: { status: 'rejected', note, proposalKind: proposal.proposalKind },
    }).catch(() => undefined);
    return { ok: true, proposal: updated };
  }

  if (proposal.proposalKind === 'opening_report') {
    if (!input.opening) {
      return {
        ok: false,
        error: 'قبول فتح العهدة يتطلب بيانات المعدات (شنطة/تيشرت/جاكيت/خوذة/استعلام أمني/مدفوع تاريخي)',
      };
    }
    return acceptOpeningReport(proposal, {
      reviewerCode: input.reviewerCode,
      reviewerName: input.reviewerName,
      reviewerNote: note,
      opening: input.opening,
      action: input.action,
    });
  }

  const issue = await getById(proposal.equipmentIssueId);
  if (!issue) return { ok: false, error: 'عهدة المعدات غير موجودة' };
  if (issue.status !== 'open') {
    return { ok: false, error: 'العهدة ليست مفتوحة — لا يمكن تطبيق سداد' };
  }

  const targetStatus =
    input.action === 'modify_accept' && input.modifiedPaymentStatus
      ? input.modifiedPaymentStatus
      : proposal.proposedPaymentStatus;

  let settlementTargetEgp =
    input.action === 'modify_accept' && input.modifiedSettlementPaidEgp != null
      ? Number(input.modifiedSettlementPaidEgp)
      : proposal.proposedSettlementPaidEgp;

  if (targetStatus === 'PAID' && (settlementTargetEgp == null || !Number.isFinite(settlementTargetEgp))) {
    settlementTargetEgp = milliemesToEgp(issue.outstandingMilli + (issue.settlementPaidMilli || 0));
  }
  if (targetStatus === 'UNPAID') {
    const updated: EquipmentPaymentProposal = {
      ...proposal,
      status: input.action === 'modify_accept' ? 'modified_accepted' : 'accepted',
      proposedPaymentStatus: targetStatus,
      reviewerCode: input.reviewerCode,
      reviewerName: input.reviewerName,
      reviewerNote: note || 'تم الاعتماد بدون تغيير أرصدة (لم يدفع)',
      reviewedAt: now,
      afterOutstandingMilli: issue.outstandingMilli,
      afterSettlementPaidMilli: issue.settlementPaidMilli || 0,
    };
    await updateSheetRow(
      SHEET_EQUIPMENT_PAYMENT_PROPOSALS,
      proposal.sheetRow,
      proposalToRow(updated)
    );
    return { ok: true, proposal: updated, issue };
  }

  if (settlementTargetEgp == null || !Number.isFinite(settlementTargetEgp) || settlementTargetEgp < 0) {
    return { ok: false, error: 'مبلغ السداد المقترح مطلوب للتطبيق' };
  }

  const targetPaidMilli = egpToMilliemes(settlementTargetEgp);
  const currentPaid = issue.settlementPaidMilli || 0;
  const delta = targetPaidMilli - currentPaid;
  if (delta < 0) {
    return {
      ok: false,
      error: 'تخفيض مبلغ السداد المسجّل غير مدعوم من هذا المسار — راجع مكتب العهدة',
    };
  }
  if (delta === 0) {
    const updated: EquipmentPaymentProposal = {
      ...proposal,
      status: input.action === 'modify_accept' ? 'modified_accepted' : 'accepted',
      proposedPaymentStatus: targetStatus,
      proposedSettlementPaidEgp: settlementTargetEgp,
      reviewerCode: input.reviewerCode,
      reviewerName: input.reviewerName,
      reviewerNote: note || 'لا تغيير — المبلغ مطابق',
      reviewedAt: now,
      afterOutstandingMilli: issue.outstandingMilli,
      afterSettlementPaidMilli: currentPaid,
    };
    await updateSheetRow(
      SHEET_EQUIPMENT_PAYMENT_PROPOSALS,
      proposal.sheetRow,
      proposalToRow(updated)
    );
    return { ok: true, proposal: updated, issue };
  }

  const applied = await applySettlementPayment(issue.equipmentIssueId, delta, {
    code: input.reviewerCode,
    name: input.reviewerName,
  });
  if (!applied.ok) {
    return { ok: false, error: applied.error };
  }

  const updated: EquipmentPaymentProposal = {
    ...proposal,
    status: input.action === 'modify_accept' ? 'modified_accepted' : 'accepted',
    proposedPaymentStatus: targetStatus,
    proposedSettlementPaidEgp: settlementTargetEgp,
    reviewerCode: input.reviewerCode,
    reviewerName: input.reviewerName,
    reviewerNote: note,
    reviewedAt: now,
    afterOutstandingMilli: applied.issue.outstandingMilli,
    afterSettlementPaidMilli: applied.issue.settlementPaidMilli || 0,
  };
  await updateSheetRow(
    SHEET_EQUIPMENT_PAYMENT_PROPOSALS,
    proposal.sheetRow,
    proposalToRow(updated)
  );

  void appendAuditLog({
    domain: 'equipment',
    action: 'equipment_payment_proposal_accepted',
    entityType: 'equipment_payment_proposal',
    entityCode: proposal.proposalId,
    actorCode: input.reviewerCode,
    actorName: input.reviewerName,
    before: {
      outstandingMilli: proposal.beforeOutstandingMilli,
      settlementPaidMilli: proposal.beforeSettlementPaidMilli,
    },
    after: {
      outstandingMilli: updated.afterOutstandingMilli,
      settlementPaidMilli: updated.afterSettlementPaidMilli,
      status: updated.status,
    },
  }).catch(() => undefined);

  return { ok: true, proposal: updated, issue: applied.issue };
}
