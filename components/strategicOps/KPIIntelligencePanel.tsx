'use client';

/**
 * SRS-010 Part 4 — "Every KPI Must Explain Itself" + cross-linking hub.
 * Opens as a drawer from anywhere a KPI is shown (Health Score, KPI badges,
 * Root Cause Tree nodes, Action cards). Static registry content is merged
 * with a live snapshot supplied by the caller (real numbers, not invented).
 */
import type { ReactNode } from 'react';
import Link from 'next/link';
import { buildKpiDeepLinks, getKpiDef, type KpiLiveSnapshot } from '@/lib/strategicOps/kpiIntelligence';

type Props = {
  kpiId: string | null;
  isOpen: boolean;
  onClose: () => void;
  live?: KpiLiveSnapshot;
};

export function KPIIntelligencePanel({ kpiId, isOpen, onClose, live }: Props) {
  if (!isOpen || !kpiId) return null;
  const def = getKpiDef(kpiId);
  const links = buildKpiDeepLinks(kpiId);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl border border-white/15 bg-[#0B1220] p-5 space-y-4"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] text-[#64748B]">KPI Intelligence Panel — SRS-010</p>
            <h2 className="text-lg font-semibold text-[#EAF0FF]">{def?.labelAr ?? kpiId}</h2>
            {def && <p className="text-xs text-[#64748B] mt-0.5">{def.labelEn}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/15 px-3 py-1 text-xs text-[#EAF0FF] hover:bg-white/10"
          >
            إغلاق
          </button>
        </div>

        {!def ? (
          <p className="text-sm text-[#94A3B8]">
            لا يوجد تعريف مسجَّل لهذا المؤشر في سجل الذكاء بعد ({kpiId}).
          </p>
        ) : (
          <>
            {live && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                {live.currentValue != null && (
                  <Metric label="القيمة الحالية" value={`${live.currentValue}${live.unit ?? ''}`} />
                )}
                {live.trendAr && <Metric label="الاتجاه" value={live.trendAr} />}
                {live.confidencePercent != null && (
                  <Metric label="الثقة" value={`${live.confidencePercent}%`} />
                )}
                {live.validationStatus && (
                  <Metric
                    label="حالة التحقق"
                    value={live.validationStatus}
                    tone={
                      live.validationStatus === 'PASS'
                        ? 'good'
                        : live.validationStatus === 'WARN'
                          ? 'warn'
                          : live.validationStatus === 'FAIL'
                            ? 'bad'
                            : 'neutral'
                    }
                  />
                )}
                {live.lastRecalculationAt && (
                  <Metric
                    label="آخر إعادة حساب"
                    value={new Date(live.lastRecalculationAt).toLocaleString('ar-EG')}
                  />
                )}
              </div>
            )}

            <Block title="التعريف">
              <p className="text-xs text-[#CBD5E1]">{def.definitionAr}</p>
            </Block>
            <Block title="المعنى التشغيلي/التجاري">
              <p className="text-xs text-[#CBD5E1]">{def.businessMeaningAr}</p>
            </Block>
            <Block title="الهدف التشغيلي (Operational Objective)">
              <p className="text-xs text-emerald-200/90">{def.operationalObjectiveAr}</p>
            </Block>
            <Block title="المعادلة">
              <code className="text-xs text-cyan-200 whitespace-pre-wrap block">{def.formulaAr}</code>
            </Block>
            <Block title="خطوات الحساب">
              <ol className="list-decimal list-inside space-y-1 text-xs text-[#94A3B8]">
                {def.calculationStepsAr.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            </Block>
            <div className="grid sm:grid-cols-2 gap-3">
              <Block title="مصادر البيانات">
                <ul className="list-disc list-inside space-y-1 text-xs text-[#94A3B8]">
                  {def.dataSourcesAr.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </Block>
              <Block title="الـ Sheet والأعمدة المستخدمة">
                <p className="text-xs text-[#EAF0FF] mb-1">{def.sheetUsedAr}</p>
                <div className="flex flex-wrap gap-1">
                  {def.columnsUsedAr.map((c) => (
                    <span key={c} className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[10px] text-[#94A3B8]">
                      {c}
                    </span>
                  ))}
                </div>
              </Block>
            </div>
            {def.businessRulesAr.length > 0 && (
              <Block title="قواعد العمل">
                <ul className="list-disc list-inside space-y-1 text-xs text-[#94A3B8]">
                  {def.businessRulesAr.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </Block>
            )}

            <div className="grid sm:grid-cols-2 gap-3">
              <Block title="يعتمد على (Dependencies)">
                {def.dependsOn.length === 0 ? (
                  <p className="text-xs text-[#64748B]">لا يعتمد على مؤشرات أخرى — مصدر أساسي.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {def.dependsOn.map((id) => (
                      <KpiChip key={id} id={id} />
                    ))}
                  </div>
                )}
              </Block>
              <Block title="يؤثر على (Affected KPIs)">
                {def.affects.length === 0 ? (
                  <p className="text-xs text-[#64748B]">لا يوجد مؤشر تابع محدَّد.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {def.affects.map((id) => (
                      <KpiChip key={id} id={id} />
                    ))}
                  </div>
                )}
              </Block>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <Block title="من يستخدم هذا المؤشر">
                <p className="text-xs text-[#94A3B8]">{def.usedByAr.join(' · ')}</p>
              </Block>
              <Block title="المسؤول عن التصحيح">
                <p className="text-xs text-[#94A3B8]">{def.ownerRoleAr}</p>
              </Block>
            </div>

            <Block title="أمثلة قرارات تشغيلية">
              <ul className="list-disc list-inside space-y-1 text-xs text-emerald-300/90">
                {def.decisionExamplesAr.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </Block>

            {def.knownLimitationsAr.length > 0 && (
              <Block title="حدود معروفة">
                <ul className="list-disc list-inside space-y-1 text-xs text-amber-300/90">
                  {def.knownLimitationsAr.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </Block>
            )}

            {/* SRS-011 Part 5 — no KPI without a full "why does it drop / how to fix" explanation */}
            <div className="grid sm:grid-cols-3 gap-3">
              {def.commonErrorsAr.length > 0 && (
                <Block title="الأخطاء الشائعة">
                  <ul className="list-disc list-inside space-y-1 text-xs text-red-300/90">
                    {def.commonErrorsAr.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </Block>
              )}
              {def.declineReasonsAr.length > 0 && (
                <Block title="أسباب انخفاض المؤشر">
                  <ul className="list-disc list-inside space-y-1 text-xs text-amber-300/90">
                    {def.declineReasonsAr.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </Block>
              )}
              {def.improvementMethodsAr.length > 0 && (
                <Block title="طرق تحسينه">
                  <ul className="list-disc list-inside space-y-1 text-xs text-emerald-300/90">
                    {def.improvementMethodsAr.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </Block>
              )}
            </div>

            <Block title="مرتبط عبر النظام">
              <p className="text-[10px] text-[#64748B] mb-2">
                نفس المؤشر — سبب المشكلة في Integrity، التحقق في Validation، المعادلة في Explorer،
                مستوى الثقة في Trust، وهل يمنع الاعتماد في Enterprise Certification.
              </p>
              <div className="flex flex-wrap gap-1.5">
                <CrossLink href={links.integrity} label="🛡️ Integrity Center" />
                <CrossLink href={links.validation} label="✅ Validation Center" />
                <CrossLink href={links.explorer} label="🔎 KPI Explorer" />
                <CrossLink href={links.trust} label="🤝 Trust Center" />
                <CrossLink href={links.certification} label="🏆 Enterprise Certification" />
              </div>
            </Block>
            <p className="text-[10px] text-[#64748B]">
              مستوى الاعتماد المرتبط (SRS-009): {def.certificationLevelHint}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function CrossLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-white/15 bg-black/25 px-2.5 py-1 text-xs text-[#EAF0FF] hover:bg-white/10"
    >
      {label}
    </Link>
  );
}

function KpiChip({ id }: { id: string }) {
  const def = getKpiDef(id);
  const links = buildKpiDeepLinks(id);
  return (
    <Link
      href={links.dashboard}
      className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-[#CBD5E1] hover:bg-white/10"
    >
      {def?.labelAr ?? id}
    </Link>
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
