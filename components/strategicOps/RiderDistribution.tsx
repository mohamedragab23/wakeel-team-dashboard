/**
 * Rider Distribution Visualization
 * 
 * Visualizes rider distribution across hours buckets.
 * Implements SRS-002 Section 8: Rider Distribution.
 * 
 * @module RiderDistribution
 * @version 1.0
 */

import type { RiderDistributionBucket } from '@/lib/strategicOps/kpi';
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts';

const BUCKET_COLORS = ['#64748b', '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#8b5cf6'];

type RiderDistributionProps = {
  distribution: RiderDistributionBucket[];
  totalRiders: number;
};

export function RiderDistributionVisualization({ distribution, totalRiders }: RiderDistributionProps) {
  // Prepare data for charts
  const barData = distribution.map((bucket, idx) => ({
    name: bucket.labelAr,
    count: bucket.riderCount,
    percent: bucket.riderPercent,
    fill: BUCKET_COLORS[idx % BUCKET_COLORS.length],
  }));
  
  const pieData = distribution
    .filter(b => b.riderCount > 0)
    .map((bucket, idx) => ({
      name: bucket.labelAr,
      value: bucket.riderCount,
      fill: BUCKET_COLORS[idx % BUCKET_COLORS.length],
    }));
  
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white mb-1">توزيع المناديب حسب ساعات العمل</h2>
        <p className="text-sm text-gray-400">Rider Distribution by Working Hours</p>
      </div>
      
      {/* Charts Grid */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Bar Chart */}
        <div>
          <h3 className="text-sm font-semibold text-white mb-3">التوزيع (عدد المناديب)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={barData}>
              <XAxis 
                dataKey="name" 
                stroke="#94A3B8"
                style={{ fontSize: '11px' }}
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <YAxis 
                stroke="#94A3B8"
                style={{ fontSize: '12px' }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  color: '#fff',
                }}
              />
              <Bar dataKey="count" name="عدد المناديب">
                {barData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        
        {/* Pie Chart */}
        <div>
          <h3 className="text-sm font-semibold text-white mb-3">التوزيع (نسبة مئوية)</h3>
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
                <th className="text-right text-xs font-semibold text-gray-400 pb-2">العدد</th>
                <th className="text-right text-xs font-semibold text-gray-400 pb-2">النسبة</th>
                <th className="text-right text-xs font-semibold text-gray-400 pb-2">متوسط الأوردرات</th>
                <th className="text-right text-xs font-semibold text-gray-400 pb-2">متوسط التأخير</th>
                <th className="text-right text-xs font-semibold text-gray-400 pb-2">متوسط البريك</th>
                <th className="text-right text-xs font-semibold text-gray-400 pb-2">المشرف الأكثر</th>
              </tr>
            </thead>
            <tbody>
              {distribution.map((bucket, idx) => (
                <tr key={idx} className="border-b border-white/5">
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded"
                        style={{ backgroundColor: BUCKET_COLORS[idx % BUCKET_COLORS.length] }}
                      />
                      <span className="text-sm text-white">{bucket.labelAr}</span>
                    </div>
                  </td>
                  <td className="py-3 text-sm text-white">{bucket.riderCount}</td>
                  <td className="py-3 text-sm text-gray-300">{bucket.riderPercent.toFixed(1)}%</td>
                  <td className="py-3 text-sm text-gray-300">{bucket.averageOrders.toFixed(0)}</td>
                  <td className="py-3 text-sm text-gray-300">{bucket.averageLateMinutes.toFixed(0)} دقيقة</td>
                  <td className="py-3 text-sm text-gray-300">{bucket.averageBreakMinutes.toFixed(0)} دقيقة</td>
                  <td className="py-3 text-sm text-gray-300">{bucket.topSupervisor || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-4 border-t border-white/10">
        <div className="rounded-lg bg-white/5 border border-white/10 p-3 text-center">
          <p className="text-xs text-gray-400 mb-1">إجمالي المناديب</p>
          <p className="text-xl font-bold text-white">{totalRiders}</p>
        </div>
        <div className="rounded-lg bg-white/5 border border-white/10 p-3 text-center">
          <p className="text-xs text-gray-400 mb-1">مناديب بدون ساعات</p>
          <p className="text-xl font-bold text-red-300">{distribution[0]?.riderCount || 0}</p>
        </div>
        <div className="rounded-lg bg-white/5 border border-white/10 p-3 text-center">
          <p className="text-xs text-gray-400 mb-1">مناديب عالي الأداء (10+)</p>
          <p className="text-xl font-bold text-emerald-300">
            {distribution[distribution.length - 1]?.riderCount || 0}
          </p>
        </div>
        <div className="rounded-lg bg-white/5 border border-white/10 p-3 text-center">
          <p className="text-xs text-gray-400 mb-1">الفئة الأكثر شيوعاً</p>
          <p className="text-sm font-bold text-white">
            {distribution.reduce((max, b) => b.riderCount > max.riderCount ? b : max).labelAr}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Compact Rider Distribution Badge
 * For dashboard overview
 */
export function RiderDistributionBadge({ distribution, totalRiders }: RiderDistributionProps) {
  const zeroHoursCount = distribution[0]?.riderCount || 0;
  const highPerformersCount = distribution[distribution.length - 1]?.riderCount || 0;
  
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
      <p className="text-xs text-gray-400 mb-2">توزيع المناديب</p>
      <div className="flex items-center gap-2 mb-2">
        {distribution.map((bucket, idx) => (
          <div
            key={idx}
            className="h-2 rounded-full transition-all hover:h-3"
            style={{
              width: `${bucket.riderPercent}%`,
              backgroundColor: BUCKET_COLORS[idx % BUCKET_COLORS.length],
            }}
            title={`${bucket.labelAr}: ${bucket.riderCount} (${bucket.riderPercent.toFixed(1)}%)`}
          />
        ))}
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-red-300">{zeroHoursCount} بدون ساعات</span>
        <span className="text-emerald-300">{highPerformersCount} عالي الأداء</span>
      </div>
    </div>
  );
}
