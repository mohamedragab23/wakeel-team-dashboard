'use client';

import { useMemo, useState, useCallback, useRef, type ReactNode } from 'react';
import Layout from '@/components/Layout';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authFetch } from '@/lib/authFetch';
import type { RiderStrategicProfile, RiderStrategicAnalytics, StrategicAuditEntry } from '@/lib/riderStrategic/types';
import {
  RIDER_TYPE_OPTIONS,
  RIDER_STATUS_OPTIONS,
  RISK_LABELS_AR,
  type RiderTypeOption,
  type RiderStatusOption,
  type RiskLevel,
} from '@/lib/riderStrategic/types';
import { BULK_TEMPLATE_HEADERS } from '@/lib/riderStrategic/bulkImport';

const RISK_COLORS: Record<RiskLevel, string> = {
  green: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  yellow: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  red: 'bg-red-500/20 text-red-300 border-red-500/40',
  unknown: 'bg-slate-500/20 text-slate-300 border-slate-500/40',
};

type TabKey = 'profiles' | 'analytics' | 'audit' | 'bulk';

export default function RiderStrategicProfilesPage() {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<TabKey>('profiles');
  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState<RiskLevel | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [editing, setEditing] = useState<RiderStrategicProfile | null>(null);
  const [form, setForm] = useState({
    actualJoinDate: '',
    riderType: '' as RiderTypeOption | '',
    dailyTargetHours: 0,
    currentStatus: '' as RiderStatusOption | '',
    supervisorNotes: '',
    lastFollowUpDate: '',
  });
  const [bulkResult, setBulkResult] = useState<string | null>(null);

  const { data: profilesRes, isLoading } = useQuery({
    queryKey: ['rider-strategic-profiles'],
    queryFn: async () => {
      const res = await authFetch('/api/rider-strategic-profiles?refresh=true');
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'فشل التحميل');
      return json as {
        data: RiderStrategicProfile[];
        meta: { role: string; scoped: boolean };
        auditLog?: StrategicAuditEntry[];
      };
    },
  });

  const { data: analyticsRes } = useQuery({
    queryKey: ['rider-strategic-analytics'],
    queryFn: async () => {
      const res = await authFetch('/api/rider-strategic-profiles/analytics?refresh=true');
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      return json.data as RiderStrategicAnalytics;
    },
    enabled: tab === 'analytics',
  });

  const { data: auditRes } = useQuery({
    queryKey: ['rider-strategic-audit'],
    queryFn: async () => {
      const res = await authFetch('/api/rider-strategic-profiles?audit=true');
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      return (json.auditLog ?? []) as StrategicAuditEntry[];
    },
    enabled: tab === 'audit' && profilesRes?.meta.role === 'admin',
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: { riderCode: string } & typeof form) => {
      const res = await authFetch('/api/rider-strategic-profiles', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      return json.data as RiderStrategicProfile;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rider-strategic-profiles'] });
      queryClient.invalidateQueries({ queryKey: ['rider-strategic-analytics'] });
      queryClient.invalidateQueries({ queryKey: ['rider-strategic-audit'] });
      setEditing(null);
    },
  });

  const profiles = profilesRes?.data ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return profiles.filter((p) => {
      if (riskFilter !== 'all' && p.riskLevel !== riskFilter) return false;
      if (statusFilter !== 'all' && p.currentStatus !== statusFilter) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.riderCode.includes(q) ||
        p.activationOwnerName.toLowerCase().includes(q)
      );
    });
  }, [profiles, search, riskFilter, statusFilter]);

  const openEdit = useCallback((p: RiderStrategicProfile) => {
    setEditing(p);
    setForm({
      actualJoinDate: p.actualJoinDate || '',
      riderType: p.riderType,
      dailyTargetHours: p.dailyTargetHours,
      currentStatus: p.currentStatus,
      supervisorNotes: p.supervisorNotes,
      lastFollowUpDate: p.lastFollowUpDate,
    });
  }, []);

  const handleBulkFile = async (file: File) => {
    const XLSX = await import('xlsx');
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];
    const res = await authFetch('/api/rider-strategic-profiles/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows }),
    });
    const json = await res.json();
    if (json.errors?.length) {
      setBulkResult(`تم تحديث ${json.updated} من ${json.processed}. أخطاء: ${json.errors.length}`);
    } else {
      setBulkResult(`تم تحديث ${json.updated} سجل بنجاح`);
    }
    queryClient.invalidateQueries({ queryKey: ['rider-strategic-profiles'] });
    queryClient.invalidateQueries({ queryKey: ['rider-strategic-analytics'] });
  };

  const downloadTemplate = async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([BULK_TEMPLATE_HEADERS]);
    XLSX.utils.book_append_sheet(wb, ws, 'قالب');
    XLSX.writeFile(wb, 'rider-strategic-template.xlsx');
  };

  return (
    <Layout>
      <div className="p-4 lg:p-8 max-w-[1600px] mx-auto" dir="rtl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#EAF0FF]">إدارة بيانات المناديب</h1>
          <p className="text-sm text-[#94A3B8] mt-1">
            مصدر البيانات الاستراتيجية — شيت بيانات_المناديب_الاستراتيجية
          </p>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          {(
            [
              ['profiles', 'الملفات'],
              ['analytics', 'التحليلات'],
              ['bulk', 'رفع مجمع'],
              ...(profilesRes?.meta.role === 'admin' ? [['audit', 'سجل التدقيق'] as const] : []),
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                tab === key
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'bg-white/5 text-[#94A3B8] border border-white/10 hover:bg-white/10'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'profiles' && (
          <>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              <input
                type="search"
                placeholder="بحث بالاسم أو الكود..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm"
              />
              <select
                value={riskFilter}
                onChange={(e) => setRiskFilter(e.target.value as RiskLevel | 'all')}
                className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm"
              >
                <option value="all">كل مستويات الخطورة</option>
                <option value="green">أخضر</option>
                <option value="yellow">أصفر</option>
                <option value="red">أحمر</option>
                <option value="unknown">غير معروف</option>
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm"
              >
                <option value="all">كل الحالات</option>
                {RIDER_STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <div className="text-sm text-[#94A3B8] flex items-center">
                {isLoading ? 'جاري التحميل...' : `${filtered.length} طيار`}
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full text-sm">
                <thead className="bg-white/5 text-[#94A3B8]">
                  <tr>
                    <th className="p-3 text-right">الكود</th>
                    <th className="p-3 text-right">الاسم</th>
                    <th className="p-3 text-right">انضمام فعلي</th>
                    <th className="p-3 text-right">النوع</th>
                    <th className="p-3 text-right">تارجت/يوم</th>
                    <th className="p-3 text-right">الحالة</th>
                    <th className="p-3 text-right">آخر نشاط</th>
                    <th className="p-3 text-right">الخطورة</th>
                    <th className="p-3 text-right">المشرف</th>
                    <th className="p-3 text-right">إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => (
                    <tr key={p.riderCode} className="border-t border-white/5 hover:bg-white/5">
                      <td className="p-3 font-mono">{p.riderCode}</td>
                      <td className="p-3">{p.name}</td>
                      <td className="p-3">
                        {p.actualJoinDate || <span className="text-amber-400">مطلوب</span>}
                      </td>
                      <td className="p-3">{p.riderType || '—'}</td>
                      <td className="p-3">{p.dailyTargetHours || '—'}</td>
                      <td className="p-3">{p.currentStatus}</td>
                      <td className="p-3">
                        <div>{p.lastActivityDate ?? '—'}</div>
                        {p.daysSinceLastActivity !== null && (
                          <div className="text-xs text-[#64748B]">{p.daysSinceLastActivity} يوم</div>
                        )}
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded border text-xs ${RISK_COLORS[p.riskLevel]}`}>
                          {RISK_LABELS_AR[p.riskLevel]}
                        </span>
                      </td>
                      <td className="p-3">{p.activationOwnerName || p.activationOwnerCode}</td>
                      <td className="p-3">
                        {p.canEdit && (
                          <button
                            onClick={() => openEdit(p)}
                            className="text-cyan-400 hover:text-cyan-300 text-xs"
                          >
                            تعديل
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === 'analytics' && analyticsRes && (
          <div className="space-y-6">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <StatCard
                label="متوسط عمر الطيار"
                value={`${analyticsRes.averageRiderLifetimeDays} يوم`}
                sub={`${analyticsRes.lifetimeSampleCount} عينة`}
              />
              <StatCard label="طيارون عاليو الخطورة" value={analyticsRes.riskRiders.length} />
              <StatCard label="غير نشطين / موقوفين" value={analyticsRes.inactiveRiders.length} />
            </div>

            <Section title="توزيع Full Time vs Part Time">
              <MiniTable
                headers={['النوع', 'العدد', 'النسبة']}
                rows={analyticsRes.riderTypeDistribution.map((r) => [r.type, r.count, `${r.percent}%`])}
              />
            </Section>

            <Section title="تقرير الخطورة">
              <MiniTable
                headers={['الكود', 'الاسم', 'الأيام', 'المشرف', 'المستوى']}
                rows={analyticsRes.riskRiders.slice(0, 50).map((r) => [
                  r.riderCode,
                  r.name,
                  r.daysSinceLastActivity ?? '—',
                  r.supervisorName,
                  RISK_LABELS_AR[r.riskLevel],
                ])}
              />
            </Section>

            <Section title="تقرير غير النشطين">
              <MiniTable
                headers={['الكود', 'الاسم', 'الحالة', 'أيام بدون نشاط', 'المشرف']}
                rows={analyticsRes.inactiveRiders.slice(0, 50).map((r) => [
                  r.riderCode,
                  r.name,
                  r.currentStatus,
                  r.daysSinceLastActivity ?? '—',
                  r.supervisorCode,
                ])}
              />
            </Section>

            <Section title="إقالات قادمة / معتمدة">
              <MiniTable
                headers={['الكود', 'الاسم', 'تاريخ الإقالة', 'السبب', 'المشرف']}
                rows={analyticsRes.upcomingAttrition.slice(0, 50).map((r) => [
                  r.riderCode,
                  r.name,
                  r.resignationDate,
                  r.resignationReason || '—',
                  r.supervisorCode,
                ])}
              />
            </Section>

            <Section title="التزام المشرفين بالمتابعة">
              <MiniTable
                headers={['المشرف', 'معيّنون', 'متابعة خلال ٧ أيام', 'متأخرون', 'الالتزام %']}
                rows={analyticsRes.supervisorFollowUpCompliance.map((s) => [
                  s.supervisorName,
                  s.assignedRiders,
                  s.followedUpWithin7Days,
                  s.overdueRiders,
                  `${s.compliancePercent}%`,
                ])}
              />
            </Section>
          </div>
        )}

        {tab === 'bulk' && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-6 space-y-4 max-w-xl">
            <p className="text-sm text-[#94A3B8]">
              ارفع ملف Excel بالحقول القابلة للتعديل فقط. الحقول التلقائية (آخر نشاط، الإقالة، الخطورة) تُحسب من النظام.
            </p>
            <button
              onClick={downloadTemplate}
              className="text-cyan-400 text-sm hover:underline"
            >
              تحميل قالب Excel
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="block text-sm"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleBulkFile(f);
              }}
            />
            {bulkResult && <p className="text-sm text-emerald-300">{bulkResult}</p>}
          </div>
        )}

        {tab === 'audit' && auditRes && (
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-[#94A3B8]">
                <tr>
                  <th className="p-3 text-right">التاريخ</th>
                  <th className="p-3 text-right">الكود</th>
                  <th className="p-3 text-right">الحقل</th>
                  <th className="p-3 text-right">قديم</th>
                  <th className="p-3 text-right">جديد</th>
                  <th className="p-3 text-right">بواسطة</th>
                  <th className="p-3 text-right">المصدر</th>
                </tr>
              </thead>
              <tbody>
                {auditRes.slice(0, 200).map((e, i) => (
                  <tr key={i} className="border-t border-white/5">
                    <td className="p-3 text-xs">{e.timestamp}</td>
                    <td className="p-3 font-mono">{e.riderCode}</td>
                    <td className="p-3">{e.field}</td>
                    <td className="p-3 text-[#64748B] max-w-[120px] truncate">{e.oldValue}</td>
                    <td className="p-3 max-w-[120px] truncate">{e.newValue}</td>
                    <td className="p-3">{e.changedByName}</td>
                    <td className="p-3">{e.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {editing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="bg-[#0f172a] border border-white/10 rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <h2 className="text-lg font-bold mb-4">
                {editing.name} ({editing.riderCode})
              </h2>

              <div className="space-y-3 text-sm">
                <Field label="تاريخ الانضمام الفعلي *">
                  <input
                    type="date"
                    required
                    value={form.actualJoinDate}
                    onChange={(e) => setForm((f) => ({ ...f, actualJoinDate: e.target.value }))}
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2"
                  />
                </Field>

                <Field label="نوع الطيار">
                  <select
                    value={form.riderType}
                    onChange={(e) => setForm((f) => ({ ...f, riderType: e.target.value as RiderTypeOption }))}
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2"
                  >
                    <option value="">—</option>
                    {RIDER_TYPE_OPTIONS.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </Field>

                <Field label="التارجت اليومي (ساعة)">
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={form.dailyTargetHours}
                    onChange={(e) => setForm((f) => ({ ...f, dailyTargetHours: parseFloat(e.target.value) || 0 }))}
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2"
                  />
                </Field>

                <Field label="حالة الطيار">
                  <select
                    value={form.currentStatus}
                    onChange={(e) => setForm((f) => ({ ...f, currentStatus: e.target.value as RiderStatusOption }))}
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2"
                  >
                    {RIDER_STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </Field>

                <Field label="ملاحظات المشرف">
                  <textarea
                    rows={3}
                    value={form.supervisorNotes}
                    onChange={(e) => setForm((f) => ({ ...f, supervisorNotes: e.target.value }))}
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2"
                  />
                </Field>

                <Field label="تاريخ آخر متابعة">
                  <input
                    type="date"
                    value={form.lastFollowUpDate}
                    onChange={(e) => setForm((f) => ({ ...f, lastFollowUpDate: e.target.value }))}
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2"
                  />
                </Field>

                <div className="rounded-lg bg-black/30 p-3 space-y-2 text-[#94A3B8]">
                  <p><span className="text-[#64748B]">آخر نشاط:</span> {editing.lastActivityDate ?? '—'} ({editing.daysSinceLastActivity ?? '—'} يوم) — تلقائي</p>
                  <p><span className="text-[#64748B]">سبب الإقالة:</span> {editing.resignationReason || '—'} — تلقائي</p>
                  <p><span className="text-[#64748B]">تاريخ الإقالة:</span> {editing.resignationDate || '—'}</p>
                  <p><span className="text-[#64748B]">مستوى الخطورة:</span> {RISK_LABELS_AR[editing.riskLevel]}</p>
                  <p><span className="text-[#64748B]">مسؤول التفعيل:</span> {editing.activationOwnerName}</p>
                </div>
              </div>

              {saveMutation.error && (
                <p className="text-red-400 text-sm mt-3">{(saveMutation.error as Error).message}</p>
              )}

              <div className="flex gap-2 mt-6 justify-end">
                <button
                  onClick={() => setEditing(null)}
                  className="px-4 py-2 rounded-lg border border-white/10 text-[#94A3B8]"
                >
                  إلغاء
                </button>
                <button
                  disabled={!form.actualJoinDate || saveMutation.isPending}
                  onClick={() =>
                    saveMutation.mutate({ riderCode: editing.riderCode, ...form })
                  }
                  className="px-4 py-2 rounded-lg bg-cyan-600 text-white disabled:opacity-50"
                >
                  {saveMutation.isPending ? 'جاري الحفظ...' : 'حفظ'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <p className="text-xs text-[#94A3B8]">{label}</p>
      <p className="text-2xl font-bold text-[#EAF0FF] mt-1">{value}</p>
      {sub && <p className="text-xs text-[#64748B] mt-1">{sub}</p>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-[#94A3B8] mb-2">{title}</h3>
      {children}
    </div>
  );
}

function MiniTable({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-white/10">
      <table className="w-full text-sm">
        <thead className="bg-white/5 text-[#94A3B8]">
          <tr>{headers.map((h) => <th key={h} className="p-2 text-right">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-white/5">
              {row.map((cell, j) => <td key={j} className="p-2">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-[#94A3B8] text-xs mb-1 block">{label}</span>
      {children}
    </label>
  );
}
