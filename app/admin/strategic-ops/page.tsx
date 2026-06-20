'use client';

import { useMemo, useState, type ReactNode } from 'react';
import Layout from '@/components/Layout';
import { useQuery } from '@tanstack/react-query';
import { usePageNotify } from '@/lib/usePageNotify';
import { ZONE_OPTIONS } from '@/lib/zones';
import { STRATEGIC_OPS_LABELS as L } from '@/lib/strategicOps/labelsAr';
import type { StrategicOpsReport } from '@/lib/strategicOps/buildReport';
import {
  exportStrategicOpsExcel,
  exportStrategicOpsPdf,
  copyStrategicOpsText,
} from '@/lib/strategicOps/clientExport';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const BUCKET_COLORS = ['#64748b', '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#8b5cf6'];

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
      <p className="text-xs text-[#94A3B8] mb-1">{label}</p>
      <p className="text-2xl font-bold text-[#EAF0FF]">{value}</p>
      {sub && <p className="text-xs text-[#64748B] mt-1">{sub}</p>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-[rgba(255,255,255,0.04)] p-5 space-y-4">
      <h2 className="text-lg font-semibold text-[#EAF0FF] border-b border-white/10 pb-2">{title}</h2>
      {children}
    </section>
  );
}

function RiskBadge({ level }: { level: 'green' | 'yellow' | 'red' }) {
  const colors = {
    green: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    yellow: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    red: 'bg-red-500/20 text-red-300 border-red-500/40',
  };
  const labels = { green: 'منخفض', yellow: 'متوسط', red: 'مرتفع' };
  return <span className={`px-2 py-0.5 rounded-full text-xs border ${colors[level]}`}>{labels[level]}</span>;
}

function HealthBadge({ score, label }: { score: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm border border-cyan-500/40 bg-cyan-500/15 text-cyan-200">
      <span className="font-bold">{score}/100</span>
      <span>{label}</span>
    </span>
  );
}

