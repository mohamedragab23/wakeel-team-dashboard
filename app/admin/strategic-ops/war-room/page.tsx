'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import Layout from '@/components/Layout';
import { authFetch } from '@/lib/authFetch';
import { ZONE_OPTIONS } from '@/lib/zones';
import type { DigitalTwinState } from '@/lib/strategicOps/digitalTwin';
import {
  WhatIfLab,
  WarRoomDashboard,
  CityExpansionPanel,
  ModelLearningPanel,
} from '@/components/strategicOps/digitalTwin';

function defaultRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 6);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { startDate: iso(start), endDate: iso(end) };
}

export default function WarRoomPage() {
  const defaults = useMemo(() => defaultRange(), []);
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [endDate, setEndDate] = useState(defaults.endDate);
  const [zone, setZone] = useState('all');
  const [supervisorCode, setSupervisorCode] = useState('all');
  const [applied, setApplied] = useState({
    startDate: defaults.startDate,
    endDate: defaults.endDate,
    zone: 'all',
    supervisorCode: 'all',
  });

  const qs = useMemo(() => {
    return new URLSearchParams({
      startDate: applied.startDate,
      endDate: applied.endDate,
      zone: applied.zone,
      supervisorCode: applied.supervisorCode,
    }).toString();
  }, [applied]);

  const twinQuery = useQuery({
    queryKey: ['digital-twin-snapshot', qs],
    queryFn: async () => {
      const res = await authFetch(`/api/strategic-ops/digital-twin/snapshot?${qs}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'فشل تحميل التوأم الرقمي');
      return json.data as DigitalTwinState;
    },
    staleTime: 2 * 60_000,
  });

  return (
    <Layout>
      <div className="space-y-6 min-w-0 pb-12" dir="rtl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs text-[#64748B] mb-1">
              <Link href="/admin/strategic-ops" className="hover:text-cyan-300">
                مركز العمليات الاستراتيجي
              </Link>{' '}
              / Executive War Room
            </p>
            <h1 className="text-2xl font-bold text-[#EAF0FF]">Executive War Room</h1>
            <p className="text-sm text-[#94A3B8] mt-1">
              توأم رقمي + محاكاة قرارات — بدون تعديل بيانات الإنتاج
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/strategic-ops"
              className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-[#EAF0FF] hover:bg-white/10"
            >
              العودة للوحة
            </Link>
            <Link
              href="/admin/strategic-ops/integrity"
              className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-[#EAF0FF] hover:bg-white/10"
            >
              System Integrity
            </Link>
          </div>
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
              placeholder="all"
              className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-[#EAF0FF] text-sm"
            />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() =>
                setApplied({ startDate, endDate, zone, supervisorCode })
              }
              className="w-full rounded-lg bg-cyan-500/80 hover:bg-cyan-500 text-black font-semibold py-2.5 text-sm"
            >
              تحديث التوأم
            </button>
          </div>
        </div>

        {twinQuery.error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-300 text-sm">
            {(twinQuery.error as Error).message}
          </div>
        )}

        <WarRoomDashboard twin={twinQuery.data} loading={twinQuery.isLoading} />

        <CityExpansionPanel filters={applied} />

        <WhatIfLab filters={applied} />

        <ModelLearningPanel />
      </div>
    </Layout>
  );
}
