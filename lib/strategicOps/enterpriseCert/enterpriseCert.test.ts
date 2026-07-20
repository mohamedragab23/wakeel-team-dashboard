import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  runEnterpriseCertification,
  evaluateDeployGates,
  buildEnterpriseCertificateHtml,
} from './index';

describe('SRS-009 Enterprise Certification', () => {
  it('runs 10 levels and produces certificate text', () => {
    const report = runEnterpriseCertification();
    assert.equal(report.certificate.levels.length, 10);
    assert.ok(report.certificate.certificateText.includes('Enterprise Production Certificate'));
    assert.ok(report.certificate.enterpriseScore >= 0);
    assert.ok(report.opsValidationSummary.totalTests >= 217);
  });

  it('L1–L8 and L10 pass; L9 pending without Sheets blocks Production Ready', () => {
    const report = runEnterpriseCertification();
    for (const l of report.certificate.levels) {
      if (l.rank === 9) {
        assert.equal(l.passed, false, 'L9 must not auto-pass without Sheets 0% sample');
        continue;
      }
      assert.equal(l.passed, true, `L${l.rank} ${l.titleEn} should pass: ${l.blockers.join('; ')}`);
    }
    assert.equal(report.certificate.productionReady, false);
    assert.equal(report.certificate.verdict, 'FAIL');
    assert.equal(report.certificate.tier, 'gold', 'without L9 max display tier is gold');
  });

  it('deploy gate blocks without L9', () => {
    const g = evaluateDeployGates();
    assert.equal(g.allowDeploy, false);
    assert.ok(g.failedGates.includes('business_sheets'));
  });

  it('certificate HTML renders', () => {
    const report = runEnterpriseCertification();
    const html = buildEnterpriseCertificateHtml(report.certificate);
    assert.ok(html.includes('Enterprise Production Certificate'));
    assert.ok(html.includes('L1'));
  });
});
