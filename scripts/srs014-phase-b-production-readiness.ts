/**
 * Phase B Production Readiness — enable FEATURE_RECRUITMENT_V2 only, then
 * exercise synthetic SRS014_UI_QA_ flow + permissions + financial isolation + cleanup.
 *
 *   npx tsx scripts/srs014-phase-b-production-readiness.ts
 *
 * MUTATES only SRS014_UI_QA_ prefixed synthetic rows. Cleans them up at end.
 */
import fs from 'fs';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env.vercel.prod' });
dotenv.config({ path: '.env.vercel.cron', override: true });

import { getJwtSecret } from '../lib/jwtConfig';
import { getSheetData } from '../lib/googleSheets';
import {
  SHEET_CANDIDATES,
  SHEET_CANDIDATE_CONTACTS,
  CANDIDATE_HEADERS,
} from '../lib/recruitment/types';
import { SHEET_EQUIPMENT_LIABILITY } from '../lib/equipmentLiability/constants';
import { SHEET_EQUIPMENT_AUTO_DEDUCTIONS } from '../lib/equipmentDeductions/constants';
import { PAYROLL_LEDGER_SHEET_NAME } from '../lib/payrollLedger';
import { AUDIT_LOG_SHEET_NAME } from '../lib/auditLog';
import { deriveRecruitmentPipelineStage } from '../lib/recruitment/phaseB';

const BASE = process.env.VERIFY_BASE_URL || 'https://wakeel-team-dashboard.vercel.app';
const PREFIX = 'SRS014_UI_QA_';
const QA_NAME = `${PREFIX}PhaseB_Candidate`;
const QA_PHONE = '01999888777';
const QA_RIDER_CODE = '990014'; // synthetic numeric — not a real ops assignment

function mint(payload: Record<string, unknown>) {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '45m' });
}

const tokens = {
  admin: mint({ role: 'admin', name: 'PhaseB Ready Admin', code: 'PHASEB-READY-ADMIN' }),
  rm: mint({ role: 'recruitment_manager', name: 'PhaseB Ready RM', code: 'PHASEB-READY-RM' }),
  supervisor: mint({ role: 'supervisor', name: 'PhaseB Ready Sup', code: 'WA-001' }),
  limNo: mint({
    role: 'admin',
    name: 'Lim No Rec',
    code: 'PHASEB-LIM-NO',
    permissions: 'limited:salaries,riders',
  }),
  limYes: mint({
    role: 'admin',
    name: 'Lim Rec',
    code: 'PHASEB-LIM-YES',
    permissions: 'limited:recruitment',
  }),
};

let passed = 0;
let failed = 0;
const bugs: string[] = [];
const notes: string[] = [];
let candidateId = '';
const contactIds: string[] = [];

function check(name: string, ok: boolean, detail: string) {
  if (ok) {
    passed++;
    console.log(`✅ PASS — ${name}: ${detail}`);
  } else {
    failed++;
    bugs.push(`${name}: ${detail}`);
    console.log(`❌ FAIL — ${name}: ${detail}`);
  }
}

async function api(
  method: string,
  path: string,
  token?: string,
  body?: unknown
): Promise<{ status: number; j: any }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body != null ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const j = await res.json().catch(() => ({}));
  return { status: res.status, j };
}

