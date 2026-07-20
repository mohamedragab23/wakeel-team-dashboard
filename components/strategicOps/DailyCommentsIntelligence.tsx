/**
 * Daily Comments Intelligence Components
 * 
 * Displays insights from daily rider comments and supervisor feedback.
 * Implements SRS-002 Section 9: Daily Comments Intelligence.
 * 
 * @module DailyCommentsIntelligence
 * @version 1.0
 */

import React from 'react';

// ============================================================================
// TYPES
// ============================================================================

export type CommentCategory = 
  | 'working_normally'
  | 'medical'
  | 'equipment'
  | 'personal'
  | 'training'
  | 'no_show'
  | 'terminated'
  | 'other';

export type CommentInsight = {
  category: CommentCategory;
  categoryAr: string;
  count: number;
  percent: number;
  trend: 'increasing' | 'stable' | 'decreasing';
  impactOnHours: number; // Estimated lost hours
};

export type DailyCommentsData = {
  totalComments: number;
  commentedRiders: number;
  totalRiders: number;
  coveragePercent: number;
  
  byCategory: CommentInsight[];
  
  // Top issues
  topIssues: {
    issue: string;
    issueAr: string;
    count: number;
    affectedRiders: string[];
  }[];
  
  // Supervisor engagement
  supervisorEngagement: {
    supervisorName: string;
    commentsCount: number;
    coveragePercent: number;
  }[];
};

// ============================================================================
// CATEGORY LABELS
// ============================================================================

const CATEGORY_LABELS_AR: Record<CommentCategory, string> = {
  working_normally: 'شغال عادي',
  medical: 'إجازة مرضية',
  equipment: 'مشاكل معدات',
  personal: 'ظروف شخصية',
  training: 'تدريب',
  no_show: 'غائب',
  terminated: 'منتهي',
  other: 'أخرى',
};

const CATEGORY_COLORS: Record<CommentCategory, string> = {
  working_normally: 'from-green-100 to-green-200 border-green-300 text-green-800',
  medical: 'from-blue-100 to-blue-200 border-blue-300 text-blue-800',
  equipment: 'from-orange-100 to-orange-200 border-orange-300 text-orange-800',
  personal: 'from-purple-100 to-purple-200 border-purple-300 text-purple-800',
  training: 'from-teal-100 to-teal-200 border-teal-300 text-teal-800',
  no_show: 'from-red-100 to-red-200 border-red-300 text-red-800',
  terminated: 'from-gray-100 to-gray-200 border-gray-300 text-gray-800',
  other: 'from-yellow-100 to-yellow-200 border-yellow-300 text-yellow-800',
};

// ============================================================================
// COMMENTS OVERVIEW
// ============================================================================

type CommentsOverviewProps = {
  data: DailyCommentsData;
};

