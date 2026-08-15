/**
 * READ-ONLY pilot + FA flag check for RBAC acceptance audit.
 * Zero writes. Zero Financial Apply.
 */
import fs from 'node:fs';
import path from 'node:path';

function loadEnv() {
  const p = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

function normRider(c: string): string {
  return String(c || '').trim().replace(/^0+/, '') || '0';
}

async function main() {
  loadEnv();
  delete process.env.FEATURE_SRS014_FINANCIAL_APPLY_ENABLED;
  delete process.env.FEATURE_AUTO_EQUIPMENT_DEDUCTIONS_ENABLED;
  delete process.env.FEATURE_SRS014_OPENING_BALANCE_WRITE_ENABLED;

  const { listIssues } = await import('@/lib/equipmentLiability/store');
  const {
    isSrs014FinancialApplyEnabled,
    isAutoEquipmentDeductionsEnabled,
    isSrs014OpeningBalanceWriteEnabled,
  } = await import('@/lib/srs014Flags');

  const issues = await listIssues();
  const pilots = ['877614', '4802535', '4811093'] as const;
  const out: Record<string, unknown> = {};

  for (const code of pilots) {
    const rows = issues.filter((i) => normRider(String(i.riderCode || '')) === code);
    const opening = rows.filter(
      (i) =>
        String(i.deliveryRowRef || '').includes('OPENING') ||
        String((i as { pricingSource?: string }).pricingSource || '') === 'OPENING_MIGRATION'
    );
    out[code] = {
      totalRows: rows.length,
      openingCount: opening.length,
      opening: opening.map((o) => ({
        id: o.id,
        status: o.status,
        outstandingMilli: o.outstandingMilli,
        amountDeductedMilli: o.amountDeductedMilli,
        settlementPaidMilli: o.settlementPaidMilli,
        totalLiabilityMilli: o.totalLiabilityMilli,
        deliveryRowRef: o.deliveryRowRef,
      })),
    };
  }

  console.log(
    JSON.stringify(
      {
        flags: {
          FA: isSrs014FinancialApplyEnabled(),
          AUTO: isAutoEquipmentDeductionsEnabled(),
          OPENING_WRITE: isSrs014OpeningBalanceWriteEnabled(),
        },
        pilots: out,
        mutations: 'NONE_THIS_AUDIT',
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error('PILOT_READ_FAILED', e instanceof Error ? e.message : e);
  process.exit(1);
});
