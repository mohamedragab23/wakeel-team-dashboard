/**
 * Diagnose WA-003 Phase 3 OFF vs ON mismatch — print exact key diffs.
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { calculateSupervisorSalary } from '../lib/salaryService';
import { invalidateSalaryCaches } from '../lib/cacheInvalidation';
import { getLedgerTransactions } from '../lib/payrollLedger';

function deepDiff(a: any, b: any, path = ''): string[] {
  const out: string[] = [];
  if (a === b) return out;
  if (typeof a !== typeof b) {
    out.push(`${path || '(root)'}: type ${typeof a} !== ${typeof b} | ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
    return out;
  }
  if (a == null || b == null || typeof a !== 'object') {
    out.push(`${path || '(root)'}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
    return out;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) out.push(`${path}.length: ${a.length} !== ${b.length}`);
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) out.push(...deepDiff(a[i], b[i], `${path}[${i}]`));
    return out;
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (!(k in a)) out.push(`${path}.${k}: MISSING in OFF, ON=${JSON.stringify(b[k]).slice(0, 200)}`);
    else if (!(k in b)) out.push(`${path}.${k}: MISSING in ON, OFF=${JSON.stringify(a[k]).slice(0, 200)}`);
    else out.push(...deepDiff(a[k], b[k], path ? `${path}.${k}` : k));
  }
  return out;
}

async function main() {
  const code = 'WA-003';
  const startDate = '2026-07-01';
  const endDate = '2026-07-31';
  const periodLabel = '2026-07';

  const rows = await getLedgerTransactions({ entityCode: code, period: periodLabel });
  console.log('ledger rows', rows.length, 'active', rows.filter((r) => r.status === 'active').length);
  console.log(
    'sources',
    rows.map((r) => ({ id: r.transactionId, status: r.status, source: r.source, amount: r.amount, category: (r as any).category }))
  );

  await invalidateSalaryCaches();
  process.env.FEATURE_PAYROLL_LEDGER_ENABLED = 'false';
  process.env.FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED = 'false';
  const off = await calculateSupervisorSalary(code, startDate, endDate);

  await invalidateSalaryCaches();
  process.env.FEATURE_PAYROLL_LEDGER_ENABLED = 'true';
  process.env.FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED = 'false';
  const on = await calculateSupervisorSalary(code, startDate, endDate);

  const { ledgerTransactions, ...onWithoutLedger } = on as any;
  const diffs = deepDiff(off, onWithoutLedger);
  console.log('\nDIFF COUNT', diffs.length);
  console.log(diffs.slice(0, 80).join('\n'));
  console.log('\nOFF net', (off as any).netSalary, 'ON net', (on as any).netSalary);
  console.log('ON has ledgerTransactions', Array.isArray(ledgerTransactions), 'len', ledgerTransactions?.length);
  console.log('OFF keys', Object.keys(off as any).sort().join(','));
  console.log('ON keys (stripped)', Object.keys(onWithoutLedger).sort().join(','));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
