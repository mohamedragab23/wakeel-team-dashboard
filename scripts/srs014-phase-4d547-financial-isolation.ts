/**
 * 4D.5.4.7 — READ-ONLY financial isolation + liability count markers.
 */
import fs from 'node:fs';
import path from 'node:path';
import { getSheetData } from '@/lib/googleSheets';
import { SHEET_EQUIPMENT_LIABILITY } from '@/lib/equipmentLiability/constants';
import {
  isAutoEquipmentDeductionsEnabled,
  isEquipmentLedgerEnabled,
  isSrs014FinancialApplyEnabled,
} from '@/lib/srs014Flags';
import { loadAdminEquipmentPricingFromSheets } from '@/lib/equipmentPricing/loadAdminPricing';
import { findCandidateByRiderCode } from '@/lib/equipmentLiability/store';
import { assertPhaseCCandidateReady } from '@/lib/equipmentLiability/phaseCGates';

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    const k = m[1].trim();
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v.replace(/\\n/g, '\n');
  }
}

async function main() {
  loadEnvLocal();
  const liability = await getSheetData(SHEET_EQUIPMENT_LIABILITY, false);
  const pricing = await loadAdminEquipmentPricingFromSheets();
  const probeRider = '4821034';
  const cand = await findCandidateByRiderCode(probeRider);
  const gate = assertPhaseCCandidateReady(cand, probeRider);

  console.log(
    JSON.stringify(
      {
        at: new Date().toISOString(),
        flags: {
          FINANCIAL_APPLY: isSrs014FinancialApplyEnabled(),
          EQUIPMENT_LEDGER_localEnv: isEquipmentLedgerEnabled(),
          AUTO_DEDUCTIONS: isAutoEquipmentDeductionsEnabled(),
        },
        liabilitySheetRows: liability?.length || 0,
        liabilityDataRows: Math.max(0, (liability?.length || 1) - 1),
        pricingOk: pricing.ok,
        pricingEgp: pricing.ok ? pricing.egp : null,
        probePendingRider: {
          riderCode: probeRider,
          candidateFound: Boolean(cand),
          gateOk: gate.ok,
          gateCode: gate.ok ? null : gate.code,
        },
        financialMutations: 0,
        note: 'LEDGER is ON in Vercel Production env (separate from local .env.local). Approve path would still fail Phase-C gates.',
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
