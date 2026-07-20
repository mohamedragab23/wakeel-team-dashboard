/**
 * Lost Hours Analysis Component
 * 
 * Breakdown of lost hours by category with financial impact.
 * Implements SRS-002 Section 7: Lost Hours Analysis.
 * 
 * @module LostHoursAnalysis
 * @version 1.0
 */

import type { LostHoursCategoryBreakdown } from '@/lib/strategicOps/kpi';
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const CATEGORY_COLORS: Record<string, string> = {
  absence: '#ef4444',
  late: '#f97316',
  break: '#eab308',
  medical: '#06b6d4',
  equipment: '#8b5cf6',
  vacation: '#ec4899',
  accident: '#f43f5e',
  poor_performance: '#fb923c',
  other: '#64748b',
  no_shift: '#94a3b8',
  unknown: '#475569',
};

const CATEGORY_ICONS: Record<string, string> = {
  absence: '🚫',
  late: '⏰',
  break: '☕',
  medical: '🏥',
  equipment: '🔧',
  vacation: '🏖️',
  accident: '🚨',
  poor_performance: '📉',
  other: '❓',
  no_shift: '🔄',
  unknown: '❔',
};

type LostHoursAnalysisProps = {
  categoryBreakdown: LostHoursCategoryBreakdown[];
  totalLostHours: number;
  lostPercent: number;
  potentialHours: number;
};

