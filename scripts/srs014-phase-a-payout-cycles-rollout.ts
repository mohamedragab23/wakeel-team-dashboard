/**
 * Phase A — controlled Production rollout for FEATURE_PAYOUT_CYCLES_ENABLED only.
 * Creates August 2026 payout cycles via Admin API and validates isolation/permissions.
 *
 * Usage:
 *   VERIFY_BASE_URL=https://wakeel-team-dashboard.vercel.app npx tsx scripts/srs014-phase-a-payout-cycles-rollout.ts
 */
import fs from 'fs';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env.vercel.prod' });
dotenv.config({ path: '.env.vercel.cron', override: true });

import { getJwtSecret } from '../lib/jwtConfig';
import { getSheetData } from '../lib/googleSheets';
import { SHEET_PAYOUT_CYCLES } from '../lib/payoutCycles/constants';
import { SHEET_EQUIPMENT_LIABILITY } from '../lib/equipmentLiability/constants';
import { SHEET_EQUIPMENT_AUTO_DEDUCTIONS } from '../lib/equipmentDeductions/constants';
import { PAYROLL_LEDGER_SHEET_NAME } from '../lib/payrollLedger';
import { AUDIT_LOG_SHEET_NAME } from '../lib/auditLog';
import {
  isCycleEligibleForEquipmentDeduction,
  resolveCycleForDeductionDate,
  shouldSkipEquipmentAutoDeductions,
} from '../lib/payoutCycles/eligibility';
import { validatePayoutCycleInput } from '../lib/payoutCycles/validation';
import type { PayoutCycle } from '../lib/payoutCycles/types';

const BASE = process.env.VERIFY_BASE_URL || 'https://wakeel-team-dashboard.vercel.app';

function mint(payload: Record<string, unknown>) {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '15m' });
}

const adminToken = mint({ role: 'admin', name: 'PhaseA Admin', code: 'PHASEA-ADMIN' });
const supervisorToken = mint({ role: 'supervisor', name: 'PhaseA Supervisor', code: 'PHASEA-SUP' });
const recruitmentToken = mint({ role: 'recruitment', name: 'PhaseA Recruitment', code: 'PHASEA-REC' });

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

async function api(
  method: string,
  path: string,
  token: string,
  body?: unknown
): Promise<{ status: number; j: any }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body != null ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const j = await res.json().catch(() => ({}));
  return { status: res.status, j };
}

