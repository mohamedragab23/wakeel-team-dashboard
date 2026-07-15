'use client';

import { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import { authFetch } from '@/lib/authFetch';
import { usePageNotify } from '@/lib/usePageNotify';

type MissingDataRider = {
  code: string;
  name: string;
  issues: string[];
  supervisorCode?: string;
  supervisorName?: string;
  region?: string;
  joinDate?: string;
  status?: string;
};

type Summary = {
  totalRiders: number;
  ridersWithIssues: number;
  completenessPercent: number;
  issueBreakdown: {
    missingSupervisor: number;
    missingRegion: number;
    missingJoinDate: number;
    missingName: number;
  };
};

export default function MissingDataAuditPage() {
  const notify = usePageNotify();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [riders, setRiders] = useState<MissingDataRider[]>([]);
  const [filterIssue, setFilterIssue] = useState<string>('all');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const response = await authFetch('/api/admin/missing-data-audit');
      if (!response.ok) throw new Error('Failed to load data');
      const data = await response.json();
      setSummary(data.summary);
      setRiders(data.riders);
    } catch (error) {
      console.error('Error loading data:', error);
      notify.error('فشل تحميل البيانات');
    } finally {
      setLoading(false);
    }
  };

  const filteredRiders =
    filterIssue === 'all'
      ? riders
      : riders.filter((r) => r.issues.includes(filterIssue));

  const getCompletionColor = (percent: number) => {
    if (percent >= 90) return 'text-emerald-300';
    if (percent >= 70) return 'text-amber-300';
    return 'text-red-300';
  };

  const getCompletionBg = (percent: number) => {
    if (percent >= 90) return 'border-emerald-500/30 bg-emerald-500/5';
    if (percent >= 70) return 'border-amber-500/30 bg-amber-500/5';
    return 'border-red-500/30 bg-red-500/5';
  };

  if (loading) {
    return (
      <Layout>
        <div className="min-h-screen bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#0f172a] flex items-center justify-center">
          <p className="text-[#EAF0FF] text-xl">⏳ جاري التحميل...</p>
        </div>
      </Layout>
    );
  }

  if (!summary) {
    return (
      <Layout>
        <div className="min-h-screen bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#0f172a] flex items-center justify-center">
          <p className="text-red-300 text-xl">❌ فشل تحميل البيانات</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#0f172a] p-6">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-[#EAF0FF] mb-2">
              📋 تدقيق البيانات الناقصة
            </h1>
            <p className="text-[#94A3B8]">
              المناديب الذين لديهم بيانات ناقصة (مشرف، منطقة، تاريخ انضمام)
            </p>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="rounded-xl border border-white/10 bg-[rgba(255,255,255,0.04)] p-4">
              <p className="text-xs text-[#94A3B8] mb-1">إجمالي المناديب</p>
              <p className="text-3xl font-bold text-[#EAF0FF]">{summary.totalRiders}</p>
            </div>
            <div className={`rounded-xl border p-4 ${getCompletionBg(summary.completenessPercent)}`}>
              <p className="text-xs text-[#94A3B8] mb-1">نسبة اكتمال البيانات</p>
              <p className={`text-3xl font-bold ${getCompletionColor(summary.completenessPercent)}`}>
                {summary.completenessPercent}%
              </p>
              <p className="text-xs text-[#64748B] mt-1">
                {summary.totalRiders - summary.ridersWithIssues} / {summary.totalRiders} كاملة
              </p>
            </div>
            <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
              <p className="text-xs text-[#94A3B8] mb-1">مناديب بها مشاكل</p>
              <p className="text-3xl font-bold text-red-300">{summary.ridersWithIssues}</p>
            </div>
            <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-4">
              <p className="text-xs text-[#94A3B8] mb-1">الحالة</p>
              <p className="text-lg font-semibold text-cyan-300">
                {summary.completenessPercent >= 90
                  ? '✅ ممتاز'
                  : summary.completenessPercent >= 70
                    ? '⚠️ يحتاج تحسين'
                    : '🔴 حرج'}
              </p>
            </div>
          </div>

          {/* Issue Breakdown */}
          <div className="rounded-2xl border border-white/10 bg-[rgba(255,255,255,0.04)] p-6 mb-8">
            <h2 className="text-xl font-semibold text-[#EAF0FF] mb-4">توزيع المشاكل</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="rounded-lg border border-white/10 bg-[#1e293b] p-4">
                <p className="text-sm text-[#94A3B8] mb-2">بدون مشرف</p>
                <p className="text-2xl font-bold text-red-300">
                  {summary.issueBreakdown.missingSupervisor}
                </p>
              </div>
              <div className="rounded-lg border border-white/10 bg-[#1e293b] p-4">
                <p className="text-sm text-[#94A3B8] mb-2">بدون منطقة</p>
                <p className="text-2xl font-bold text-amber-300">
                  {summary.issueBreakdown.missingRegion}
                </p>
              </div>
              <div className="rounded-lg border border-white/10 bg-[#1e293b] p-4">
                <p className="text-sm text-[#94A3B8] mb-2">بدون تاريخ انضمام</p>
                <p className="text-2xl font-bold text-yellow-300">
                  {summary.issueBreakdown.missingJoinDate}
                </p>
              </div>
              <div className="rounded-lg border border-white/10 bg-[#1e293b] p-4">
                <p className="text-sm text-[#94A3B8] mb-2">بدون اسم</p>
                <p className="text-2xl font-bold text-orange-300">
                  {summary.issueBreakdown.missingName}
                </p>
              </div>
            </div>
          </div>

          {/* Filter */}
          <div className="rounded-xl border border-white/10 bg-[rgba(255,255,255,0.04)] p-4 mb-6">
            <label className="block text-sm font-medium text-[#94A3B8] mb-2">
              فلترة حسب المشكلة
            </label>
            <select
              value={filterIssue}
              onChange={(e) => setFilterIssue(e.target.value)}
              className="w-full md:w-1/2 px-4 py-2 rounded-lg bg-[#1e293b] border border-white/10 text-[#EAF0FF] focus:outline-none focus:border-cyan-500"
            >
              <option value="all">جميع المشاكل ({riders.length})</option>
              <option value="لا يوجد مشرف مسجل">
                بدون مشرف ({summary.issueBreakdown.missingSupervisor})
              </option>
              <option value="لا توجد منطقة محددة">
                بدون منطقة ({summary.issueBreakdown.missingRegion})
              </option>
              <option value="لا يوجد تاريخ انضمام">
                بدون تاريخ انضمام ({summary.issueBreakdown.missingJoinDate})
              </option>
              <option value="لا يوجد اسم">
                بدون اسم ({summary.issueBreakdown.missingName})
              </option>
            </select>
          </div>

          {/* Riders List */}
          <div className="rounded-2xl border border-white/10 bg-[rgba(255,255,255,0.04)] p-6">
            <h2 className="text-xl font-semibold text-[#EAF0FF] mb-4">
              المناديب ({filteredRiders.length})
            </h2>

            {filteredRiders.length === 0 ? (
              <p className="text-center text-[#94A3B8] py-8">
                ✅ لا توجد مشاكل في هذه الفئة
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-right p-3 text-[#94A3B8] font-medium">الكود</th>
                      <th className="text-right p-3 text-[#94A3B8] font-medium">الاسم</th>
                      <th className="text-right p-3 text-[#94A3B8] font-medium">المشرف</th>
                      <th className="text-right p-3 text-[#94A3B8] font-medium">المنطقة</th>
                      <th className="text-right p-3 text-[#94A3B8] font-medium">تاريخ الانضمام</th>
                      <th className="text-right p-3 text-[#94A3B8] font-medium">المشاكل</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRiders.map((rider) => (
                      <tr key={rider.code} className="border-b border-white/5 hover:bg-white/5">
                        <td className="p-3 text-[#EAF0FF]">{rider.code}</td>
                        <td className="p-3 text-[#EAF0FF]">
                          {rider.name || <span className="text-red-300">غير محدد</span>}
                        </td>
                        <td className="p-3 text-[#94A3B8]">
                          {rider.supervisorName || <span className="text-red-300">-</span>}
                          {rider.supervisorCode && (
                            <span className="text-xs text-[#64748B] block">
                              ({rider.supervisorCode})
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-[#94A3B8]">
                          {rider.region || <span className="text-amber-300">-</span>}
                        </td>
                        <td className="p-3 text-[#94A3B8]">
                          {rider.joinDate || <span className="text-yellow-300">-</span>}
                        </td>
                        <td className="p-3">
                          <div className="space-y-1">
                            {rider.issues.map((issue, idx) => (
                              <span
                                key={idx}
                                className="inline-block px-2 py-0.5 rounded text-xs bg-red-500/20 text-red-300 border border-red-500/30 mr-1"
                              >
                                {issue}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Instructions */}
          <div className="mt-6 rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-4">
            <h3 className="text-lg font-semibold text-cyan-300 mb-2">
              🔧 كيفية تصحيح البيانات الناقصة
            </h3>
            <ol className="space-y-2 text-sm text-[#94A3B8] list-decimal list-inside">
              <li>
                <strong>بدون مشرف:</strong> افتح صفحة "إدارة المناديب" وأضف مشرف لكل مندوب
              </li>
              <li>
                <strong>بدون منطقة:</strong> حدد المنطقة لكل مندوب من نفس الصفحة
              </li>
              <li>
                <strong>بدون تاريخ انضمام:</strong> أضف تاريخ الانضمام في ملف "المناديب" أو من لوحة التحكم
              </li>
              <li>
                <strong>بدون اسم:</strong> أضف اسم المندوب في ملف "المناديب"
              </li>
              <li>
                بعد التصحيح، قم بتحديث الصفحة لرؤية التحسن في نسبة الاكتمال
              </li>
            </ol>
          </div>

          {/* Impact Warning */}
          {summary.completenessPercent < 80 && (
            <div className="mt-6 rounded-xl border border-red-500/30 bg-red-500/5 p-4">
              <h3 className="text-lg font-semibold text-red-300 mb-2">
                ⚠️ تحذير: نسبة الاكتمال أقل من 80%
              </h3>
              <ul className="space-y-2 text-sm text-[#94A3B8] list-disc list-inside">
                <li>التقارير في "مركز العمليات الاستراتيجي" قد لا تكون دقيقة</li>
                <li>بعض التحليلات الاستراتيجية معطلة حتى تتحسن جودة البيانات</li>
                <li>يُنصح بإكمال البيانات الناقصة في أقرب وقت ممكن</li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
