/**
 * Strategic Operations Center - UI Components Index
 * 
 * Central export point for all SOC UI components.
 * 
 * @module StrategicOpsUI
 * @version 1.0
 */

// Core Components
export { KPICard, KPICardsGrid, KPICategorySection } from './KPICard';
export { ExecutiveHealthBanner } from './ExecutiveHealthBanner';
export { TrendChart, MultiLineTrendChart, TrendSummary } from './TrendCharts';
export { RiderDistributionVisualization, RiderDistributionBadge } from './RiderDistribution';
export { LostHoursAnalysis, LostHoursBadge } from './LostHoursAnalysis';

// Data Quality Components
export { 
  DataQualityBanner,
  DataQualityBadge,
  MissingDaysAlert,
  GhostRiderBadge,
} from './DataQualityBanner';

// SRS-006 Executive Trust & Integrity
export { ExecutiveTrustCenter } from './ExecutiveTrustCenter';
export { LiveOperationsAudit } from './LiveOperationsAudit';
export { KPILineageModal } from './KPILineageModal';
export { SystemHealthCard } from './SystemHealthCard';
export { AuditResultRow } from './AuditResultRow';

// SRS-007 Digital Twin
export {
  WhatIfLab,
  ScenarioBuilder,
  ImpactSummary,
  ScenarioComparisonTable,
  HiringSimulatorPanel,
  ExecutiveDecisionCard,
  WarRoomDashboard,
} from './digitalTwin';

// Supervisor Intelligence
export type { SupervisorScore, SupervisorIntelligenceData } from './SupervisorIntelligence';
export {
  SupervisorRankingTable,
  SupervisorPerformanceCards,
  SupervisorScoreBreakdown,
  SupervisorBadge,
} from './SupervisorIntelligence';

// Rider Intelligence
export type { 
  RiderClassification, 
  RiderPerformance, 
  RiderIntelligenceData 
} from './RiderIntelligence';
export {
  TopPerformersTable,
  BottomPerformersTable,
  RiderClassificationOverview,
  RiderPerformanceCard,
  RiderIntelligenceBadge,
} from './RiderIntelligence';

// Daily Comments Intelligence
export type { 
  CommentCategory, 
  CommentInsight, 
  DailyCommentsData 
} from './DailyCommentsIntelligence';
export {
  CommentsOverview,
  CommentsByCategory,
  TopIssues,
  SupervisorEngagement,
  CommentsBadge,
} from './DailyCommentsIntelligence';
