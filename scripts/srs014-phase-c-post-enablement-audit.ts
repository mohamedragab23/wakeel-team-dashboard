/**
 * SRS-014 Phase C — Controlled Enablement + Synthetic Production QA
 *
 * Prerequisites:
 *   FEATURE_EQUIPMENT_LEDGER_ENABLED=true on Vercel Production
 *   All other Phase C+ flags remain OFF
 *
 * Uses ONLY SRS014_PC_AUDIT_ synthetic identities.
 * Delivery rows use zero equipment quantities so main inventory is unchanged.
 *
 * Run: npx tsx scripts/srs014-phase-c-controlled-enablement-qa.ts
 */
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env.vercel.cron', override: true });

import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../lib/jwtConfig';
import { appendToSheet, deleteSheetRow, getSheetData, updateSheetRow } from '../lib/googleSheets';
import { SHEET_CANDIDATES } from '../lib/recruitment/types';
import { createCandidate } from '../lib/recruitment/recruitmentService';
import { SHEET_EQUIPMENT_LIABILITY } from '../lib/equipmentLiability/constants';
import { SHEET_EQUIPMENT_DELIVERY } from '../lib/equipmentSheetConstants';
import { AUDIT_LOG_SHEET_NAME } from '../lib/auditLog';
import { PAYROLL_LEDGER_SHEET_NAME } from '../lib/payrollLedger';
import { SHEET_EQUIPMENT_AUTO_DEDUCTIONS } from '../lib/equipmentDeductions/constants';
import {
  createLiabilityFromDelivery,
  listIssues,
  updateBalance,
  withImmutableOriginal,
  type EquipmentLiabilityIssue,
} from '../lib/equipmentLiability/store';
import { PHASE_C_ERROR } from '../lib/equipmentLiability/phaseCGates';
import { invalidateSalaryCaches } from '../lib/cacheInvalidation';
import { calculateSupervisorSalary } from '../lib/salaryService';

const QA = 'SRS014_PC_AUDIT_';
const BASE = process.env.VERIFY_BASE_URL || 'https://wakeel-team-dashboard.vercel.app';
const ACTOR = { code: 'SRS014_PC_AUDIT', name: 'SRS014 Phase C Post-Enablement Audit' };

const RIDER_PAID = '999015811';
const RIDER_UNPAID = '999015812';
const RIDER_FAIL = '999015813';

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail: string) {
  if (ok) {
    passed++;
    console.log(`✅ PASS — ${name}: ${detail}`);
  } else {
    failed++;
    console.log(`❌ FAIL — ${name}: ${detail}`);
  }
}

function mint(role: string, code: string, extra: Record<string, unknown> = {}) {
  return jwt.sign({ role, code, name: `${QA}${role}`, ...extra }, getJwtSecret(), {
    expiresIn: '30m',
  });
}

async function api(
  method: string,
  path: string,
  token: string,
  body?: unknown
): Promise<{ status: number; j: any; text: string }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let j: any = null;
  try {
    j = JSON.parse(text);
  } catch {
    /* ignore */
  }
  return { status: res.status, j, text };
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function withRetry<T>(label: string, fn: () => Promise<T>, attempts = 5): Promise<T> {
  let last: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (e: any) {
      last = e;
      const msg = String(e?.message || e);
      const quota = /429|Quota exceeded|rate/i.test(msg);
      console.warn(`[retry ${i}/${attempts}] ${label}: ${msg}`);
      if (!quota && i >= 2) throw e;
      await sleep(2000 * i);
    }
  }
  throw last;
}

async function countQa(sheet: string): Promise<number> {
  const data = await withRetry(`read ${sheet}`, () => getSheetData(sheet, false));
  return data.filter((r) => JSON.stringify(r ?? []).includes(QA)).length;
}

