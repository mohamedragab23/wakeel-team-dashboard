'use client';

import Link from 'next/link';
import Layout from '@/components/Layout';
import { KpiCrossLinkBanner } from '@/components/strategicOps/KpiCrossLinkBanner';
import { AIRecommendationPerformancePanel } from '@/components/strategicOps/AIRecommendationPerformancePanel';

export default function DecisionPerformancePage() {
  return (
    <Layout>
      <div className="space-y-6 min-w-0 pb-12" dir="rtl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs text-[#64748B] mb-1">
              <Link href="/admin/strategic-ops" className="hover:text-cyan-300">
                مركز العمليات
              </Link>{' '}
              / Decision Effectiveness &amp; Learning
            </p>
            <h1 className="text-2xl font-bold text-[#EAF0FF]">فعالية القرارات والتعلم — SRS-011 Part 11</h1>
            <p className="text-sm text-[#94A3B8] mt-1">
              هل توصيات النظام تنجح فعليًا؟ كل توصية حرجة/عالية الأولوية تُسجَّل، ويتابع النظام نتيجتها بعد يومين من
              التنفيذ الفعلي المؤكَّد.
            </p>
          </div>
          <Link
            href="/admin/strategic-ops"
            className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-[#EAF0FF] hover:bg-white/10"
          >
            العودة لمركز العمليات
          </Link>
        </div>

        <KpiCrossLinkBanner currentSurface="dashboard" />

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <AIRecommendationPerformancePanel />
        </div>
      </div>
    </Layout>
  );
}
