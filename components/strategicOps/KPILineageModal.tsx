'use client';

import type { ReactNode } from 'react';
import type { KPILineage } from '@/lib/strategicOps/audit';

type Props = {
  lineage: KPILineage | null;
  isOpen: boolean;
  onClose: () => void;
};

export function KPILineageModal({ lineage, isOpen, onClose }: Props) {
  if (!isOpen || !lineage) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="kpi-lineage-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-white/15 bg-[#0B1220] p-5 space-y-4"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="kpi-lineage-title" className="text-lg font-semibold text-[#EAF0FF]">
              نسب المؤشر — {lineage.kpi}
            </h2>
            <p className="text-xs text-[#64748B] mt-1">
              آخر تحديث: {new Date(lineage.lastRefresh).toLocaleString('ar-EG')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/15 px-3 py-1 text-xs text-[#EAF0FF] hover:bg-white/10"
          >
            إغلاق
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <Metric label="المصدر" value={lineage.sourceSheet} />
          <Metric label="صفوف مستخدمة" value={String(lineage.rowsUsed)} />
          <Metric label="صفوف متجاهلة" value={String(lineage.rowsIgnored)} />
          <Metric label="التغطية" value={`${lineage.coverage}%`} />
          <Metric label="الثقة" value={`${lineage.confidence}%`} />
          <Metric label="Expected" value={String(lineage.expectedValue ?? '—')} />
          <Metric label="Calculated" value={String(lineage.reportValue ?? '—')} />
          <Metric
            label="Audit"
            value={lineage.auditResult?.status ?? '—'}
            tone={
              lineage.auditResult?.status === 'PASS'
                ? 'good'
                : lineage.auditResult?.status === 'WARN'
                  ? 'warn'
                  : lineage.auditResult?.status === 'FAIL'
                    ? 'bad'
                    : 'neutral'
            }
          />
        </div>

        <Block title="المعادلة">
          <code className="text-xs text-cyan-200 whitespace-pre-wrap">{lineage.formula}</code>
        </Block>

        <Block title="خطوات الحساب">
          <ol className="list-decimal list-inside space-y-1 text-xs text-[#94A3B8]">
            {lineage.calculationSteps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </Block>

        {lineage.ignoredReasons && lineage.ignoredReasons.length > 0 && (
          <Block title="صفوف متجاهلة — الأسباب">
            <ul className="space-y-1 text-xs text-[#94A3B8]">
              {lineage.ignoredReasons.map((r) => (
                <li key={r.reason}>
                  {r.reason}: <strong className="text-[#EAF0FF]">{r.count}</strong>
                </li>
              ))}
            </ul>
          </Block>
        )}

        <Block title="فحوصات التحقق">
          <ul className="space-y-1 text-xs">
            {lineage.validationChecks.map((v) => (
              <li key={v.check} className="flex justify-between gap-2 border-b border-white/5 py-1">
                <span className="text-[#94A3B8]">{v.check}</span>
                <span
                  className={
                    v.status === 'pass'
                      ? 'text-emerald-300'
                      : v.status === 'warn'
                        ? 'text-amber-300'
                        : 'text-red-300'
                  }
                >
                  {v.status.toUpperCase()}
                </span>
              </li>
            ))}
          </ul>
        </Block>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'good' | 'warn' | 'bad' | 'neutral';
}) {
  const toneClass =
    tone === 'good'
      ? 'text-emerald-300'
      : tone === 'warn'
        ? 'text-amber-300'
        : tone === 'bad'
          ? 'text-red-300'
          : 'text-[#EAF0FF]';
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-2">
      <p className="text-[10px] text-[#64748B]">{label}</p>
      <p className={`text-sm font-semibold truncate ${toneClass}`}>{value}</p>
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2">
      <p className="text-xs font-semibold text-[#EAF0FF]">{title}</p>
      {children}
    </div>
  );
}