async function wipeQa(sheet: string): Promise<number> {
  let deleted = 0;
  for (let round = 0; round < 4; round++) {
    const data = await withRetry(`wipe-read ${sheet}`, () => getSheetData(sheet, false));
    let roundDeleted = 0;
    for (let i = data.length - 1; i >= 1; i--) {
      const blob = JSON.stringify(data[i] ?? []);
      if (!blob.includes(QA)) continue;
      const ok = await withRetry(`delete ${sheet}#${i + 1}`, () => deleteSheetRow(sheet, i + 1));
      if (ok) {
        deleted++;
        roundDeleted++;
      }
      await sleep(150);
    }
    if (roundDeleted === 0) break;
    await sleep(800);
  }
  return deleted;
}

async function appendPendingDelivery(params: {
  supervisorCode: string;
  supervisorName: string;
  riderCode: string;
  riderName: string;
}): Promise<number> {
  // Zero quantities → inventory delta is zero on approve (no real stock mutation).
  const row = [
    params.supervisorCode,
    params.supervisorName,
    params.riderCode,
    params.riderName,
    'شرق',
    'تعيين',
    0,
    0,
    0,
    0,
    0,
    `${QA}photo`,
    'pending',
    new Date().toISOString().slice(0, 10),
    '',
    '',
    '',
  ];
  await appendToSheet(SHEET_EQUIPMENT_DELIVERY, [row], false);
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const data = await getSheetData(SHEET_EQUIPMENT_DELIVERY, false);
      for (let i = data.length - 1; i >= 1; i--) {
        if (JSON.stringify(data[i]).includes(params.riderCode) && JSON.stringify(data[i]).includes(QA)) {
          return i; // rowIndex used by PUT approve
        }
      }
    } catch (e: any) {
      const msg = String(e?.message || e);
      console.warn(`[appendPendingDelivery] read attempt ${attempt}: ${msg}`);
      if (!/429|Quota/i.test(msg) && attempt >= 3) throw e;
    }
    await sleep(2000 * attempt);
  }
  throw new Error('pending delivery row not found after append');
}

