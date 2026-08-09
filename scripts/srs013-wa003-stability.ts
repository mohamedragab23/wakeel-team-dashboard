/**
 * Prove whether WA-003 mismatch is OFF/ON ledger-related or non-deterministic sheet floats.
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { calculateSupervisorSalary } from '../lib/salaryService';
import { invalidateSalaryCaches } from '../lib/cacheInvalidation';

function stripLedger(r: any) {
  const { ledgerTransactions, ...rest } = r || {};
  return rest;
}

async function run(label: string, flag: 'true' | 'false') {
  await invalidateSalaryCaches();
  process.env.FEATURE_PAYROLL_LEDGER_ENABLED = flag;
  process.env.FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED = 'false';
  const r = await calculateSupervisorSalary('WA-003', '2026-07-01', '2026-07-31');
  return { label, flag, json: JSON.stringify(stripLedger(r)), net: (r as any).netSalary, hours: (r as any).periodTotals?.totalHours };
}

async function main() {
  const a = await run('A', 'false');
  const b = await run('B', 'false');
  const c = await run('C', 'true');
  const d = await run('D', 'true');

  console.log('A(off) net', a.net, 'hours', a.hours);
  console.log('B(off) net', b.net, 'hours', b.hours);
  console.log('C(on)  net', c.net, 'hours', c.hours);
  console.log('D(on)  net', d.net, 'hours', d.hours);
  console.log('A==B (off vs off)', a.json === b.json);
  console.log('C==D (on vs on)', c.json === d.json);
  console.log('A==C (off vs on)', a.json === c.json);
  console.log('B==D (off vs on)', b.json === d.json);

  if (a.json !== c.json) {
    // find first differing index
    const n = Math.min(a.json.length, c.json.length);
    let i = 0;
    while (i < n && a.json[i] === c.json[i]) i++;
    console.log('first diff at', i);
    console.log('OFF slice', a.json.slice(Math.max(0, i - 40), i + 80));
    console.log('ON  slice', c.json.slice(Math.max(0, i - 40), i + 80));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
