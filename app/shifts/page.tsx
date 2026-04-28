'use client';

import { useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import Card from '@/components/ui-v2/Card';
import Button from '@/components/ui-v2/Button';
import Tabs, { type TabItem } from '@/components/ui-v2/Tabs';
import { v2CssVars } from '@/theme/tokens';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

type ShiftsTab = 'upload' | 'overview' | 'hours' | 'unassigned' | 'supervisors';

export default function ShiftsPage() {
  const [tab, setTab] = useState<ShiftsTab>('upload');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [pickedDates, setPickedDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [datesUsed, setDatesUsed] = useState<string[]>([]);
  const [metrics, setMetrics] = useState<{ totalEmployees?: number; booked?: number; notBooked?: number }>({});
  const [activeScope, setActiveScope] = useState<'all' | string>('all');
  const [metricsByDate, setMetricsByDate] = useState<Record<string, any>>({});
  const [supervisorFilter, setSupervisorFilter] = useState<string>('');
  const [reports, setReports] = useState<{
    pivotByDate?: Record<string, Array<{ city: string; HQ: number; assigned: number; unassigned: number; pct: number }>>;
    pivotCombined?: Array<Record<string, any>>;
    assignedRowsByDate?: Record<string, any[]>;
    unassignedRowsByDate?: Record<string, any[]>;
    supervisorOptions?: string[];
    supervisorSummaryByDate?: Record<string, any[]>;
  }>({});

  const tabs: Array<TabItem<ShiftsTab>> = [
    { value: 'upload', label: 'رفع الملفات' },
    { value: 'overview', label: 'نظرة عامة' },
    { value: 'hours', label: 'عدد ساعات الحاجزين' },
    { value: 'unassigned', label: 'غير الحاجزين' },
    { value: 'supervisors', label: 'المشرفون' },
  ];

  const pivotChartData = useMemo(() => {
    const d = activeScope !== 'all' ? activeScope : datesUsed[0];
    const rows = (d && reports.pivotByDate?.[d]) || [];
    return rows.map((r) => ({ city: r.city, pct: r.pct, assigned: r.assigned, HQ: r.HQ }));
  }, [datesUsed, reports.pivotByDate, activeScope]);

  const scopedMetrics = useMemo(() => {
    if (activeScope !== 'all' && metricsByDate?.[activeScope]) return metricsByDate[activeScope];
    return metrics;
  }, [activeScope, metricsByDate, metrics]);

  const handleAnalyze = async () => {
    if (!selectedFiles.length) {
      setMessage({ type: 'err', text: 'اختر ملفات الشفتات أولاً' });
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const token = localStorage.getItem('token');
      const fd = new FormData();
      for (const f of selectedFiles) fd.append('files', f);

      const q = new URLSearchParams();
      if (rangeStart && rangeEnd) {
        q.set('start', rangeStart);
        q.set('end', rangeEnd);
      }
      for (const d of pickedDates) q.append('dates', d);

      const res = await fetch(`/api/shifts/legacy-analyze?${q.toString()}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = await res.json();
      if (!data.success) {
        setMessage({ type: 'err', text: data.error || 'فشل التحليل' });
        return;
      }
      setAvailableDates(Array.isArray(data.availableDates) ? data.availableDates : []);
      setDatesUsed(Array.isArray(data.datesUsed) ? data.datesUsed : []);
      setMetrics(data.metrics || {});
      setMetricsByDate(typeof data.metricsByDate === 'object' && data.metricsByDate ? data.metricsByDate : {});
      setReports(data.reports || {});
      setSupervisorFilter('');
      setMessage({ type: 'ok', text: 'تم التحليل (مطابق للداشبورد القديم) — Wakeel + 3 مدن فقط + EVALUATED/PUBLISHED.' });
      const firstDay = Array.isArray(data.datesUsed) && data.datesUsed.length ? data.datesUsed[0] : 'all';
      setActiveScope(firstDay);
      setTab('overview');
    } catch (e: any) {
      setMessage({ type: 'err', text: e?.message || 'خطأ غير متوقع' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div style={v2CssVars()} className="app-theme max-w-[1400px] mx-auto px-4 py-6 space-y-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#EAF0FF]">الشفتات (Legacy)</h1>
            <p className="text-sm text-[rgba(234,240,255,0.72)] mt-1">
              المنطق مأخوذ 1:1 من <code>shift-automation-master</code>: فلترة <code>EVALUATED/PUBLISHED</code> + dedupe
              لكل (employee_id, date) + HQ من تبويب <code>all</code> بعد فلترة Wakeel + (Alexandria/Mansoura/Cairo).
            </p>
          </div>
        </div>

        <Tabs items={tabs} value={tab} onChange={setTab} className="flex flex-wrap w-full sm:w-auto" />

        {message ? (
          <div
            className={
              message.type === 'ok'
                ? 'rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-emerald-100 text-sm'
                : 'rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-red-100 text-sm'
            }
          >
            {message.text}
          </div>
        ) : null}

        {tab === 'upload' && (
          <Card className="p-5 space-y-4">
            <label className="block text-sm text-[#EAF0FF]">
              ملفات الشفتات (CSV/XLSX) — متعدد
              <input
                type="file"
                id="shifts-files"
                name="shifts-files"
                accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                multiple
                onChange={(e) => setSelectedFiles(Array.from(e.target.files || []).filter(Boolean))}
                className="mt-2 block w-full text-sm text-[rgba(234,240,255,0.85)]"
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm text-[#EAF0FF]">
                تاريخ البداية
                <input
                  type="date"
                  id="shifts-start"
                  name="shifts-start"
                  value={rangeStart}
                  onChange={(e) => setRangeStart(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[rgba(255,255,255,0.12)] bg-[rgba(0,0,0,0.25)] px-3 py-2 text-sm text-[#EAF0FF] [color-scheme:dark]"
                />
              </label>
              <label className="block text-sm text-[#EAF0FF]">
                تاريخ النهاية
                <input
                  type="date"
                  id="shifts-end"
                  name="shifts-end"
                  value={rangeEnd}
                  onChange={(e) => setRangeEnd(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[rgba(255,255,255,0.12)] bg-[rgba(0,0,0,0.25)] px-3 py-2 text-sm text-[#EAF0FF] [color-scheme:dark]"
                />
              </label>
            </div>

            {availableDates.length ? (
              <label className="block text-sm text-[#EAF0FF]">
                اختيار تواريخ محددة (اختياري — متعدد). لو اخترت هنا، سيتم تجاهل نطاق البداية/النهاية.
                <select
                  multiple
                  id="shifts-picked-dates"
                  name="shifts-picked-dates"
                  value={pickedDates}
                  onChange={(e) => setPickedDates(Array.from(e.target.selectedOptions).map((o) => o.value))}
                  className="mt-2 w-full rounded-lg border border-[rgba(255,255,255,0.12)] bg-[rgba(0,0,0,0.25)] px-3 py-2 text-sm text-[#EAF0FF] min-h-[120px]"
                >
                  {availableDates.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <Button type="button" variant="primary" onClick={handleAnalyze} disabled={loading || !selectedFiles.length}>
              {loading ? 'جاري التحليل…' : 'تحليل (Legacy)'}
            </Button>
          </Card>
        )}

        {tab === 'overview' && (
          <div className="space-y-4">
            {datesUsed.length ? (
              <Card className="p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-sm text-[#EAF0FF] font-medium">اختيار يوم العرض (مثل الداشبورد القديم)</p>
                    <p className="text-xs text-[rgba(234,240,255,0.6)] mt-1">
                      الملخص يعتمد على اليوم المختار. لو اخترت "كل الأيام" هيعرض إجمالي مُجمّع.
                    </p>
                  </div>
                  <select
                    id="shifts-scope"
                    name="shifts-scope"
                    value={activeScope}
                    onChange={(e) => setActiveScope(e.target.value)}
                    className="w-full sm:w-[260px] rounded-lg border border-[rgba(255,255,255,0.12)] bg-[rgba(0,0,0,0.25)] px-3 py-2 text-sm text-[#EAF0FF]"
                  >
                    <option value="all">كل الأيام</option>
                    {datesUsed.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              </Card>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-3">
              <Card className="p-4">
                <p className="text-xs text-[rgba(234,240,255,0.55)]">HQ (Wakeel + 3 مدن)</p>
                <p className="text-2xl font-bold text-[#EAF0FF]">{scopedMetrics.totalEmployees ?? '—'}</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-[rgba(234,240,255,0.55)]">Assigned</p>
                <p className="text-2xl font-bold text-[#EAF0FF]">{scopedMetrics.booked ?? '—'}</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-[rgba(234,240,255,0.55)]">Unassigned</p>
                <p className="text-2xl font-bold text-[#EAF0FF]">{scopedMetrics.notBooked ?? '—'}</p>
              </Card>
            </div>

            <Card className="p-4">
              <p className="text-sm text-[#EAF0FF] font-medium">التواريخ المستخدمة</p>
              <p className="text-xs text-[rgba(234,240,255,0.65)] mt-1">{datesUsed.length ? datesUsed.join(' , ') : '—'}</p>
            </Card>

            {/* Debug removed per request */}

            {pivotChartData.length ? (
              <Card className="p-4">
                <p className="text-sm text-[#EAF0FF] font-medium">مقارنة Assigned/Unassigned بين الأيام</p>
                <div className="h-[280px] mt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={datesUsed.map((d) => ({
                        date: d,
                        assigned: metricsByDate?.[d]?.booked ?? 0,
                        unassigned: metricsByDate?.[d]?.notBooked ?? 0,
                      }))}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                      <XAxis dataKey="date" stroke="rgba(234,240,255,0.6)" />
                      <YAxis stroke="rgba(234,240,255,0.6)" />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="assigned" name="Assigned" fill="rgba(0,245,255,0.7)" />
                      <Bar dataKey="unassigned" name="Unassigned" fill="rgba(255,90,0,0.65)" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            ) : null}
          </div>
        )}

        {tab === 'hours' && (
          <div className="space-y-4">
            {!datesUsed.length ? (
              <Card className="p-6 text-sm text-[rgba(234,240,255,0.72)]">حلّل ملفات الشفتات أولاً.</Card>
            ) : (
              <>
                <Card className="p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <p className="text-sm text-[#EAF0FF] font-medium">فلترة بالمشرف (Admin فقط)</p>
                    <select
                      value={supervisorFilter}
                      onChange={(e) => setSupervisorFilter(e.target.value)}
                      className="w-full sm:w-[320px] rounded-lg border border-[rgba(255,255,255,0.12)] bg-[rgba(0,0,0,0.25)] px-3 py-2 text-sm text-[#EAF0FF]"
                    >
                      <option value="">الكل</option>
                      {(reports.supervisorOptions || []).map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                </Card>

                {datesUsed.map((d) => {
                  const allRows = reports.assignedRowsByDate?.[d] || [];
                  const rows = supervisorFilter
                    ? allRows.filter((r: any) => String(r?.supervisors || '').trim() === supervisorFilter)
                    : allRows;
                  if (!rows.length) return null;
                  return (
                    <Card key={d} className="overflow-hidden">
                    <div className="px-4 py-3 border-b border-[rgba(255,255,255,0.08)] text-sm text-[#EAF0FF] font-medium">
                      الحاجزين بتاريخ {d}
                    </div>
                    <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
                      <table className="min-w-full text-sm">
                        <thead className="sticky top-0 bg-[rgba(15,18,28,0.98)]">
                          <tr className="text-[#EAF0FF]">
                            {['employee_id', 'employee_name', 'city', 'contract_name', 'supervisors', 'planned_start_time', 'planned_end_time', 'shift_hours'].map((h) => (
                              <th key={h} className="px-3 py-2 text-right border-b border-[rgba(255,255,255,0.1)] whitespace-nowrap">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((r: any, i: number) => (
                            <tr key={i} className="border-b border-[rgba(255,255,255,0.06)] hover:bg-[rgba(0,245,255,0.05)]">
                              {['employee_id', 'employee_name', 'city', 'contract_name', 'supervisors', 'planned_start_time', 'planned_end_time', 'shift_hours'].map((k) => (
                                <td key={k} className="px-3 py-2 text-[rgba(234,240,255,0.85)] whitespace-nowrap">
                                  {String(r?.[k] ?? '')}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                  );
                })}
              </>
            )}
          </div>
        )}

        {tab === 'unassigned' && (
          <div className="space-y-4">
            {!datesUsed.length ? (
              <Card className="p-6 text-sm text-[rgba(234,240,255,0.72)]">حلّل ملفات الشفتات أولاً.</Card>
            ) : (
              <>
                <Card className="p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <p className="text-sm text-[#EAF0FF] font-medium">فلترة بالمشرف (Admin فقط)</p>
                    <select
                      value={supervisorFilter}
                      onChange={(e) => setSupervisorFilter(e.target.value)}
                      className="w-full sm:w-[320px] rounded-lg border border-[rgba(255,255,255,0.12)] bg-[rgba(0,0,0,0.25)] px-3 py-2 text-sm text-[#EAF0FF]"
                    >
                      <option value="">الكل</option>
                      {(reports.supervisorOptions || []).map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                </Card>

                {datesUsed.map((d) => {
                  const allRows = reports.unassignedRowsByDate?.[d] || [];
                  const rows = supervisorFilter
                    ? allRows.filter((r: any) => String(r?.supervisors || '').trim() === supervisorFilter)
                    : allRows;
                  if (!rows.length) return null;
                  return (
                    <Card key={d} className="overflow-hidden">
                    <div className="px-4 py-3 border-b border-[rgba(255,255,255,0.08)] text-sm text-[#EAF0FF] font-medium">
                      غير الحاجزين بتاريخ {d} ({rows.length})
                    </div>
                    <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
                      <table className="min-w-full text-sm">
                        <thead className="sticky top-0 bg-[rgba(15,18,28,0.98)]">
                          <tr className="text-[#EAF0FF]">
                            {['employee_id', 'employee_name', 'contract_name', 'city', 'supervisors'].map((h) => (
                              <th key={h} className="px-3 py-2 text-right border-b border-[rgba(255,255,255,0.1)] whitespace-nowrap">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((r: any, i: number) => (
                            <tr key={i} className="border-b border-[rgba(255,255,255,0.06)] hover:bg-[rgba(0,245,255,0.05)]">
                              {['employee_id', 'employee_name', 'contract_name', 'city', 'supervisors'].map((k) => (
                                <td key={k} className="px-3 py-2 text-[rgba(234,240,255,0.85)] whitespace-nowrap">
                                  {String(r?.[k] ?? '')}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                  );
                })}
              </>
            )}
          </div>
        )}

        {tab === 'supervisors' && (
          <div className="space-y-4">
            {!datesUsed.length ? (
              <Card className="p-6 text-sm text-[rgba(234,240,255,0.72)]">حلّل ملفات الشفتات أولاً.</Card>
            ) : (
              <>
                {activeScope === 'all' ? (
                  <Card className="p-4 text-sm text-[rgba(234,240,255,0.72)]">
                    اختر يوم من “نظرة عامة” (اختيار يوم العرض) ثم ارجع هنا لعرض تبويبات المشرفين لهذا اليوم.
                  </Card>
                ) : null}

                {/* Admin summary table (per selected day) */}
                {activeScope !== 'all' && (reports.supervisorSummaryByDate?.[activeScope]?.length || 0) > 0 ? (
                  <Card className="overflow-hidden">
                    <div className="px-4 py-3 border-b border-[rgba(255,255,255,0.08)] text-sm text-[#EAF0FF] font-medium">
                      ملخص حسب المشرف — {activeScope}
                    </div>
                    <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                      <table className="min-w-full text-sm">
                        <thead className="sticky top-0 bg-[rgba(15,18,28,0.98)]">
                          <tr className="text-[#EAF0FF]">
                            {['المشرف', 'التاريخ', 'الإجمالي', 'الحاجزين', 'غير الحاجزين', 'نسبة الحاجزين', 'إجمالي ساعات الحاجزين'].map((h) => (
                              <th key={h} className="px-3 py-2 text-right border-b border-[rgba(255,255,255,0.1)] whitespace-nowrap">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(reports.supervisorSummaryByDate?.[activeScope] || []).map((r: any, i: number) => (
                            <tr key={i} className="border-b border-[rgba(255,255,255,0.06)] hover:bg-[rgba(0,245,255,0.05)]">
                              <td className="px-3 py-2 text-[rgba(234,240,255,0.9)] font-medium">{String(r.supervisor)}</td>
                              <td className="px-3 py-2 text-[rgba(234,240,255,0.85)]">{activeScope}</td>
                              <td className="px-3 py-2 text-[rgba(234,240,255,0.85)]">{String(r.total)}</td>
                              <td className="px-3 py-2 text-[rgba(234,240,255,0.85)]">{String(r.booked)}</td>
                              <td className="px-3 py-2 text-[rgba(234,240,255,0.85)]">{String(r.notBooked)}</td>
                              <td className="px-3 py-2 text-[rgba(234,240,255,0.85)]">{`${Number(r.pct || 0).toFixed(1)}%`}</td>
                              <td className="px-3 py-2 text-[rgba(234,240,255,0.85)]">{Number(r.totalBookedHours || 0).toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                ) : null}

                {/* Tabs per supervisor: show assigned/unassigned tables for that supervisor and active day */}
                {activeScope !== 'all' ? (
                  <Card className="p-4 space-y-3">
                    <p className="text-sm text-[#EAF0FF] font-medium">تفاصيل المشرفين — {activeScope}</p>
                    <Tabs
                      items={(reports.supervisorOptions || []).map((s) => ({ value: s, label: s }))}
                      value={supervisorFilter || (reports.supervisorOptions?.[0] || '')}
                      onChange={(v) => setSupervisorFilter(v)}
                      className="flex flex-wrap w-full sm:w-auto"
                    />

                    {(() => {
                      const sup = supervisorFilter || (reports.supervisorOptions?.[0] || '');
                      if (!sup) return null;
                      const assignedAll = reports.assignedRowsByDate?.[activeScope] || [];
                      const unassignedAll = reports.unassignedRowsByDate?.[activeScope] || [];
                      const assigned = assignedAll.filter((r: any) => String(r?.supervisors || '').trim() === sup);
                      const unassigned = unassignedAll.filter((r: any) => String(r?.supervisors || '').trim() === sup);
                      const total = assigned.length + unassigned.length;
                      const pct = total > 0 ? (assigned.length / total) * 100 : 0;
                      return (
                        <div className="space-y-4">
                          <div className="grid gap-3 sm:grid-cols-4">
                            <Card className="p-4">
                              <p className="text-xs text-[rgba(234,240,255,0.55)]">إجمالي الرايدرز</p>
                              <p className="text-2xl font-bold text-[#EAF0FF]">{total}</p>
                            </Card>
                            <Card className="p-4">
                              <p className="text-xs text-[rgba(234,240,255,0.55)]">حاجز</p>
                              <p className="text-2xl font-bold text-[#EAF0FF]">{assigned.length}</p>
                            </Card>
                            <Card className="p-4">
                              <p className="text-xs text-[rgba(234,240,255,0.55)]">غير حاجز</p>
                              <p className="text-2xl font-bold text-[#EAF0FF]">{unassigned.length}</p>
                            </Card>
                            <Card className="p-4">
                              <p className="text-xs text-[rgba(234,240,255,0.55)]">نسبة الحاجزين</p>
                              <p className="text-2xl font-bold text-[#EAF0FF]">{`${pct.toFixed(1)}%`}</p>
                            </Card>
                          </div>

                          <div className="grid gap-4 lg:grid-cols-2">
                            <div className="overflow-hidden rounded-lg border border-[rgba(255,255,255,0.10)]">
                              <div className="px-3 py-2 text-sm text-[#EAF0FF] border-b border-[rgba(255,255,255,0.08)]">
                                ✅ الرايدرز الحاجزين ({assigned.length})
                              </div>
                              <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
                                <table className="min-w-full text-sm">
                                  <thead className="sticky top-0 bg-[rgba(15,18,28,0.98)]">
                                    <tr className="text-[#EAF0FF]">
                                      {['employee_id', 'employee_name', 'city', 'contract_name', 'planned_start_time', 'planned_end_time', 'shift_hours'].map(
                                        (h) => (
                                          <th key={h} className="px-3 py-2 text-right border-b border-[rgba(255,255,255,0.1)] whitespace-nowrap">
                                            {h}
                                          </th>
                                        )
                                      )}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {assigned.map((r: any, i: number) => (
                                      <tr key={i} className="border-b border-[rgba(255,255,255,0.06)] hover:bg-[rgba(0,245,255,0.05)]">
                                        {['employee_id', 'employee_name', 'city', 'contract_name', 'planned_start_time', 'planned_end_time', 'shift_hours'].map((k) => (
                                          <td key={k} className="px-3 py-2 text-[rgba(234,240,255,0.85)] whitespace-nowrap">
                                            {String(r?.[k] ?? '')}
                                          </td>
                                        ))}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>

                            <div className="overflow-hidden rounded-lg border border-[rgba(255,255,255,0.10)]">
                              <div className="px-3 py-2 text-sm text-[#EAF0FF] border-b border-[rgba(255,255,255,0.08)]">
                                ❌ الرايدرز غير الحاجزين ({unassigned.length})
                              </div>
                              <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
                                <table className="min-w-full text-sm">
                                  <thead className="sticky top-0 bg-[rgba(15,18,28,0.98)]">
                                    <tr className="text-[#EAF0FF]">
                                      {['employee_id', 'employee_name', 'city', 'contract_name'].map((h) => (
                                        <th key={h} className="px-3 py-2 text-right border-b border-[rgba(255,255,255,0.1)] whitespace-nowrap">
                                          {h}
                                        </th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {unassigned.map((r: any, i: number) => (
                                      <tr key={i} className="border-b border-[rgba(255,255,255,0.06)] hover:bg-[rgba(0,245,255,0.05)]">
                                        {['employee_id', 'employee_name', 'city', 'contract_name'].map((k) => (
                                          <td key={k} className="px-3 py-2 text-[rgba(234,240,255,0.85)] whitespace-nowrap">
                                            {String(r?.[k] ?? '')}
                                          </td>
                                        ))}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </Card>
                ) : null}
              </>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
