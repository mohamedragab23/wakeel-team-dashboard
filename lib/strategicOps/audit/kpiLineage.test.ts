import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildKpiLineageFromAuditResult } from './kpiLineage';
import type { AuditResult } from './types';

const sample: AuditResult = {
  id: 'a-headcount',
  section: 'A',
  sectionTitle: 'Fleet',
  kpi: 'Headcount',
  formula: 'COUNT(codes)',
  rawSource: 'المناديب',
  intermediate: '512 codes',
  reportValue: 512,
  auditValue: 512,
  expected: 512,
  calculated: 512,
  diff: 0,
  pctDiff: 0,
  unit: '',
  status: 'PASS',
  toleranceWarnPct: 1,
  toleranceFailPct: 5,
};

describe('kpiLineage', () => {
  it('builds lineage with validation and steps', () => {
    const lineage = buildKpiLineageFromAuditResult(sample, {
      sourceRows: 1000,
      rowsUsed: 950,
      duplicateRows: 5,
      ghostRows: 10,
      coverage: 98.7,
      lastRefresh: '2026-07-19T00:00:00.000Z',
    });

    assert.equal(lineage.kpi, 'Headcount');
    assert.equal(lineage.sourceSheet, 'المناديب');
    assert.equal(lineage.rowsUsed, 950);
    assert.equal(lineage.confidence, 95);
    assert.equal(lineage.coverage, 98.7);
    assert.ok(lineage.calculationSteps.length >= 4);
    assert.equal(lineage.validationChecks[0].status, 'pass');
  });

  it('marks FAIL lineage with low confidence', () => {
    const lineage = buildKpiLineageFromAuditResult({ ...sample, status: 'FAIL', pctDiff: 8, diff: 40 });
    assert.equal(lineage.confidence, 40);
    assert.equal(lineage.validationChecks[1].status, 'fail');
  });
});
