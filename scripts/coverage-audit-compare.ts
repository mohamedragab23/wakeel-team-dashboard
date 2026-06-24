import { config } from 'dotenv';
import path from 'node:path';
import { buildStrategicOpsReport } from '../lib/strategicOps/buildReport';
import { computeSourceDataCoverage } from '../lib/strategicOps/talabatOpsMetrics';

config({ path: path.resolve('.env.local') });

async function snapshot(label: string, filters: Parameters<typeof buildStrategicOpsReport>[0]) {
  const r = await buildStrategicOpsReport(filters);
  const s = r.sourceDataCoverage;
  const j = r.joinDateAudit;
  console.log(JSON.stringify({
    label,
    filters,
    calendarDays: r.meta.periodDays,
    validDays: r.dataIntegrity.validDaysInDataset,
    completeness: s.completenessPercentage,
    riders: j.totalRidersInScope,
    withJoin: j.ridersWithValidJoinDate,
    joinPct: s.joinDateCoveragePercent,
    coverage: s.coverage,
    rawJoinCalc: j.totalRidersInScope > 0 ? Math.round((j.ridersWithValidJoinDate / j.totalRidersInScope) * 10000) / 100 : 0,
  }));
}

async function main() {
  await snapshot('Alexandria 15-22', { startDate: '2026-06-15', endDate: '2026-06-22', zone: 'Alexandria', supervisorCode: 'all' });
  await snapshot('All zones 15-22', { startDate: '2026-06-15', endDate: '2026-06-22', zone: 'all', supervisorCode: 'all' });
  await snapshot('All zones May 1-30', { startDate: '2026-05-01', endDate: '2026-05-30', zone: 'all', supervisorCode: 'all' });
  await snapshot('Alexandria May 1-30', { startDate: '2026-05-01', endDate: '2026-05-30', zone: 'Alexandria', supervisorCode: 'all' });
  await snapshot('All zones Jun 1-30', { startDate: '2026-06-01', endDate: '2026-06-30', zone: 'all', supervisorCode: 'all' });
}

main();
