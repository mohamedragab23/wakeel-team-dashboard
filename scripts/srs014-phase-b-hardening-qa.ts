/**
 * Phase B hardening QA — synthetic SRS014_UI_QA_ only.
 * npx tsx scripts/srs014-phase-b-hardening-qa.ts
 */
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../lib/jwtConfig';
import { deleteSheetRow, getSheetData } from '../lib/googleSheets';
import { SHEET_CANDIDATES, SHEET_CANDIDATE_CONTACTS } from '../lib/recruitment/types';
import { ACTIVATION_CONTACTS_BLOCKED_AR } from '../lib/recruitment/phaseB';
import { SHEET_EQUIPMENT_LIABILITY } from '../lib/equipmentLiability/constants';
import { SHEET_EQUIPMENT_AUTO_DEDUCTIONS } from '../lib/equipmentDeductions/constants';
import { PAYROLL_LEDGER_SHEET_NAME } from '../lib/payrollLedger';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env.vercel.cron', override: true });

const BASE = process.env.VERIFY_BASE_URL || 'https://wakeel-team-dashboard.vercel.app';
const PREFIX = 'SRS014_UI_QA_';
const phoneA = '01999111001';
const phoneB = '01999111002';
const nidA = '29801019990111';

function mint(role: string, code: string, extra: Record<string, unknown> = {}) {
  return jwt.sign({ role, name: `Hardening ${role}`, code, ...extra }, getJwtSecret(), {
    expiresIn: '45m',
  });
}

const tokens = {
  admin: mint('admin', 'PHASEB-HARD-ADMIN'),
  rm: mint('recruitment_manager', 'PHASEB-HARD-RM'),
};

let passed = 0;
let failed = 0;
const bugs: string[] = [];
const createdIds: string[] = [];

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