function readCronSecret(): string {
  const fromEnv = String(process.env.CRON_SECRET || '').trim();
  if (fromEnv) return fromEnv;
  for (const path of ['.env.vercel.cron', '.env.vercel.prod', '.env.local']) {
    try {
      const line = fs
        .readFileSync(path, 'utf8')
        .split(/\r?\n/)
        .find((l) => l.startsWith('CRON_SECRET='));
      if (!line) continue;
      return line
        .slice('CRON_SECRET='.length)
        .trim()
        .replace(/^['"]|['"]$/g, '');
    } catch {
      /* skip */
    }
  }
  return '';
}

const AUGUST_CYCLES = [
  {
    year: 2026,
    month: 8,
    cycleNumber: 1,
    startDate: '2026-08-01',
    endDate: '2026-08-09',
    payoutDate: '2026-08-09',
    deductionGenerationDate: '2026-08-09',
    isClosing: false,
    equipmentDeductionEnabled: true,
    status: 'active' as const,
    notes: 'SRS014 Phase A production calendar — August 2026 cycle 1',
  },
  {
    year: 2026,
    month: 8,
    cycleNumber: 2,
    startDate: '2026-08-10',
    endDate: '2026-08-16',
    payoutDate: '2026-08-16',
    deductionGenerationDate: '2026-08-16',
    isClosing: false,
    equipmentDeductionEnabled: true,
    status: 'active' as const,
    notes: 'SRS014 Phase A production calendar — August 2026 cycle 2',
  },
  {
    year: 2026,
    month: 8,
    cycleNumber: 3,
    startDate: '2026-08-17',
    endDate: '2026-08-23',
    payoutDate: '2026-08-23',
    deductionGenerationDate: '2026-08-23',
    isClosing: false,
    equipmentDeductionEnabled: true,
    status: 'active' as const,
    notes: 'SRS014 Phase A production calendar — August 2026 cycle 3',
  },
  {
    year: 2026,
    month: 8,
    cycleNumber: 4,
    startDate: '2026-08-24',
    endDate: '2026-08-31',
    payoutDate: '2026-08-31',
    deductionGenerationDate: '2026-08-31',
    isClosing: true,
    equipmentDeductionEnabled: true,
    status: 'active' as const,
    notes: 'SRS014 Phase A production calendar — August 2026 closing cycle',
  },
];

async function countSheetPrefix(sheet: string, prefix: string): Promise<number> {
  try {
    const data = await getSheetData(sheet, false);
    let n = 0;
    for (let i = 1; i < data.length; i++) {
      if (data[i].some((c) => String(c ?? '').includes(prefix))) n++;
    }
    return n;
  } catch {
    return -1;
  }
}

async function main() {
  console.log('=== SRS-014 Phase A — Payout Cycles Controlled Rollout ===');
  console.log('BASE', BASE);

  const cap = await api('GET', '/api/admin/payout-cycles/capability', adminToken);
  check('capability enabled', cap.status === 200 && cap.j.enabled === true, JSON.stringify(cap.j));

  const cronSecret = readCronSecret();
  const cron = await fetch(`${BASE}/api/cron/equipment-auto-deductions`, {
    headers: { Authorization: `Bearer ${cronSecret}` },
  });
  const cronBody = await cron.json().catch(() => ({}));
  check(
    'cron still skipped (auto flag OFF)',
    cron.status === 200 && cronBody.skipped === true,
    JSON.stringify(cronBody)
  );

  const liabBefore = await countSheetPrefix(SHEET_EQUIPMENT_LIABILITY, 'SRS014');
  const autoBefore = await countSheetPrefix(SHEET_EQUIPMENT_AUTO_DEDUCTIONS, 'SRS014');
  const ledgerEquipBefore = await countSheetPrefix(PAYROLL_LEDGER_SHEET_NAME, 'equipment_installment');

  const supPost = await api('POST', '/api/admin/payout-cycles', supervisorToken, AUGUST_CYCLES[0]);
  check('supervisor cannot create cycles', supPost.status === 401, `status=${supPost.status}`);

  const recPost = await api('POST', '/api/admin/payout-cycles', recruitmentToken, AUGUST_CYCLES[0]);
  check('recruitment cannot create cycles', recPost.status === 401, `status=${recPost.status}`);

  const existing = await api('GET', '/api/admin/payout-cycles?year=2026&month=8', adminToken);
  check(
    'list August cycles',
    existing.status === 200 && existing.j.success === true,
    `count=${existing.j.cycles?.length ?? 0}`
  );

  const byNumber = new Map<number, any>((existing.j.cycles || []).map((c: any) => [c.cycleNumber, c]));
  const created: any[] = [];

  for (const input of AUGUST_CYCLES) {
    const found = byNumber.get(input.cycleNumber);
    if (found) {
      console.log(`ℹ️  cycle ${input.cycleNumber} already exists: ${found.cycleId}`);
      created.push(found);
      check(
        `cycle ${input.cycleNumber} dates match intended calendar`,
        found.startDate === input.startDate &&
          found.endDate === input.endDate &&
          found.deductionGenerationDate === input.deductionGenerationDate &&
          Boolean(found.isClosing) === input.isClosing,
        `${found.startDate}..${found.endDate} gen=${found.deductionGenerationDate} closing=${found.isClosing}`
      );
      continue;
    }
    const { status, j } = await api('POST', '/api/admin/payout-cycles', adminToken, input);
    check(
      `create cycle ${input.cycleNumber}`,
      status === 200 && j.success === true,
      JSON.stringify(j.errors || j.cycle?.cycleId)
    );
    if (j.cycle) created.push(j.cycle);
    await new Promise((r) => setTimeout(r, 800));
  }

  check('exactly 4 August cycles present', created.length === 4, `n=${created.length}`);
  for (const c of created) {
    check(
      `cycleId is canonical UUID/opaque (not Arabic label) #${c.cycleNumber}`,
      typeof c.cycleId === 'string' &&
        c.cycleId.length >= 8 &&
        !/الأولى|الثانية|الثالثة|التقفيلة/.test(c.cycleId),
      c.cycleId
    );
  }

  // API rejection cases — must not persist
  const overlap = await api('POST', '/api/admin/payout-cycles', adminToken, {
    ...AUGUST_CYCLES[0],
    cycleNumber: 99,
    startDate: '2026-08-05',
    endDate: '2026-08-12',
    notes: 'SRS014 Phase A reject-overlap — must not persist',
  });
  check('reject overlapping cycle', overlap.status === 400, JSON.stringify(overlap.j.errors));

  const badRange = await api('POST', '/api/admin/payout-cycles', adminToken, {
    year: 2026,
    month: 8,
    cycleNumber: 98,
    startDate: '2026-08-20',
    endDate: '2026-08-10',
    payoutDate: '2026-08-20',
    deductionGenerationDate: '2026-08-20',
    isClosing: false,
    status: 'draft',
    notes: 'SRS014 Phase A reject-range',
  });
  check('reject startDate > endDate', badRange.status === 400, JSON.stringify(badRange.j.errors));

  const dupNum = await api('POST', '/api/admin/payout-cycles', adminToken, {
    ...AUGUST_CYCLES[0],
    notes: 'SRS014 Phase A reject-dup',
  });
  check('reject duplicate cycleNumber', dupNum.status === 400, JSON.stringify(dupNum.j.errors));

  const badMonth = await api('POST', '/api/admin/payout-cycles', adminToken, {
    ...AUGUST_CYCLES[0],
    cycleNumber: 97,
    month: 13,
    notes: 'SRS014 Phase A reject-month',
  });
  check('reject invalid month', badMonth.status === 400, JSON.stringify(badMonth.j.errors));

  const secondClosing = await api('POST', '/api/admin/payout-cycles', adminToken, {
    year: 2026,
    month: 8,
    cycleNumber: 96,
    startDate: '2026-08-31',
    endDate: '2026-08-31',
    payoutDate: '2026-08-31',
    deductionGenerationDate: '2026-08-31',
    isClosing: true,
    status: 'draft',
    notes: 'SRS014 Phase A reject-second-closing',
  });
  check('reject multiple closing cycles', secondClosing.status === 400, JSON.stringify(secondClosing.j.errors));

  // Closing-not-final: pure validation against August peers (no sheet write)
  const peers = created.map((c) => ({
    cycleId: c.cycleId,
    year: c.year,
    month: c.month,
    cycleNumber: c.cycleNumber,
    startDate: c.startDate,
    endDate: c.endDate,
    isClosing: Boolean(c.isClosing),
    status: c.status,
  }));
  const closingNotLast = validatePayoutCycleInput(
    {
      year: 2026,
      month: 8,
      cycleNumber: 95,
      startDate: '2026-08-12',
      endDate: '2026-08-14',
      payoutDate: '2026-08-14',
      deductionGenerationDate: '2026-08-14',
      isClosing: true,
      status: 'draft',
    },
    peers
  );
  check(
    'reject closing cycle that is not final',
    closingNotLast.some((e) => e.field === 'isClosing'),
    JSON.stringify(closingNotLast)
  );

  const invalidDeductionDate = await api('POST', '/api/admin/payout-cycles', adminToken, {
    year: 2026,
    month: 8,
    cycleNumber: 94,
    startDate: '2026-08-01',
    endDate: '2026-08-02',
    payoutDate: 'not-a-date',
    deductionGenerationDate: '32/08/2026',
    isClosing: false,
    status: 'draft',
    notes: 'SRS014 Phase A reject-invalid-dates',
  });
  check(
    'reject invalid payout/deduction dates',
    invalidDeductionDate.status === 400,
    JSON.stringify(invalidDeductionDate.j.errors)
  );

  // Finalized silent edit guard on cycle 1
  const c1 = created.find((c) => c.cycleNumber === 1);
  if (c1) {
    if (c1.status !== 'finalized') {
      const fin = await api('POST', `/api/admin/payout-cycles/${c1.cycleId}/finalize`, adminToken);
      check(
        'finalize cycle 1',
        fin.status === 200 && fin.j.success === true,
        JSON.stringify(fin.j.errors || fin.j.cycle?.status)
      );
    } else {
      check('finalize cycle 1', true, 'already finalized');
    }
    const silent = await api('PATCH', `/api/admin/payout-cycles/${c1.cycleId}`, adminToken, {
      notes: 'silent edit should fail',
    });
    check('reject silent edit of finalized cycle', silent.status === 409, JSON.stringify(silent.j.errors));
    const correct = await api('PATCH', `/api/admin/payout-cycles/${c1.cycleId}`, adminToken, {
      notes: 'Phase A explicit correction note',
      allowFinalizedCorrection: true,
      correctionNote: 'SRS014 Phase A audit correction test — notes only',
    });
    check(
      'allow explicit finalized correction',
      correct.status === 200 && correct.j.success === true,
      JSON.stringify(correct.j.errors || 'ok')
    );
  }

  const listed = await api('GET', '/api/admin/payout-cycles?year=2026&month=8', adminToken);
  const cycles = (listed.j.cycles || []) as PayoutCycle[];
  const resolved = resolveCycleForDeductionDate(cycles, '2026-08-16');
  check(
    'resolve by configured deductionGenerationDate (not week inference)',
    resolved?.cycleNumber === 2 && resolved.deductionGenerationDate === '2026-08-16',
    `resolved=#${resolved?.cycleNumber} gen=${resolved?.deductionGenerationDate}`
  );
  const closing = cycles.find((c) => c.isClosing);
  check('closing cycle exists for payroll/reporting', Boolean(closing), `id=${closing?.cycleId}`);
  check(
    'closing prevents auto equipment deductions',
    closing ? shouldSkipEquipmentAutoDeductions(closing) === true : false,
    `isClosing=${closing?.isClosing}`
  );
  if (closing) {
    const elig = isCycleEligibleForEquipmentDeduction(closing, cycles, '2026-08-01');
    check(
      'closing eligibility reason',
      elig.eligible === false && elig.reason === 'closing_cycle',
      elig.reason || ''
    );
  }

  // July/August boundary: cycle 1 starts on month start (Admin-configured), not hard-coded Monday
  const first = cycles.find((c) => c.cycleNumber === 1);
  check(
    'first cycle uses Admin-configured month start (2026-08-01), not hard-coded Monday week',
    first?.startDate === '2026-08-01' && first.endDate === '2026-08-09',
    `${first?.startDate}..${first?.endDate}`
  );

  const audit = await getSheetData(AUDIT_LOG_SHEET_NAME, false);
  let auditHits = 0;
  for (const c of created) {
    for (let i = audit.length - 1; i >= 1 && i >= audit.length - 120; i--) {
      const row = audit[i];
      const entity = String(row[4] ?? '');
      const action = String(row[2] ?? '');
      const actor = String(row[5] ?? '');
      const ts = String(row[9] ?? '');
      const afterJson = String(row[8] ?? '');
      if (
        entity === c.cycleId &&
        (action === 'create_cycle' || action === 'update_cycle' || action === 'correct_cycle') &&
        actor &&
        ts &&
        afterJson.includes(c.cycleId)
      ) {
        auditHits++;
        break;
      }
    }
  }
  check(
    'audit trail present for August cycles (actor+action+timestamp+cycleId+after)',
    auditHits >= 1,
    `hits=${auditHits}`
  );

  const sheet = await getSheetData(SHEET_PAYOUT_CYCLES, false);
  check('دورات_القبض sheet readable (lazy/additive)', sheet.length >= 1, `rows=${sheet.length - 1}`);

  const liabAfter = await countSheetPrefix(SHEET_EQUIPMENT_LIABILITY, 'SRS014');
  const autoAfter = await countSheetPrefix(SHEET_EQUIPMENT_AUTO_DEDUCTIONS, 'SRS014');
  const ledgerEquipAfter = await countSheetPrefix(PAYROLL_LEDGER_SHEET_NAME, 'equipment_installment');
  check('no new SRS014 liability rows', liabAfter === liabBefore, `${liabBefore}→${liabAfter}`);
  check('no new SRS014 auto-deduction rows', autoAfter === autoBefore, `${autoBefore}→${autoAfter}`);
  check(
    'equipment_installment ledger count unchanged',
    ledgerEquipAfter === ledgerEquipBefore,
    `${ledgerEquipBefore}→${ledgerEquipAfter}`
  );

  // Confirm rejected attempts did not leave cycleNumber 94-99 rows
  const orphan = cycles.filter((c) => c.cycleNumber >= 94);
  check('no persisted rejected August QA cycleNumbers', orphan.length === 0, `orphans=${orphan.length}`);

  console.log(`\n=== Phase A API Result: ${passed} passed, ${failed} failed ===`);
  console.log(
    'August cycles:',
    JSON.stringify(
      created.map((c) => ({
        cycleId: c.cycleId,
        n: c.cycleNumber,
        range: `${c.startDate}..${c.endDate}`,
        gen: c.deductionGenerationDate,
        closing: c.isClosing,
        status: c.status,
      })),
      null,
      2
    )
  );
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
