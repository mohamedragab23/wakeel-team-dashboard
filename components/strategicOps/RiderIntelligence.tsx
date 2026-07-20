/**
 * Rider Intelligence Components
 * 
 * Displays rider performance, classification, and intelligence insights.
 * Implements SRS-002 Section 6: Rider Intelligence & Segmentation.
 * 
 * @module RiderIntelligence
 * @version 1.0
 */

import React from 'react';

// ============================================================================
// TYPES
// ============================================================================

export type RiderClassification = 'star' | 'solid' | 'at_risk' | 'critical';

export type RiderPerformance = {
  riderCode: string;
  riderName: string;
  supervisor?: string;
  zone?: string;
  
  // Performance metrics
  hours: number;
  orders: number;
  ordersPerHour: number;
  attendanceDays: number;
  totalDays: number;
  attendancePercent: number;
  breakPercent: number;
  latePercent: number;
  
  // Classification
  classification: RiderClassification;
  score: number; // 0-100
  rank: number;
  
  // Trend
  trend: 'improving' | 'stable' | 'declining';
  hoursChange?: number; // % change
  
  // Insights
  strengths: string[];
  concerns: string[];
  recommendations: string[];
};

export type RiderIntelligenceData = {
  totalRiders: number;
  classifications: {
    stars: RiderPerformance[]; // Top 10-15%
    solid: RiderPerformance[]; // 60-70%
    atRisk: RiderPerformance[]; // 15-20%
    critical: RiderPerformance[]; // Bottom 5-10%
  };
  topPerformers: RiderPerformance[]; // Top 10
  bottomPerformers: RiderPerformance[]; // Bottom 10
};

// ============================================================================
// TOP PERFORMERS TABLE
// ============================================================================

type TopPerformersTableProps = {
  riders: RiderPerformance[];
  onRiderClick?: (rider: RiderPerformance) => void;
};