function MiniTable({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-[#CBD5E1]">
        <thead>
          <tr className="border-b border-white/10">
            {headers.map((h) => (
              <th key={h} className="text-right py-2 px-2 font-medium text-[#94A3B8] whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-white/5 hover:bg-white/5">
              {row.map((cell, j) => (
                <td key={j} className="py-2 px-2 text-right">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function StrategicOpsCenterPage() {
  const notify = usePageNotify();
  const today = new Date().toISOString().split('T')[0];
  const monthAgo = new Date();
  monthAgo.setDate(monthAgo.getDate() - 30);
  const defaultStart = monthAgo.toISOString().split('T')[0];

  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(today);
  const [zone, setZone] = useState('all');
  const [supervisorCode, setSupervisorCode] = useState('all');
  const [requestFilters, setRequestFilters] = useState<{
    startDate: string;
    endDate: string;
    zone: string;
    supervisorCode: string;
  } | null>(null);

  const { data: supervisorsList } = useQuery({
    queryKey: ['admin', 'supervisors-list'],
    queryFn: async () => {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/admin/supervisors', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!json.success) return [];
      return (json.data ?? []) as Array<{ code: string; name: string; region: string }>;
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: report, isLoading, isFetching, error } = useQuery({
    queryKey: ['admin', 'strategic-ops', requestFilters?.startDate, requestFilters?.endDate, requestFilters?.zone, requestFilters?.supervisorCode],
    queryFn: async () => {
      const token = localStorage.getItem('token');
      const q = new URLSearchParams({
        startDate: requestFilters!.startDate,
        endDate: requestFilters!.endDate,
        zone: requestFilters!.zone,
        supervisorCode: requestFilters!.supervisorCode,
      });
      const res = await fetch(`/api/admin/strategic-ops?${q}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'فشل تحميل التقرير');
      return json.data as StrategicOpsReport;
    },
    enabled: !!requestFilters,
    staleTime: 2 * 60 * 1000,
  });

  const supervisorsFiltered = useMemo(() => {
    if (!supervisorsList) return [];
    if (zone === 'all') return supervisorsList;
    return supervisorsList.filter((s) =>
      String(s.region ?? '').split(/[|,]/).map((z) => z.trim()).includes(zone)
    );
  }, [supervisorsList, zone]);

  const runAnalysis = () => {
    if (!startDate || !endDate) {
      notify.error('يرجى اختيار نطاق التاريخ');
      return;
    }
    if (new Date(startDate) > new Date(endDate)) {
      notify.error('تاريخ البداية يجب أن يكون قبل النهاية');
      return;
    }
    setRequestFilters({ startDate, endDate, zone, supervisorCode });
  };

  const loading = isLoading || isFetching;

  const handleCopy = async () => {
    if (!report) return;
    try {
      await copyStrategicOpsText(report);
      notify.success('تم نسخ التحليل الكامل للحافظة');
    } catch {
      notify.error('فشل النسخ — تحقق من صلاحيات الحافظة');
    }
  };

  return (
    <Layout>
      <div className="space-y-6 min-w-0 pb-12" dir="rtl">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold text-[#EAF0FF]">{L.pageTitle}</h1>
          <p className="text-sm text-[#94A3B8]">{L.pageSubtitle}</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="text-xs text-[#94A3B8] block mb-1">{L.startDate}</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-[#EAF0FF] text-sm" />
          </div>
          <div>
            <label className="text-xs text-[#94A3B8] block mb-1">{L.endDate}</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-[#EAF0FF] text-sm" />
          </div>
          <div>
            <label className="text-xs text-[#94A3B8] block mb-1">{L.zone}</label>
            <select value={zone} onChange={(e) => { setZone(e.target.value); setSupervisorCode('all'); }} className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-[#EAF0FF] text-sm">
              <option value="all">{L.allZones}</option>
              {ZONE_OPTIONS.map((z) => <option key={z} value={z}>{z}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-[#94A3B8] block mb-1">{L.supervisor}</label>
            <select value={supervisorCode} onChange={(e) => setSupervisorCode(e.target.value)} className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-[#EAF0FF] text-sm">
              <option value="all">{L.allSupervisors}</option>
              {supervisorsFiltered.map((s) => <option key={s.code} value={s.code}>{s.name} ({s.code})</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <button type="button" onClick={runAnalysis} disabled={loading} className="w-full rounded-lg bg-cyan-500/80 hover:bg-cyan-500 text-black font-semibold py-2.5 text-sm disabled:opacity-50">
              {loading ? L.analyzing : L.runAnalysis}
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-300 text-sm">{(error as Error).message}</div>
        )}

        {!requestFilters && !loading && (
          <div className="text-center py-16 text-[#64748B]">{L.selectFilters}</div>
        )}

        {report && (
          <>
            {/* درجة صحة التشغيل */}
            <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 p-5 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm text-[#94A3B8]">{L.operationalHealth}</p>
                <p className="text-4xl font-bold text-[#EAF0FF] mt-1">{report.operationalHealth.score}<span className="text-lg text-[#64748B]">/100</span></p>
              </div>
              <div className="text-right">
                <HealthBadge score={report.operationalHealth.score} label={report.operationalHealth.levelLabelAr} />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => exportStrategicOpsExcel(report)} className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm text-[#EAF0FF] hover:bg-white/10">{L.exportExcel}</button>
              <button type="button" onClick={() => exportStrategicOpsPdf(report)} className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm text-[#EAF0FF] hover:bg-white/10">{L.exportPdf}</button>
              <button type="button" onClick={handleCopy} className="rounded-lg border border-purple-500/40 bg-purple-500/15 px-4 py-2 text-sm text-purple-200 hover:bg-purple-500/25">{L.copyChatGpt}</button>
            </div>

            <Section title={L.executiveSummary}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard label={L.totalRegistered} value={report.executiveSummary.totalRegisteredRiders} />
                <StatCard label={L.totalAssigned} value={report.executiveSummary.totalAssignedToSupervisors} />
                <StatCard label={L.activeRiders} value={report.executiveSummary.activeRiders} sub={`${report.executiveSummary.activePercent}%`} />
                <StatCard label={L.inactiveRiders} value={report.executiveSummary.inactiveRiders} sub={`${report.executiveSummary.inactivePercent}%`} />
                <StatCard label={L.suspendedRiders} value={report.executiveSummary.suspendedRiders} sub={`${report.executiveSummary.suspensionPercent}%`} />
                <StatCard label={L.approvedResignations} value={report.executiveSummary.approvedResignations} />
                <StatCard label={L.newJoins} value={report.executiveSummary.newRidersJoined} />
                <StatCard label={L.utilizationRate} value={`${report.executiveSummary.utilizationRate}%`} />
                <StatCard label={L.attritionRate} value={`${report.executiveSummary.attritionRate}%`} />
                <StatCard label={L.monthlyAttrition} value={`${report.executiveSummary.monthlyAttritionRate}%`} />
              </div>
              <p className="text-xs text-[#64748B]">الطيارون غير النشطين = بدون نشاط (ساعات ٠ وطلبات ٠) — نفس قيمة «بدون نشاط»</p>
            </Section>

            <Section title={L.activityDistribution}>
              <div className="grid lg:grid-cols-2 gap-6">
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={report.activityDistribution.buckets}>
                      <CartesianGrid stroke="rgba(255,255,255,0.08)" />
                      <XAxis dataKey="label" tick={{ fill: '#94A3B8', fontSize: 10 }} angle={-15} textAnchor="end" height={70} />
                      <YAxis tick={{ fill: '#94A3B8', fontSize: 11 }} />
                      <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8 }} />
                      <Bar dataKey="count" name="عدد الطيارين" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={report.activityDistribution.buckets.filter((b) => b.count > 0)} dataKey="hoursContribution" nameKey="label" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}>
                        {report.activityDistribution.buckets.map((_, i) => <Cell key={i} fill={BUCKET_COLORS[i % BUCKET_COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155' }} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <p className="text-xs text-[#64748B] mb-2">
                أساس التصنيف: {report.activityDistribution.classificationFormula} — {report.activityDistribution.periodDays} يوم
              </p>
              <MiniTable headers={['الفئة', 'العدد', 'النسبة', 'مساهمة الساعات']} rows={report.activityDistribution.buckets.map((b) => [b.label, b.count, `${b.percent}%`, b.hoursContribution])} />
            </Section>

            <Section title={L.utilization}>
              <div className="grid sm:grid-cols-3 gap-3 mb-4">
                <StatCard label={L.totalRegistered} value={report.utilization.totalRegisteredRiders} />
                <StatCard label={L.activeRiders} value={report.utilization.activeRiders} />
                <StatCard label={L.utilizationRate} value={`${report.utilization.utilizationRate}%`} sub="النشطون ÷ المسجلون" />
              </div>
              <div className="grid lg:grid-cols-2 gap-4">
                <div>
                  <h3 className="text-sm font-medium text-[#94A3B8] mb-2">أعلى ٢٠ طياراً بالساعات</h3>
                  <MiniTable headers={['الاسم', 'الكود', 'الساعات', 'الطلبات']} rows={report.utilization.top20ByHours.map((r) => [r.name, r.code, r.hours, r.orders])} />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-[#94A3B8] mb-2">أدنى ٢٠ طياراً بالساعات</h3>
                  <MiniTable headers={['الاسم', 'الكود', 'الساعات', 'متوسط يومي']} rows={report.utilization.bottom20ByHours.map((r) => [r.name, r.code, r.hours, r.avgDailyHours])} />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-[#94A3B8] mb-2">الأكثر انتظاماً</h3>
                  <MiniTable headers={['الاسم', 'الدرجة', 'أيام عمل', 'الساعات']} rows={report.utilization.mostConsistent.slice(0, 10).map((r) => [r.name, r.consistencyScore ?? 0, r.workDays, r.hours])} />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-[#94A3B8] mb-2">الأكثر تحسناً / تراجعاً</h3>
                  <MiniTable headers={['الاسم', 'التغير', 'الساعات']} rows={[
                    ...report.utilization.mostImproved.slice(0, 5).map((r) => [r.name, `+${r.trendDelta ?? 0}`, r.hours]),
                    ...report.utilization.declining.slice(0, 5).map((r) => [r.name, String(r.trendDelta ?? 0), r.hours]),
                  ]} />
                </div>
              </div>
            </Section>

            <Section title={L.hoursAnalysis}>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <StatCard label="إجمالي الساعات" value={report.hoursAnalysis.totalHours} />
                <StatCard label="متوسط الساعات اليومية" value={report.hoursAnalysis.averageDailyHours} />
                <StatCard label="أعلى يوم" value={report.hoursAnalysis.highestDay?.hours ?? 0} sub={report.hoursAnalysis.highestDay?.date} />
                <StatCard label="أدنى يوم" value={report.hoursAnalysis.lowestDay?.hours ?? 0} sub={report.hoursAnalysis.lowestDay?.date} />
                <StatCard label="متوسط الساعات/طيار" value={report.hoursAnalysis.averageHoursPerRider} />
                <StatCard label="متوسط الساعات/طيار نشط" value={report.hoursAnalysis.averageHoursPerActiveRider} />
              </div>
              <div className="h-64 mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={report.hoursAnalysis.trend}>
                    <CartesianGrid stroke="rgba(255,255,255,0.08)" />
                    <XAxis dataKey="date" tick={{ fill: '#94A3B8', fontSize: 10 }} />
                    <YAxis tick={{ fill: '#94A3B8', fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155' }} />
                    <Legend />
                    <Line type="monotone" dataKey="hours" name="الساعات" stroke="#06b6d4" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="orders" name="الطلبات" stroke="#a855f7" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="grid lg:grid-cols-2 gap-4">
                <div>
                  <h3 className="text-sm text-[#94A3B8] mb-2">أفضل ١٠ أيام</h3>
                  <MiniTable headers={['التاريخ', 'الساعات']} rows={report.hoursAnalysis.top10Days.map((d) => [d.date, d.hours])} />
                </div>
                <div>
                  <h3 className="text-sm text-[#94A3B8] mb-2">أسوأ ١٠ أيام</h3>
                  <MiniTable headers={['التاريخ', 'الساعات']} rows={report.hoursAnalysis.worst10Days.map((d) => [d.date, d.hours])} />
                </div>
              </div>
            </Section>

            <Section title={L.lostHours}>
              <div className="grid sm:grid-cols-4 gap-3">
                <StatCard label="الساعات المحتملة" value={report.lostHours.potentialHours} sub="طيار × ١٠س × أيام" />
                <StatCard label="الساعات الفعلية" value={report.lostHours.actualHours} />
                <StatCard label="الساعات المهدرة" value={report.lostHours.lostHours} sub={`${report.lostHours.lostPercent}%`} />
              </div>
              <div className="h-56 mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={report.lostHours.breakdown} layout="vertical">
                    <CartesianGrid stroke="rgba(255,255,255,0.08)" />
                    <XAxis type="number" tick={{ fill: '#94A3B8' }} />
                    <YAxis type="category" dataKey="category" width={200} tick={{ fill: '#94A3B8', fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155' }} />
                    <Bar dataKey="hours" name="ساعات مهدرة" fill="#ef4444" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <MiniTable headers={['الفئة', 'الساعات المهدرة', 'النسبة', 'العدد']} rows={report.lostHours.breakdown.map((b) => [b.category, b.hours, `${b.percent}%`, b.riderCount])} />
            </Section>

            <Section title={L.supervisorPerformance}>
              {report.supervisorPerformance.bestSupervisor && (
                <p className="text-sm text-emerald-300">الأفضل: {report.supervisorPerformance.bestSupervisor.name} (إنتاجية {report.supervisorPerformance.bestSupervisor.productivityScore})</p>
              )}
              {report.supervisorPerformance.worstSupervisor && (
                <p className="text-sm text-red-300">الأضعف: {report.supervisorPerformance.worstSupervisor.name} (إنتاجية {report.supervisorPerformance.worstSupervisor.productivityScore})</p>
              )}
              <MiniTable
                headers={['المشرف', 'معيّنون', 'نشطون', 'غير نشطين', 'ساعات', 'متوسط س/ط', 'طلبات', 'حضور%', 'هدف%', 'درجة', 'إقالات']}
                rows={report.supervisorPerformance.rows.map((s) => [
                  s.name, s.assignedRiders, s.activeRiders, s.inactiveRiders, s.totalHours, s.avgHoursPerRider, s.avgOrders,
                  `${s.attendancePercent}%`, `${s.targetAchievementPercent}%`, s.productivityScore, s.resignations,
                ])}
              />
            </Section>

            <Section title={L.supervisorRisk}>
              <MiniTable headers={['المشرف', 'درجة المخاطر', 'المستوى', 'العوامل']} rows={report.supervisorRisk.rows.map((s) => [
                s.name, s.riskScore, <RiskBadge key={s.code} level={s.riskLevel} />, s.factors.join('؛ ') || '—',
              ])} />
            </Section>

            <Section title={L.recruitment}>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <StatCard label="إجمالي الطلبات" value={report.recruitment.totalApplications} />
                <StatCard label="المقبولون" value={report.recruitment.totalAccepted} />
                <StatCard label="المنضمون" value={report.recruitment.totalJoined} />
                <StatCard label="نشطون بعد الانضمام" value={report.recruitment.totalActiveAfterJoining} />
                <StatCard label="طلب→انضمام" value={`${report.recruitment.applicationToJoinRate}%`} />
                <StatCard label="كفاءة التعيين" value={`${report.recruitment.recruitmentEfficiencyPercent}%`} />
              </div>
              <h3 className="text-sm text-[#94A3B8] mt-4">ترتيب مسؤولي التعيين</h3>
              <MiniTable headers={['المسؤول', 'طلبات', 'مقبول', 'منضم', 'نشط', 'كفاءة%']} rows={report.recruitment.recruiterRanking.slice(0, 15).map((r) => [
                r.recruiter, r.applications, r.accepted, r.joined, r.activeAfterJoining, r.efficiencyPercent,
              ])} />
            </Section>

            <Section title={L.attrition}>
              <div className="grid sm:grid-cols-4 gap-3">
                <StatCard label="عدد الإقالات" value={report.attrition.approvedResignations} />
                <StatCard label="نسبة التسرب" value={`${report.attrition.attritionRate}%`} />
                <StatCard label="متوسط التسرب الشهري" value={`${report.attrition.monthlyAttritionRate}%`} />
                <StatCard label="متوسط عمر الطيار (يوم)" value={report.attrition.averageRiderLifetimeDays} />
              </div>
              <p className="text-xs text-[#64748B]">متوسط الطيارين النشطين يومياً: {report.attrition.averageActiveRidersDuringPeriod}</p>
              <h3 className="text-sm text-[#94A3B8] mt-4">أكثر المشرفين فقداناً للطيارين</h3>
              <MiniTable headers={['المشرف', 'إقالات']} rows={report.attrition.topSupervisorsLosingRiders.map((s) => [s.name, s.count])} />
              {report.attrition.attritionTrend.length > 0 && (
                <div className="h-48 mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={report.attrition.attritionTrend}>
                      <CartesianGrid stroke="rgba(255,255,255,0.08)" />
                      <XAxis dataKey="period" tick={{ fill: '#94A3B8', fontSize: 10 }} />
                      <YAxis tick={{ fill: '#94A3B8' }} />
                      <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155' }} />
                      <Bar dataKey="resignations" fill="#f97316" name="إقالات" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Section>

            <Section title={L.growthOpportunities}>
              <div className="grid sm:grid-cols-2 gap-4">
                {report.growthOpportunities.scenarios.map((sc) => (
                  <div key={sc.key} className="rounded-xl border border-white/10 p-4 bg-white/5">
                    <p className="font-medium text-[#EAF0FF]">{sc.label}</p>
                    <p className="text-cyan-400 text-lg font-bold mt-1">+{sc.additionalHoursGain} ساعة</p>
                    <p className="text-xs text-[#94A3B8]">إجمالي متوقع: {sc.expectedTotalHours}س · {sc.affectedRiders} طيار</p>
                  </div>
                ))}
              </div>
            </Section>

            <Section title={L.growthExpansion}>
              <div className="grid sm:grid-cols-2 gap-3 mb-4">
                <StatCard
                  label="هدف الساعات اليومية"
                  value={report.growthExpansion.dailyTargetHours}
                  sub="ساعة/يوم"
                />
                <StatCard
                  label="متوسط الساعات اليومية الحالي"
                  value={report.growthExpansion.currentAverageDailyHours}
                  sub="ساعة/يوم"
                />
              </div>
              <div className="space-y-3">
                {report.growthExpansion.indicators.map((ind) => (
                  <div
                    key={ind.key}
                    className="rounded-xl border border-white/10 bg-white/5 p-4 grid gap-2 lg:grid-cols-[1fr_auto] lg:items-start"
                  >
                    <div className="space-y-1">
                      <p className="font-medium text-[#EAF0FF]">{ind.labelAr}</p>
                      <p className="text-xs text-cyan-400/90 font-mono" dir="ltr">
                        {ind.formula}
                      </p>
                      <p className="text-sm text-[#94A3B8]">{ind.calculation}</p>
                    </div>
                    <div className="text-left lg:text-left shrink-0">
                      <p className="text-2xl font-bold text-cyan-300">{ind.displayValue}</p>
                      {ind.unit !== '%' && ind.unit !== 'طيار' && ind.unit !== 'ساعة' && ind.unit !== 'طلب' && (
                        <p className="text-xs text-[#64748B]">{ind.unit}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            <Section title={L.hoursRoadmap}>
              <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <StatCard label="المتوسط اليومي الحالي" value={report.hoursRoadmap.currentDailyHours} sub="ساعة/يوم" />
                <StatCard label="الهدف اليومي" value={report.hoursRoadmap.targetDailyHours} sub="ساعة/يوم" />
                <StatCard label="الفجوة اليومية" value={report.hoursRoadmap.dailyGap} sub="ساعة/يوم" />
                <StatCard label="إجمالي الفترة (مرجع)" value={report.hoursRoadmap.currentPeriodHours} sub={`${report.hoursRoadmap.periodDays} يوم`} />
                <StatCard label="طيارون إضافيون" value={report.hoursRoadmap.additionalActiveRidersNeeded} sub={`+${report.hoursRoadmap.additionalHoursPerRiderNeeded}س/طيار/يوم`} />
              </div>
              <ul className="list-disc list-inside text-sm text-[#CBD5E1] space-y-1 mt-3">
                {report.hoursRoadmap.roadmap.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </Section>

            <Section title={L.formulaAudit}>
              <p className="text-sm text-amber-300/90 mb-4">{report.operationalFormulaAudit.daily2200Roadmap.warning}</p>

              <h3 className="text-sm font-semibold text-[#94A3B8] mb-2">جدول التحقق من المؤشرات</h3>
              <MiniTable
                headers={['المؤشر', 'الصيغة', 'البيانات الخام', 'النتيجة', 'الحالة']}
                rows={report.operationalFormulaAudit.validationTable.map((row) => [
                  row.kpi,
                  row.formula,
                  row.rawData,
                  row.result,
                  <span key={row.kpi} className={row.status === 'valid' ? 'text-emerald-400' : 'text-amber-400'}>
                    {row.status === 'valid' ? 'صالح' : `تحذير${row.statusReason ? `: ${row.statusReason}` : ''}`}
                  </span>,
                ])}
              />

              <div className="grid lg:grid-cols-2 gap-4 mt-6">
                <AuditCard title="نسبة التسرب — تدقيق تفصيلي">
                  <p className="text-cyan-400/90 text-xs font-mono">{report.operationalFormulaAudit.attrition.formula}</p>
                  <p>البسط: {report.operationalFormulaAudit.attrition.numerator} ({report.operationalFormulaAudit.attrition.numeratorLabel})</p>
                  <p>المقام: {report.operationalFormulaAudit.attrition.denominator} ({report.operationalFormulaAudit.attrition.denominatorLabel})</p>
                  <p className="font-medium text-[#EAF0FF]">{report.operationalFormulaAudit.attrition.calculation}</p>
                  <p className="text-sm text-[#94A3B8] mt-2">{report.operationalFormulaAudit.attrition.explanation}</p>
                  <p className="text-xs text-[#64748B]">{report.operationalFormulaAudit.attrition.dailyActiveCountsSample}</p>
                </AuditCard>

                <AuditCard title="متوسط عمر الطيار">
                  <p className="text-cyan-400/90 text-xs font-mono">{report.operationalFormulaAudit.riderLifetime.formula}</p>
                  <p>انضمام: {report.operationalFormulaAudit.riderLifetime.joinDateColumn}</p>
                  <p>موافقة: {report.operationalFormulaAudit.riderLifetime.approvalDateColumns}</p>
                  <p>{report.operationalFormulaAudit.riderLifetime.calculation}</p>
                  <p className="font-medium">النتيجة: {report.operationalFormulaAudit.riderLifetime.resultDays} يوم</p>
                </AuditCard>

                <AuditCard title="خارطة 2200 ساعة يومياً">
                  <p className="text-cyan-400/90 text-xs font-mono">{report.operationalFormulaAudit.daily2200Roadmap.formula}</p>
                  <p>{report.operationalFormulaAudit.daily2200Roadmap.calculation}</p>
                  <p>{report.operationalFormulaAudit.daily2200Roadmap.additionalRidersFormula}</p>
                  <p className="font-medium">{report.operationalFormulaAudit.daily2200Roadmap.additionalRidersCalculation}</p>
                </AuditCard>

                <AuditCard title="توزيع الساعات">
                  <p className="font-medium text-emerald-300">{report.operationalFormulaAudit.hoursDistribution.basisLabelAr}</p>
                  <p className="text-cyan-400/90 text-xs font-mono">{report.operationalFormulaAudit.hoursDistribution.formula}</p>
                  <p>{report.operationalFormulaAudit.hoursDistribution.classificationLogic}</p>
                  <p className="text-sm text-[#94A3B8]">{report.operationalFormulaAudit.hoursDistribution.example}</p>
                </AuditCard>
              </div>

              <h3 className="text-sm font-semibold text-[#94A3B8] mt-6 mb-2">الإقالات المعتمدة — سجلات مُحتسبة</h3>
              <p className="text-xs text-[#64748B] mb-2">
                صفوف خام: {report.operationalFormulaAudit.approvedResignations.rawRowsMatched} |
                بعد إزالة التكرار: {report.operationalFormulaAudit.approvedResignations.afterDedupe} |
                تكرارات محذوفة: {report.operationalFormulaAudit.approvedResignations.duplicatesRemoved}
              </p>
              <MiniTable
                headers={['صف الشيت', 'كود الطيار', 'الاسم', 'المشرف', 'الحالة', 'تاريخ الموافقة', 'مُحتسب']}
                rows={report.operationalFormulaAudit.approvedResignations.records.map((rec) => [
                  rec.sheetRow,
                  rec.riderCode,
                  rec.riderName || '—',
                  rec.supervisorCode,
                  rec.statusRaw,
                  rec.approvalDate,
                  rec.included ? 'نعم' : `لا${rec.dedupeNote ? ` (${rec.dedupeNote})` : ''}`,
                ])}
              />

              {report.operationalFormulaAudit.riderLifetime.samples.length > 0 && (
                <>
                  <h3 className="text-sm font-semibold text-[#94A3B8] mt-6 mb-2">عينة حساب عمر الطيار</h3>
                  <MiniTable
                    headers={['الكود', 'انضمام', 'موافقة', 'العمر (يوم)']}
                    rows={report.operationalFormulaAudit.riderLifetime.samples.slice(0, 20).map((s) => [
                      s.riderCode,
                      s.joinDate ?? '—',
                      s.approvalDate,
                      s.lifetimeDays > 0 ? s.lifetimeDays : '—',
                    ])}
                  />
                </>
              )}

              <h3 className="text-sm font-semibold text-[#94A3B8] mt-6 mb-2">الساعات المهدرة — صيغ مفصلة</h3>
              <div className="space-y-3">
                {report.operationalFormulaAudit.lostHours.categories.map((cat) => (
                  <div key={cat.key} className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm">
                    <p className="font-medium text-[#EAF0FF]">{cat.label}</p>
                    <p className="text-cyan-400/90 text-xs font-mono mt-1">{cat.formula}</p>
                    <p className="text-[#94A3B8]">{cat.rawData}</p>
                    <p className="text-cyan-300 font-semibold mt-1">{cat.resultHours} ساعة</p>
                  </div>
                ))}
              </div>
            </Section>

            <Section title={L.aiInsights}>
              <div className="space-y-3 text-sm text-[#CBD5E1]">
                <InsightBlock title="أكبر مشكلة تشغيلية" text={report.aiInsights.biggestProblem} />
                <InsightBlock title="سبب الساعات المهدرة" text={report.aiInsights.lostHoursCause} />
                <InsightBlock title="مشرف يحتاج تدخل" text={report.aiInsights.supervisorNeedingIntervention} />
                <InsightBlock title="طيارون غير مستغَلون" text={report.aiInsights.underutilizedRiders} />
                <InsightBlock title="تركيز هذا الأسبوع" text={report.aiInsights.focusThisWeek} />
                <InsightBlock title="تركيز هذا الشهر" text={report.aiInsights.focusThisMonth} />
                <InsightBlock title="أسرع مكاسب للساعات" text={report.aiInsights.fastestHourGains} />
              </div>
            </Section>

            <Section title={L.dataValidation}>
              <MiniTable
                headers={['المؤشر', 'الشيت', 'الأعمدة', 'السجلات', 'طريقة الحساب', 'النتيجة']}
                rows={report.dataValidation.map((d) => [d.kpi, d.sourceSheet, d.columns, d.recordsRead, d.formula, d.result])}
              />
            </Section>
          </>
        )}
      </div>
    </Layout>
  );
}

function AuditCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2 text-sm text-[#CBD5E1]">
      <h4 className="font-semibold text-[#EAF0FF]">{title}</h4>
      {children}
    </div>
  );
}

function InsightBlock({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
      <p className="text-xs font-semibold text-cyan-400 mb-1">{title}</p>
      <p className="leading-relaxed">{text}</p>
    </div>
  );
}