export function CommentsOverview({ data }: CommentsOverviewProps) {
  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="text-4xl">💬</div>
        <div>
          <h2 className="text-2xl font-bold text-gray-800">ذكاء التعليقات اليومية</h2>
          <p className="text-sm text-gray-600">تحليل تعليقات المشرفين والمناديب</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-blue-50 rounded-lg p-4 border-2 border-blue-200">
          <div className="text-sm text-blue-600 mb-1">إجمالي التعليقات</div>
          <div className="text-3xl font-bold text-blue-800">{data.totalComments}</div>
        </div>
        
        <div className="bg-green-50 rounded-lg p-4 border-2 border-green-200">
          <div className="text-sm text-green-600 mb-1">المناديب المُعلق عليهم</div>
          <div className="text-3xl font-bold text-green-800">{data.commentedRiders}</div>
          <div className="text-xs text-green-600 mt-1">من {data.totalRiders}</div>
        </div>
        
        <div className="bg-purple-50 rounded-lg p-4 border-2 border-purple-200">
          <div className="text-sm text-purple-600 mb-1">نسبة التغطية</div>
          <div className="text-3xl font-bold text-purple-800">
            {data.coveragePercent.toFixed(0)}%
          </div>
        </div>
        
        <div className="bg-orange-50 rounded-lg p-4 border-2 border-orange-200">
          <div className="text-sm text-orange-600 mb-1">الساعات المتأثرة</div>
          <div className="text-3xl font-bold text-orange-800">
            {data.byCategory.reduce((sum, cat) => sum + cat.impactOnHours, 0).toFixed(0)}
          </div>
        </div>
      </div>

      {/* Coverage Alert */}
      {data.coveragePercent < 80 && (
        <div className="mb-6 p-4 bg-yellow-50 border-l-4 border-yellow-400 rounded">
          <div className="flex items-center gap-2">
            <div className="text-2xl">⚠️</div>
            <div>
              <div className="font-semibold text-yellow-800">تغطية منخفضة</div>
              <div className="text-sm text-yellow-700">
                فقط {data.coveragePercent.toFixed(0)}% من المناديب لديهم تعليقات. يُنصح بتغطية 90%+ للحصول على رؤية شاملة.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// COMMENTS BY CATEGORY
// ============================================================================

type CommentsByCategoryProps = {
  categories: CommentInsight[];
};

export function CommentsByCategory({ categories }: CommentsByCategoryProps) {
  const getTrendIcon = (trend: CommentInsight['trend']) => {
    switch (trend) {
      case 'increasing': return '📈';
      case 'stable': return '➡️';
      case 'decreasing': return '📉';
    }
  };

  // Sort by count descending
  const sortedCategories = [...categories].sort((a, b) => b.count - a.count);

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <h3 className="text-xl font-bold text-gray-800 mb-4">التعليقات حسب الفئة</h3>

      <div className="space-y-3">
        {sortedCategories.map((category) => (
          <div
            key={category.category}
            className={`bg-gradient-to-r ${CATEGORY_COLORS[category.category]} rounded-lg p-4 border-2`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <div className="text-2xl font-bold">
                  {category.count}
                </div>
                <div>
                  <div className="font-semibold">{category.categoryAr}</div>
                  <div className="text-xs opacity-75">
                    {category.percent.toFixed(1)}% من الإجمالي
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl mb-1">{getTrendIcon(category.trend)}</div>
                {category.impactOnHours > 0 && (
                  <div className="text-sm font-medium">
                    -{category.impactOnHours.toFixed(0)} ساعة
                  </div>
                )}
              </div>
            </div>
            
            <div className="w-full h-2 bg-white/30 rounded-full overflow-hidden">
              <div
                className="h-full bg-white/50 transition-all"
                style={{ width: `${category.percent}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// TOP ISSUES
// ============================================================================

type TopIssuesProps = {
  issues: DailyCommentsData['topIssues'];
};

export function TopIssues({ issues }: TopIssuesProps) {
  return (
    <div className="bg-gradient-to-br from-red-50 to-orange-100 rounded-lg shadow-lg p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="text-3xl">🔥</div>
        <div>
          <h3 className="text-xl font-bold text-red-800">المشاكل الرئيسية</h3>
          <p className="text-sm text-red-600">القضايا الأكثر تكراراً</p>
        </div>
      </div>

      <div className="space-y-3">
        {issues.slice(0, 5).map((issue, idx) => (
          <div key={idx} className="bg-white rounded-lg p-4 shadow-sm">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-red-100 flex items-center justify-center font-bold text-red-700">
                  {idx + 1}
                </div>
                <div>
                  <div className="font-semibold text-gray-800">
                    {issue.issueAr}
                  </div>
                  <div className="text-sm text-gray-600 mt-1">
                    {issue.count} حالة
                  </div>
                </div>
              </div>
            </div>
            
            {issue.affectedRiders.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-200">
                <div className="text-xs text-gray-600 mb-1">المناديب المتأثرون:</div>
                <div className="flex flex-wrap gap-1">
                  {issue.affectedRiders.slice(0, 5).map((rider, i) => (
                    <span key={i} className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-mono">
                      {rider}
                    </span>
                  ))}
                  {issue.affectedRiders.length > 5 && (
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">
                      +{issue.affectedRiders.length - 5}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// SUPERVISOR ENGAGEMENT
// ============================================================================

type SupervisorEngagementProps = {
  supervisors: DailyCommentsData['supervisorEngagement'];
};

export function SupervisorEngagement({ supervisors }: SupervisorEngagementProps) {
  // Sort by coverage percent
  const sortedSupervisors = [...supervisors].sort((a, b) => b.coveragePercent - a.coveragePercent);

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <h3 className="text-xl font-bold text-gray-800 mb-4">مشاركة المشرفين</h3>
      <p className="text-sm text-gray-600 mb-4">
        نسبة تغطية التعليقات لكل مشرف
      </p>

      <div className="space-y-3">
        {sortedSupervisors.map((supervisor, idx) => {
          const isLow = supervisor.coveragePercent < 70;
          const isGood = supervisor.coveragePercent >= 90;
          
          return (
            <div key={idx} className="p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <div className="font-medium text-gray-800">
                  {supervisor.supervisorName}
                </div>
                <div className={`text-lg font-bold ${
                  isGood ? 'text-green-600' : 
                  isLow ? 'text-red-600' : 
                  'text-yellow-600'
                }`}>
                  {supervisor.coveragePercent.toFixed(0)}%
                </div>
              </div>
              
              <div className="flex items-center gap-2 mb-2">
                <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      isGood ? 'bg-green-500' : 
                      isLow ? 'bg-red-500' : 
                      'bg-yellow-500'
                    }`}
                    style={{ width: `${supervisor.coveragePercent}%` }}
                  />
                </div>
                <div className="text-xs text-gray-600">
                  {supervisor.commentsCount} تعليق
                </div>
              </div>
              
              {isLow && (
                <div className="text-xs text-red-600 flex items-center gap-1">
                  <span>⚠️</span>
                  <span>يحتاج تحسين التغطية</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// COMPACT BADGE
// ============================================================================

type CommentsBadgeProps = {
  totalComments: number;
  coveragePercent: number;
  topIssue?: string;
};

export function CommentsBadge({ 
  totalComments, 
  coveragePercent, 
  topIssue 
}: CommentsBadgeProps) {
  const isLowCoverage = coveragePercent < 80;
  
  return (
    <div className={`inline-flex items-center gap-3 px-4 py-2 rounded-lg border-2 ${
      isLowCoverage 
        ? 'bg-yellow-50 border-yellow-300' 
        : 'bg-green-50 border-green-300'
    }`}>
      <div className="text-2xl">💬</div>
      <div>
        <div className={`text-xs font-medium ${
          isLowCoverage ? 'text-yellow-600' : 'text-green-600'
        }`}>
          التعليقات اليومية
        </div>
        <div className={`text-sm font-bold ${
          isLowCoverage ? 'text-yellow-800' : 'text-green-800'
        }`}>
          {totalComments} تعليق • {coveragePercent.toFixed(0)}% تغطية
        </div>
        {topIssue && (
          <div className="text-xs text-gray-600">
            الأكثر: {topIssue}
          </div>
        )}
      </div>
    </div>
  );
}
