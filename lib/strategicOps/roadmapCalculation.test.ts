import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computeAdditionalRidersNeeded,
  formatAdditionalRidersCalculation,
  validateRoadmapRidersAudit,
} from '@/lib/strategicOps/roadmapCalculation';

describe('roadmapCalculation', () => {
  it('Gap=1140.09 AvgHours=5.49 → 208 riders', () => {
    const audit = computeAdditionalRidersNeeded(1140.09, 5.49);
    assert.equal(audit.rawQuotient, 207.67);
    assert.equal(audit.roundedResult, 208);
    assert.equal(validateRoadmapRidersAudit(audit), true);
    assert.match(formatAdditionalRidersCalculation(audit), /208 طيار/);
    assert.match(formatAdditionalRidersCalculation(audit), /1140\.09 ÷ 5\.49/);
  });

  it('never returns 0 riders when gap and avg are both positive', () => {
    const audit = computeAdditionalRidersNeeded(100, 50);
    assert.equal(audit.roundedResult, 2);
    assert.equal(validateRoadmapRidersAudit(audit), true);
  });

  it('does not coerce null avg to 0 for calculation', () => {
    const audit = computeAdditionalRidersNeeded(500, null);
    assert.equal(audit.roundedResult, null);
    assert.equal(audit.avgHoursPerActiveRider, null);
  });

  it('does not coerce undefined gap to 0 riders when gap is positive', () => {
    const audit = computeAdditionalRidersNeeded(10, 5);
    assert.equal(audit.roundedResult, 2);
  });

  it('zero gap yields zero riders', () => {
    const audit = computeAdditionalRidersNeeded(0, 5.49);
    assert.equal(audit.roundedResult, 0);
    assert.equal(validateRoadmapRidersAudit(audit), true);
  });
});
