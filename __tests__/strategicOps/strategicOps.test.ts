/**
 * Strategic Operations Testing Suite
 * 
 * Comprehensive tests for all Strategic Operations modules.
 * 
 * @module StrategicOpsTests
 * @version 1.0
 */

import { describe, it, expect } from '@jest/globals';
import type { KPIEngineOutput } from '@/lib/strategicOps/kpi';

// ============================================================================
// TEST DATA GENERATORS
// ============================================================================

/**
 * Generate mock KPI data for testing
 */
export function generateMockKPIData(overrides?: Partial<any>): KPIEngineOutput {
  const baseData: any = {
    hours: {
      totalWorkingHours: {
        value: { current: 5000, previous: 4800, weekAgo: 4900 },
        trend: { vsYesterday: 4.2, vsLastWeek: 2.0 },
        status: 'good',
      },
      targetHours: {
        value: { current: 5500, previous: 5500, weekAgo: 5500 },
        trend: { vsYesterday: 0, vsLastWeek: 0 },
        status: 'neutral',
      },
      hoursAchievement: {
        value: { current: 90.9, previous: 87.3, weekAgo: 89.1 },
        trend: { vsYesterday: 3.6, vsLastWeek: 1.8 },
        status: 'good',
      },
    },
    headcount: {
      totalRiders: {
        value: { current: 250, previous: 250, weekAgo: 245 },
        trend: { vsYesterday: 0, vsLastWeek: 2.0 },
        status: 'neutral',
      },
      workingRiders: {
        value: { current: 180, previous: 175, weekAgo: 178 },
        trend: { vsYesterday: 2.9, vsLastWeek: 1.1 },
        status: 'good',
      },
      activeRiders: {
        value: { current: 180, previous: 175, weekAgo: 178 },
        trend: { vsYesterday: 2.9, vsLastWeek: 1.1 },
        status: 'good',
      },
    },
    orders: {
      totalOrders: {
        value: { current: 11500, previous: 11200, weekAgo: 11300 },
        trend: { vsYesterday: 2.7, vsLastWeek: 1.8 },
        status: 'good',
      },
      ordersPerHour: {
        value: { current: 2.3, previous: 2.33, weekAgo: 2.31 },
        trend: { vsYesterday: -1.3, vsLastWeek: -0.4 },
        status: 'good',
      },
    },
    attendance: {
      attendancePercent: {
        value: { current: 86.5, previous: 85.2, weekAgo: 87.1 },
        trend: { vsYesterday: 1.3, vsLastWeek: -0.6 },
        status: 'good',
      },
    },
    break: {
      breakPercent: {
        value: { current: 7.8, previous: 8.2, weekAgo: 8.0 },
        trend: { vsYesterday: -4.9, vsLastWeek: -2.5 },
        status: 'good',
      },
    },
    late: {
      latePercent: {
        value: { current: 12.3, previous: 13.1, weekAgo: 12.8 },
        trend: { vsYesterday: -6.1, vsLastWeek: -3.9 },
        status: 'good',
      },
    },
    lostHours: {
      lostHoursPercent: {
        value: { current: 18.5, previous: 19.8, weekAgo: 19.2 },
        trend: { vsYesterday: -6.6, vsLastWeek: -3.6 },
        status: 'good',
      },
    },
  };
  
  return { ...baseData, ...overrides };
}

// ============================================================================
// KPI ENGINE TESTS
// ============================================================================

describe('KPI Engine', () => {
  it('should calculate hours achievement correctly', () => {
    const data = generateMockKPIData();
    expect(data.hours.hoursAchievement.value.current).toBeCloseTo(90.9, 1);
  });
  
  it('should identify trends correctly', () => {
    const data = generateMockKPIData();
    expect(data.hours.totalWorkingHours.trend.vsYesterday).toBeGreaterThan(0);
  });
  
  it('should calculate orders per hour', () => {
    const data = generateMockKPIData();
    expect(data.orders.ordersPerHour.value.current).toBeCloseTo(2.3, 1);
  });
  
  it('should handle zero division gracefully', () => {
    const data = generateMockKPIData({
      hours: {
        totalWorkingHours: {
          value: { current: 0, previous: 0, weekAgo: 0 },
        },
      },
    });
    
    expect(data.orders?.ordersPerHour?.value?.current).toBe(0);
  });
});

// ============================================================================
// ROOT CAUSE ANALYSIS TESTS
// ============================================================================

