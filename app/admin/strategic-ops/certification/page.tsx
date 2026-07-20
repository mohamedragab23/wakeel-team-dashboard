'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import Layout from '@/components/Layout';
import { authFetch } from '@/lib/authFetch';
import type { ValidationRunReport } from '@/lib/strategicOps/opsValidation';

const LEVEL_AR: Record<string, string> = {
  not_ready: 'Level 1 — Not Ready',
  development_ready: 'Level 2 — Development Ready',
  operational_ready: 'Level 3 — Operational Ready',
  production_ready: 'Level 4 — Production Ready',
  enterprise_certified: 'Level 5 — Enterprise Certified',
};

export default function CertificationPage() {
  const query = useQuery({
    queryKey: ['ops-validation-cert'],
    queryFn: async () => {
      const res = await authFetch('/api/strategic-ops/ops-validation');
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'فشل الشهادة');
      return json.data as ValidationRunReport;
    },
    staleTime: 30_000,
  });

  const cert = query.data?.certificate;

  return (
    <Layout>
      <div className="space-y-6 min-w-0 pb-12" dir="rtl">
        <div>
          <p className="text-xs text-[#64748B] mb-1">
            <Link href="/admin/strategic-ops/validation-center" className="hover:text-cyan-300">
              Validation Center
            </Link>{' '}
            / Certification
          </p>
          <h1 className="text-2xl font-bold text-[#EAF0FF]">Production Certification</h1>
          <p className="text-sm text-[#94A3B8] mt-1">
            لا شهادة إنتاج بدون اجتياز حدود SRS-008
          </p>
        </div>

        {query.isLoading && <p className="text-[#94A3B8]">جاري التقييم…</p>}
        {query.error && (
          <p className="text-red-300 text-sm">{(query.error as Error).message}</p>
        )}

        {cert && (
          <div
            className={`rounded-2xl border p-8 text-center ${
              cert.verdict === 'PASS'
                ? 'border-emerald-500/40 bg-emerald-500/10'
                : 'border-red-500/40 bg-red-500/10'
            }`}
          >
            <p className="text-xs uppercase tracking-widest text-[#94A3B8]">Final Verdict</p>
            <p className="text-6xl font-black text-[#EAF0FF] mt-3">{cert.verdict}</p>
            <p className="text-lg text-[#CBD5E1] mt-4">{LEVEL_AR[cert.level]}</p>
            <p className="text-sm text-[#94A3B8] mt-2">Readiness {cert.readinessPercent}%</p>
            <p className="text-xs text-[#64748B] mt-6 max-w-xl mx-auto">{cert.noteAr}</p>
            <p className="text-[10px] text-[#64748B] mt-4">
              Phase: {cert.phase} · Cases: {cert.totalTests}/{query.data?.targetCaseCount}
            </p>
          </div>
        )}
      </div>
    </Layout>
  );
}
