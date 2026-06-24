import { STRATEGIC_KPI_COVERAGE_THRESHOLD } from '@/lib/strategicOps/talabatOpsMetrics';
import type { ControlTowerReport } from '@/lib/strategicOps/controlTower/types';

export const COVERAGE_GATE_DISABLED_AR =
  'Control Tower insights disabled due to insufficient operational data coverage.';

export const METADATA_COVERAGE_LIMITED_AR =
  'Tenure and lifecycle analytics limited — rider metadata coverage below 80%.';

/** @deprecated Use isOperationalInsightsEnabled */
export function isControlTowerInsightsEnabled(coveragePercent: number): boolean {
  return isOperationalInsightsEnabled(coveragePercent);
}

export function isOperationalInsightsEnabled(operationalCoveragePercent: number): boolean {
  return operationalCoveragePercent >= STRATEGIC_KPI_COVERAGE_THRESHOLD;
}

export function isMetadataInsightsEnabled(metadataCoveragePercent: number): boolean {
  return metadataCoveragePercent >= STRATEGIC_KPI_COVERAGE_THRESHOLD;
}

export function createDisabledInsightsReport(
  partial: Omit<
    ControlTowerReport,
    'disabled' | 'disabledReasonAr' | 'reliability' | 'executiveFocusAudit'
  >,
  coveragePercent: number
): Pick<ControlTowerReport, 'executiveFocus' | 'kpiRootCauses' | 'topNegativeImpactRiders'> {
  void partial;
  void coveragePercent;
  return {
    executiveFocus: [],
    kpiRootCauses: [],
    topNegativeImpactRiders: [],
  };
}
