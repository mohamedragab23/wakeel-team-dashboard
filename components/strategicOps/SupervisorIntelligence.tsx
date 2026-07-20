/**
 * Supervisor Intelligence Components
 * 
 * Displays supervisor performance, ranking, and intelligence insights.
 * Implements SRS-002 Section 5: Supervisor Intelligence & Performance.
 * 
 * @module SupervisorIntelligence
 * @version 1.0
 */

import React from 'react';

// ============================================================================
// TYPES
// ============================================================================

export type SupervisorScore = {
  supervisorId: string;
  supervisorName: string;
  zone?: string;
  
  // Overall score
  totalScore: number; // 0-100
  rank: number;
  
  // Score components (weights from businessRules.ts)
  hoursAchievement: number; // 0-100
  ordersPerHour: number; // 0-100
  attendanceRate: number; // 0-100
  breakCompliance: number; // 0-100
  lateCompliance: number; // 0-100
  teamSize: number; // Actual count
  activeRidersPercent: number; // 0-100
  dataQuality: number; // 0-100
  commentsQuality: number; // 0-100
  
  // Performance indicators
  status: 'excellent' | 'good' | 'needs_improvement' | 'critical';
  trend: 'improving' | 'stable' | 'declining';
  
  // Insights
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
};

export type SupervisorIntelligenceData = {
  supervisors: SupervisorScore[];
  topPerformers: SupervisorScore[]; // Top 3
  needsAttention: SupervisorScore[]; // Bottom 3 or status=critical
  averageScore: number;
};

// ============================================================================
// SUPERVISOR RANKING TABLE
// ============================================================================

type SupervisorRankingTableProps = {
  data: SupervisorIntelligenceData;
  onSupervisorClick?: (supervisor: SupervisorScore) => void;
};

