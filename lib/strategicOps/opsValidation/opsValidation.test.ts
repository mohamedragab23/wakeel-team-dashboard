import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getTalabatWeeksInMonth } from './talabatWeeks';
import { assignExclusiveLostHoursCategory } from './lostHoursExclusive';
import { attributeByDaySupervisor, totalsMatch } from './attribution';
import { runOpsValidation } from './certificationEngine';
import { isRiderActiveByRules } from '@/lib/strategicOps/config/businessRules';
import {
  applyDayFilters,
  buildDemoFleet,
  kpiFromDays,
} from './filterPipeline';
import { runExportValidationSuite } from './exportValidation';

describe('SRS-008 opsValidation Complete', () => {
  it('active rider AND rule', () => {
    assert.equal(isRiderActiveByRules(5, 10), true);
    assert.equal(isRiderActiveByRules(5, 0), false);
  });

  it('talabat weeks july 2026', () => {
    const w = getTalabatWeeksInMonth(2026, 7);
    assert.equal(w.length, 5);
    assert.equal(w[0].endDate, '2026-07-05');
  });

  it('lost hours exclusive', () => {
    assert.equal(
      assignExclusiveLostHoursCategory({ medical: true, no_show: true }),
      'medical'
    );
  });

  it('day attribution', () => {
    const days = [
      { date: '2026-07-13', supervisorCode: 'A', zone: 'Z1', hours: 8, orders: 1 },
      { date: '2026-07-14', supervisorCode: 'A', zone: 'Z1', hours: 8, orders: 1 },
      { date: '2026-07-15', supervisorCode: 'B', zone: 'Z1', hours: 8, orders: 1 },
    ];
    const buckets = attributeByDaySupervisor(days);
    assert.equal(buckets.find((b) => b.key === 'A')?.hours, 16);
    assert.ok(totalsMatch(days, buckets));
  });

  it('filter pipeline', () => {
    const { days } = buildDemoFleet();
    assert.equal(kpiFromDays(applyDayFilters(days, { supervisorCode: 'SA' })).hours, 22);
  });

  it('export validation suite', () => {
    const rows = runExportValidationSuite();
    assert.ok(rows.every((r) => r.pass));
  });

  it('full suite meets SRS-008 DoD (150+, PASS)', () => {
    const report = runOpsValidation();
    assert.ok(report.results.length >= 150, `got ${report.results.length}`);
    const failedCritical = report.results.filter((r) => r.critical && r.status === 'fail');
    assert.equal(
      failedCritical.length,
      0,
      failedCritical.map((f) => `${f.id}:${f.actual}`).join(' | ')
    );
    assert.equal(report.certificate.verdict, 'PASS');
    assert.ok(
      ['production_ready', 'enterprise_certified'].includes(report.certificate.level)
    );
    assert.ok(report.results.some((r) => r.id === 'P3-PERF-500K' && r.status === 'pass'));
    assert.ok(report.results.some((r) => r.id === 'P3-ATT-PROD-PATH' && r.status === 'pass'));
  });
});
