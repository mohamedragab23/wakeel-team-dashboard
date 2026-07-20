'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import Layout from '@/components/Layout';
import { authFetch } from '@/lib/authFetch';
import { KPILineageModal } from '@/components/strategicOps/KPILineageModal';
import type { ValidationRunReport } from '@/lib/strategicOps/opsValidation';
import type { KPILineage } from '@/lib/strategicOps/audit';

export default function KpiExplorerPage() {
  const [lineage, setLineage] = useState<KPILineage | null>(null);
  const [open, setOpen] = useState(false);

  const query = useQuery({
    queryKey: ['ops-validation-kpi-explorer'],
    queryFn: async () => {
      const res = await authFetch('/api/strategic-ops/ops-validation');
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'فشل');
      return json.data as ValidationRunReport;
    },
    staleTime: 60_000,
  });

  const kpiRows = useMemo(() => {
    return (query.data?.results ?? []).filter((r) => r.module === 'kpi_engine');
  }, [query.data]);

  const openKpi = (r: (typeof kpiRows)[number]) => {
    setLineage({
      kpi: r.id,
      sourceSheet: 'Validation Fixture / البيانات اليومية',
      sourceRows: 0,
      rowsUsed: 0,
      rowsIgnored: 0,
      formula: r.titleEn,
      calculationSteps: [
        `Expected: ${r.expected}`,
        `Actual: ${r.actual}`,
        r.detailAr ?? '',
      ].filter(Boolean),
      validationChecks: [
        {
          check: 'SRS-008 KPI accuracy',
          status: r.status === 'pass' ? 'pass' : r.status === 'fail' ? 'fail' : 'warn',
        },
      ],
      coverage: 100,
      confidence: r.status === 'pass' ? 99.5 : 40,
      lastRefresh: query.data?.certificate.generatedAt ?? new Date().toISOString(),
      reportValue: r.actual,
      expectedValue: r.expected,
    });
    setOpen(true);
  };

  return (
    <Layout>
      <div className="space-y-6 min-w-0 pb-12" dir="rtl">
        <div>
          <p className="text-xs text-[#64748B] mb-1">
            <Link href="/admin/strategic-ops/validation-center" className="hover:text-cyan-300">
              Validation Center
            </Link>{' '}
            / KPI Explorer
          </p>
          <h1 className="text-2xl font-bold text-[#EAF0FF]">KPI Explorer</h1>
          <p className="text-sm text-[#94A3B8] mt-1">
            كل مؤشر قابل للتدقيق — Formula / Expected / Actual / Validation
          </p>
        </div>

        {query.isLoading && <p className="text-[#94A3B8]">جاري التحميل…</p>}
        {query.error && (
          <p className="text-red-300 text-sm">{(query.error as Error).message}</p>
        )}

        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="min-w-full text-xs text-[#CBD5E1]">
            <thead className="bg-black/40 text-[#94A3B8]">
              <tr>
                <th className="px-3 py-2 text-right">KPI</th>
                <th className="px-3 py-2 text-right">الحالة</th>
                <th className="px-3 py-2 text-right">Expected</th>
                <th className="px-3 py-2 text-right">Actual</th>
                <th className="px-3 py-2 text-right">تفاصيل</th>
              </tr>
            </thead>
            <tbody>
              {kpiRows.map((r) => (
                <tr
                  key={r.id}
                  className="border-t border-white/5 cursor-pointer hover:bg-white/5"
                  onClick={() => openKpi(r)}
                >
                  <td className="px-3 py-2 text-[#EAF0FF]">{r.id}</td>
                  <td
                    className={`px-3 py-2 ${
                      r.status === 'pass' ? 'text-emerald-300' : 'text-red-300'
                    }`}
                  >
                    {r.status}
                  </td>
                  <td className="px-3 py-2">{r.expected}</td>
                  <td className="px-3 py-2">{r.actual}</td>
                  <td className="px-3 py-2">{r.titleAr}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <KPILineageModal lineage={lineage} isOpen={open} onClose={() => setOpen(false)} />
      </div>
    </Layout>
  );
}
