'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import Layout from '@/components/Layout';
import { authFetch } from '@/lib/authFetch';
import { KpiCrossLinkBanner } from '@/components/strategicOps/KpiCrossLinkBanner';
import { KPIIntelligencePanel } from '@/components/strategicOps/KPIIntelligencePanel';
import { buildCertificationProgress, kpiCertificationImpact } from '@/lib/strategicOps/enterpriseCert/progress';
import { readKpiParamFromLocation } from '@/lib/strategicOps/kpiIntelligence';
import type { EnterpriseCertificationReport } from '@/lib/strategicOps/enterpriseCert';

export default function EnterpriseCertificationPage() {
  const [showTechnical, setShowTechnical] = useState(false);
  const [kpiPanelId, setKpiPanelId] = useState<string | null>(null);
  const [focusKpiId, setFocusKpiId] = useState<string | null>(null);

  useEffect(() => {
    setFocusKpiId(readKpiParamFromLocation());
  }, []);

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
  const progress = useMemo(
    () => (query.data ? buildCertificationProgress(query.data) : null),
    [query.data]
  );
  const kpiImpact = useMemo(
    () => (query.data && focusKpiId ? kpiCertificationImpact(focusKpiId, query.data) : null),
    [query.data, focusKpiId]
  );

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

        <KpiCrossLinkBanner currentSurface="certification" />

        {kpiImpact && (
          <div
            className={`rounded-xl border p-3 text-xs ${
              kpiImpact.blocksCertification
                ? 'border-red-500/40 bg-red-500/10'
                : 'border-emerald-500/40 bg-emerald-500/10'
            }`}
            dir="rtl"
          >
            <p className="font-semibold text-[#EAF0FF]">
              🔗 هل {kpiImpact.labelAr} يمنع الاعتماد؟
            </p>
            <p className={`mt-1 ${kpiImpact.blocksCertification ? 'text-red-200' : 'text-emerald-200'}`}>
              {kpiImpact.answerAr}
            </p>
            {kpiImpact.matchingOpenIssues.length > 0 && (
              <ul className="list-disc list-inside mt-2 text-[#CBD5E1]">
                {kpiImpact.matchingOpenIssues.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => setKpiPanelId(focusKpiId)}
              className="mt-2 rounded-lg border border-white/15 bg-black/20 px-2 py-1 text-[#EAF0FF] hover:bg-white/10"
            >
              فتح KPI Intelligence
            </button>
          </div>
        )}

        {kpiImpact && (
          <div
            className={`rounded-xl border p-3 text-xs ${
              kpiImpact.blocksCertification
                ? 'border-red-500/40 bg-red-500/10'
                : 'border-cyan-500/40 bg-cyan-500/10'
            }`}
            dir="rtl"
          >
            <p className={kpiImpact.blocksCertification ? 'text-red-200' : 'text-cyan-200'}>
              🔗 هل يمنع <span className="font-semibold">{kpiImpact.labelAr}</span> الاعتماد؟{' '}
              <span className="font-semibold">{kpiImpact.blocksCertification ? 'نعم' : 'لا'}</span>
            </p>
            <p className="text-[#CBD5E1] mt-1">{kpiImpact.answerAr}</p>
            {kpiImpact.matchingOpenIssues.length > 0 && (
              <ul className="list-disc list-inside mt-1.5 text-amber-200/90">
                {kpiImpact.matchingOpenIssues.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => setKpiPanelId(focusKpiId)}
              className="mt-2 rounded-lg border border-white/15 px-2 py-1 text-[#EAF0FF] hover:bg-white/10"
            >
              فتح KPI Intelligence
            </button>
          </div>
        )}

        {query.isLoading && <p className="text-[#94A3B8]">جاري تقييم المستويات العشرة…</p>}
        {query.error && (
          <p className="text-red-300 text-sm">{(query.error as Error).message}</p>
        )}

        {c && progress && (
          <>
            {/* SRS-010 Part 8 — Certification Progress (executive view) */}
            <section
              className={`rounded-2xl border p-6 ${
                c.productionReady
                  ? 'border-emerald-500/40 bg-emerald-500/10'
                  : 'border-amber-500/40 bg-amber-500/10'
              }`}
            >
              <p className="text-xs text-[#94A3B8]">Certification Progress</p>
              <div className="flex items-baseline gap-3 mt-1">
                <span className="text-5xl font-bold text-[#EAF0FF]">{progress.progressPercent}%</span>
                <span className="text-lg text-[#CBD5E1]">{progress.statusAr}</span>
              </div>

              {progress.remainingAr.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-semibold text-amber-200 mb-1">Remaining</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    {progress.remainingAr.map((r) => (
                      <li key={r} className="text-xs text-[#CBD5E1]">{r}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-4">
                <p className="text-xs font-semibold text-cyan-200 mb-1.5">Required actions</p>
                <div className="grid sm:grid-cols-2 gap-2">
                  {progress.requiredActions.map((a) => {
                    const btnClassName =
                      'rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors self-start ' +
                      (a.kind === 'refresh'
                        ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20'
                        : 'border-white/15 bg-black/20 text-[#EAF0FF] hover:bg-white/10');
                    let button: ReactNode;
                    if (a.kind === 'refresh') {
                      button = (
                        <button type="button" onClick={() => void query.refetch()} className={btnClassName}>
                          🔄 {a.labelAr}
                        </button>
                      );
                    } else if (a.kind === 'link' && a.href) {
                      button = (
                        <Link href={a.href} className={btnClassName}>
                          {a.labelAr}
                        </Link>
                      );
                    } else if (a.kind === 'external' && a.href) {
                      button = (
                        <a href={a.href} target="_blank" rel="noreferrer" className={btnClassName}>
                          {a.labelAr}
                        </a>
                      );
                    } else {
                      button = <span className={btnClassName}>{a.labelAr}</span>;
                    }
                    return (
                      <div key={a.id} className="rounded-xl border border-white/10 bg-black/15 p-2.5 space-y-1.5">
                        {button}
                        <p className="text-[11px] text-[#94A3B8]">{a.detailAr}</p>
                        {/* SRS-011 Part 9 — owner + estimated duration per remaining action */}
                        <p className="text-[10px] text-[#64748B]">
                          👤 المسؤول: <span className="text-[#CBD5E1]">{a.ownerAr}</span> · ⏱ المدة المقدَّرة:{' '}
                          <span className="text-[#CBD5E1]">{a.estimatedDurationAr}</span>
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
              <p className="text-xs text-[#94A3B8] mt-4">{c.noteAr}</p>
            </section>

            <div>
              <button
                type="button"
                onClick={() => setShowTechnical((v) => !v)}
                className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-[#94A3B8] hover:bg-white/10"
              >
                {showTechnical ? '▲ إخفاء التفاصيل الفنية (10 مستويات + Gates)' : '▼ عرض التفاصيل الفنية (10 مستويات + Gates)'}
              </button>
            </div>

            {showTechnical && (
              <>
                <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
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
                        <tr
                          key={l.id}
                          className={`border-t border-white/5 ${
                            kpiImpact?.primaryLevelId === l.id ? 'bg-cyan-500/10 ring-1 ring-cyan-400/50' : ''
                          }`}
                        >
                          <td className="px-3 py-2 font-mono">
                            {kpiImpact?.primaryLevelId === l.id && '🔗 '}L{l.rank}
                          </td>
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
              </>
            )}

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
                    <li
                      key={i}
                      className={kpiImpact?.matchingOpenIssues.includes(i) ? 'text-cyan-200 font-semibold' : undefined}
                    >
                      {kpiImpact?.matchingOpenIssues.includes(i) && '🔗 '}
                      {i}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        <KPIIntelligencePanel
          kpiId={kpiPanelId}
          isOpen={Boolean(kpiPanelId)}
          onClose={() => setKpiPanelId(null)}
        />
      </div>
    </Layout>
  );
}