async function api(method: string, path: string, token?: string, body?: unknown) {
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

function baseCreate(overrides: Record<string, unknown> = {}) {
  return {
    fullName: `${PREFIX}Hardening_${Date.now()}`,
    phone: phoneA,
    nationalId: nidA,
    detailedAddress: `${PREFIX} addr`,
    age: '24',
    studentStatus: 'غير طالب',
    vehicleType: 'موتوسيكل',
    workedBefore: 'لا',
    governorate: 'Cairo',
    zone: 'Nasr city',
    jobAd: PREFIX,
    hiringDecision: 'هيشتغل',
    lecturePlannedDate: new Date().toISOString().slice(0, 10),
    securityInquiryPayment: 'NOT_PAID',
    assignedSupervisorCode: 'WA-001', // must be ignored for RM under V2
    ...overrides,
  };
}

async function countQa(sheet: string, range?: string) {
  try {
    const data = await getSheetData(sheet, false, range);
    return data.filter((r) => JSON.stringify(r).includes(PREFIX)).length;
  } catch {
    return 0;
  }
}

async function cleanup() {
  console.log('\n--- CLEANUP ---');
  for (const id of createdIds) {
    await api('DELETE', `/api/recruitment/candidates/${id}`, tokens.admin);
  }
  // hard-clean any leftover QA contact/candidate rows
  try {
    const contacts = await getSheetData(SHEET_CANDIDATE_CONTACTS, false);
    for (let i = contacts.length - 1; i >= 1; i--) {
      if (JSON.stringify(contacts[i]).includes(PREFIX) || JSON.stringify(contacts[i]).includes(phoneA) || JSON.stringify(contacts[i]).includes(phoneB)) {
        await deleteSheetRow(SHEET_CANDIDATE_CONTACTS, i + 1);
      }
    }
  } catch {
    /* sheet may be empty */
  }
  const cands = await getSheetData(SHEET_CANDIDATES, false, `${SHEET_CANDIDATES}!A:BZ`);
  for (let i = cands.length - 1; i >= 1; i--) {
    if (JSON.stringify(cands[i]).includes(PREFIX)) {
      await deleteSheetRow(SHEET_CANDIDATES, i + 1);
    }
  }
}

async function main() {
  console.log('=== PHASE B HARDENING QA ===');
  const cap = await api('GET', '/api/recruitment/capability', tokens.admin);
  check('V2 capability ON', cap.status === 200 && cap.j.recruitmentV2Enabled === true, JSON.stringify(cap.j));

  const cron = await fetch(`${BASE}/api/cron/equipment-auto-deductions`, {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  }).then((r) => r.json());
  check('cron skipped', cron.skipped === true, JSON.stringify(cron));

  const fin0 = {
    liability: await countQa(SHEET_EQUIPMENT_LIABILITY),
    auto: await countQa(SHEET_EQUIPMENT_AUTO_DEDUCTIONS),
    ledger: await countQa(PAYROLL_LEDGER_SHEET_NAME),
  };
  check('pre financial clean', fin0.liability === 0 && fin0.auto === 0 && fin0.ledger === 0, JSON.stringify(fin0));

  const create = await api('POST', '/api/recruitment/candidates', tokens.rm, baseCreate());
  check('RM create ok', create.status === 200 && create.j.success, `${create.status} ${create.j.error || create.j.data?.id}`);
  const id = create.j.data?.id as string;
  if (id) createdIds.push(id);
  check(
    'RM create ignored Ops supervisor preference',
    String(create.j.data?.assignedSupervisorCode || '') === '',
    `assigned=${create.j.data?.assignedSupervisorCode}`
  );

  // Sheets eventual consistency — brief pause before duplicate probes
  await new Promise((r) => setTimeout(r, 2500));

  // Duplicate phone
  const dupPhone = await api(
    'POST',
    '/api/recruitment/candidates',
    tokens.rm,
    baseCreate({ fullName: `${PREFIX}DupPhone`, nationalId: '29801019990222' })
  );
  check('duplicate phone rejected', dupPhone.status === 400 && /هاتف/.test(String(dupPhone.j.error || '')), `${dupPhone.status} ${dupPhone.j.error}`);
  if (dupPhone.status === 200 && dupPhone.j.data?.id) createdIds.push(dupPhone.j.data.id);

  // Duplicate NID
  const dupNid = await api(
    'POST',
    '/api/recruitment/candidates',
    tokens.rm,
    baseCreate({ fullName: `${PREFIX}DupNid`, phone: phoneB, nationalId: nidA })
  );
  check('duplicate nationalId rejected', dupNid.status === 400 && /قومي/.test(String(dupNid.j.error || '')), `${dupNid.status} ${dupNid.j.error}`);

  // RM cannot assign ops
  const rmAssign = await api('PUT', `/api/recruitment/candidates/${id}`, tokens.rm, {
    finalAssignedSupervisorCode: 'WA-001',
  });
  check('RM Ops assign 403', rmAssign.status === 403, `${rmAssign.status} ${rmAssign.j.error}`);

  const rmPref = await api('PUT', `/api/recruitment/candidates/${id}`, tokens.rm, {
    assignedSupervisorCode: 'WA-001',
  });
  // sanitized empty patch → 403 or ignored
  check(
    'RM preferred Ops blocked/ignored',
    rmPref.status === 403 || String(rmPref.j.data?.assignedSupervisorCode || '') === '',
    `${rmPref.status} ${rmPref.j.error || rmPref.j.data?.assignedSupervisorCode}`
  );

  // Lecture present then activation without contacts
  await api('PUT', `/api/recruitment/candidates/${id}`, tokens.rm, {
    lectureAttendance: 'حضر',
    lectureConfirmed: 'مؤكد',
    lectureDate: new Date().toISOString().slice(0, 10),
  });

  const act0 = await api('PUT', `/api/recruitment/candidates/${id}`, tokens.rm, {
    activationStatus: 'مفعل - تم القبول',
    activationConfirmed: 'مؤكد',
    activationDate: new Date().toISOString().slice(0, 10),
    riderCode: '990101',
  });
  check(
    '0 contacts → activation blocked',
    act0.status === 400 && String(act0.j.error) === ACTIVATION_CONTACTS_BLOCKED_AR,
    `${act0.status} ${act0.j.error}`
  );

  // Add 1 contact
  await api('POST', `/api/recruitment/candidates/${id}/contacts`, tokens.rm, {
    name: `${PREFIX}C1`,
    relationship: 'أب',
    phone: '01011110001',
  });
  const act1 = await api('PUT', `/api/recruitment/candidates/${id}`, tokens.rm, {
    activationStatus: 'مفعل - تم القبول',
    activationConfirmed: 'مؤكد',
    activationDate: new Date().toISOString().slice(0, 10),
    riderCode: '990101',
  });
  check(
    '1 contact → activation blocked',
    act1.status === 400 && String(act1.j.error) === ACTIVATION_CONTACTS_BLOCKED_AR,
    `${act1.status} ${act1.j.error}`
  );

  // Admin exception with 1 contact → allowed (design freeze)
  await api('PUT', `/api/recruitment/candidates/${id}`, tokens.admin, {
    contactsExceptionApproved: true,
    contactsExceptionReason: `${PREFIX} exception`,
  });
  const actExc = await api('PUT', `/api/recruitment/candidates/${id}`, tokens.rm, {
    activationStatus: 'مفعل - تم القبول',
    activationConfirmed: 'مؤكد',
    activationDate: new Date().toISOString().slice(0, 10),
    riderCode: '990101',
  });
  check('1 contact + Admin exception → allowed', actExc.status === 200 && actExc.j.success, `${actExc.status} ${actExc.j.error}`);

  // Second candidate for 2-contact happy path
  const create2 = await api(
    'POST',
    '/api/recruitment/candidates',
    tokens.rm,
    baseCreate({
      fullName: `${PREFIX}TwoContacts`,
      phone: '01999111003',
      nationalId: '29801019990333',
      assignedSupervisorCode: '',
    })
  );
  const id2 = create2.j.data?.id as string;
  if (id2) createdIds.push(id2);
  await api('PUT', `/api/recruitment/candidates/${id2}`, tokens.rm, {
    lectureAttendance: 'حضر',
    lectureConfirmed: 'مؤكد',
    lectureDate: new Date().toISOString().slice(0, 10),
  });
  await api('POST', `/api/recruitment/candidates/${id2}/contacts`, tokens.rm, {
    name: `${PREFIX}C2a`,
    relationship: 'أم',
    phone: '01011110002',
  });
  await api('POST', `/api/recruitment/candidates/${id2}/contacts`, tokens.rm, {
    name: `${PREFIX}C2b`,
    relationship: 'أخرى',
    relationshipOther: 'جدة',
    phone: '01011110003',
  });
  const act2 = await api('PUT', `/api/recruitment/candidates/${id2}`, tokens.rm, {
    activationStatus: 'مفعل - تم القبول',
    activationConfirmed: 'مؤكد',
    activationDate: new Date().toISOString().slice(0, 10),
    riderCode: '990102',
  });
  check('2 contacts → activation allowed', act2.status === 200 && act2.j.success, `${act2.status} ${act2.j.error}`);

  // Duplicate rider code
  const create3 = await api(
    'POST',
    '/api/recruitment/candidates',
    tokens.rm,
    baseCreate({
      fullName: `${PREFIX}RiderDup`,
      phone: '01999111004',
      nationalId: '29801019990444',
    })
  );
  const id3 = create3.j.data?.id as string;
  if (id3) createdIds.push(id3);
  await api('PUT', `/api/recruitment/candidates/${id3}`, tokens.rm, {
    lectureAttendance: 'حضر',
    lectureConfirmed: 'مؤكد',
    lectureDate: new Date().toISOString().slice(0, 10),
  });
  await api('PUT', `/api/recruitment/candidates/${id3}`, tokens.admin, {
    contactsExceptionApproved: true,
  });
  const riderDup = await api('PUT', `/api/recruitment/candidates/${id3}`, tokens.rm, {
    activationStatus: 'مفعل - تم القبول',
    activationConfirmed: 'مؤكد',
    activationDate: new Date().toISOString().slice(0, 10),
    riderCode: '990102',
  });
  check('duplicate rider code rejected', riderDup.status === 400 && /كود المندوب/.test(String(riderDup.j.error || '')), `${riderDup.status} ${riderDup.j.error}`);

  // Admin assign
  const adminAssign = await api('PUT', `/api/recruitment/candidates/${id2}`, tokens.admin, {
    finalAssignedSupervisorCode: 'WA-001',
    assignmentStatus: 'تم التعيين',
    assignedAt: new Date().toISOString().slice(0, 10),
  });
  check('Admin Ops assign ok', adminAssign.status === 200 && adminAssign.j.data?.finalAssignedSupervisorCode === 'WA-001', `${adminAssign.status}`);

  const fin1 = {
    liability: await countQa(SHEET_EQUIPMENT_LIABILITY),
    auto: await countQa(SHEET_EQUIPMENT_AUTO_DEDUCTIONS),
    ledger: await countQa(PAYROLL_LEDGER_SHEET_NAME),
  };
  check('post financial still clean', fin1.liability === 0 && fin1.auto === 0 && fin1.ledger === 0, JSON.stringify(fin1));

  await cleanup();
  const leftCand = await countQa(SHEET_CANDIDATES, `${SHEET_CANDIDATES}!A:BZ`);
  const leftContact = await countQa(SHEET_CANDIDATE_CONTACTS);
  check('ZERO candidate leftovers', leftCand === 0, `leftover=${leftCand}`);
  check('ZERO contact leftovers', leftContact === 0, `leftover=${leftContact}`);

  console.log(`\n=== Result: ${passed} passed, ${failed} failed ===`);
  if (bugs.length) console.log(bugs.join('\n'));
  process.exitCode = failed ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
