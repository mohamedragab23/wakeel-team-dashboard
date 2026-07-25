'use client';

/**
 * SRS-010 — "Interconnected Tabs".
 * Reads `?kpi=<id>` from the URL and renders a cross-navigation banner
 * linking to the same KPI in the other 4 Strategic Ops surfaces:
 * Integrity Center, Validation Center, KPI Explorer, Trust Center,
 * Enterprise Certification.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { buildKpiDeepLinks, getKpiDef, readKpiParamFromLocation } from '@/lib/strategicOps/kpiIntelligence';

type SurfaceKey = 'dashboard' | 'integrity' | 'validation' | 'explorer' | 'trust' | 'certification';

const SURFACE_LABELS: Record<SurfaceKey, string> = {
  dashboard: '🏠 مركز العمليات',
  integrity: '🛡️ Integrity Center',
  validation: '✅ Validation Center',
  explorer: '🔎 KPI Explorer',
  trust: '🤝 Trust Center',
  certification: '🏆 Enterprise Certification',
};

export function KpiCrossLinkBanner({ currentSurface }: { currentSurface: SurfaceKey }) {
  const [kpiId, setKpiId] = useState<string | null>(null);

  useEffect(() => {
    setKpiId(readKpiParamFromLocation());
  }, []);

  if (!kpiId) return null;
  const def = getKpiDef(kpiId);
  const links = buildKpiDeepLinks(kpiId);

  const others: SurfaceKey[] = (
    ['dashboard', 'integrity', 'validation', 'explorer', 'trust', 'certification'] as SurfaceKey[]
  ).filter((s) => s !== currentSurface);

  return (
    <div
      className="rounded-xl border border-cyan-500/40 bg-cyan-500/10 p-3 flex flex-wrap items-center gap-3 text-xs"
      dir="rtl"
    >
      <span className="font-semibold text-cyan-200">
        🔗 عرض مرتبط بمؤشر: {def?.labelAr ?? kpiId}
      </span>
      {!def && (
        <span className="text-[#94A3B8]">
          (لم يتم العثور على تطابق مؤكد في هذه الصفحة — راجع القائمة الكاملة أدناه)
        </span>
      )}
      <div className="flex flex-wrap gap-1.5">
        {others.map((s) => (
          <Link
            key={s}
            href={links[s]}
            className="rounded-lg border border-white/15 bg-black/20 px-2 py-1 text-[#EAF0FF] hover:bg-white/10"
          >
            {SURFACE_LABELS[s]}
          </Link>
        ))}
      </div>
    </div>
  );
}