export function SupervisorRankingTable({ 
  data, 
  onSupervisorClick 
}: SupervisorRankingTableProps) {
  const getStatusColor = (status: SupervisorScore['status']) => {
    switch (status) {
      case 'excellent': return 'text-green-700 bg-green-50';
      case 'good': return 'text-blue-700 bg-blue-50';
      case 'needs_improvement': return 'text-yellow-700 bg-yellow-50';
      case 'critical': return 'text-red-700 bg-red-50';
    }
  };
  
  const getStatusLabel = (status: SupervisorScore['status']) => {
    switch (status) {
      case 'excellent': return 'ممتاز';
      case 'good': return 'جيد';
      case 'needs_improvement': return 'يحتاج تحسين';
      case 'critical': return 'حرج';
    }
  };
  
  const getTrendIcon = (trend: SupervisorScore['trend']) => {
    switch (trend) {
      case 'improving': return '📈';
      case 'stable': return '➡️';
      case 'declining': return '📉';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">ترتيب المشرفين</h2>
          <p className="text-sm text-gray-600 mt-1">
            متوسط الدرجة: {data.averageScore.toFixed(1)} / 100
          </p>
        </div>
        <div className="text-right">
          <div className="text-sm text-gray-600">إجمالي المشرفين</div>
          <div className="text-3xl font-bold text-blue-600">{data.supervisors.length}</div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm" dir="rtl">
          <thead>
            <tr className="border-b-2 border-gray-200 bg-gray-50">
              <th className="px-4 py-3 text-right font-semibold text-gray-700">الترتيب</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-700">المشرف</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-700">المنطقة</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-700">الدرجة الكلية</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-700">الساعات</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-700">الإنتاجية</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-700">الحضور</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-700">حجم الفريق</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-700">الحالة</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-700">الاتجاه</th>
            </tr>
          </thead>
          <tbody>
            {data.supervisors.map((supervisor) => (
              <tr
                key={supervisor.supervisorId}
                onClick={() => onSupervisorClick?.(supervisor)}
                className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <td className="px-4 py-3">
                  <div className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-bold ${
                    supervisor.rank <= 3 ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {supervisor.rank}
                  </div>
                </td>
                <td className="px-4 py-3 font-medium text-gray-800">
                  {supervisor.supervisorName}
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {supervisor.zone || '-'}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="text-lg font-bold text-blue-600">
                      {supervisor.totalScore.toFixed(1)}
                    </div>
                    <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 transition-all"
                        style={{ width: `${supervisor.totalScore}%` }}
                      />
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-700">
                  {supervisor.hoursAchievement.toFixed(0)}%
                </td>
                <td className="px-4 py-3 text-gray-700">
                  {supervisor.ordersPerHour.toFixed(1)}
                </td>
                <td className="px-4 py-3 text-gray-700">
                  {supervisor.attendanceRate.toFixed(0)}%
                </td>
                <td className="px-4 py-3 text-gray-700">
                  {supervisor.teamSize} مندوب
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(supervisor.status)}`}>
                    {getStatusLabel(supervisor.status)}
                  </span>
                </td>
                <td className="px-4 py-3 text-center text-xl">
                  {getTrendIcon(supervisor.trend)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================================
// SUPERVISOR PERFORMANCE CARDS (Top/Bottom)
// ============================================================================

type SupervisorPerformanceCardsProps = {
  data: SupervisorIntelligenceData;
};

export function SupervisorPerformanceCards({ data }: SupervisorPerformanceCardsProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Top Performers */}
      <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg shadow-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="text-3xl">🏆</div>
          <div>
            <h3 className="text-xl font-bold text-green-800">المشرفون المتميزون</h3>
            <p className="text-sm text-green-600">أفضل 3 مشرفين</p>
          </div>
        </div>
        
        <div className="space-y-3">
          {data.topPerformers.map((supervisor, idx) => (
            <div
              key={supervisor.supervisorId}
              className="bg-white rounded-lg p-4 shadow-sm"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className="text-2xl font-bold text-green-600">
                    #{idx + 1}
                  </div>
                  <div>
                    <div className="font-semibold text-gray-800">
                      {supervisor.supervisorName}
                    </div>
                    <div className="text-xs text-gray-500">
                      {supervisor.zone} • {supervisor.teamSize} مندوب
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-green-600">
                    {supervisor.totalScore.toFixed(1)}
                  </div>
                  <div className="text-xs text-gray-500">الدرجة</div>
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-gray-200">
                <div className="text-center">
                  <div className="text-sm font-semibold text-gray-700">
                    {supervisor.hoursAchievement.toFixed(0)}%
                  </div>
                  <div className="text-xs text-gray-500">الساعات</div>
                </div>
                <div className="text-center">
                  <div className="text-sm font-semibold text-gray-700">
                    {supervisor.ordersPerHour.toFixed(1)}
                  </div>
                  <div className="text-xs text-gray-500">أوردر/س</div>
                </div>
                <div className="text-center">
                  <div className="text-sm font-semibold text-gray-700">
                    {supervisor.attendanceRate.toFixed(0)}%
                  </div>
                  <div className="text-xs text-gray-500">الحضور</div>
                </div>
              </div>
              
              {supervisor.strengths.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <div className="text-xs text-gray-600 mb-1">نقاط القوة:</div>
                  <div className="flex flex-wrap gap-1">
                    {supervisor.strengths.slice(0, 2).map((strength, i) => (
                      <span
                        key={i}
                        className="inline-block px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs"
                      >
                        {strength}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Needs Attention */}
      <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-lg shadow-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="text-3xl">⚠️</div>
          <div>
            <h3 className="text-xl font-bold text-red-800">يحتاجون دعم</h3>
            <p className="text-sm text-red-600">المشرفون الذين يحتاجون اهتمام</p>
          </div>
        </div>
        
        <div className="space-y-3">
          {data.needsAttention.map((supervisor) => (
            <div
              key={supervisor.supervisorId}
              className="bg-white rounded-lg p-4 shadow-sm"
            >
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="font-semibold text-gray-800">
                    {supervisor.supervisorName}
                  </div>
                  <div className="text-xs text-gray-500">
                    {supervisor.zone} • الترتيب: #{supervisor.rank}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-red-600">
                    {supervisor.totalScore.toFixed(1)}
                  </div>
                  <div className="text-xs text-gray-500">الدرجة</div>
                </div>
              </div>
              
              {supervisor.weaknesses.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <div className="text-xs text-gray-600 mb-1">نقاط الضعف:</div>
                  <div className="flex flex-wrap gap-1">
                    {supervisor.weaknesses.slice(0, 2).map((weakness, i) => (
                      <span
                        key={i}
                        className="inline-block px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs"
                      >
                        {weakness}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              
              {supervisor.recommendations.length > 0 && (
                <div className="mt-2">
                  <div className="text-xs text-gray-600 mb-1">التوصيات:</div>
                  <ul className="text-xs text-gray-700 space-y-1">
                    {supervisor.recommendations.slice(0, 2).map((rec, i) => (
                      <li key={i} className="flex items-start gap-1">
                        <span>•</span>
                        <span>{rec}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// SUPERVISOR SCORE BREAKDOWN
// ============================================================================

type SupervisorScoreBreakdownProps = {
  supervisor: SupervisorScore;
};

export function SupervisorScoreBreakdown({ supervisor }: SupervisorScoreBreakdownProps) {
  const scoreComponents = [
    { label: 'تحقيق الساعات', value: supervisor.hoursAchievement, weight: 25, color: 'blue' },
    { label: 'الإنتاجية (أوردر/ساعة)', value: supervisor.ordersPerHour, weight: 20, color: 'green' },
    { label: 'معدل الحضور', value: supervisor.attendanceRate, weight: 15, color: 'purple' },
    { label: 'الالتزام بالاستراحة', value: supervisor.breakCompliance, weight: 10, color: 'yellow' },
    { label: 'الالتزام بالمواعيد', value: supervisor.lateCompliance, weight: 10, color: 'orange' },
    { label: 'نسبة المناديب النشطين', value: supervisor.activeRidersPercent, weight: 10, color: 'teal' },
    { label: 'جودة البيانات', value: supervisor.dataQuality, weight: 5, color: 'indigo' },
    { label: 'جودة التعليقات', value: supervisor.commentsQuality, weight: 5, color: 'pink' },
  ];
  
  const getColorClasses = (color: string) => {
    const colors: Record<string, string> = {
      blue: 'bg-blue-500',
      green: 'bg-green-500',
      purple: 'bg-purple-500',
      yellow: 'bg-yellow-500',
      orange: 'bg-orange-500',
      teal: 'bg-teal-500',
      indigo: 'bg-indigo-500',
      pink: 'bg-pink-500',
    };
    return colors[color] || 'bg-gray-500';
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6" dir="rtl">
      <h3 className="text-xl font-bold text-gray-800 mb-4">
        تفصيل درجة: {supervisor.supervisorName}
      </h3>
      
      <div className="mb-6 p-4 bg-gray-50 rounded-lg">
        <div className="flex items-center justify-between mb-2">
          <span className="text-gray-600">الدرجة الكلية</span>
          <span className="text-3xl font-bold text-blue-600">
            {supervisor.totalScore.toFixed(1)}
          </span>
        </div>
        <div className="w-full h-4 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 transition-all"
            style={{ width: `${supervisor.totalScore}%` }}
          />
        </div>
      </div>
      
      <div className="space-y-4">
        {scoreComponents.map((component, idx) => (
          <div key={idx}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">
                  {component.label}
                </span>
                <span className="text-xs text-gray-500">
                  (وزن {component.weight}%)
                </span>
              </div>
              <span className="text-sm font-semibold text-gray-800">
                {component.value.toFixed(1)}
              </span>
            </div>
            <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full ${getColorClasses(component.color)} transition-all`}
                style={{ width: `${component.value}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// COMPACT BADGE
// ============================================================================

type SupervisorBadgeProps = {
  totalSupervisors: number;
  averageScore: number;
  topPerformerName?: string;
};

export function SupervisorBadge({ 
  totalSupervisors, 
  averageScore, 
  topPerformerName 
}: SupervisorBadgeProps) {
  return (
    <div className="inline-flex items-center gap-3 px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg">
      <div className="text-2xl">👥</div>
      <div>
        <div className="text-xs text-blue-600 font-medium">المشرفون</div>
        <div className="text-sm font-bold text-blue-800">
          {totalSupervisors} مشرف • متوسط {averageScore.toFixed(1)}
        </div>
        {topPerformerName && (
          <div className="text-xs text-blue-600">
            الأول: {topPerformerName}
          </div>
        )}
      </div>
    </div>
  );
}
