import fs from 'node:fs';
import path from 'node:path';
import { loadAllCandidates } from '@/lib/recruitment/recruitmentService';
import { getSheetData } from '@/lib/googleSheets';

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
  const sample = cands.slice(0, 5).map((c) => ({
    id: c.id,
    fullName: c.fullName,
    riderCode: c.riderCode,
    phone: c.phone,
    activationStatus: c.activationStatus,
    activationConfirmed: c.activationConfirmed,
    activationDate: c.activationDate,
    securityInquiryPayment: c.securityInquiryPayment,
    finalAssignedSupervisorCode: c.finalAssignedSupervisorCode,
    equipmentStatus: c.equipmentStatus,
    pipelineStatus: c.pipelineStatus,
  }));
  console.log(
    JSON.stringify(
      {
        sample,
        actConfirmed: cands.filter((c) => c.activationConfirmed === 'مؤكد').length,
        actStatus: cands.filter((c) => c.activationStatus === 'مفعل - تم القبول')
          .length,
        withSec: cands.filter(
          (c) =>
            c.securityInquiryPayment === 'PAID' ||
            c.securityInquiryPayment === 'NOT_PAID'
        ).length,
        withSup: cands.filter((c) =>
          String(c.finalAssignedSupervisorCode || '').trim()
        ).length,
        withAnyRiderCode: cands.filter((c) => String(c.riderCode || '').trim())
          .length,
      },
      null,
      2
    )
  );

  const live = await getSheetData('المناديب', false);
  const codes = ['4821034', '4822961', '4826265', '4828725'];
  for (const code of codes) {
    const row = live.slice(1).find((r) => String(r[0] || '').trim() === code);
    console.log(
      JSON.stringify({
        code,
        inLive: Boolean(row),
        row: row
          ? {
              code: row[0],
              name: row[1],
              zone: row[2],
              sup: row[3],
              supName: row[4],
              join: row[6],
              status: row[7],
            }
          : null,
      })
    );
  }

  // Name match pending riders against candidates
  const pendingNames = [
    'Mostafa Fathy',
    'Mohamed Saied Khalil',
    'Mohamed Ahmed Elsayed',
    'Mohamed Ayman Mohamed Omar',
  ];
  for (const n of pendingNames) {
    const hits = cands
      .filter((c) =>
        String(c.fullName || '')
          .toLowerCase()
          .includes(n.toLowerCase().slice(0, 10))
      )
      .slice(0, 5)
      .map((c) => ({
        fullName: c.fullName,
        riderCode: c.riderCode,
        activationStatus: c.activationStatus,
        activationConfirmed: c.activationConfirmed,
        securityInquiryPayment: c.securityInquiryPayment,
        finalAssignedSupervisorCode: c.finalAssignedSupervisorCode,
        phone: c.phone,
      }));
    console.log(JSON.stringify({ nameQuery: n, hits }, null, 2));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
