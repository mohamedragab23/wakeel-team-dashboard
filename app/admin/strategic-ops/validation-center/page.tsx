'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import Layout from '@/components/Layout';
import { authFetch } from '@/lib/authFetch';
import { OpsValidationCenter } from '@/components/strategicOps/OpsValidationCenter';
import type { ValidationRunReport } from '@/lib/strategicOps/opsValidation';

export default function ValidationCenterPage() {
  const query = useQuery({
    queryKey: ['ops-validation-run'],
    queryFn: async () => {
      const res = await authFetch('/api/strategic-ops/ops-validation');
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'فشل تشغيل التحقق');
      return json.data as ValidationRunReport;
    },
    staleTime: 30_000,
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
              / Validation Center
            </p>
            <h1 className="text-2xl font-bold text-[#EAF0FF]">Operations Validation Center</h1>
            <p className="text-sm text-[#94A3B8] mt-1">
              SRS-008 — من System Works إلى System Proven
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/strategic-ops/enterprise-certification"
              className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-500/20"
            >
              Enterprise Certification (SRS-009)
            </Link>
            <Link
              href="/admin/strategic-ops/certification"
              className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-[#EAF0FF] hover:bg-white/10"
            >
              Production Certification
            </Link>
            <Link
              href="/admin/strategic-ops/kpi-explorer"
              className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-[#EAF0FF] hover:bg-white/10"
            >
              KPI Explorer
            </Link>
            <Link
              href="/admin/strategic-ops/trust-center"
              className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-[#EAF0FF] hover:bg-white/10"
            >
              Trust Center
            </Link>
            <Link
              href="/admin/strategic-ops/integrity"
              className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-[#EAF0FF] hover:bg-white/10"
            >
              System Integrity
            </Link>
          </div>
        </div>

        {query.error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-300 text-sm">
            {(query.error as Error).message}
          </div>
        )}

        <OpsValidationCenter
          report={query.data}
          loading={query.isLoading || query.isFetching}
          onRefresh={() => void query.refetch()}
        />
      </div>
    </Layout>
  );
}