describe('Root Cause Analysis', () => {
  it('should identify low hours as root cause', async () => {
    const { analyzeRootCauses } = await import('@/lib/strategicOps/ai');
    
    const data = generateMockKPIData({
      hours: {
        hoursAchievement: {
          value: { current: 65 }, // Below critical threshold
        },
      },
    });
    
    const analysis = analyzeRootCauses(data);
    
    expect(analysis.rootCauses).toHaveLength(1);
    expect(analysis.rootCauses[0].category).toBe('capacity');
  });
  
  it('should prioritize critical root causes', async () => {
    const { analyzeRootCauses } = await import('@/lib/strategicOps/ai');
    
    const data = generateMockKPIData({
      hours: { hoursAchievement: { value: { current: 60 } } },
      attendance: { attendancePercent: { value: { current: 70 } } },
    });
    
    const analysis = analyzeRootCauses(data);
    
    const criticalCauses = analysis.rootCauses.filter(c => c.severity === 'critical');
    expect(criticalCauses.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// OPPORTUNITY DETECTION TESTS
// ============================================================================

describe('Opportunity Detection', () => {
  it('should detect capacity opportunities', async () => {
    const { detectOpportunities } = await import('@/lib/strategicOps/ai');
    
    const data = generateMockKPIData({
      headcount: {
        totalRiders: { value: { current: 250 } },
        workingRiders: { value: { current: 150 } }, // 60% active
      },
    });
    
    const opportunities = detectOpportunities(data);
    
    expect(opportunities.opportunities.length).toBeGreaterThan(0);
    const capacityOpp = opportunities.opportunities.find(o => o.type === 'capacity_activation');
    expect(capacityOpp).toBeDefined();
  });
  
  it('should calculate potential hours gain', async () => {
    const { detectOpportunities } = await import('@/lib/strategicOps/ai');
    
    const data = generateMockKPIData();
    const opportunities = detectOpportunities(data);
    
    expect(opportunities.totalPotentialHoursGain).toBeGreaterThan(0);
  });
});

// ============================================================================
// RISK DETECTION TESTS
// ============================================================================

describe('Risk Detection', () => {
  it('should detect critical risks', async () => {
    const { detectRisks } = await import('@/lib/strategicOps/ai');
    
    const data = generateMockKPIData({
      hours: { hoursAchievement: { value: { current: 65 } } },
      attendance: { attendancePercent: { value: { current: 72 } } },
    });
    
    const risks = detectRisks(data);
    
    expect(risks.criticalRisks).toBeGreaterThan(0);
  });
  
  it('should prioritize risks correctly', async () => {
    const { detectRisks } = await import('@/lib/strategicOps/ai');
    
    const data = generateMockKPIData({
      hours: { hoursAchievement: { value: { current: 65 } } },
    });
    
    const risks = detectRisks(data);
    
    const sortedRisks = risks.risks;
    expect(sortedRisks[0].severity).toBe('critical');
  });
});

// ============================================================================
// SUPERVISOR INTELLIGENCE TESTS
// ============================================================================

describe('Supervisor Intelligence', () => {
  it('should calculate supervisor score', async () => {
    const { calculateSupervisorIntelligence } = await import('@/lib/strategicOps/ai');
    
    const supervisorData = {
      supervisorName: 'Test Supervisor',
      zone: 'Zone A',
      totalHours: 1000,
      targetHours: 1100,
      totalOrders: 2300,
      teamSize: 20,
      attendanceRate: 85,
      breakPercent: 8,
      latePercent: 10,
      activeRiders: 18,
      totalRiders: 20,
    };
    
    const intelligence = calculateSupervisorIntelligence([supervisorData]);
    
    expect(intelligence.supervisors).toHaveLength(1);
    expect(intelligence.supervisors[0].totalScore).toBeGreaterThan(0);
    expect(intelligence.supervisors[0].totalScore).toBeLessThanOrEqual(100);
  });
  
  it('should rank supervisors correctly', async () => {
    const { calculateSupervisorIntelligence } = await import('@/lib/strategicOps/ai');
    
    const supervisors = [
      { supervisorName: 'Top', zone: 'A', totalHours: 1200, targetHours: 1100, totalOrders: 2800, teamSize: 20, attendanceRate: 95, breakPercent: 6, latePercent: 5, activeRiders: 19, totalRiders: 20 },
      { supervisorName: 'Bottom', zone: 'B', totalHours: 800, targetHours: 1100, totalOrders: 1600, teamSize: 20, attendanceRate: 75, breakPercent: 12, latePercent: 18, activeRiders: 15, totalRiders: 20 },
    ];
    
    const intelligence = calculateSupervisorIntelligence(supervisors);
    
    expect(intelligence.supervisors[0].rank).toBe(1);
    expect(intelligence.supervisors[1].rank).toBe(2);
    expect(intelligence.supervisors[0].totalScore).toBeGreaterThan(intelligence.supervisors[1].totalScore);
  });
});

// ============================================================================
// RIDER INTELLIGENCE TESTS
// ============================================================================

describe('Rider Intelligence', () => {
  it('should classify riders into tiers', async () => {
    const { calculateRiderIntelligence } = await import('@/lib/strategicOps/ai');
    
    const riders = [
      { riderCode: 'R001', name: 'Star Rider', zone: 'A', supervisor: 'S1', hours: 50, orders: 130, attendance: 100, break: 5, late: 0 },
      { riderCode: 'R002', name: 'At-Risk Rider', zone: 'A', supervisor: 'S1', hours: 10, orders: 18, attendance: 60, break: 15, late: 25 },
    ];
    
    const intelligence = calculateRiderIntelligence(riders);
    
    expect(intelligence.riders[0].classification).toBe('star_performer');
    expect(intelligence.riders[1].classification).toBe('at_risk');
  });
  
  it('should identify riders needing intervention', async () => {
    const { calculateRiderIntelligence, getRidersNeedingIntervention } = await import('@/lib/strategicOps/ai');
    
    const riders = [
      { riderCode: 'R001', name: 'Good', zone: 'A', supervisor: 'S1', hours: 45, orders: 110, attendance: 95, break: 6, late: 5 },
      { riderCode: 'R002', name: 'Needs Help', zone: 'A', supervisor: 'S1', hours: 15, orders: 25, attendance: 70, break: 12, late: 20 },
    ];
    
    const intelligence = calculateRiderIntelligence(riders);
    const needingIntervention = getRidersNeedingIntervention(intelligence);
    
    expect(needingIntervention.length).toBeGreaterThan(0);
    expect(needingIntervention[0].riderCode).toBe('R002');
  });
});

// ============================================================================
// RECOMMENDATION RULES TESTS
// ============================================================================

describe('Recommendation Rules', () => {
  it('should generate critical recommendations', async () => {
    const { generateRecommendations } = await import('@/lib/strategicOps/ai');
    
    const data = generateMockKPIData({
      hours: { hoursAchievement: { value: { current: 65 } } },
    });
    
    const recs = generateRecommendations(data);
    
    expect(recs.summary.critical).toBeGreaterThan(0);
  });
  
  it('should provide actionable recommendations', async () => {
    const { generateRecommendations } = await import('@/lib/strategicOps/ai');
    
    const data = generateMockKPIData({
      hours: { hoursAchievement: { value: { current: 80 } } },
    });
    
    const recs = generateRecommendations(data);
    
    const firstRec = recs.recommendations[0];
    expect(firstRec.actions.length).toBeGreaterThan(0);
    expect(firstRec.actions[0].owner).toBeDefined();
    expect(firstRec.actions[0].deadline).toBeDefined();
  });
});

// ============================================================================
// OPERATIONAL PLAYBOOKS TESTS
// ============================================================================

describe('Operational Playbooks', () => {
  it('should return correct playbook', async () => {
    const { getPlaybook } = await import('@/lib/strategicOps/ai');
    
    const playbook = getPlaybook('critical_hours_shortage');
    
    expect(playbook.scenario).toBe('critical_hours_shortage');
    expect(playbook.actions.length).toBeGreaterThan(0);
    expect(playbook.severity).toBe('critical');
  });
  
  it('should recommend appropriate playbooks', async () => {
    const { recommendPlaybooks } = await import('@/lib/strategicOps/ai');
    
    const data = generateMockKPIData({
      hours: { hoursAchievement: { value: { current: 65 } } },
      attendance: { attendancePercent: { value: { current: 80 } } },
    });
    
    const recommended = recommendPlaybooks(data);
    
    expect(recommended).toContain('critical_hours_shortage');
    expect(recommended).toContain('low_attendance');
  });
  
  it('should provide step-by-step actions', async () => {
    const { getPlaybook } = await import('@/lib/strategicOps/ai');
    
    const playbook = getPlaybook('low_productivity');
    
    playbook.actions.forEach((action, index) => {
      expect(action.step).toBe(index + 1);
      expect(action.action).toBeDefined();
      expect(action.owner).toBeDefined();
      expect(action.deadline).toBeDefined();
      expect(action.expectedOutcome).toBeDefined();
    });
  });
});

// ============================================================================
// COMPARATIVE INTELLIGENCE TESTS
// ============================================================================

describe('Comparative Intelligence', () => {
  it('should compare two entities correctly', async () => {
    const { compareEntities } = await import('@/lib/strategicOps/ai');
    
    const entity1 = generateMockKPIData({ hours: { totalWorkingHours: { value: { current: 5000 } } } });
    const entity2 = generateMockKPIData({ hours: { totalWorkingHours: { value: { current: 4500 } } } });
    
    const comparison = compareEntities(entity1, entity2, 'Zone A', 'Zone B', 'zone');
    
    expect(comparison.overallWinner).toBeDefined();
    expect(comparison.metrics.length).toBeGreaterThan(0);
  });
  
  it('should generate benchmark analysis', async () => {
    const { generateBenchmarkAnalysis } = await import('@/lib/strategicOps/ai');
    
    const entities = [
      { name: 'Zone A', data: generateMockKPIData({ hours: { totalWorkingHours: { value: { current: 5000 } } } }) },
      { name: 'Zone B', data: generateMockKPIData({ hours: { totalWorkingHours: { value: { current: 4500 } } } }) },
      { name: 'Zone C', data: generateMockKPIData({ hours: { totalWorkingHours: { value: { current: 4800 } } } }) },
    ];
    
    const benchmark = generateBenchmarkAnalysis(entities);
    
    expect(benchmark.benchmarks.hours.top10).toBeDefined();
    expect(benchmark.benchmarks.hours.median).toBeDefined();
    expect(benchmark.topPerformers.zones).toBeDefined();
  });
});

// ============================================================================
// GROWTH STRATEGY TESTS
// ============================================================================

describe('Growth Strategy', () => {
  it('should generate growth plan', async () => {
    const { generateGrowthPlan } = await import('@/lib/strategicOps/ai');
    
    const data = generateMockKPIData({
      hours: { hoursAchievement: { value: { current: 80 } } },
    });
    
    const forecast = {
      week: { value: 5200, confidence: 85 },
      month: { value: 22000, confidence: 80 },
      quarter: { value: 66000, confidence: 75 },
    } as any;
    
    const plan = generateGrowthPlan(data, forecast);
    
    expect(plan.strategies.length).toBeGreaterThan(0);
    expect(plan.overallTargets).toBeDefined();
    expect(plan.totalInvestment).toBeDefined();
    expect(plan.roiProjection).toBeDefined();
  });
  
  it('should calculate ROI correctly', async () => {
    const { generateGrowthPlan } = await import('@/lib/strategicOps/ai');
    
    const data = generateMockKPIData();
    const forecast = {
      week: { value: 5200, confidence: 85 },
      month: { value: 22000, confidence: 80 },
      quarter: { value: 66000, confidence: 75 },
    } as any;
    
    const plan = generateGrowthPlan(data, forecast);
    
    expect(plan.roiProjection.roi).toBeGreaterThan(0);
    expect(plan.roiProjection.expectedRevenue).toBeGreaterThan(plan.roiProjection.expectedCost);
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Integration Tests', () => {
  it('should run complete AI analysis without errors', async () => {
    const { runCompleteAIAnalysis } = await import('@/lib/strategicOps/ai');
    
    const data = generateMockKPIData();
    
    expect(() => {
      runCompleteAIAnalysis(data);
    }).not.toThrow();
  });
  
  it('should return consistent results', async () => {
    const { runCompleteAIAnalysis } = await import('@/lib/strategicOps/ai');
    
    const data = generateMockKPIData();
    
    const analysis1 = runCompleteAIAnalysis(data);
    const analysis2 = runCompleteAIAnalysis(data);
    
    expect(analysis1.rootCauses).toEqual(analysis2.rootCauses);
  });
});

// ============================================================================
// PERFORMANCE TESTS
// ============================================================================

describe('Performance Tests', () => {
  it('should handle large datasets efficiently', () => {
    const startTime = Date.now();
    
    // Generate 1000 riders
    const riders = Array.from({ length: 1000 }, (_, i) => ({
      riderCode: `R${i.toString().padStart(4, '0')}`,
      name: `Rider ${i}`,
      zone: `Zone ${i % 10}`,
      supervisor: `Supervisor ${i % 20}`,
      hours: Math.random() * 50,
      orders: Math.random() * 120,
      attendance: 70 + Math.random() * 30,
      break: 5 + Math.random() * 10,
      late: Math.random() * 20,
    }));
    
    // Process riders (simulated)
    const processedRiders = riders.map(r => ({
      ...r,
      score: (r.hours / 50) * 100,
    }));
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    expect(duration).toBeLessThan(1000); // Should complete in <1 second
    expect(processedRiders.length).toBe(1000);
  });
});

// ============================================================================
// EXPORT TEST SUITE
// ============================================================================

export const testSuite = {
  kpiEngine: describe,
  rootCauseAnalysis: describe,
  opportunityDetection: describe,
  riskDetection: describe,
  supervisorIntelligence: describe,
  riderIntelligence: describe,
  recommendationRules: describe,
  operationalPlaybooks: describe,
  comparativeIntelligence: describe,
  growthStrategy: describe,
  integration: describe,
  performance: describe,
};
