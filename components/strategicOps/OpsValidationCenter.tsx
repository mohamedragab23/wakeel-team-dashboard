'use client';

import type { ValidationRunReport } from '@/lib/strategicOps/opsValidation';

const LEVEL_AR: Record<string, string> = {
  not_ready: 'غير جاهز',
  development_ready: 'جاهز للتطوير',
  operational_ready: 'جاهز تشغيليًا',
  production_ready: 'جاهز للإنتاج',
  enterprise_certified: 'معتمد مؤسسيًا',
};

type Props = {
  report: ValidationRunReport | undefined;
  loading: boolean;
  onRefresh: () => void;
};

export function OpsValidationCenter({ report, loading, onRefresh }: Props) {
  const cert = report?.certificate;

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[#EAF0FF]">Operations Validation Center</h2>
          <p className="text-xs text-[#64748B] mt-1">
            SRS-008 — إثبات تشغيلي وليس مجرد وجود ميزات. الشهادة ترفض التضخيم.
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="rounded-lg bg-cyan-500/80 hover:bg-cyan-500 text-black font-semibold px-3 py-1.5 text-xs disabled:opacity-40"
        >
          {loading ? 'جاري التشغيل…' : 'تشغيل مجموعة التحقق'}
        </button>
      </div>

      {cert && (
        <>
          <section
            className={`rounded-2xl border p-5 ${
              cert.verdict === 'PASS'
                ? 'border-emerald-500/40 bg-emerald-500/10'
                : 'border-amber-500/40 bg-amber-500/10'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs text-[#94A3B8]">Production Certificate</p>
                <p className="text-3xl font-bold text-[#EAF0FF] mt-1">{cert.verdict}</p>
                <p className="text-sm text-[#CBD5E1] mt-1">
                  {LEVEL_AR[cert.level] ?? cert.level} — جاهزية {cert.readinessPercent}%
                </p>
              </div>
              <div className="text-xs text-[#94A3B8] space-y-1 text-left sm:text-right">
                <p>تغطية الحالات: {report?.coveragePercent}% من {report?.targetCaseCount}</p>
                <p>
                  نجح {cert.passed} · فشل {cert.failed} · تخطي {cert.skipped}
                </p>
                <p>آخر تشغيل: {new Date(cert.generatedAt).toLocaleString('ar-EG')}</p>
              </div>
            </div>
            <p className="text-xs text-[#CBD5E1] mt-3">{cert.noteAr}</p>
          </section>

          <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {cert.categoryScores.map((c) => (
              <div
                key={c.category}
                className={`rounded-xl border p-3 text-xs ${
                  c.passed
                    ? 'border-emerald-500/30 bg-emerald-500/10'
                    : 'border-red-500/30 bg-red-500/10'
                }`}
              >
                <p className="text-[#94A3B8]">{c.category}</p>
                <p className="text-lg font-bold text-[#EAF0FF] mt-1">{c.score}%</p>
                <p className="text-[#64748B]">حد أدنى {c.minimum}%</p>
              </div>
            ))}
          </section>

          <section className="overflow-x-auto rounded-xl border border-white/10">
            <table className="min-w-full text-xs text-[#CBD5E1]">
              <thead className="bg-black/40 text-[#94A3B8]">
                <tr>
                  <th className="px-3 py-2 text-right">Module</th>
                  <th className="px-3 py-2">Tests</th>
                  <th className="px-3 py-2">Passed</th>
                  <th className="px-3 py-2">Failed</th>
                  <th className="px-3 py-2">Pass %</th>
                </tr>
              </thead>
              <tbody>
                {cert.matrix.map((m) => (
                  <tr key={m.module} className="border-t border-white/5">
                    <td className="px-3 py-2 text-[#EAF0FF]">{m.labelAr}</td>
                    <td className="px-3 py-2 text-center">{m.tests}</td>
                    <td className="px-3 py-2 text-center text-emerald-300">{m.passed}</td>
                    <td className="px-3 py-2 text-center text-red-300">{m.failed}</td>
                    <td className="px-3 py-2 text-center">{m.passRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {cert.openIssues.length > 0 && (
            <section className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
              <p className="text-sm font-semibold text-red-100 mb-2">Open Issues</p>
              <ul className="list-disc list-inside text-xs text-[#FECACA] space-y-1">
                {cert.openIssues.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </section>
          )}

          <section className="rounded-xl border border-white/10 bg-black/20 max-h-96 overflow-y-auto">
            <table className="min-w-full text-[11px] text-[#CBD5E1]">
              <thead className="sticky top-0 bg-black/80 text-[#94A3B8]">
                <tr>
                  <th className="px-2 py-1.5 text-right">ID</th>
                  <th className="px-2 py-1.5 text-right">الحالة</th>
                  <th className="px-2 py-1.5 text-right">العنوان</th>
                  <th className="px-2 py-1.5 text-right">متوقع</th>
                  <th className="px-2 py-1.5 text-right">فعلي</th>
                </tr>
              </thead>
              <tbody>
                {(report?.results ?? []).map((r) => (
                  <tr key={r.id} className="border-t border-white/5">
                    <td className="px-2 py-1 font-mono">{r.id}</td>
                    <td
                      className={`px-2 py-1 ${
                        r.status === 'pass'
                          ? 'text-emerald-300'
                          : r.status === 'fail'
                            ? 'text-red-300'
                            : 'text-amber-300'
                      }`}
                    >
                      {r.status}
                    </td>
                    <td className="px-2 py-1">{r.titleAr}</td>
                    <td className="px-2 py-1">{r.expected}</td>
                    <td className="px-2 py-1">{r.actual}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}
