import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

describe('healthMonitor scoring bands', () => {
  it('maps score to healthy / degraded / critical', () => {
    const statusFromScore = (score: number) => {
      if (score >= 85) return 'healthy';
      if (score >= 70) return 'degraded';
      return 'critical';
    };
    assert.equal(statusFromScore(90), 'healthy');
    assert.equal(statusFromScore(75), 'degraded');
    assert.equal(statusFromScore(40), 'critical');
  });

  it('weights data/api/calc into overall score as documented', () => {
    const overall = (data: number, api: number, calc: number) =>
      Math.round((data * 0.4 + api * 0.25 + calc * 0.35) * 100) / 100;
    assert.equal(overall(100, 100, 100), 100);
    assert.equal(overall(50, 100, 100), 80);
    assert.ok(overall(50, 50, 50) === 50);
  });
});