export function LostHoursAnalysis({
  categoryBreakdown,
  totalLostHours,
  lostPercent,
  potentialHours,
}: LostHoursAnalysisProps) {
  // Sort by hours descending
  const sortedCategories = [...categoryBreakdown].sort((a, b) => b.hours - a.hours);
  
  // Prepare chart data
  const pieData = sortedCategories
    .filter(c => c.hours > 0)
    .map(cat => ({
      name: cat.categoryAr,
      value: cat.hours,
      fill: CATEGORY_COLORS[cat.category] || '#64748b',
    }));
  
  const barData = sortedCategories.map(cat => ({
    name: cat.categoryAr,
    hours: cat.hours,
    fill: CATEGORY_COLORS[cat.category] || '#64748b',
  }));
  
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-1">تحليل الساعات الضائعة</h2>
        <p className="text-sm text-gray-400">Lost Hours Analysis by Category</p>
      </div>
      
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-center">
          <p className="text-xs text-gray-400 mb-1">إجمالي الساعات الضائعة</p>
          <p className="text-2xl font-bold text-red-300">{totalLostHours.toFixed(0)}</p>
          <p className="text-xs text-gray-500 mt-1">ساعة</p>
        </div>
        <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-center">
          <p className="text-xs text-gray-400 mb-1">نسبة الضياع</p>
          <p className="text-2xl font-bold text-red-300">{lostPercent.toFixed(1)}%</p>
          <p className="text-xs text-gray-500 mt-1">من الإجمالي</p>
        </div>
        <div className="rounded-lg bg-white/5 border border-white/10 p-3 text-center">
          <p className="text-xs text-gray-400 mb-1">الساعات المحتملة</p>
          <p className="text-2xl font-bold text-white">{potentialHours.toFixed(0)}</p>
          <p className="text-xs text-gray-500 mt-1">ساعة</p>
        </div>
        <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-3 text-center">
          <p className="text-xs text-gray-400 mb-1">الساعات المنجزة</p>
          <p className="text-2xl font-bold text-emerald-300">
            {(potentialHours - totalLostHours).toFixed(0)}
          </p>
          <p className="text-xs text-gray-500 mt-1">ساعة</p>
        </div>
      </div>
      
      {/* Charts */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Bar Chart */}
        <div>
          <h3 className="text-sm font-semibold text-white mb-3">التوزيع حسب الفئة</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={barData} layout="vertical">
              <XAxis type="number" stroke="#94A3B8" style={{ fontSize: '12px' }} />
              <YAxis 
                type="category" 
                dataKey="name" 
                stroke="#94A3B8"
                style={{ fontSize: '11px' }}
                width={100}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  color: '#fff',
                }}
              />
              <Bar dataKey="hours" name="ساعات ضائعة">
                {barData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        
        {/* Pie Chart */}
        <div>
          <h3 className="text-sm font-semibold text-white mb-3">النسب المئوية</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({name, percent}) => `${name}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  color: '#fff',
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
      
      {/* Detailed Table */}
      <div>
        <h3 className="text-sm font-semibold text-white mb-3">التفاصيل الكاملة</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-right text-xs font-semibold text-gray-400 pb-2">الفئة</th>
                <th className="text-right text-xs font-semibold text-gray-400 pb-2">الساعات</th>
                <th className="text-right text-xs font-semibold text-gray-400 pb-2">النسبة</th>
                <th className="text-right text-xs font-semibold text-gray-400 pb-2">الخسارة المالية</th>
                <th className="text-right text-xs font-semibold text-gray-400 pb-2">الأوردرات المفقودة</th>
                <th className="text-right text-xs font-semibold text-gray-400 pb-2">الاتجاه</th>
              </tr>
            </thead>
            <tbody>
              {sortedCategories.map((cat, idx) => (
                <tr key={idx} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{CATEGORY_ICONS[cat.category] || '📊'}</span>
                      <div>
                        <p className="text-sm text-white font-medium">{cat.categoryAr}</p>
                        <p className="text-xs text-gray-500 capitalize">{cat.category.replace('_', ' ')}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3">
                    <p className="text-sm font-semibold text-white">{cat.hours.toFixed(1)}</p>
                    <p className="text-xs text-gray-500">ساعة</p>
                  </td>
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-white/10 rounded-full h-2 overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${cat.percent}%`,
                            backgroundColor: CATEGORY_COLORS[cat.category] || '#64748b',
                          }}
                        />
                      </div>
                      <span className="text-sm text-gray-300">{cat.percent.toFixed(1)}%</span>
                    </div>
                  </td>
                  <td className="py-3">
                    <p className="text-sm text-gray-300">${cat.financialLoss.toLocaleString()}</p>
                  </td>
                  <td className="py-3">
                    <p className="text-sm text-gray-300">{cat.ordersLost.toLocaleString()}</p>
                  </td>
                  <td className="py-3">
                    <span className={`text-sm ${
                      cat.trend === 'up' ? 'text-red-400' :
                      cat.trend === 'down' ? 'text-emerald-400' :
                      'text-gray-400'
                    }`}>
                      {cat.trend === 'up' ? '↑' : cat.trend === 'down' ? '↓' : '→'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Top 3 Categories */}
      <div className="grid md:grid-cols-3 gap-3 pt-4 border-t border-white/10">
        {sortedCategories.slice(0, 3).map((cat, idx) => (
          <div key={idx} className="rounded-lg bg-white/5 border border-white/10 p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">{CATEGORY_ICONS[cat.category]}</span>
              <div className="flex-1">
                <p className="text-xs text-gray-400">#{idx + 1} الأكثر تأثيراً</p>
                <p className="text-sm font-semibold text-white">{cat.categoryAr}</p>
              </div>
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-400">الساعات:</span>
                <span className="text-white font-semibold">{cat.hours.toFixed(1)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">النسبة:</span>
                <span className="text-white font-semibold">{cat.percent.toFixed(1)}%</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Compact Lost Hours Badge
 * For dashboard overview
 */
export function LostHoursBadge({ 
  totalLostHours, 
  lostPercent 
}: { 
  totalLostHours: number; 
  lostPercent: number;
}) {
  const isHigh = lostPercent > 10;
  const bgColor = isHigh ? 'bg-red-500/10' : 'bg-amber-500/10';
  const borderColor = isHigh ? 'border-red-500/30' : 'border-amber-500/30';
  const textColor = isHigh ? 'text-red-300' : 'text-amber-300';
  
  return (
    <div className={`rounded-lg border ${borderColor} ${bgColor} p-3`}>
      <p className="text-xs text-gray-400 mb-1">الساعات الضائعة</p>
      <div className="flex items-baseline gap-2">
        <p className={`text-2xl font-bold ${textColor}`}>{totalLostHours.toFixed(0)}</p>
        <span className="text-sm text-gray-400">ساعة</span>
      </div>
      <p className={`text-xs ${textColor} mt-1`}>
        {lostPercent.toFixed(1)}% من الإجمالي
      </p>
    </div>
  );
}
