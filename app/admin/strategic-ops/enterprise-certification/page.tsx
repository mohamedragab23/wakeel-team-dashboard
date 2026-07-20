'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import Layout from '@/components/Layout';
import { authFetch } from '@/lib/authFetch';
import type { EnterpriseCertificationReport } from '@/lib/strategicOps/enterpriseCert';

export default function EnterpriseCertificationPage() {
  const query = useQuery({
    queryKey: ['enterprise-certification'],
    queryFn: async () => {
      const res = await authFetch('/api/strategic-ops/enterprise-certification');
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'فشل الاعتماد المؤسسي');
      return json.data as EnterpriseCertificationReport;
    },
    staleTime: 30_000,
  });

  const c = query.data?.certificate;

  return (
    <Layout>
      <div className="space-y-6 min-w-0 pb-12" dir="rtl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs text-[#64748B] mb-1">
              <Link href="/admin/strategic-ops" className="hover:text-cyan-300">
                مركز العمليات
              </Link>{' '}
              / Enterprise Certification
            </p>
            <h1 className="text-2xl font-bold text-[#EAF0FF]">Enterprise Certification</h1>
            <p className="text-sm text-[#94A3B8] mt-1">
              SRS-009 — إثبات تشغيلي وإنتاجي عبر 10 مستويات (بدون إضافة Features)
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href="/api/strategic-ops/enterprise-certification?format=html"
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-[#EAF0FF] hover:bg-white/10"
            >
              فتح شهادة HTML / PDF
            </a>
            <Link
              href="/admin/strategic-ops/validation-center"
              className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-[#EAF0FF] hover:bg-white/10"
            >
              Validation Center
            </Link>
          </div>
        </div>

        {query.isLoading && <p className="text-[#94A3B8]">جاري تقييم المستويات العشرة…</p>}
        {query.error && (
          <p className="text-red-300 text-sm">{(query.error as Error).message}</p>
        )}

        {c && (
          <>
            <section
              className={`rounded-2xl border p-6 ${
                c.productionReady
                  ? 'border-emerald-500/40 bg-emerald-500/10'
                  : 'border-amber-500/40 bg-amber-500/10'
              }`}
            >
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-[#94A3B8]">Enterprise Score</p>
                  <p className="text-3xl font-bold text-[#EAF0FF]">{c.enterpriseScore}%</p>
                </div>
                <div>
                  <p className="text-xs text-[#94A3B8]">Production Ready</p>
                  <p className="text-3xl font-bold text-[#EAF0FF]">
                    {c.productionReady ? 'YES' : 'NO'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[#94A3B8]">Certification Level</p>
                  <p className="text-xl font-bold text-[#EAF0FF] mt-1">
                    {c.tier.replace(/_/g, ' ')}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[#94A3B8]">Verdict</p>
                  <p className="text-3xl font-bold text-[#EAF0FF]">{c.verdict}</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-[#CBD5E1]">
                <span>Build {c.buildVersion}</span>
                <span>Commit {c.gitCommit}</span>
                <span>
                  Sheets{' '}
                  {c.sheetsConnected == null
                    ? '—'
                    : c.sheetsConnected
                      ? 'Connected'
                      : 'Not configured'}
                </span>
                <span>{new Date(c.lastVerifiedAt).toLocaleString('ar-EG')}</span>
              </div>
              <p className="text-xs text-[#94A3B8] mt-3">{c.noteAr}</p>
            </section>

            <section className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
              {[
                ['217 Cases', `${c.opsCasesPassed}/${c.opsCasesTotal}`],
                ['65 KPI', `${c.kpiChecksPassed}/${c.kpiChecksTotal}`],
                ['AI', c.levels[4]?.passed ? 'PASS' : 'FAIL'],
                ['Security', c.levels[6]?.passed ? 'PASS' : 'FAIL'],
                ['Performance', c.levels[5]?.passed ? 'PASS' : 'FAIL'],
                ['Forecast/L5', c.levels[4]?.passed ? 'PASS' : 'FAIL'],
                ['Lineage', c.levels[3]?.passed ? 'PASS' : 'FAIL'],
                ['Business L9', c.levels[8]?.passed ? 'PASS' : 'PENDING'],
                ['Executive', c.levels[9]?.passed ? 'PASS' : 'FAIL'],
                ['Trust hint', c.trustScoreHint ?? '—'],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl border border-white/10 bg-black/20 p-3 text-xs">
                  <p className="text-[#94A3B8]">{k}</p>
                  <p className="text-lg font-semibold text-[#EAF0FF] mt-1">{v}</p>
                </div>
              ))}
            </section>

            <section className="overflow-x-auto rounded-xl border border-white/10">
              <table className="min-w-full text-xs text-[#CBD5E1]">
                <thead className="bg-black/40 text-[#94A3B8]">
                  <tr>
                    <th className="px-3 py-2 text-right">Level</th>
                    <th className="px-3 py-2 text-right">الاسم</th>
                    <th className="px-3 py-2">Score</th>
                    <th className="px-3 py-2">الحالة</th>
                    <th className="px-3 py-2 text-right">تفاصيل</th>
                  </tr>
                </thead>
                <tbody>
                  {c.levels.map((l) => (
                    <tr key={l.id} className="border-t border-white/5">
                      <td className="px-3 py-2 font-mono">L{l.rank}</td>
                      <td className="px-3 py-2 text-[#EAF0FF]">{l.titleAr}</td>
                      <td className="px-3 py-2 text-center">{l.score}%</td>
                      <td
                        className={`px-3 py-2 text-center font-semibold ${
                          l.passed
                            ? 'text-emerald-300'
                            : l.skippedTests > 0
                              ? 'text-amber-300'
                              : 'text-red-300'
                        }`}
                      >
                        {l.passed ? 'PASS' : l.skippedTests > 0 ? 'PENDING' : 'FAIL'}
                      </td>
                      <td className="px-3 py-2">{l.detailAr}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="rounded-xl border border-white/10 p-4">
              <p className="text-sm font-semibold text-[#EAF0FF] mb-2">Enterprise Gates</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {c.gates.map((g) => (
                  <div
                    key={g.id}
                    className={`rounded-lg border px-3 py-2 text-xs ${
                      g.passed
                        ? 'border-emerald-500/30 bg-emerald-500/10'
                        : 'border-amber-500/30 bg-amber-500/10'
                    }`}
                  >
                    <span className="font-semibold text-[#EAF0FF]">
                      {g.passed ? '✓' : '○'} {g.labelAr}
                    </span>
                    <p className="text-[#94A3B8] mt-0.5">{g.detailAr}</p>
                  </div>
                ))}
              </div>
            </section>

            {c.openIssues.length > 0 && (
              <section className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                <p className="text-sm font-semibold text-amber-100 mb-2">Open Issues</p>
                <ul className="list-disc list-inside text-xs text-[#FDE68A] space-y-1">
                  {c.openIssues.slice(0, 20).map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
