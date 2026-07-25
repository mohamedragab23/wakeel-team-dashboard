'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import Layout from '@/components/Layout';
import { authFetch } from '@/lib/authFetch';
import { KPILineageModal } from '@/components/strategicOps/KPILineageModal';
import { KpiCrossLinkBanner } from '@/components/strategicOps/KpiCrossLinkBanner';
import { KPIIntelligencePanel } from '@/components/strategicOps/KPIIntelligencePanel';
import { getKpiDef, readKpiParamFromLocation, resolveKpiFromText } from '@/lib/strategicOps/kpiIntelligence';
import type { ValidationRunReport } from '@/lib/strategicOps/opsValidation';
import type { KPILineage } from '@/lib/strategicOps/audit';

export default function KpiExplorerPage() {
  const [lineage, setLineage] = useState<KPILineage | null>(null);
  const [open, setOpen] = useState(false);
  const [kpiPanelId, setKpiPanelId] = useState<string | null>(null);
  const [focusKpiId, setFocusKpiId] = useState<string | null>(null);
  const [focusedOnly, setFocusedOnly] = useState(false);

  useEffect(() => {
    setFocusKpiId(readKpiParamFromLocation());
  }, []);

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

  const kpiRowsAll = useMemo(() => {
    const rows = (query.data?.results ?? []).filter((r) => r.module === 'kpi_engine');
    // SRS-010 — Interconnected Tabs: resolve each test row to a canonical KPI
    // registry id via its title text, so `?kpi=` from other tabs can find it here.
    return rows.map((r) => ({
      ...r,
      canonicalKpiId: resolveKpiFromText(`${r.titleAr} ${r.titleEn} ${r.id}`)?.id ?? null,
    }));
  }, [query.data]);

  const kpiRows = useMemo(() => {
    if (!focusKpiId) return kpiRowsAll;
    const matched = kpiRowsAll.filter((r) => r.canonicalKpiId === focusKpiId);
    if (focusedOnly) return matched;
    // Focused rows float to the top without hiding the rest.
    return [...kpiRowsAll].sort((a, b) => {
      const aMatch = a.canonicalKpiId === focusKpiId ? 1 : 0;
      const bMatch = b.canonicalKpiId === focusKpiId ? 1 : 0;
      return bMatch - aMatch;
    });
  }, [kpiRowsAll, focusKpiId, focusedOnly]);

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

        <KpiCrossLinkBanner currentSurface="explorer" />

        {focusKpiId && (
          <div className="rounded-xl border border-cyan-500/40 bg-cyan-500/10 p-3 flex flex-wrap items-center justify-between gap-2 text-xs" dir="rtl">
            <span className="text-cyan-200">
              🔗 معادلة/اختبارات المؤشر:{' '}
              <span className="font-semibold">{getKpiDef(focusKpiId)?.labelAr ?? focusKpiId}</span> — مُبرزة أعلى الجدول.
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setKpiPanelId(focusKpiId)}
                className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-cyan-100 hover:bg-cyan-500/20"
              >
                فتح KPI Intelligence
              </button>
              <label className="flex items-center gap-1 text-[#94A3B8]">
                <input
                  type="checkbox"
                  checked={focusedOnly}
                  onChange={(e) => setFocusedOnly(e.target.checked)}
                />
                عرض هذا المؤشر فقط
              </label>
            </div>
          </div>
        )}

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
              {kpiRows.map((r) => {
                const isFocused = Boolean(focusKpiId && r.canonicalKpiId === focusKpiId);
                return (
                  <tr
                    key={r.id}
                    className={`border-t border-white/5 cursor-pointer hover:bg-white/5 ${
                      isFocused ? 'bg-cyan-500/10 ring-1 ring-cyan-400/50' : ''
                    }`}
                    onClick={() => openKpi(r)}
                  >
                    <td className="px-3 py-2 text-[#EAF0FF]">
                      {isFocused && '🔗 '}
                      {r.id}
                    </td>
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
                );
              })}
            </tbody>
          </table>
        </div>

        <KPILineageModal lineage={lineage} isOpen={open} onClose={() => setOpen(false)} />
        <KPIIntelligencePanel
          kpiId={kpiPanelId}
          isOpen={Boolean(kpiPanelId)}
          onClose={() => setKpiPanelId(null)}
        />
      </div>
    </Layout>
  );
}
