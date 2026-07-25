/**
 * SRS-011 Part 2 — Executive Decision Feed.
 * "🟢 فرصة" opportunities are NOT problems being fixed — they are a distinct,
 * positive signal (a supervisor/zone already trending right, with cheap
 * remaining upside) derived from `SupervisorIntelligence`, kept separate from
 * the 🔴/🟡 problem-driven `ManagementAction` timeline.
 */
import type { SupervisorIntelligence } from './types';

export type DecisionOpportunity = {
  id: string;
  supervisorCode: string;
  titleAr: string;
  reasonAr: string;
  actionAr: string;
  achievementPercent: number;
  recoverableHoursDaily: number;
};

export function buildDecisionOpportunities(
  supervisors: SupervisorIntelligence[],
  limit = 3
): DecisionOpportunity[] {
  return supervisors
    .filter((s) => s.trendStatus === 'improving' && s.lostTargetHours > 0 && s.achievementPercent >= 60)
    .sort((a, b) => b.achievementPercent - a.achievementPercent)
    .slice(0, limit)
    .map((s) => ({
      id: `opp-${s.code}`,
      supervisorCode: s.code,
      titleAr: `${s.name}${s.region ? ` (${s.region})` : ''}`,
      reasonAr: `اتجاه تحسّن مستمر — تحقيق ${s.achievementPercent}% حاليًا، ولا يزال هناك ${s.lostTargetHours}س/يوم قابلة للاستعادة بسهولة نسبيًا.`,
      actionAr: 'يمكن رفع الساعات بسهولة — دفعة بسيطة من المشرف (نصف ساعة إلى ساعة/طيار) قد تكفي لإغلاق الفجوة المتبقية.',
      achievementPercent: s.achievementPercent,
      recoverableHoursDaily: s.lostTargetHours,
    }));
}