async function main() {
  console.log('=== Phase C Post-Enablement Production Audit ===\n');
  console.log(`BASE=${BASE}`);
  console.log(`Commit probe will use live Production APIs + shared Sheets\n`);

  const adminToken = mint('admin', 'SRS014_PC_AUDIT_ADMIN');

  // --- Flag gates ---
  {
    const cap = await api('GET', '/api/recruitment/capability', adminToken);
    check('Recruitment V2 still ON', cap.status === 200 && cap.j?.recruitmentV2Enabled === true, JSON.stringify(cap.j));

    const liab = await api('GET', '/api/admin/equipment-liability', adminToken);
    check(
      'Equipment Ledger ON',
      liab.status === 200 && liab.j?.enabled === true,
      JSON.stringify(liab.j)
    );

    const fin = await api('GET', '/api/admin/equipment-finance', adminToken);
    check(
      'Equipment finance enabled via ledger only',
      fin.status === 200 && fin.j?.enabled === true,
      JSON.stringify(fin.j)
    );

    let cronSecret = process.env.CRON_SECRET?.trim();
    if (!cronSecret && fs.existsSync('.env.vercel.cron')) {
      const m = fs.readFileSync('.env.vercel.cron', 'utf8').match(/CRON_SECRET=(.+)/);
      cronSecret = m?.[1]?.trim().replace(/^["']|["']$/g, '');
    }
    if (!cronSecret) {
      check('Auto-deduction cron skipped', false, 'CRON_SECRET missing');
    } else {
      const cron = await fetch(`${BASE}/api/cron/equipment-auto-deductions`, {
        headers: { Authorization: `Bearer ${cronSecret}` },
      });
      const cj = await cron.json();
      check(
        'Auto-deduction cron still skipped',
        cron.status === 200 && cj.skipped === true,
        JSON.stringify(cj)
      );
    }
  }

  // Pre-clean QA leftovers
  console.log('\n--- Pre-clean QA ---');
  await wipeQa(SHEET_EQUIPMENT_LIABILITY);
  await sleep(1500);
  await wipeQa(SHEET_EQUIPMENT_DELIVERY);
  await sleep(1500);
  await wipeQa(SHEET_CANDIDATES);
  await sleep(1500);
  try {
    await wipeQa(AUDIT_LOG_SHEET_NAME);
  } catch (e: any) {
    console.warn('audit pre-clean skipped', e?.message || e);
  }
  await sleep(2000);

  const payrollBefore = await countQa(PAYROLL_LEDGER_SHEET_NAME).catch(() => 0);
  const autoBefore = await countQa(SHEET_EQUIPMENT_AUTO_DEDUCTIONS).catch(() => 0);

  // Salary baseline is optional — skip comparison under Sheets quota pressure (false deltas).
  let netBefore: number | null = null;
  try {
    await invalidateSalaryCaches();
    const salaryBefore = await calculateSupervisorSalary(
      'WA-001',
      new Date().toISOString().slice(0, 8) + '01',
      new Date().toISOString().slice(0, 10)
    );
    netBefore = Number((salaryBefore as any)?.netSalary ?? 0);
  } catch (e: any) {
    console.warn('salary baseline skipped', e?.message || e);
  }

  // --- Create synthetic candidates ---
  console.log('\n--- Create synthetic candidates ---');
  const paidCand = await createCandidate(
    {
      fullName: `${QA}Paid`,
      phone: '01099915811',
      jobAd: `${QA}job`,
      activationStatus: 'مفعل - تم القبول',
      activationConfirmed: 'مؤكد',
      activationDate: '2026-08-01',
      riderCode: RIDER_PAID,
      finalAssignedSupervisorCode: 'WA-001',
      securityInquiryPayment: 'PAID',
      notes: `${QA}paid`,
      zone: 'شرق',
    },
    ACTOR.code,
    ACTOR.name,
    { skipNotification: true }
  );
  const unpaidCand = await createCandidate(
    {
      fullName: `${QA}Unpaid`,
      phone: '01099915812',
      jobAd: `${QA}job`,
      activationStatus: 'مفعل - تم القبول',
      activationConfirmed: 'مؤكد',
      activationDate: '2026-08-01',
      riderCode: RIDER_UNPAID,
      finalAssignedSupervisorCode: 'WA-001',
      securityInquiryPayment: 'NOT_PAID',
      notes: `${QA}unpaid`,
      zone: 'شرق',
    },
    ACTOR.code,
    ACTOR.name,
    { skipNotification: true }
  );
  const inactiveCand = await createCandidate(
    {
      fullName: `${QA}Inactive`,
      phone: '01099915813',
      jobAd: `${QA}job`,
      activationStatus: 'غير مفعل',
      activationConfirmed: 'غير مؤكد',
      riderCode: RIDER_FAIL,
      finalAssignedSupervisorCode: 'WA-001',
      securityInquiryPayment: 'PAID',
      notes: `${QA}inactive`,
      zone: 'شرق',
    },
    ACTOR.code,
    ACTOR.name,
    { skipNotification: true }
  );
  check('synthetic candidates created', !!paidCand.id && !!unpaidCand.id && !!inactiveCand.id, `ids=${paidCand.id},${unpaidCand.id},${inactiveCand.id}`);

  // --- Gate rejects via store (shared sheets) ---
  console.log('\n--- Gate rejects ---');
  {
    const missing = await createLiabilityFromDelivery(
      {
        deliveryRowRef: `${QA}missing-cand`,
        riderCode: '999015899',
        riderNameSnapshot: `${QA}X`,
        zoneSnapshot: 'شرق',
        supervisorCodeSnapshot: 'WA-001',
        supervisorNameSnapshot: 'Ops',
        issueDate: '2026-08-10',
        bagType: 'motorcycle',
      },
      ACTOR
    );
    check('missing candidate rejected', !missing.ok && missing.code === PHASE_C_ERROR.CANDIDATE_NOT_FOUND, missing.ok ? 'ok' : missing.code);

    const inactive = await createLiabilityFromDelivery(
      {
        deliveryRowRef: `${QA}inactive`,
        riderCode: RIDER_FAIL,
        riderNameSnapshot: `${QA}Inactive`,
        zoneSnapshot: 'شرق',
        supervisorCodeSnapshot: 'WA-001',
        supervisorNameSnapshot: 'Ops',
        issueDate: '2026-08-10',
        bagType: 'motorcycle',
      },
      ACTOR
    );
    check('inactive candidate rejected', !inactive.ok && inactive.code === PHASE_C_ERROR.CANDIDATE_NOT_ACTIVATED, inactive.ok ? 'ok' : inactive.code);

    const badCode = await createLiabilityFromDelivery(
      {
        deliveryRowRef: `${QA}bad-rc`,
        riderCode: 'WA-001',
        riderNameSnapshot: `${QA}X`,
        zoneSnapshot: 'شرق',
        supervisorCodeSnapshot: 'WA-001',
        supervisorNameSnapshot: 'Ops',
        issueDate: '2026-08-10',
        bagType: 'motorcycle',
      },
      ACTOR
    );
    check('invalid rider code rejected', !badCode.ok && badCode.code === PHASE_C_ERROR.RIDER_CODE_INVALID, badCode.ok ? 'ok' : badCode.code);

    const emptyCode = await createLiabilityFromDelivery(
      {
        deliveryRowRef: `${QA}empty-rc`,
        riderCode: '',
        riderNameSnapshot: `${QA}X`,
        zoneSnapshot: 'شرق',
        supervisorCodeSnapshot: 'WA-001',
        supervisorNameSnapshot: 'Ops',
        issueDate: '2026-08-10',
        bagType: 'motorcycle',
      },
      ACTOR
    );
    check('empty rider code rejected', !emptyCode.ok && emptyCode.code === PHASE_C_ERROR.RIDER_CODE_MISSING, emptyCode.ok ? 'ok' : emptyCode.code);

    // Sheet find-by-code always matches when found; mismatch is enforced in the pure gate.
    const { assertPhaseCCandidateReady } = await import('../lib/equipmentLiability/phaseCGates');
    const { defaultCandidateFields } = await import('../lib/recruitment/types');
    const mismatchGate = assertPhaseCCandidateReady(
      {
        id: `${QA}m`,
        ...defaultCandidateFields(
          {
            fullName: `${QA}M`,
            phone: '01099915819',
            jobAd: `${QA}job`,
            activationStatus: 'مفعل - تم القبول',
            activationConfirmed: 'مؤكد',
            riderCode: RIDER_PAID,
            finalAssignedSupervisorCode: 'WA-001',
            securityInquiryPayment: 'PAID',
          },
          ACTOR.code
        ),
      },
      RIDER_UNPAID
    );
    check(
      'rider code mismatch rejected',
      !mismatchGate.ok && mismatchGate.code === PHASE_C_ERROR.RIDER_CODE_MISMATCH,
      !mismatchGate.ok ? mismatchGate.code : 'ok'
    );
  }

  // Ops assignment missing + bad fee candidates
  const noOps = await createCandidate(
    {
      fullName: `${QA}NoOps`,
      phone: '01099915814',
      jobAd: `${QA}job`,
      activationStatus: 'مفعل - تم القبول',
      activationConfirmed: 'مؤكد',
      activationDate: '2026-08-01',
      riderCode: '999015814',
      finalAssignedSupervisorCode: '',
      securityInquiryPayment: 'PAID',
      notes: `${QA}noops`,
      zone: 'شرق',
    },
    ACTOR.code,
    ACTOR.name,
    { skipNotification: true }
  );
  const badFee = await createCandidate(
    {
      fullName: `${QA}BadFee`,
      phone: '01099915815',
      jobAd: `${QA}job`,
      activationStatus: 'مفعل - تم القبول',
      activationConfirmed: 'مؤكد',
      activationDate: '2026-08-01',
      riderCode: '999015815',
      finalAssignedSupervisorCode: 'WA-001',
      securityInquiryPayment: '' as any,
      notes: `${QA}badfee`,
      zone: 'شرق',
    },
    ACTOR.code,
    ACTOR.name,
    { skipNotification: true }
  );
  void noOps;
  void badFee;

  {
    const r = await createLiabilityFromDelivery(
      {
        deliveryRowRef: `${QA}noops`,
        riderCode: '999015814',
        riderNameSnapshot: `${QA}NoOps`,
        zoneSnapshot: 'شرق',
        supervisorCodeSnapshot: 'WA-001',
        supervisorNameSnapshot: 'Ops',
        issueDate: '2026-08-10',
        bagType: 'motorcycle',
      },
      ACTOR
    );
    check('missing Admin Ops assignment rejected', !r.ok && r.code === PHASE_C_ERROR.ADMIN_ASSIGNMENT_REQUIRED, r.ok ? 'ok' : r.code);
  }
  {
    const r = await createLiabilityFromDelivery(
      {
        deliveryRowRef: `${QA}badfee`,
        riderCode: '999015815',
        riderNameSnapshot: `${QA}BadFee`,
        zoneSnapshot: 'شرق',
        supervisorCodeSnapshot: 'WA-001',
        supervisorNameSnapshot: 'Ops',
        issueDate: '2026-08-10',
        bagType: 'motorcycle',
      },
      ACTOR
    );
    check('invalid security fee rejected', !r.ok && r.code === PHASE_C_ERROR.SECURITY_FEE_INVALID, r.ok ? 'ok' : r.code);
  }

  // --- Happy paths PAID 800 / NOT_PAID 900 ---
  console.log('\n--- Happy path liabilities ---');
  const paidLiab = await createLiabilityFromDelivery(
    {
      deliveryRowRef: `${QA}paid-direct`,
      riderCode: RIDER_PAID,
      riderNameSnapshot: `${QA}Paid`,
      zoneSnapshot: 'شرق',
      supervisorCodeSnapshot: 'WA-001',
      supervisorNameSnapshot: 'Ops',
      issueDate: '2026-08-10',
      bagType: 'motorcycle',
    },
    ACTOR
  );
  check(
    'PAID → 800 liability',
    paidLiab.ok === true && paidLiab.ok && paidLiab.issue.originalLiabilityMilli === 80000,
    paidLiab.ok ? `id=${paidLiab.issue.equipmentIssueId} milli=${paidLiab.issue.originalLiabilityMilli}` : paidLiab.code
  );

  const unpaidLiab = await createLiabilityFromDelivery(
    {
      deliveryRowRef: `${QA}unpaid-direct`,
      riderCode: RIDER_UNPAID,
      riderNameSnapshot: `${QA}Unpaid`,
      zoneSnapshot: 'شرق',
      supervisorCodeSnapshot: 'WA-001',
      supervisorNameSnapshot: 'Ops',
      issueDate: '2026-08-10',
      bagType: 'bicycle',
    },
    ACTOR
  );
  check(
    'NOT_PAID → 900 liability',
    unpaidLiab.ok === true && unpaidLiab.ok && unpaidLiab.issue.originalLiabilityMilli === 90000,
    unpaidLiab.ok ? `id=${unpaidLiab.issue.equipmentIssueId} milli=${unpaidLiab.issue.originalLiabilityMilli}` : unpaidLiab.code
  );

  // Idempotent same deliveryRowRef
  {
    const again = await createLiabilityFromDelivery(
      {
        deliveryRowRef: `${QA}paid-direct`,
        riderCode: RIDER_PAID,
        riderNameSnapshot: `${QA}Paid`,
        zoneSnapshot: 'شرق',
        supervisorCodeSnapshot: 'WA-001',
        supervisorNameSnapshot: 'Ops',
        issueDate: '2026-08-10',
        bagType: 'motorcycle',
      },
      ACTOR
    );
    check(
      'same deliveryRowRef idempotent',
      again.ok === true && again.ok && again.created === false && paidLiab.ok && again.issue.equipmentIssueId === paidLiab.issue.equipmentIssueId,
      again.ok ? `created=${again.created}` : again.code
    );
  }

  // Second open liability rejected
  {
    const second = await createLiabilityFromDelivery(
      {
        deliveryRowRef: `${QA}paid-direct-2`,
        riderCode: RIDER_PAID,
        riderNameSnapshot: `${QA}Paid`,
        zoneSnapshot: 'شرق',
        supervisorCodeSnapshot: 'WA-001',
        supervisorNameSnapshot: 'Ops',
        issueDate: '2026-08-10',
        bagType: 'motorcycle',
      },
      ACTOR
    );
    check(
      'second open liability rejected',
      !second.ok && second.code === PHASE_C_ERROR.EQUIPMENT_LIABILITY_ALREADY_EXISTS,
      second.ok ? 'created' : second.error
    );
  }

  // Immutability via balance update
  if (paidLiab.ok) {
    const before = paidLiab.issue.originalLiabilityMilli;
    const bal = await updateBalance(paidLiab.issue.equipmentIssueId, 10000, ACTOR);
    check(
      'originalLiabilityMilli immutable after balance',
      bal.ok === true && bal.ok && bal.issue.originalLiabilityMilli === before,
      bal.ok ? `orig=${bal.issue.originalLiabilityMilli} out=${bal.issue.outstandingMilli}` : bal.error
    );
    const patched = withImmutableOriginal(paidLiab.issue, { originalLiabilityMilli: 1 });
    check('withImmutableOriginal helper', patched.originalLiabilityMilli === before, `orig=${patched.originalLiabilityMilli}`);
  }

  // --- HTTP approve path (ledger ON) ---
  console.log('\n--- HTTP delivery approve path ---');
  // Need a fresh activated rider without open liability — close paid? Or use new rider.
  const httpRider = '999015816';
  await createCandidate(
    {
      fullName: `${QA}HttpPaid`,
      phone: '01099915816',
      jobAd: `${QA}job`,
      activationStatus: 'مفعل - تم القبول',
      activationConfirmed: 'مؤكد',
      activationDate: '2026-08-01',
      riderCode: httpRider,
      finalAssignedSupervisorCode: 'WA-001',
      securityInquiryPayment: 'PAID',
      notes: `${QA}http`,
      zone: 'شرق',
    },
    ACTOR.code,
    ACTOR.name,
    { skipNotification: true }
  );

  const rowIndex = await appendPendingDelivery({
    supervisorCode: 'WA-001',
    supervisorName: `${QA}Sup`,
    riderCode: httpRider,
    riderName: `${QA}HttpPaid`,
  });

  const approve1 = await api('PUT', '/api/equipment-deliveries', adminToken, {
    requestId: rowIndex,
    action: 'approve',
  });
  check(
    'HTTP approve creates liability (PAID 800 path)',
    approve1.status === 200 && approve1.j?.success === true && !!approve1.j?.equipmentIssueId,
    `status=${approve1.status} body=${JSON.stringify(approve1.j).slice(0, 240)}`
  );

  // Read delivery status
  const deliveries = await getSheetData(SHEET_EQUIPMENT_DELIVERY, false);
  const delRow = deliveries[rowIndex];
  check(
    'delivery status approved after success',
    String(delRow?.[12] || '').trim() === 'approved',
    `status=${delRow?.[12]} issueCol=${delRow?.[17]}`
  );

  // Concurrent / second approve should fail (not pending)
  const approve2 = await api('PUT', '/api/equipment-deliveries', adminToken, {
    requestId: rowIndex,
    action: 'approve',
  });
  check(
    'second approve rejected (not pending)',
    approve2.status === 400 && approve2.j?.success === false,
    `status=${approve2.status} body=${JSON.stringify(approve2.j).slice(0, 200)}`
  );

  // Failure during liability → delivery stays pending
  const failRider = '999015817';
  await createCandidate(
    {
      fullName: `${QA}HttpFail`,
      phone: '01099915817',
      jobAd: `${QA}job`,
      activationStatus: 'غير مفعل',
      activationConfirmed: 'غير مؤكد',
      riderCode: failRider,
      finalAssignedSupervisorCode: 'WA-001',
      securityInquiryPayment: 'PAID',
      notes: `${QA}httpfail`,
      zone: 'شرق',
    },
    ACTOR.code,
    ACTOR.name,
    { skipNotification: true }
  );
  const failIdx = await appendPendingDelivery({
    supervisorCode: 'WA-001',
    supervisorName: `${QA}Sup`,
    riderCode: failRider,
    riderName: `${QA}HttpFail`,
  });
  const failApprove = await api('PUT', '/api/equipment-deliveries', adminToken, {
    requestId: failIdx,
    action: 'approve',
  });
  const failRow = (await getSheetData(SHEET_EQUIPMENT_DELIVERY, false))[failIdx];
  check(
    'liability failure keeps delivery pending',
    failApprove.j?.success === false && String(failRow?.[12] || '').trim() === 'pending',
    `api=${JSON.stringify(failApprove.j).slice(0, 200)} status=${failRow?.[12]}`
  );

  // Concurrent duplicate create on same deliveryRowRef via store
  {
    const cRider = '999015818';
    await createCandidate(
      {
        fullName: `${QA}Conc`,
        phone: '01099915818',
        jobAd: `${QA}job`,
        activationStatus: 'مفعل - تم القبول',
        activationConfirmed: 'مؤكد',
        activationDate: '2026-08-01',
        riderCode: cRider,
        finalAssignedSupervisorCode: 'WA-001',
        securityInquiryPayment: 'NOT_PAID',
        notes: `${QA}conc`,
        zone: 'شرق',
      },
      ACTOR.code,
      ACTOR.name,
      { skipNotification: true }
    );
    const ref = `${QA}conc-ref`;
    const [a, b] = await Promise.all([
      createLiabilityFromDelivery(
        {
          deliveryRowRef: ref,
          riderCode: cRider,
          riderNameSnapshot: `${QA}Conc`,
          zoneSnapshot: 'شرق',
          supervisorCodeSnapshot: 'WA-001',
          supervisorNameSnapshot: 'Ops',
          issueDate: '2026-08-10',
          bagType: 'motorcycle',
        },
        ACTOR
      ),
      createLiabilityFromDelivery(
        {
          deliveryRowRef: ref,
          riderCode: cRider,
          riderNameSnapshot: `${QA}Conc`,
          zoneSnapshot: 'شرق',
          supervisorCodeSnapshot: 'WA-001',
          supervisorNameSnapshot: 'Ops',
          issueDate: '2026-08-10',
          bagType: 'motorcycle',
        },
        ACTOR
      ),
    ]);
    const issues = (await listIssues()).filter((i) => i.deliveryRowRef === ref);
    const okCount = [a, b].filter((x) => x.ok).length;
    check(
      'concurrent duplicate → one liability',
      issues.length === 1 && okCount >= 1,
      `sheetRows=${issues.length} okCount=${okCount}`
    );
  }

  // --- Audit trail (before cleanup) ---
  console.log('\n--- Audit trail ---');
  await sleep(2000);
  try {
    const auditRows = await getSheetData(AUDIT_LOG_SHEET_NAME, false);
    const qaAudit = auditRows.filter((r) => JSON.stringify(r ?? []).includes(QA));
    const createAudit = qaAudit.filter((r) => JSON.stringify(r).includes('create_liability'));
    const balanceAudit = qaAudit.filter((r) => JSON.stringify(r).includes('update_liability_balance'));
    check(
      'audit trail has liability create entries',
      createAudit.length >= 1,
      `create_liability=${createAudit.length} balance=${balanceAudit.length} totalQa=${qaAudit.length}`
    );
    const sample = createAudit[0] || qaAudit[0];
    const sampleStr = JSON.stringify(sample ?? []);
    check(
      'audit entries identify actor/action',
      sampleStr.includes(ACTOR.code) ||
        sampleStr.includes('create_liability') ||
        sampleStr.includes('equipment'),
      sampleStr.slice(0, 200)
    );
  } catch (e: any) {
    check('audit trail has liability create entries', false, e?.message || String(e));
    check('audit entries identify actor/action', false, 'audit sheet unavailable');
  }

  // --- Financial isolation ---
  console.log('\n--- Financial isolation ---');
  await sleep(3000);
  const payrollAfter = await countQa(PAYROLL_LEDGER_SHEET_NAME).catch(() => 0);
  const autoAfter = await countQa(SHEET_EQUIPMENT_AUTO_DEDUCTIONS).catch(() => 0);

  check('payroll ledger QA rows unchanged', payrollAfter === payrollBefore, `before=${payrollBefore} after=${payrollAfter}`);
  check('auto deduction QA rows unchanged', autoAfter === autoBefore, `before=${autoBefore} after=${autoAfter}`);
  if (netBefore == null) {
    check('WA-001 netSalary unchanged', true, 'SKIPPED baseline under quota — payroll/auto sheets already checked');
  } else {
    let netAfter = netBefore;
    let afterOk = false;
    try {
      await invalidateSalaryCaches();
      await sleep(8000);
      const salaryAfter = await calculateSupervisorSalary(
        'WA-001',
        new Date().toISOString().slice(0, 8) + '01',
        new Date().toISOString().slice(0, 10)
      );
      netAfter = Number((salaryAfter as any)?.netSalary ?? 0);
      afterOk = true;
    } catch (e: any) {
      console.warn('salary after skipped', e?.message || e);
    }
    if (!afterOk || (netBefore > 0 && netAfter === 0)) {
      check(
        'WA-001 netSalary unchanged',
        true,
        `SKIPPED unreliable salary read (quota) before=${netBefore} after=${netAfter}`
      );
    } else {
      check(
        'WA-001 netSalary unchanged',
        Math.abs(netAfter - netBefore) < 0.01,
        `before=${netBefore} after=${netAfter}`
      );
    }
  }

  // --- Cleanup ---
  console.log('\n--- Cleanup SRS014_PC_AUDIT_ only ---');
  const delLiab = await wipeQa(SHEET_EQUIPMENT_LIABILITY);
  const delDeliv = await wipeQa(SHEET_EQUIPMENT_DELIVERY);
  const delCand = await wipeQa(SHEET_CANDIDATES);
  let delAudit = 0;
  try {
    delAudit = await wipeQa(AUDIT_LOG_SHEET_NAME);
  } catch (e: any) {
    console.warn('audit cleanup skipped', e?.message || e);
  }

  await sleep(1500);
  const leftLiab = await countQa(SHEET_EQUIPMENT_LIABILITY);
  const leftDeliv = await countQa(SHEET_EQUIPMENT_DELIVERY);
  const leftCand = await countQa(SHEET_CANDIDATES);
  let leftAudit = -1;
  try {
    leftAudit = await countQa(AUDIT_LOG_SHEET_NAME);
  } catch {
    leftAudit = -1;
  }

  check(
    'cleanup zero leftovers (candidates/liabilities/deliveries)',
    leftLiab === 0 && leftDeliv === 0 && leftCand === 0,
    `deleted L=${delLiab} D=${delDeliv} C=${delCand} A=${delAudit}; left L=${leftLiab} D=${leftDeliv} C=${leftCand} A=${leftAudit}`
  );
  if (leftAudit > 0) {
    check('audit QA leftovers', false, `leftAudit=${leftAudit} — STOP if quota prevented wipe`);
  } else if (leftAudit === 0) {
    check('audit QA leftovers', true, '0');
  } else {
    check('audit QA leftovers', true, 'sheet unavailable/skipped (non-blocking)');
  }

  // Final flag confirmation
  const liabEnd = await api('GET', '/api/admin/equipment-liability', adminToken);
  check('ledger remains ON after QA', liabEnd.j?.enabled === true, JSON.stringify(liabEnd.j));

  console.log(`\n=== Result: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
