import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  aggregateTalabatFromDailySeries,
  buildNoShowComparison,
  computeFleetTalabatMetrics,
  computeDailyTalabatSeries,
} from '@/lib/strategicOps/talabatOpsMetrics';

describe('talabatOpsMetrics', () => {
  it('matches user example: 1222 hours, 202 active, 339 headcount', () => {
    const assigned = new Set(['R1', 'R2', 'R3']);
    const calendarDates = ['2026-06-01'];
    const performance = [
      { date: '2026-06-01', riderCode: 'R1', hours: 6, orders: 10 },
      { date: '2026-06-01', riderCode: 'R2', hours: 6, orders: 8 },
      ...Array.from({ length: 200 }, (_, i) => ({
        date: '2026-06-01',
        riderCode: `A${i}`,
        hours: 6.05,
        orders: 1,
      })),
    ];

    const dailySeries = computeDailyTalabatSeries({
      calendarDates,
      performance,
      assignedRiderCodes: new Set([...assigned, ...Array.from({ length: 200 }, (_, i) => `A${i}`)]),
      dailyTargetHours: 1500,
    });

    const day = dailySeries[0];
    assert.equal(day.activeRiders, 202);
    assert.equal(day.hours, 1222);

    const metrics = aggregateTalabatFromDailySeries(dailySeries, 339, 202);
    assert.ok(Math.abs(metrics.utilizationPercent - 59.59) < 0.1);
    assert.ok(Math.abs(metrics.avgHoursPerActiveRider - 6.05) < 0.1);
    assert.ok(Math.abs(metrics.achievementPercent - 81.47) < 0.5);
  });

  it('averages active/hours across calendar days with zero on missing data days', () => {
    const assigned = new Set(['R1']);
    const metrics = computeFleetTalabatMetrics({
      calendarDates: ['2026-06-01', '2026-06-02'],
      performance: [{ date: '2026-06-01', riderCode: 'R1', hours: 8, orders: 2 }],
      assignedRiderCodes: assigned,
      fleetDailyTargetHours: 1500,
      headcount: 10,
    });
    assert.equal(metrics.activeRiders, 0.5);
    assert.equal(metrics.actualHours, 4);
  });

  it('counts no-show only for scheduled riders with row and zero work', () => {
    const assigned = new Set(['R1', 'R2']);
    const metrics = computeFleetTalabatMetrics({
      calendarDates: ['2026-06-01'],
      performance: [
        { date: '2026-06-01', riderCode: 'R1', hours: 0, orders: 0 },
        { date: '2026-06-01', riderCode: 'R2', hours: 5, orders: 1 },
      ],
      assignedRiderCodes: assigned,
      fleetDailyTargetHours: 1500,
      headcount: 2,
    });
    assert.equal(metrics.noShowRiders, 1);
    assert.equal(metrics.activeRiders, 1);
    assert.equal(metrics.dailySeries[0].scheduledRiders, 2);
  });

  it('excludes assigned riders without a daily row (not scheduled that day)', () => {
    const assigned = new Set(['R1', 'R2', 'R3']);
    const metrics = computeFleetTalabatMetrics({
      calendarDates: ['2026-06-01'],
      performance: [
        { date: '2026-06-01', riderCode: 'R1', hours: 0, orders: 0 },
        { date: '2026-06-01', riderCode: 'R2', hours: 4, orders: 1 },
      ],
      assignedRiderCodes: assigned,
      fleetDailyTargetHours: 1500,
      headcount: 3,
    });
    assert.equal(metrics.noShowRiders, 1);
    assert.equal(metrics.dailySeries[0].scheduledRiders, 2);
  });

  it('averages no-show over operational days only', () => {
    const assigned = new Set(['R1', 'R2']);
    const metrics = computeFleetTalabatMetrics({
      calendarDates: ['2026-06-01', '2026-06-02', '2026-06-03'],
      performance: [
        { date: '2026-06-01', riderCode: 'R1', hours: 0, orders: 0 },
        { date: '2026-06-03', riderCode: 'R1', hours: 0, orders: 0 },
      ],
      assignedRiderCodes: assigned,
      fleetDailyTargetHours: 1500,
      headcount: 2,
    });
    assert.equal(metrics.operationalDays, 2);
    assert.equal(metrics.noShowRiders, 1);
  });

  it('excludes riders with orders but zero hours from no-show', () => {
    const assigned = new Set(['R1']);
    const metrics = computeFleetTalabatMetrics({
      calendarDates: ['2026-06-01'],
      performance: [{ date: '2026-06-01', riderCode: 'R1', hours: 0, orders: 3 }],
      assignedRiderCodes: assigned,
      fleetDailyTargetHours: 1500,
      headcount: 1,
    });
    assert.equal(metrics.noShowRiders, 0);
    assert.equal(metrics.activeRiders, 0);
  });

  it('buildNoShowComparison computes deviation', () => {
    const cmp = buildNoShowComparison(37, 40);
    assert.equal(cmp.deviationPercent, 7.5);
    assert.equal(cmp.withinTolerance, false);
  });
});
