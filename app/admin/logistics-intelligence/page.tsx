'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Layout from '@/components/Layout';
import Card from '@/components/ui-v2/Card';
import Button from '@/components/ui-v2/Button';
import { authFetch } from '@/lib/authFetch';
import { usePageNotify } from '@/lib/usePageNotify';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

interface AnalyticsData {
  totalRiders: number;
  uniqueRiders: number;
  avgActiveRiders: number;
  avgAbsentRiders: number;
  activeRidersPercentage: number;
  avgWorkHours: number;
  avgBreakHours: number;
  totalWorkHours: number;
  dateRange: { from: string; to: string } | null;
  workHoursSegments: {
    lessThan4: { count: number; riders: Array<{ id: string; name: string; avgHours: number }> };
    from4To6: { count: number; riders: Array<{ id: string; name: string; avgHours: number }> };
    from6To8: { count: number; riders: Array<{ id: string; name: string; avgHours: number }> };
    above8: { count: number; riders: Array<{ id: string; name: string; avgHours: number }> };
  };
  inactive3DaysPlus: Array<{ id: string; name: string; lastActiveDate: string; daysInactive: number }>;
  topBreakTakers: Array<{ id: string; name: string; avgBreakHours: number; totalBreakHours: number }>;
  topAbsentRiders: Array<{ id: string; name: string; absentDays: number; totalDays: number }>;
  supervisorStats: Array<{
    supervisor: string;
    totalRiders: number;
    avgActiveRiders: number;
    avgWorkHours: number;
    avgBreakHours: number;
    absentRate: number;
    activeRate: number;
  }>;
  dailyStats: Array<{
    date: string;
    activeRiders: number;
    absentRiders: number;
    avgWorkHours: number;
    totalWorkHours: number;
  }>;
}

interface PlanningData {
  targetHoursPerDay?: number;
  requiredRiders?: number;
  gap?: number;
  recommendations?: Array<{ priority: string; action: string; timeline: string; details: string }>;
  phases?: Array<{
    month: number;
    targetHours: number;
    requiredRiders: number;
    newRidersToHire: number;
    avgHoursGoal: number;
    milestones: string[];
  }>;
  warnings?: Array<{
    severity: string;
    category: string;
    issue: string;
    impact: string;
    solutions: string[];
    timeline: string;
  }>;
}

interface DeltaData {
  newHires: number;
  reactivations: number;
  terminations: number;
  delta: number;
  netGrowth: string;
  period: { from: string; to: string } | null;
}

function StatCard({ label, value, sub, trend }: { label: string; value: string | number; sub?: string; trend?: 'up' | 'down' | 'neutral' }) {
  const trendColor = trend === 'up' ? 'text-emerald-400' : trend === 'down' ? 'text-red-400' : 'text-gray-400';
  const trendIcon = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→';

  return (
    <div className="rounded-xl border border-white/10 bg-gradient-to-br from-white/5 to-white/[0.02] p-5 backdrop-blur-sm hover:border-white/20 transition-all">
      <p className="text-xs text-[#94A3B8] mb-2 font-medium">{label}</p>
      <div className="flex items-baseline gap-2">
        <p className="text-3xl font-bold text-[#EAF0FF]">{value}</p>
        {trend && <span className={`text-xl ${trendColor}`}>{trendIcon}</span>}
      </div>
      {sub && <p className="text-xs text-[#64748B] mt-2">{sub}</p>}
    </div>
  );
}

