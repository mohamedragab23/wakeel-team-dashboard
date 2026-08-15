import fs from 'node:fs';
import path from 'node:path';
import { loadAllCandidates } from '@/lib/recruitment/recruitmentService';
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
  const cands = await loadAllCandidates(false);
  const activated = cands.filter(
    (c) =>
      c.activationConfirmed === 'مؤكد' ||
      c.activationStatus === 'مفعل - تم القبول'
  );
  console.log(
    JSON.stringify(
      {
        activatedCount: activated.length,
        rows: activated.map((c) => {
          const gate = assertPhaseCCandidateReady(c, c.riderCode || 'MISSING');
          return {
            fullName: c.fullName,
            riderCode: c.riderCode || '(empty)',
            activationDate: c.activationDate,
            activationStatus: c.activationStatus,
            activationConfirmed: c.activationConfirmed,
            securityInquiryPayment: c.securityInquiryPayment || '(empty)',
            finalAssignedSupervisorCode:
              c.finalAssignedSupervisorCode || '(empty)',
            equipmentStatus: c.equipmentStatus,
            gateOk: gate.ok,
            gateCode: gate.ok ? null : gate.code,
          };
        }),
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
