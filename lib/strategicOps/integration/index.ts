/**
 * Strategic Operations Integration Layer
 * 
 * Central export point for all integration modules.
 * 
 * @module Integration
 * @version 1.0
 */

// Hiring & Termination Integration
export type {
  HiringRecord,
  TerminationRecord,
  ReactivationRecord,
  RecruitmentMetrics,
} from './hiringTermination';

export {
  fetchHiringRecords,
  fetchTerminationRecords,
  fetchReactivationRecords,
  calculateRecruitmentMetrics,
} from './hiringTermination';

// Daily Comments Integration
export type {
  DailyCommentRecord,
  CommentAnalytics,
  SupervisorResponseQuality,
} from './dailyCommentsIntegration';

export {
  fetchDailyComments,
  calculateCommentAnalytics,
  analyzeSupervisorResponseQuality,
} from './dailyCommentsIntegration';