function Section({ title, children, icon }: { title: string; children: React.ReactNode; icon?: string }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-5 backdrop-blur-sm">
      <h2 className="text-xl font-bold text-[#EAF0FF] border-b border-white/10 pb-3 flex items-center gap-2">
        {icon && <span className="text-2xl">{icon}</span>}
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function LogisticsIntelligencePage() {
  const notify = usePageNotify();
  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const defaultStart = weekAgo.toISOString().split('T')[0];

  const [fromDate, setFromDate] = useState(defaultStart);
  const [toDate, setToDate] = useState(today);
  const [zone, setZone] = useState('all');
  const [targetHours, setTargetHours] = useState('1500');
  const [targetFinalHours, setTargetFinalHours] = useState('2000');
  const [growthMonths, setGrowthMonths] = useState('4');
  const [activeTab, setActiveTab] = useState<'overview' | 'segments' | 'issues' | 'planning' | 'supervisors'>('overview');

  // Fetch analytics data
  const { data: analytics, isLoading: loadingAnalytics, refetch: refetchAnalytics } = useQuery({
    queryKey: ['logistics-analytics', fromDate, toDate, zone],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      if (zone && zone !== 'all') params.set('zone', zone);
      const res = await authFetch(`/api/admin/performance/analytics?${params}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      return json.data as AnalyticsData;
    },
    enabled: false,
  });

  // Fetch delta data
  const { data: delta, refetch: refetchDelta } = useQuery({
    queryKey: ['logistics-delta', fromDate, toDate, zone],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      if (zone && zone !== 'all') params.set('zone', zone);
      const res = await authFetch(`/api/admin/performance/delta?${params}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      return json.data as DeltaData;
    },
    enabled: false,
  });

  // Calculate target requirements
  const [planningData, setPlanningData] = useState<PlanningData | null>(null);

  const runAnalysis = async () => {
    if (!fromDate || !toDate) {
      notify.error('يرجى اختيار نطاق التاريخ');
      return;
    }
    await Promise.all([refetchAnalytics(), refetchDelta()]);
    notify.success('تم تحديث التحليلات');
  };

  const calculateTarget = async () => {
    if (!analytics || !targetHours) {
      notify.error('يرجى تشغيل التحليل أولاً وإدخال Target');
      return;
    }

    try {
      const res = await authFetch('/api/admin/performance/planning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'target_calculation',
          data: {
            targetHoursPerDay: parseFloat(targetHours),
            avgWorkHoursPerRider: analytics.avgWorkHours,
            currentActiveRiders: analytics.avgActiveRiders,
          },
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setPlanningData(json.data);
      notify.success('تم حساب متطلبات Target');
    } catch (error: any) {
      notify.error(error.message || 'فشل الحساب');
    }
  };

  const generateGrowthPlan = async () => {
    if (!analytics || !targetFinalHours || !growthMonths) {
      notify.error('يرجى إدخال جميع البيانات المطلوبة');
      return;
    }

    try {
      const res = await authFetch('/api/admin/performance/planning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'growth_plan',
          data: {
            targetHoursPerDay: parseFloat(targetFinalHours),
            currentTotalHours: analytics.totalWorkHours / (analytics.dailyStats?.length || 1),
            currentActiveRiders: analytics.avgActiveRiders,
            avgWorkHoursPerRider: analytics.avgWorkHours,
            timeframeMonths: parseInt(growthMonths),
          },
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setPlanningData(json.data);
      notify.success('تم إنشاء خطة النمو');
    } catch (error: any) {
      notify.error(error.message || 'فشل إنشاء الخطة');
    }
  };

  const generateWarnings = async () => {
    if (!analytics) {
      notify.error('يرجى تشغيل التحليل أولاً');
      return;
    }

    try {
      const res = await authFetch('/api/admin/performance/planning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'performance_warnings',
          data: {
            avgActiveRiders: analytics.avgActiveRiders,
            avgWorkHours: analytics.avgWorkHours,
            absentRate: (analytics.avgAbsentRiders / analytics.totalRiders) * 100,
            avgBreakHours: analytics.avgBreakHours,
            totalRiders: analytics.totalRiders,
            lessThan4HoursCount: analytics.workHoursSegments.lessThan4.count,
          },
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setPlanningData(json.data);
      notify.success('تم تحليل الأداء');
    } catch (error: any) {
      notify.error(error.message || 'فشل التحليل');
    }
  };

  const loading = loadingAnalytics;

  // Prepare charts data
  const workHoursSegmentsChart = analytics ? [
    { name: 'أقل من 4 ساعات', value: analytics.workHoursSegments.lessThan4.count, fill: '#ef4444' },
    { name: '4-6 ساعات', value: analytics.workHoursSegments.from4To6.count, fill: '#f59e0b' },
    { name: '6-8 ساعات', value: analytics.workHoursSegments.from6To8.count, fill: '#3b82f6' },
    { name: '8+ ساعات', value: analytics.workHoursSegments.above8.count, fill: '#22c55e' },
  ] : [];

  const dailyTrendData = analytics?.dailyStats?.map(d => ({
    date: d.date.split('-').slice(1).join('/'),
    active: d.activeRiders,
    absent: d.absentRiders,
    hours: d.avgWorkHours,
  })) || [];

  return (
    <Layout>
      <div className="space-y-6 pb-12" dir="rtl">
        {/* Header */}
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold text-[#EAF0FF] flex items-center gap-3">
            <span className="text-4xl">🎯</span>
            تحليلات العمليات اللوجستية
          </h1>
          <p className="text-sm text-[#94A3B8]">تحليلات متقدمة، تخطيط استراتيجي، وتوصيات ذكية لتحسين الأداء التشغيلي</p>
        </div>

        {/* Filters */}
        <Card className="p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <label className="text-xs text-[#94A3B8] block mb-2 font-medium">من تاريخ</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2.5 text-[#EAF0FF] text-sm focus:border-cyan-500/50 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-[#94A3B8] block mb-2 font-medium">إلى تاريخ</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2.5 text-[#EAF0FF] text-sm focus:border-cyan-500/50 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-[#94A3B8] block mb-2 font-medium">المنطقة</label>
              <select
                value={zone}
                onChange={(e) => setZone(e.target.value)}
                className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2.5 text-[#EAF0FF] text-sm focus:border-cyan-500/50 focus:outline-none"
              >
                <option value="all">جميع المناطق</option>
                <option value="Alexandria">Alexandria</option>
                <option value="Cairo">Cairo</option>
                <option value="Giza">Giza</option>
                <option value="Mansoura">Mansoura</option>
                <option value="Tanta">Tanta</option>
                <option value="Zagazig">Zagazig</option>
                <option value="Assiut">Assiut</option>
                <option value="Port Said">Port Said</option>
                <option value="Suez">Suez</option>
                <option value="Ismailia">Ismailia</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-[#94A3B8] block mb-2 font-medium">Target الحالي (ساعة/يوم)</label>
              <input
                type="number"
                value={targetHours}
                onChange={(e) => setTargetHours(e.target.value)}
                placeholder="1500"
                className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2.5 text-[#EAF0FF] text-sm focus:border-cyan-500/50 focus:outline-none"
              />
            </div>
            <div className="flex items-end">
              <Button
                onClick={runAnalysis}
                disabled={loading}
                className="w-full bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white font-semibold py-2.5"
              >
                {loading ? '🔄 جاري التحليل...' : '📊 تشغيل التحليل'}
              </Button>
            </div>
          </div>
        </Card>

        {!analytics && !loading && (
          <div className="text-center py-20 text-[#64748B]">
            <p className="text-xl mb-2">👆 اختر الفترة واضغط "تشغيل التحليل"</p>
            <p className="text-sm">سيتم تحليل بيانات الأداء وإنشاء تقرير شامل</p>
          </div>
        )}

        {analytics && (
          <>
            {/* Delta Summary */}
            {delta && (
              <Card className="p-5 bg-gradient-to-r from-purple-500/10 to-pink-500/10 border-purple-500/30">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <p className="text-sm text-[#94A3B8] mb-1">📈 التغير الصافي في القوى العاملة (Delta)</p>
                    <p className="text-3xl font-bold text-[#EAF0FF]">{delta.netGrowth}</p>
                  </div>
                  <div className="flex gap-6 text-sm">
                    <div>
                      <p className="text-[#94A3B8]">تعيينات جديدة</p>
                      <p className="text-2xl font-bold text-emerald-400">+{delta.newHires}</p>
                    </div>
                    <div>
                      <p className="text-[#94A3B8]">إعادة تفعيل</p>
                      <p className="text-2xl font-bold text-blue-400">+{delta.reactivations}</p>
                    </div>
                    <div>
                      <p className="text-[#94A3B8]">إقالات</p>
                      <p className="text-2xl font-bold text-red-400">-{delta.terminations}</p>
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {/* Key Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                label="إجمالي المناديب"
                value={analytics.totalRiders}
                sub={`الفترة: ${analytics.dateRange?.from} → ${analytics.dateRange?.to}`}
              />
              <StatCard
                label="متوسط المناديب النشطين يومياً"
                value={analytics.avgActiveRiders}
                sub={`نسبة النشطين: ${analytics.activeRidersPercentage}%`}
                trend={analytics.activeRidersPercentage > 85 ? 'up' : analytics.activeRidersPercentage < 70 ? 'down' : 'neutral'}
              />
              <StatCard
                label="متوسط ساعات العمل"
                value={`${analytics.avgWorkHours} ساعة`}
                sub="لكل مندوب في اليوم"
                trend={analytics.avgWorkHours >= 6 ? 'up' : analytics.avgWorkHours < 5 ? 'down' : 'neutral'}
              />
              <StatCard
                label="إجمالي ساعات العمل"
                value={Math.round(analytics.totalWorkHours)}
                sub={`متوسط يومي: ${Math.round(analytics.totalWorkHours / (analytics.dailyStats?.length || 1))} ساعة`}
              />
            </div>

            {/* Tabs */}
            <div className="flex gap-2 flex-wrap border-b border-white/10 pb-3">
              {[
                { id: 'overview', label: '📊 نظرة عامة', icon: '📊' },
                { id: 'segments', label: '📈 شرائح الأداء', icon: '📈' },
                { id: 'issues', label: '⚠️ المشاكل', icon: '⚠️' },
                { id: 'planning', label: '🎯 التخطيط', icon: '🎯' },
                { id: 'supervisors', label: '👔 المشرفين', icon: '👔' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    activeTab === tab.id
                      ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white'
                      : 'text-[#94A3B8] hover:text-[#EAF0FF] hover:bg-white/5'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Overview Tab */}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                {/* Daily Trend */}
                <Section title="الاتجاه اليومي" icon="📉">
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={dailyTrendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                      <XAxis dataKey="date" stroke="#94A3B8" />
                      <YAxis stroke="#94A3B8" />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                        labelStyle={{ color: '#EAF0FF' }}
                      />
                      <Legend />
                      <Line type="monotone" dataKey="active" stroke="#22c55e" name="نشطين" strokeWidth={2} />
                      <Line type="monotone" dataKey="absent" stroke="#ef4444" name="غياب" strokeWidth={2} />
                      <Line type="monotone" dataKey="hours" stroke="#3b82f6" name="متوسط الساعات" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </Section>

                {/* Work Hours Distribution */}
                <Section title="توزيع ساعات العمل" icon="⏰">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <ResponsiveContainer width="100%" height={250}>
                      <PieChart>
                        <Pie
                          data={workHoursSegmentsChart}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={(entry) => `${entry.name}: ${entry.value}`}
                          outerRadius={80}
                          dataKey="value"
                        >
                          {workHoursSegmentsChart.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-3">
                      {workHoursSegmentsChart.map((segment) => (
                        <div key={segment.name} className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10">
                          <div className="flex items-center gap-3">
                            <div className="w-4 h-4 rounded" style={{ backgroundColor: segment.fill }}></div>
                            <span className="text-[#EAF0FF]">{segment.name}</span>
                          </div>
                          <span className="text-2xl font-bold text-[#EAF0FF]">{segment.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </Section>
              </div>
            )}

            {/* Segments Tab */}
            {activeTab === 'segments' && (
              <div className="space-y-6">
                {[
                  { key: 'lessThan4', title: 'أقل من 4 ساعات (ضعيف)', color: 'red' },
                  { key: 'from4To6', title: '4-6 ساعات (متوسط)', color: 'amber' },
                  { key: 'from6To8', title: '6-8 ساعات (جيد)', color: 'blue' },
                  { key: 'above8', title: '8+ ساعات (ممتاز)', color: 'emerald' },
                ].map((segment) => {
                  const data = analytics.workHoursSegments[segment.key as keyof typeof analytics.workHoursSegments];
                  return (
                    <Section key={segment.key} title={`${segment.title} (${data.count} مندوب)`}>
                      {data.riders.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {data.riders.slice(0, 12).map((rider) => (
                            <div key={rider.id} className="p-3 rounded-lg bg-white/5 border border-white/10">
                              <p className="text-[#EAF0FF] font-medium">{rider.name}</p>
                              <p className="text-xs text-[#94A3B8]">كود: {rider.id}</p>
                              <p className={`text-lg font-bold text-${segment.color}-400 mt-1`}>{rider.avgHours} ساعة</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[#64748B] text-center py-4">لا يوجد مناديب في هذه الشريحة</p>
                      )}
                    </Section>
                  );
                })}
              </div>
            )}

            {/* Issues Tab */}
            {activeTab === 'issues' && (
              <div className="space-y-6">
                {/* Inactive 3+ Days */}
                <Section title={`مناديب غير نشطين لـ 3 أيام فأكثر (${analytics.inactive3DaysPlus.length})`} icon="🚫">
                  {analytics.inactive3DaysPlus.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {analytics.inactive3DaysPlus.slice(0, 15).map((rider) => (
                        <div key={rider.id} className="p-4 rounded-lg bg-red-500/10 border border-red-500/30">
                          <p className="text-[#EAF0FF] font-medium">{rider.name}</p>
                          <p className="text-xs text-[#94A3B8]">كود: {rider.id}</p>
                          <p className="text-red-400 font-bold mt-2">{rider.daysInactive} أيام غياب</p>
                          {rider.lastActiveDate && (
                            <p className="text-xs text-[#64748B] mt-1">آخر نشاط: {rider.lastActiveDate}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-emerald-400 text-center py-4">✅ لا يوجد مناديب غير نشطين لفترة طويلة</p>
                  )}
                </Section>

                {/* Top Break Takers */}
                <Section title={`أعلى مناديب في أخذ الاستراحات (Top ${Math.min(10, analytics.topBreakTakers.length)})`} icon="☕">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {analytics.topBreakTakers.slice(0, 10).map((rider, index) => (
                      <div key={rider.id} className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-between">
                        <div>
                          <p className="text-[#EAF0FF] font-medium">
                            #{index + 1} {rider.name}
                          </p>
                          <p className="text-xs text-[#94A3B8]">كود: {rider.id}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-amber-400">{rider.avgBreakHours} ساعة</p>
                          <p className="text-xs text-[#64748B]">متوسط يومي</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>

                {/* Top Absent Riders */}
                <Section title={`أعلى مناديب في الغياب (Top ${Math.min(10, analytics.topAbsentRiders.length)})`} icon="⚠️">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {analytics.topAbsentRiders.slice(0, 10).map((rider, index) => (
                      <div key={rider.id} className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center justify-between">
                        <div>
                          <p className="text-[#EAF0FF] font-medium">
                            #{index + 1} {rider.name}
                          </p>
                          <p className="text-xs text-[#94A3B8]">كود: {rider.id}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-red-400">{rider.absentDays}</p>
                          <p className="text-xs text-[#64748B]">أيام غياب من {rider.totalDays}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>

                {/* Performance Warnings */}
                <div className="flex gap-3">
                  <Button onClick={generateWarnings} className="bg-orange-500 hover:bg-orange-600">
                    🔍 تحليل المشاكل وإنشاء تحذيرات
                  </Button>
                </div>

                {planningData?.warnings && (
                  <Section title={`تحذيرات الأداء (${planningData.warnings.length})`} icon="🚨">
                    <div className="space-y-4">
                      {planningData.warnings.map((warning, index) => (
                        <div
                          key={index}
                          className={`p-5 rounded-xl border ${
                            warning.severity === 'critical'
                              ? 'bg-red-500/15 border-red-500/40'
                              : warning.severity === 'high'
                                ? 'bg-orange-500/15 border-orange-500/40'
                                : 'bg-amber-500/15 border-amber-500/40'
                          }`}
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold mb-2 ${
                                warning.severity === 'critical'
                                  ? 'bg-red-500 text-white'
                                  : warning.severity === 'high'
                                    ? 'bg-orange-500 text-white'
                                    : 'bg-amber-500 text-black'
                              }`}>
                                {warning.severity === 'critical' ? '🔴 حرج' : warning.severity === 'high' ? '🟠 مرتفع' : '🟡 متوسط'}
                              </span>
                              <h3 className="text-lg font-bold text-[#EAF0FF]">{warning.category}</h3>
                            </div>
                            <span className="text-xs text-[#94A3B8] bg-white/10 px-3 py-1 rounded-full">{warning.timeline}</span>
                          </div>
                          <p className="text-[#EAF0FF] mb-2">{warning.issue}</p>
                          <p className="text-sm text-amber-300 mb-4">💥 التأثير: {warning.impact}</p>
                          <div>
                            <p className="text-sm font-bold text-[#94A3B8] mb-2">✅ الحلول المقترحة:</p>
                            <ul className="space-y-1">
                              {warning.solutions.map((solution, i) => (
                                <li key={i} className="text-sm text-[#EAF0FF] flex items-start gap-2">
                                  <span className="text-cyan-400">•</span>
                                  {solution}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Section>
                )}
              </div>
            )}

            {/* Planning Tab */}
            {activeTab === 'planning' && (
              <div className="space-y-6">
                {/* Target Calculator */}
                <Section title="حاسبة Target - كم مندوب تحتاج؟" icon="🎯">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div>
                        <label className="text-sm text-[#94A3B8] block mb-2">Target اليومي (ساعات)</label>
                        <input
                          type="number"
                          value={targetHours}
                          onChange={(e) => setTargetHours(e.target.value)}
                          className="w-full rounded-lg bg-black/30 border border-white/10 px-4 py-3 text-[#EAF0FF] text-lg font-bold"
                          placeholder="1500"
                        />
                      </div>
                      <Button onClick={calculateTarget} className="w-full bg-gradient-to-r from-cyan-500 to-blue-500">
                        📊 حساب المتطلبات
                      </Button>
                    </div>

                    {planningData?.requiredRiders && (
                      <div className="space-y-4">
                        <div className="p-5 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30">
                          <p className="text-sm text-[#94A3B8] mb-1">عدد المناديب المطلوب</p>
                          <p className="text-5xl font-bold text-cyan-400">{planningData.requiredRiders}</p>
                        </div>
                        <div className="p-5 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/30">
                          <p className="text-sm text-[#94A3B8] mb-1">الفجوة (Gap)</p>
                          <p className={`text-4xl font-bold ${planningData.gap! > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                            {planningData.gap! > 0 ? '+' : ''}{planningData.gap} مندوب
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {planningData?.recommendations && planningData.recommendations.length > 0 && (
                    <div className="mt-6 space-y-3">
                      <h4 className="font-bold text-[#EAF0FF]">📋 التوصيات:</h4>
                      {planningData.recommendations.map((rec, index) => (
                        <div key={index} className="p-4 rounded-lg bg-white/5 border border-white/10">
                          <div className="flex items-start justify-between mb-2">
                            <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                              rec.priority === 'high' ? 'bg-red-500 text-white' : 'bg-blue-500 text-white'
                            }`}>
                              {rec.priority === 'high' ? '🔴 عاجل' : '📅 مخطط'}
                            </span>
                            <span className="text-xs text-[#64748B]">{rec.timeline}</span>
                          </div>
                          <p className="text-[#EAF0FF] font-medium mb-1">{rec.action}</p>
                          <p className="text-sm text-[#94A3B8]">{rec.details}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </Section>

                {/* Growth Plan Generator */}
                <Section title="مولد خطط النمو الاستراتيجية" icon="📈">
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
                    <div>
                      <label className="text-sm text-[#94A3B8] block mb-2">Target النهائي (ساعات/يوم)</label>
                      <input
                        type="number"
                        value={targetFinalHours}
                        onChange={(e) => setTargetFinalHours(e.target.value)}
                        className="w-full rounded-lg bg-black/30 border border-white/10 px-4 py-3 text-[#EAF0FF]"
                        placeholder="2000"
                      />
                    </div>
                    <div>
                      <label className="text-sm text-[#94A3B8] block mb-2">الإطار الزمني (شهور)</label>
                      <input
                        type="number"
                        value={growthMonths}
                        onChange={(e) => setGrowthMonths(e.target.value)}
                        className="w-full rounded-lg bg-black/30 border border-white/10 px-4 py-3 text-[#EAF0FF]"
                        placeholder="4"
                      />
                    </div>
                    <div className="flex items-end">
                      <Button onClick={generateGrowthPlan} className="w-full bg-gradient-to-r from-purple-500 to-pink-500">
                        🚀 إنشاء خطة النمو
                      </Button>
                    </div>
                  </div>

                  {planningData?.phases && (
                    <div className="space-y-4">
                      {planningData.phases.map((phase) => (
                        <div key={phase.month} className="p-5 rounded-xl bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/30">
                          <div className="flex items-center justify-between mb-4">
                            <h4 className="text-xl font-bold text-[#EAF0FF]">الشهر {phase.month}</h4>
                            <span className="text-2xl font-bold text-purple-400">{phase.targetHours} ساعة</span>
                          </div>
                          <div className="grid grid-cols-3 gap-4 mb-4">
                            <div className="text-center">
                              <p className="text-xs text-[#94A3B8]">مناديب مطلوبين</p>
                              <p className="text-2xl font-bold text-cyan-400">{phase.requiredRiders}</p>
                            </div>
                            <div className="text-center">
                              <p className="text-xs text-[#94A3B8]">تعيينات جديدة</p>
                              <p className="text-2xl font-bold text-emerald-400">+{phase.newRidersToHire}</p>
                            </div>
                            <div className="text-center">
                              <p className="text-xs text-[#94A3B8]">هدف متوسط الساعات</p>
                              <p className="text-2xl font-bold text-blue-400">{phase.avgHoursGoal}</p>
                            </div>
                          </div>
                          <div>
                            <p className="text-sm font-bold text-[#94A3B8] mb-2">المعالم الرئيسية:</p>
                            <ul className="space-y-1">
                              {phase.milestones.map((milestone, i) => (
                                <li key={i} className="text-sm text-[#EAF0FF] flex items-center gap-2">
                                  <span className="text-purple-400">✓</span>
                                  {milestone}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Section>
              </div>
            )}

            {/* Supervisors Tab */}
            {activeTab === 'supervisors' && analytics.supervisorStats && (
              <div className="space-y-6">
                <Section title={`تقييم المشرفين (${analytics.supervisorStats.length} مشرف)`} icon="👔">
                  <div className="space-y-3">
                    {analytics.supervisorStats.map((sup, index) => {
                      const performance = sup.avgWorkHours >= 6 && sup.activeRate >= 85 ? 'excellent' : 
                                         sup.avgWorkHours >= 5.5 && sup.activeRate >= 80 ? 'good' : 
                                         sup.avgWorkHours >= 5 ? 'average' : 'weak';
                      const performanceColor = performance === 'excellent' ? 'emerald' : 
                                              performance === 'good' ? 'blue' : 
                                              performance === 'average' ? 'amber' : 'red';
                      const performanceLabel = performance === 'excellent' ? '⭐ ممتاز' : 
                                               performance === 'good' ? '✅ جيد' : 
                                               performance === 'average' ? '⚠️ متوسط' : '🔴 ضعيف';

                      return (
                        <div key={index} className={`p-5 rounded-xl border border-${performanceColor}-500/30 bg-${performanceColor}-500/10`}>
                          <div className="flex items-center justify-between mb-4">
                            <div>
                              <h4 className="text-lg font-bold text-[#EAF0FF]">{sup.supervisor}</h4>
                              <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold mt-1 bg-${performanceColor}-500 text-white`}>
                                {performanceLabel}
                              </span>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-[#94A3B8]">إجمالي المناديب</p>
                              <p className="text-2xl font-bold text-[#EAF0FF]">{sup.totalRiders}</p>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div>
                              <p className="text-xs text-[#94A3B8]">متوسط النشطين</p>
                              <p className="text-xl font-bold text-[#EAF0FF]">{sup.avgActiveRiders}</p>
                            </div>
                            <div>
                              <p className="text-xs text-[#94A3B8]">متوسط الساعات</p>
                              <p className="text-xl font-bold text-[#EAF0FF]">{sup.avgWorkHours}</p>
                            </div>
                            <div>
                              <p className="text-xs text-[#94A3B8]">نسبة النشطين</p>
                              <p className={`text-xl font-bold ${sup.activeRate >= 85 ? 'text-emerald-400' : sup.activeRate >= 75 ? 'text-amber-400' : 'text-red-400'}`}>
                                {sup.activeRate}%
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-[#94A3B8]">نسبة الغياب</p>
                              <p className={`text-xl font-bold ${sup.absentRate <= 10 ? 'text-emerald-400' : sup.absentRate <= 20 ? 'text-amber-400' : 'text-red-400'}`}>
                                {sup.absentRate}%
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Section>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
