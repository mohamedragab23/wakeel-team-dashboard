/**
 * 4D.5.4.7 — READ-ONLY Phase-C gate check for pending delivery riders.
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadAllCandidates } from '@/lib/recruitment/recruitmentService';
import { assertPhaseCCandidateReady } from '@/lib/equipmentLiability/phaseCGates';
import { normalizeRiderCodeForPerformance } from '@/lib/riderCodeUtils';
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
  const targets = ['4821034', '4822961', '4826265', '4828725'];
  const cands = await loadAllCandidates(false);
  console.log('candidatesTotal', cands.length);
  console.log(
    'withRiderCode',
    cands.filter((c) => String(c.riderCode || '').trim()).length
  );

  for (const t of targets) {
    const n = normalizeRiderCodeForPerformance(t);
    const hit = cands.find(
      (c) => normalizeRiderCodeForPerformance(c.riderCode) === n
    );
    if (!hit) {
      console.log(JSON.stringify({ riderCode: t, found: false }));
      continue;
    }
    const gate = assertPhaseCCandidateReady(hit, t);
    console.log(
      JSON.stringify(
        {
          riderCode: t,
          found: true,
          fullName: hit.fullName,
          activationStatus: hit.activationStatus,
          activationConfirmed: hit.activationConfirmed,
          activationDate: hit.activationDate,
          securityInquiryPayment: hit.securityInquiryPayment,
          finalAssignedSupervisorCode: hit.finalAssignedSupervisorCode,
          vehicleType: hit.vehicleType,
          zone: hit.zone,
          gate,
        },
        null,
        2
      )
    );
  }

  // Broader: any activated candidate with security + supervisor + no equipment yet
  const phaseCReady = cands
    .filter((c) => {
      const g = assertPhaseCCandidateReady(c, c.riderCode);
      return g.ok;
    })
    .slice(0, 20)
    .map((c) => ({
      riderCode: c.riderCode,
      fullName: c.fullName,
      activationDate: c.activationDate,
      securityInquiryPayment: c.securityInquiryPayment,
      finalAssignedSupervisorCode: c.finalAssignedSupervisorCode,
      equipmentStatus: c.equipmentStatus,
      zone: c.zone,
      vehicleType: c.vehicleType,
    }));
  console.log('phaseCReadyCountApprox', phaseCReady.length);
  console.log(JSON.stringify({ phaseCReadySample: phaseCReady }, null, 2));

  // Check if pending riders appear in live riders sheet
  const live = await getSheetData('المناديب', false).catch(() => null);
  const liveAlt = live || (await getSheetData('Live Riders', false).catch(() => null));
  console.log('liveSheetRows', liveAlt?.length ?? 0);
  if (liveAlt?.[0]) console.log('liveHeaderSample', liveAlt[0].slice(0, 15));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
