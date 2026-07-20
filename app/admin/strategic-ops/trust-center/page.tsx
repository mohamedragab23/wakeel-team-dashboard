'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import Layout from '@/components/Layout';
import { authFetch } from '@/lib/authFetch';
import { ZONE_OPTIONS } from '@/lib/zones';
import { ExecutiveTrustCenter } from '@/components/strategicOps/ExecutiveTrustCenter';
import type { TrustScore } from '@/lib/strategicOps/trust';
import type { ValidationRunReport } from '@/lib/strategicOps/opsValidation';

function defaultRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 6);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { startDate: iso(start), endDate: iso(end) };
}

export default function TrustCenterPage() {
  const defaults = useMemo(() => defaultRange(), []);
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [endDate, setEndDate] = useState(defaults.endDate);
  const [zone, setZone] = useState('all');
  const [supervisorCode, setSupervisorCode] = useState('all');
  const [applied, setApplied] = useState({
    ...defaults,
    zone: 'all',
    supervisorCode: 'all',
  });

  const qs = useMemo(
    () =>
      new URLSearchParams({
        startDate: applied.startDate,
        endDate: applied.endDate,
        zone: applied.zone,
        supervisorCode: applied.supervisorCode,
      }).toString(),
    [applied]
  );

  const trustQuery = useQuery({
    queryKey: ['trust-center', qs],
    queryFn: async () => {
      const res = await authFetch(`/api/strategic-ops/trust-score?${qs}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'فشل Trust Score');
      return json.data as TrustScore;
    },
    staleTime: 60_000,
  });

  const certQuery = useQuery({
    queryKey: ['trust-center-cert'],
    queryFn: async () => {
      const res = await authFetch('/api/strategic-ops/ops-validation');
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'فشل الشهادة');
      return json.data as ValidationRunReport;
    },
    staleTime: 60_000,
  });

  return (
    <Layout>
      <div className="space-y-6 min-w-0 pb-12" dir="rtl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs text-[#64748B] mb-1">
              <Link href="/admin/strategic-ops" className="hover:text-cyan-300">
                مركز العمليات
              </Link>{' '}
              / Trust Center
            </p>
            <h1 className="text-2xl font-bold text-[#EAF0FF]">Executive Trust Center</h1>
            <p className="text-sm text-[#94A3B8] mt-1">
              SRS-006 Trust + SRS-008 Certification في سطح واحد
            </p>
          </div>
          <Link
            href="/admin/strategic-ops/validation-center"
            className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-[#EAF0FF] hover:bg-white/10"
          >
            Validation Center
          </Link>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="text-xs text-[#94A3B8] block mb-1">من</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-[#EAF0FF] text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-[#94A3B8] block mb-1">إلى</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-[#EAF0FF] text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-[#94A3B8] block mb-1">المنطقة</label>
            <select
              value={zone}
              onChange={(e) => setZone(e.target.value)}
              className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-[#EAF0FF] text-sm"
            >
              <option value="all">الكل</option>
              {ZONE_OPTIONS.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-[#94A3B8] block mb-1">المشرف</label>
            <input
              value={supervisorCode}
              onChange={(e) => setSupervisorCode(e.target.value)}
              className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-[#EAF0FF] text-sm"
            />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => setApplied({ startDate, endDate, zone, supervisorCode })}
              className="w-full rounded-lg bg-cyan-500/80 hover:bg-cyan-500 text-black font-semibold py-2.5 text-sm"
            >
              تحديث الثقة
            </button>
          </div>
        </div>

        <ExecutiveTrustCenter
          trustScore={trustQuery.data}
          loading={trustQuery.isLoading}
          onViewDetails={() => {
            window.location.assign('/admin/strategic-ops/integrity');
          }}
        />

        {certQuery.data && (
          <section
            className={`rounded-2xl border p-5 ${
              certQuery.data.certificate.verdict === 'PASS'
                ? 'border-emerald-500/40 bg-emerald-500/10'
                : 'border-amber-500/40 bg-amber-500/10'
            }`}
          >
            <p className="text-xs text-[#94A3B8]">SRS-008 Production Certificate</p>
            <p className="text-3xl font-bold text-[#EAF0FF] mt-1">
              {certQuery.data.certificate.verdict}
            </p>
            <p className="text-sm text-[#CBD5E1] mt-1">
              Level: {certQuery.data.certificate.level} · Readiness{' '}
              {certQuery.data.certificate.readinessPercent}% · Coverage{' '}
              {certQuery.data.coveragePercent}%
            </p>
            <p className="text-xs text-[#94A3B8] mt-2">{certQuery.data.certificate.noteAr}</p>
          </section>
        )}
      </div>
    </Layout>
  );
}