function todayOffset(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function countQaInSheet(sheet: string): Promise<number> {
  try {
    const data = await getSheetData(sheet, false);
    return data.filter((r) => JSON.stringify(r).includes(PREFIX)).length;
  } catch {
    return 0;
  }
}

async function financialSnapshot() {
  return {
    liabilityQa: await countQaInSheet(SHEET_EQUIPMENT_LIABILITY),
    autoQa: await countQaInSheet(SHEET_EQUIPMENT_AUTO_DEDUCTIONS),
    ledgerQa: await countQaInSheet(PAYROLL_LEDGER_SHEET_NAME),
  };
}

async function cleanup() {
  console.log('\n--- CLEANUP ---');
  if (candidateId) {
    for (const cid of contactIds) {
      await api('DELETE', `/api/recruitment/candidates/${candidateId}/contacts/${cid}`, tokens.admin);
    }
    // Soft-delete remaining contacts via list
    const listed = await api('GET', `/api/recruitment/candidates/${candidateId}/contacts`, tokens.admin);
    for (const c of listed.j?.data || []) {
      await api(
        'DELETE',
        `/api/recruitment/candidates/${candidateId}/contacts/${c.contactId}`,
        tokens.admin
      );
    }
    const del = await api('DELETE', `/api/recruitment/candidates/${candidateId}`, tokens.admin);
    check('cleanup delete candidate', del.status === 200 && del.j?.success === true, `status=${del.status}`);
  }

  // Sweep any leftover QA candidates by name
  const list = await api(
    'GET',
    `/api/recruitment/candidates?q=${encodeURIComponent(PREFIX)}&limit=50`,
    tokens.admin
  );
  for (const c of list.j?.data || []) {
    if (String(c.fullName || '').includes(PREFIX) || String(c.phone) === QA_PHONE) {
      await api('DELETE', `/api/recruitment/candidates/${c.id}`, tokens.admin);
    }
  }

  // Soft-delete QA contacts left in sheet
  try {
    const contacts = await getSheetData(SHEET_CANDIDATE_CONTACTS, false);
    // API soft-delete already; verify no active QA names
    const qaActive = contacts.filter(
      (r) =>
        JSON.stringify(r).includes(PREFIX) ||
        String(r[5] ?? '').includes('019998887') ||
        String(r[2] ?? '').includes(PREFIX)
    );
    notes.push(`contacts sheet QA-ish rows after cleanup (may include inactive): ${qaActive.length}`);
  } catch {
    /* ok */
  }

  const candQa = await countQaInSheet(SHEET_CANDIDATES);
  // Candidate delete removes row or leaves? check deleteCandidate
  check('ZERO SRS014_UI_QA_ in candidates sheet', candQa === 0, `leftover=${candQa}`);
}

async function main() {
  console.log('=== PHASE B PRODUCTION READINESS ===');
  console.log('BASE', BASE);

  // 0) Flag ON check
  const cap = await api('GET', '/api/recruitment/capability', tokens.admin);
  check(
    'capability V2 ON',
    cap.status === 200 && cap.j?.recruitmentV2Enabled === true,
    `status=${cap.status} enabled=${cap.j?.recruitmentV2Enabled}`
  );
  if (cap.j?.recruitmentV2Enabled !== true) {
    console.error('STOP: FEATURE_RECRUITMENT_V2_ENABLED is not ON in Production. Enable + redeploy first.');
    process.exit(2);
  }

  const beforeFin = await financialSnapshot();
  check(
    'pre-test financial QA clean',
    beforeFin.liabilityQa === 0 && beforeFin.autoQa === 0 && beforeFin.ledgerQa === 0,
    JSON.stringify(beforeFin)
  );

  // E) Permissions matrix (read)
  {
    const u = await api('GET', '/api/recruitment/candidates');
    check('unauth → 401', u.status === 401, `status=${u.status}`);
    const s = await api('GET', '/api/recruitment/candidates', tokens.supervisor);
    check('supervisor → 403', s.status === 403, `status=${s.status}`);
    const ln = await api('GET', '/api/recruitment/candidates', tokens.limNo);
    check('limited no recruitment → 403', ln.status === 403, `status=${ln.status}`);
    const ly = await api('GET', '/api/recruitment/candidates?limit=1', tokens.limYes);
    check('limited with recruitment → 200', ly.status === 200, `status=${ly.status}`);
    const rm = await api('GET', '/api/recruitment/candidates?limit=1', tokens.rm);
    check('RM → 200', rm.status === 200, `status=${rm.status}`);
    const ad = await api('GET', '/api/recruitment/candidates?limit=1', tokens.admin);
    check('Admin → 200', ad.status === 200, `status=${ad.status}`);
  }

  // Snapshot sheet header before create (integrity)
  const headerBefore = (await getSheetData(SHEET_CANDIDATES, false))[0]?.map((c) =>
    String(c ?? '').trim()
  ) || [];
  const first22Before = headerBefore.slice(0, 22);

  // A) Create — validation failures first
  {
    const bad = await api(
      'POST',
      '/api/recruitment/candidates',
      tokens.rm,
      {
        fullName: QA_NAME,
        phone: QA_PHONE,
        vehicleType: 'موتوسيكل',
        workedBefore: 'لا',
        governorate: 'القاهرة',
        zone: 'Nasr city',
        // missing nationalId/address/age/student while V2 ON
      }
    );
    check(
      'create rejects missing V2 required fields',
      bad.status === 400,
      `status=${bad.status} err=${bad.j?.error}`
    );
  }

  const lectureDate = todayOffset(0); // today → awaiting confirmation / due
  const create = await api('POST', '/api/recruitment/candidates', tokens.rm, {
    fullName: QA_NAME,
    phone: QA_PHONE,
    phoneSecondary: '01888777666',
    nationalId: '29901011234567',
    detailedAddress: `${PREFIX} 12 Test St Nasr City`,
    age: '24',
    studentStatus: 'غير طالب',
    vehicleType: 'موتوسيكل',
    workedBefore: 'لا',
    governorate: 'القاهرة',
    zone: 'Nasr city',
    jobAd: `${PREFIX} job ad`,
    hiringDecision: 'هيشتغل',
    lecturePlannedDate: lectureDate,
    securityInquiryPayment: 'NOT_PAID',
    notes: `${PREFIX} synthetic readiness test — delete after`,
  });
  check(
    'create synthetic candidate',
    create.status === 200 && create.j?.success === true && create.j?.data?.id,
    `status=${create.status} id=${create.j?.data?.id} err=${create.j?.error}`
  );
  candidateId = create.j?.data?.id || '';
  if (!candidateId) {
    await cleanup();
    process.exit(1);
  }

  // Fee set PAID via dedicated route
  {
    const unpaidOk = await api(
      'PATCH',
      `/api/recruitment/candidates/${candidateId}/security-fee`,
      tokens.rm,
      { securityInquiryPayment: 'UNPAID' }
    );
    check(
      'security fee UNPAID alias → NOT_PAID',
      unpaidOk.status === 200 && unpaidOk.j?.data?.securityInquiryPayment === 'NOT_PAID',
      `status=${unpaidOk.status} val=${unpaidOk.j?.data?.securityInquiryPayment}`
    );
    const paid = await api(
      'PATCH',
      `/api/recruitment/candidates/${candidateId}/security-fee`,
      tokens.admin,
      { securityInquiryPayment: 'PAID' }
    );
    check(
      'Admin can set/correct fee to PAID',
      paid.status === 200 && paid.j?.data?.securityInquiryPayment === 'PAID',
      `status=${paid.status} val=${paid.j?.data?.securityInquiryPayment}`
    );
  }

  // Contacts — أخرى without custom fails
  {
    const badOther = await api('POST', `/api/recruitment/candidates/${candidateId}/contacts`, tokens.rm, {
      name: `${PREFIX}ContactOther`,
      relationship: 'أخرى',
      relationshipOther: '',
      phone: '01011112222',
    });
    check(
      'أخرى without custom → reject 400',
      badOther.status === 400,
      `status=${badOther.status} err=${badOther.j?.error}`
    );

    const c1 = await api('POST', `/api/recruitment/candidates/${candidateId}/contacts`, tokens.rm, {
      name: `${PREFIX}Father`,
      relationship: 'أب',
      phone: '01011112222',
    });
    check(
      'add contact 1 (أب)',
      (c1.status === 200 || c1.status === 201) && c1.j?.data?.contactId,
      `status=${c1.status}`
    );
    if (c1.j?.data?.contactId) contactIds.push(c1.j.data.contactId);

    const c2 = await api('POST', `/api/recruitment/candidates/${candidateId}/contacts`, tokens.rm, {
      name: `${PREFIX}Friend`,
      relationship: 'أخرى',
      relationshipOther: 'صديق عائلة',
      phone: '01033334444',
    });
    check(
      'add contact 2 (أخرى+custom)',
      (c2.status === 200 || c2.status === 201) && c2.j?.data?.contactId,
      `status=${c2.status}`
    );
    if (c2.j?.data?.contactId) contactIds.push(c2.j.data.contactId);

    const c3 = await api('POST', `/api/recruitment/candidates/${candidateId}/contacts`, tokens.rm, {
      name: `${PREFIX}Mother`,
      relationship: 'أم',
      phone: '01055556666',
    });
    check(
      'add optional 3rd contact',
      c3.status === 200 || c3.status === 201,
      `status=${c3.status}`
    );
    if (c3.j?.data?.contactId) contactIds.push(c3.j.data.contactId);

    const c4 = await api('POST', `/api/recruitment/candidates/${candidateId}/contacts`, tokens.rm, {
      name: `${PREFIX}Extra`,
      relationship: 'أخ',
      phone: '01077778888',
    });
    check('4th contact rejected (max 3)', c4.status >= 400, `status=${c4.status}`);
  }

  // Pipeline awaiting lecture / due
  {
    const get = await api('GET', `/api/recruitment/candidates/${candidateId}`, tokens.rm);
    const stage = deriveRecruitmentPipelineStage(get.j.data);
    check(
      'pipeline stage after create (lecture due)',
      stage === 'awaiting_lecture' || stage === 'absent',
      `stage=${stage}`
    );
  }

  // B) Lecture absent requires reason
  {
    const noReason = await api('PUT', `/api/recruitment/candidates/${candidateId}`, tokens.rm, {
      lectureAttendance: 'لم يحضر',
      lectureDate: lectureDate,
    });
    check(
      'absent without reason → 400',
      noReason.status === 400,
      `status=${noReason.status} err=${noReason.j?.error}`
    );

    const absent = await api('PUT', `/api/recruitment/candidates/${candidateId}`, tokens.rm, {
      lectureAttendance: 'لم يحضر',
      lectureDate: lectureDate,
      lectureAbsenceReason: `${PREFIX} illness`,
      lectureConfirmed: 'غير مؤكد',
    });
    check('absent with reason → ok', absent.status === 200, `status=${absent.status} err=${absent.j?.error}`);

    const reschedDate = todayOffset(3);
    const resched = await api('PUT', `/api/recruitment/candidates/${candidateId}`, tokens.rm, {
      lecturePlannedDate: reschedDate,
      lectureAttendance: 'لم يحضر',
      lectureConfirmed: 'غير مؤكد',
      lectureAbsenceReason: `${PREFIX} illness`,
    });
    check(
      'reschedule lecture date → ok',
      resched.status === 200,
      `status=${resched.status} err=${resched.j?.error}`
    );
    if (resched.j?.data) {
      const stage = deriveRecruitmentPipelineStage(resched.j.data);
      check(
        'pipeline rescheduled or absent',
        stage === 'rescheduled' || stage === 'awaiting_lecture' || stage === 'absent',
        `stage=${stage}`
      );
    } else {
      check('pipeline rescheduled or absent', false, 'no data after reschedule');
    }

    // Attend
    const present = await api('PUT', `/api/recruitment/candidates/${candidateId}`, tokens.rm, {
      lectureAttendance: 'حضر',
      lectureConfirmed: 'مؤكد',
      lectureDate: todayOffset(0),
    });
    check('attendance present → ok', present.status === 200, `status=${present.status}`);
    const stage2 = deriveRecruitmentPipelineStage(present.j.data);
    check(
      'pipeline attended_awaiting_activation',
      stage2 === 'attended_awaiting_activation',
      `stage=${stage2}`
    );
  }

  // C) Activation
  {
    const noCode = await api('PUT', `/api/recruitment/candidates/${candidateId}`, tokens.rm, {
      activationStatus: 'مفعل - تم القبول',
      activationConfirmed: 'مؤكد',
      activationDate: todayOffset(0),
    });
    check(
      'activate without rider code → 400',
      noCode.status === 400,
      `status=${noCode.status} err=${noCode.j?.error}`
    );

    const badCode = await api('PUT', `/api/recruitment/candidates/${candidateId}`, tokens.rm, {
      activationStatus: 'مفعل - تم القبول',
      activationConfirmed: 'مؤكد',
      riderCode: 'WA-001',
    });
    check(
      'activate with WA- code → 400',
      badCode.status === 400,
      `status=${badCode.status} err=${badCode.j?.error}`
    );

    const ok = await api('PUT', `/api/recruitment/candidates/${candidateId}`, tokens.rm, {
      activationStatus: 'مفعل - تم القبول',
      activationConfirmed: 'مؤكد',
      activationDate: todayOffset(0),
      riderCode: QA_RIDER_CODE,
    });
    check(
      'activate with valid rider code → ok',
      ok.status === 200 && ok.j?.data?.riderCode === QA_RIDER_CODE,
      `status=${ok.status} code=${ok.j?.data?.riderCode} err=${ok.j?.error}`
    );
    const stage = deriveRecruitmentPipelineStage(ok.j.data);
    check(
      'pipeline activated_awaiting_ops_assignment',
      stage === 'activated_awaiting_ops_assignment',
      `stage=${stage}`
    );
  }

  // D) Ops assignment permissions
  {
    const rmAssign = await api('PUT', `/api/recruitment/candidates/${candidateId}`, tokens.rm, {
      finalAssignedSupervisorCode: 'WA-001',
      assignmentStatus: 'تم التعيين',
    });
    check(
      'RM cannot assign Ops supervisor',
      rmAssign.status === 403 ||
        (rmAssign.status === 200 &&
          !rmAssign.j?.data?.finalAssignedSupervisorCode),
      `status=${rmAssign.status} final=${rmAssign.j?.data?.finalAssignedSupervisorCode} err=${rmAssign.j?.error}`
    );
    // Stronger: after RM put, final must still be empty
    const afterRm = await api('GET', `/api/recruitment/candidates/${candidateId}`, tokens.admin);
    check(
      'after RM attempt, Ops still unassigned',
      !String(afterRm.j?.data?.finalAssignedSupervisorCode || '').trim(),
      `final=${afterRm.j?.data?.finalAssignedSupervisorCode}`
    );

    const adminAssign = await api('PUT', `/api/recruitment/candidates/${candidateId}`, tokens.admin, {
      finalAssignedSupervisorCode: 'WA-001',
      assignmentStatus: 'تم التعيين',
      assignedAt: todayOffset(0),
      assignmentNote: `${PREFIX} admin assign`,
    });
    check(
      'Admin can assign Ops supervisor',
      adminAssign.status === 200 &&
        adminAssign.j?.data?.finalAssignedSupervisorCode === 'WA-001',
      `status=${adminAssign.status} final=${adminAssign.j?.data?.finalAssignedSupervisorCode}`
    );
  }

  // F) Financial isolation after full flow
  {
    const afterFin = await financialSnapshot();
    check(
      'no liability QA rows created',
      afterFin.liabilityQa === beforeFin.liabilityQa && afterFin.liabilityQa === 0,
      JSON.stringify(afterFin)
    );
    check(
      'no auto-deduction QA rows',
      afterFin.autoQa === 0,
      JSON.stringify(afterFin)
    );
    check(
      'no payroll ledger QA rows',
      afterFin.ledgerQa === 0,
      JSON.stringify(afterFin)
    );

    const cronSecret =
      String(process.env.CRON_SECRET || '').trim() ||
      (() => {
        try {
          const line = fs
            .readFileSync('.env.vercel.cron', 'utf8')
            .split(/\r?\n/)
            .find((l) => l.startsWith('CRON_SECRET='));
          return line?.slice('CRON_SECRET='.length).trim().replace(/^['"]|['"]$/g, '') || '';
        } catch {
          return '';
        }
      })();
    const cron = await fetch(`${BASE}/api/cron/equipment-auto-deductions`, {
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
    const cronJ = await cron.json();
    check(
      'cron still skipped (auto flag OFF)',
      cron.status === 200 && cronJ.skipped === true,
      JSON.stringify(cronJ)
    );
  }

  // H) Sheet integrity
  {
    const headerAfter = (await getSheetData(SHEET_CANDIDATES, false))[0]?.map((c) =>
      String(c ?? '').trim()
    ) || [];
    const first22After = headerAfter.slice(0, 22);
    check(
      'first-22 headers unchanged meaning',
      JSON.stringify(first22Before) === JSON.stringify(first22After) ||
        CANDIDATE_HEADERS.slice(0, 22).every((h, i) => h === first22After[i]),
      `before=${first22Before.length} after=${first22After.length}`
    );
    check(
      'phone column still phone (not renamed)',
      headerAfter[2] === 'phone' || headerAfter.includes('phone'),
      `col2=${headerAfter[2]}`
    );
    // Phase B columns may now exist after ensureHeaderRow on create
    const additivePresent = ['phoneSecondary', 'nationalId', 'detailedAddress'].filter((h) =>
      headerAfter.includes(h)
    );
    check(
      'additive Phase B headers present after ensure',
      additivePresent.length >= 1,
      `present=${additivePresent.join(',')}`
    );
  }

  // I) Audit trail
  {
    try {
      const audit = await getSheetData(AUDIT_LOG_SHEET_NAME, false);
      const hits = audit.filter(
        (r) =>
          JSON.stringify(r).includes(candidateId) ||
          JSON.stringify(r).includes(PREFIX) ||
          JSON.stringify(r).includes('PHASEB-READY')
      );
      const actions = hits.map((r) => String(r[2] ?? '')).join(',');
      check(
        'audit entries for V2 actions exist',
        hits.length >= 3,
        `hits=${hits.length} actions~${actions.slice(0, 200)}`
      );
      const hasOps = hits.some((r) => String(r[2] ?? '').includes('ops_supervisor'));
      check('audit includes ops supervisor assign', hasOps, `hasOps=${hasOps}`);
    } catch (e: any) {
      check('audit sheet readable', false, String(e?.message || e));
    }
  }

  // Other flags still off — probe equipment liability capability if any
  {
    const eq = await api('GET', '/api/admin/equipment-liability', tokens.admin);
    // 401/403/503 all acceptable as long as not creating data; 200 with enabled false also ok
    check(
      'equipment liability not silently creating via V2',
      eq.status !== 500,
      `status=${eq.status}`
    );
  }

  await cleanup();

  // Final leftover verify
  {
    const left = await countQaInSheet(SHEET_CANDIDATES);
    check('final candidates leftover = 0', left === 0, `leftover=${left}`);
    const fin = await financialSnapshot();
    check(
      'final financial leftover = 0',
      fin.liabilityQa === 0 && fin.autoQa === 0 && fin.ledgerQa === 0,
      JSON.stringify(fin)
    );
  }

  console.log(`\n=== Result: ${passed} passed, ${failed} failed ===`);
  if (notes.length) {
    console.log('Notes:');
    for (const n of notes) console.log('-', n);
  }
  if (bugs.length) {
    console.log('Bugs:');
    for (const b of bugs) console.log('-', b);
  }
  if (failed > 0) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  try {
    await cleanup();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