export function TopPerformersTable({ riders, onRiderClick }: TopPerformersTableProps) {
  const getTrendIcon = (trend: RiderPerformance['trend']) => {
    switch (trend) {
      case 'improving': return '📈';
      case 'stable': return '➡️';
      case 'declining': return '📉';
    }
  };

  return (
    <div className="bg-gradient-to-br from-green-50 to-emerald-100 rounded-lg shadow-lg p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="text-4xl">⭐</div>
        <div>
          <h2 className="text-2xl font-bold text-green-800">المناديب المتميزون</h2>
          <p className="text-sm text-green-600">أفضل 10 مناديب حسب الأداء</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm" dir="rtl">
          <thead>
            <tr className="border-b-2 border-green-200 bg-white/50">
              <th className="px-4 py-3 text-right font-semibold text-gray-700">الترتيب</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-700">الكود</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-700">الاسم</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-700">المشرف</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-700">الساعات</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-700">الأوردرات</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-700">أوردر/ساعة</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-700">الحضور</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-700">الدرجة</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-700">الاتجاه</th>
            </tr>
          </thead>
          <tbody>
            {riders.map((rider) => (
              <tr
                key={rider.riderCode}
                onClick={() => onRiderClick?.(rider)}
                className="border-b border-green-100 bg-white hover:bg-green-50 cursor-pointer transition-colors"
              >
                <td className="px-4 py-3">
                  <div className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-bold ${
                    rider.rank <= 3 
                      ? 'bg-yellow-200 text-yellow-800' 
                      : 'bg-green-100 text-green-700'
                  }`}>
                    {rider.rank}
                  </div>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-gray-600">
                  {rider.riderCode}
                </td>
                <td className="px-4 py-3 font-medium text-gray-800">
                  {rider.riderName}
                </td>
                <td className="px-4 py-3 text-gray-600 text-xs">
                  {rider.supervisor || '-'}
                </td>
                <td className="px-4 py-3">
                  <div className="font-semibold text-green-700">
                    {rider.hours.toFixed(1)}
                  </div>
                  {rider.hoursChange !== undefined && (
                    <div className={`text-xs ${rider.hoursChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {rider.hoursChange >= 0 ? '+' : ''}{rider.hoursChange.toFixed(0)}%
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 font-semibold text-gray-700">
                  {rider.orders}
                </td>
                <td className="px-4 py-3 font-semibold text-blue-600">
                  {rider.ordersPerHour.toFixed(2)}
                </td>
                <td className="px-4 py-3">
                  <div className="text-sm">
                    {rider.attendancePercent.toFixed(0)}%
                  </div>
                  <div className="text-xs text-gray-500">
                    {rider.attendanceDays}/{rider.totalDays}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="text-lg font-bold text-green-600">
                    {rider.score.toFixed(1)}
                  </div>
                </td>
                <td className="px-4 py-3 text-center text-xl">
                  {getTrendIcon(rider.trend)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Strengths summary */}
      <div className="mt-6 pt-6 border-t border-green-200">
        <h3 className="text-sm font-semibold text-green-800 mb-3">نقاط القوة المشتركة:</h3>
        <div className="flex flex-wrap gap-2">
          <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
            ساعات عالية
          </span>
          <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
            إنتاجية ممتازة
          </span>
          <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
            حضور منتظم
          </span>
          <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
            التزام بالسياسات
          </span>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// BOTTOM PERFORMERS TABLE
// ============================================================================

type BottomPerformersTableProps = {
  riders: RiderPerformance[];
  onRiderClick?: (rider: RiderPerformance) => void;
};

export function BottomPerformersTable({ riders, onRiderClick }: BottomPerformersTableProps) {
  const getConcernColor = (concern: string) => {
    if (concern.includes('ساعات') || concern.includes('غياب')) return 'bg-red-100 text-red-700';
    if (concern.includes('تأخير') || concern.includes('استراحة')) return 'bg-orange-100 text-orange-700';
    return 'bg-yellow-100 text-yellow-700';
  };

  return (
    <div className="bg-gradient-to-br from-red-50 to-orange-100 rounded-lg shadow-lg p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="text-4xl">⚠️</div>
        <div>
          <h2 className="text-2xl font-bold text-red-800">المناديب الذين يحتاجون دعم</h2>
          <p className="text-sm text-red-600">أضعف 10 مناديب - يحتاجون تدخل عاجل</p>
        </div>
      </div>

      <div className="space-y-4">
        {riders.map((rider, idx) => (
          <div
            key={rider.riderCode}
            onClick={() => onRiderClick?.(rider)}
            className="bg-white rounded-lg p-4 shadow-sm hover:shadow-md cursor-pointer transition-all border-l-4 border-red-400"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0">
                  <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center font-bold text-red-700">
                    {idx + 1}
                  </div>
                </div>
                <div>
                  <div className="font-semibold text-gray-800">
                    {rider.riderName}
                  </div>
                  <div className="text-xs text-gray-500 font-mono">
                    {rider.riderCode}
                  </div>
                  <div className="text-xs text-gray-600 mt-1">
                    {rider.supervisor ? `المشرف: ${rider.supervisor}` : 'لا يوجد مشرف'}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-red-600">
                  {rider.score.toFixed(1)}
                </div>
                <div className="text-xs text-gray-500">الدرجة</div>
              </div>
            </div>

            {/* Performance metrics */}
            <div className="grid grid-cols-4 gap-3 mb-3 pb-3 border-b border-gray-200">
              <div className="text-center">
                <div className={`text-sm font-semibold ${rider.hours < 20 ? 'text-red-600' : 'text-gray-700'}`}>
                  {rider.hours.toFixed(1)}
                </div>
                <div className="text-xs text-gray-500">ساعات</div>
              </div>
              <div className="text-center">
                <div className={`text-sm font-semibold ${rider.ordersPerHour < 2 ? 'text-red-600' : 'text-gray-700'}`}>
                  {rider.ordersPerHour.toFixed(2)}
                </div>
                <div className="text-xs text-gray-500">أوردر/س</div>
              </div>
              <div className="text-center">
                <div className={`text-sm font-semibold ${rider.attendancePercent < 70 ? 'text-red-600' : 'text-gray-700'}`}>
                  {rider.attendancePercent.toFixed(0)}%
                </div>
                <div className="text-xs text-gray-500">الحضور</div>
              </div>
              <div className="text-center">
                <div className={`text-sm font-semibold ${rider.breakPercent > 10 ? 'text-red-600' : 'text-gray-700'}`}>
                  {rider.breakPercent.toFixed(1)}%
                </div>
                <div className="text-xs text-gray-500">استراحة</div>
              </div>
            </div>

            {/* Concerns */}
            {rider.concerns.length > 0 && (
              <div className="mb-3">
                <div className="text-xs text-gray-600 font-medium mb-2">المشاكل الرئيسية:</div>
                <div className="flex flex-wrap gap-1">
                  {rider.concerns.map((concern, i) => (
                    <span
                      key={i}
                      className={`inline-block px-2 py-1 rounded text-xs font-medium ${getConcernColor(concern)}`}
                    >
                      {concern}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Recommendations */}
            {rider.recommendations.length > 0 && (
              <div className="bg-blue-50 rounded p-3">
                <div className="text-xs text-blue-800 font-medium mb-2">الإجراءات المقترحة:</div>
                <ul className="text-xs text-blue-900 space-y-1">
                  {rider.recommendations.slice(0, 3).map((rec, i) => (
                    <li key={i} className="flex items-start gap-1">
                      <span className="text-blue-600">•</span>
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
  );
}

// ============================================================================
// RIDER CLASSIFICATION OVERVIEW
// ============================================================================

type RiderClassificationOverviewProps = {
  data: RiderIntelligenceData;
};

export function RiderClassificationOverview({ data }: RiderClassificationOverviewProps) {
  const classifications = [
    {
      type: 'stars' as const,
      label: 'النجوم',
      labelEn: 'Stars',
      icon: '⭐',
      color: 'from-yellow-100 to-yellow-200',
      textColor: 'text-yellow-800',
      borderColor: 'border-yellow-300',
      count: data.classifications.stars.length,
      percent: (data.classifications.stars.length / data.totalRiders) * 100,
      description: 'أداء ممتاز في جميع المؤشرات',
    },
    {
      type: 'solid' as const,
      label: 'الأقوياء',
      labelEn: 'Solid',
      icon: '💪',
      color: 'from-green-100 to-green-200',
      textColor: 'text-green-800',
      borderColor: 'border-green-300',
      count: data.classifications.solid.length,
      percent: (data.classifications.solid.length / data.totalRiders) * 100,
      description: 'أداء جيد ومستقر',
    },
    {
      type: 'atRisk' as const,
      label: 'في خطر',
      labelEn: 'At Risk',
      icon: '⚠️',
      color: 'from-orange-100 to-orange-200',
      textColor: 'text-orange-800',
      borderColor: 'border-orange-300',
      count: data.classifications.atRisk.length,
      percent: (data.classifications.atRisk.length / data.totalRiders) * 100,
      description: 'يحتاجون دعم وتدخل',
    },
    {
      type: 'critical' as const,
      label: 'حرج',
      labelEn: 'Critical',
      icon: '🔴',
      color: 'from-red-100 to-red-200',
      textColor: 'text-red-800',
      borderColor: 'border-red-300',
      count: data.classifications.critical.length,
      percent: (data.classifications.critical.length / data.totalRiders) * 100,
      description: 'تدخل عاجل ضروري',
    },
  ];

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800">تصنيف المناديب</h2>
        <p className="text-sm text-gray-600 mt-1">
          إجمالي المناديب: {data.totalRiders}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {classifications.map((cls) => (
          <div
            key={cls.type}
            className={`bg-gradient-to-br ${cls.color} rounded-lg p-4 border-2 ${cls.borderColor}`}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="text-3xl">{cls.icon}</div>
              <div>
                <div className={`text-lg font-bold ${cls.textColor}`}>
                  {cls.label}
                </div>
                <div className="text-xs text-gray-600">{cls.labelEn}</div>
              </div>
            </div>
            
            <div className="mb-2">
              <div className="flex items-baseline gap-2">
                <div className={`text-3xl font-bold ${cls.textColor}`}>
                  {cls.count}
                </div>
                <div className="text-sm text-gray-600">
                  ({cls.percent.toFixed(1)}%)
                </div>
              </div>
            </div>
            
            <div className="w-full h-2 bg-white/50 rounded-full overflow-hidden mb-3">
              <div
                className={`h-full ${cls.textColor.replace('text-', 'bg-')} transition-all`}
                style={{ width: `${cls.percent}%` }}
              />
            </div>
            
            <p className="text-xs text-gray-700">
              {cls.description}
            </p>
          </div>
        ))}
      </div>

      {/* Visual Distribution */}
      <div className="mt-6 pt-6 border-t border-gray-200">
        <div className="text-sm font-semibold text-gray-700 mb-3">التوزيع المرئي:</div>
        <div className="flex h-8 rounded-lg overflow-hidden">
          {classifications.map((cls) => (
            <div
              key={cls.type}
              className={`bg-gradient-to-br ${cls.color} flex items-center justify-center text-xs font-semibold ${cls.textColor} transition-all hover:opacity-80`}
              style={{ width: `${cls.percent}%` }}
              title={`${cls.label}: ${cls.count} (${cls.percent.toFixed(1)}%)`}
            >
              {cls.percent > 10 && `${cls.percent.toFixed(0)}%`}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// RIDER PERFORMANCE CARD (Individual)
// ============================================================================

type RiderPerformanceCardProps = {
  rider: RiderPerformance;
};

export function RiderPerformanceCard({ rider }: RiderPerformanceCardProps) {
  const getClassificationColor = (classification: RiderClassification) => {
    switch (classification) {
      case 'star': return 'from-yellow-50 to-yellow-100 border-yellow-300';
      case 'solid': return 'from-green-50 to-green-100 border-green-300';
      case 'at_risk': return 'from-orange-50 to-orange-100 border-orange-300';
      case 'critical': return 'from-red-50 to-red-100 border-red-300';
    }
  };
  
  const getClassificationLabel = (classification: RiderClassification) => {
    switch (classification) {
      case 'star': return '⭐ نجم';
      case 'solid': return '💪 قوي';
      case 'at_risk': return '⚠️ في خطر';
      case 'critical': return '🔴 حرج';
    }
  };

  return (
    <div className={`bg-gradient-to-br ${getClassificationColor(rider.classification)} rounded-lg p-6 shadow-lg border-2`}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-xl font-bold text-gray-800">{rider.riderName}</h3>
          <div className="text-sm text-gray-600 font-mono">{rider.riderCode}</div>
          {rider.supervisor && (
            <div className="text-xs text-gray-600 mt-1">المشرف: {rider.supervisor}</div>
          )}
        </div>
        <div className="text-right">
          <div className="text-2xl mb-1">
            {getClassificationLabel(rider.classification)}
          </div>
          <div className="text-3xl font-bold text-blue-600">
            {rider.score.toFixed(1)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-white/70 rounded p-3">
          <div className="text-xs text-gray-600 mb-1">الساعات</div>
          <div className="text-2xl font-bold text-gray-800">{rider.hours.toFixed(1)}</div>
        </div>
        <div className="bg-white/70 rounded p-3">
          <div className="text-xs text-gray-600 mb-1">الأوردرات</div>
          <div className="text-2xl font-bold text-gray-800">{rider.orders}</div>
        </div>
        <div className="bg-white/70 rounded p-3">
          <div className="text-xs text-gray-600 mb-1">أوردر/ساعة</div>
          <div className="text-2xl font-bold text-blue-600">{rider.ordersPerHour.toFixed(2)}</div>
        </div>
        <div className="bg-white/70 rounded p-3">
          <div className="text-xs text-gray-600 mb-1">الحضور</div>
          <div className="text-2xl font-bold text-green-600">{rider.attendancePercent.toFixed(0)}%</div>
        </div>
      </div>

      {rider.strengths.length > 0 && (
        <div className="mb-3">
          <div className="text-xs text-gray-600 font-medium mb-2">نقاط القوة:</div>
          <div className="flex flex-wrap gap-1">
            {rider.strengths.map((strength, i) => (
              <span key={i} className="px-2 py-1 bg-white/80 text-green-700 rounded text-xs">
                {strength}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// COMPACT BADGE
// ============================================================================

type RiderIntelligenceBadgeProps = {
  totalRiders: number;
  starsCount: number;
  criticalCount: number;
};

export function RiderIntelligenceBadge({ 
  totalRiders, 
  starsCount, 
  criticalCount 
}: RiderIntelligenceBadgeProps) {
  return (
    <div className="inline-flex items-center gap-3 px-4 py-2 bg-purple-50 border border-purple-200 rounded-lg">
      <div className="text-2xl">🏍️</div>
      <div>
        <div className="text-xs text-purple-600 font-medium">المناديب</div>
        <div className="text-sm font-bold text-purple-800">
          {totalRiders} مندوب
        </div>
        <div className="text-xs text-purple-600">
          ⭐ {starsCount} • 🔴 {criticalCount}
        </div>
      </div>
    </div>
  );
}
