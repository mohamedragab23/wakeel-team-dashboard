/**
 * SRS-009 Enterprise Deploy Gate — exit 0 only when Production Ready.
 * Usage: npx tsx scripts/enterprise-cert-gate.ts
 * Staging override: ALLOW_PENDING_L9=1 (not for production release)
 */

import {
  evaluateDeployGates,
  runEnterpriseCertification,
} from '../lib/strategicOps/enterpriseCert/engine';

function main() {
  const allowPendingL9 = process.env.ALLOW_PENDING_L9 === '1';
  const report = runEnterpriseCertification();
  const { allowDeploy, failedGates } = evaluateDeployGates(report);

  console.log('=== SRS-009 Enterprise Deploy Gate ===');
  console.log('Verdict:', report.certificate.verdict);
  console.log('Tier:', report.certificate.tier);
  console.log('Score:', report.certificate.enterpriseScore);
  console.log('Production Ready:', report.certificate.productionReady);
  console.log('Failed gates:', failedGates.length ? failedGates.join(', ') : 'none');
  console.log('L9 status:', report.certificate.levels[8]?.passed ? 'PASS' : 'PENDING/FAIL');

  if (allowDeploy) {
    console.log('ALLOW DEPLOY');
    process.exit(0);
  }

  if (
    allowPendingL9 &&
    failedGates.length === 1 &&
    failedGates[0] === 'business_sheets' &&
    report.certificate.levels.filter((l) => l.rank !== 9).every((l) => l.passed)
  ) {
    console.warn('ALLOW DEPLOY (staging) — L9 Sheets 0% pending via ALLOW_PENDING_L9=1');
    process.exit(0);
  }

  console.error('BLOCK DEPLOY — SRS-009 gates failed');
  process.exit(1);
}

main();
