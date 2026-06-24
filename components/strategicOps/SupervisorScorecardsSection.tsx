'use client';

import { useMemo, useState } from 'react';
import type {
  SupervisorScorecard,
  SupervisorScorecardDrillDown,
  SupervisorScorecardsReport,
} from '@/lib/strategicOps/controlTower/types';
import { STRATEGIC_OPS_LABELS as L } from '@/lib/strategicOps/labelsAr';
import { formatKpiTrendSummary } from '@/lib/strategicOps/controlTower/kpiRootCause';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-[rgba(255,255,255,0.04)] p-5 space-y-4">
      <h2 className="text-lg font-semibold text-[#EAF0FF] border-b border-white/10 pb-2">{title}</h2>
      {children}
    </section>
  );
}

function ScorecardTable({
  rows,
  selectedCode,
  onSelect,
}: {
  rows: SupervisorScorecard[];
  selectedCode: string | null;
  onSelect: (code: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-[#CBD5E1]">
        <thead>
          <tr className="border-b border-white/10 text-[#94A3B8]">
            <th className="text-right p-2">#</th>
            <th className="text-right p-2">{L.supervisorLabel}</th>
            <th className="text-right p-2">Team</th>
            <th className="text-right p-2">Active</th>
            <th className="text-right p-2">No Show %</th>
            <th className="text-right p-2">Ach %</th>
            <th className="text-right p-2">Util %</th>
            <th className="text-right p-2">Lost H/day</th>
            <th className="text-right p-2">Lost Target</th>
            <th className="text-right p-2">Score</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr
              key={s.code}
              onClick={() => onSelect(s.code)}
              className={`border-b border-white/5 cursor-pointer transition-colors ${
                selectedCode === s.code ? 'bg-cyan-500/15' : 'hover:bg-white/5'
              }`}
            >
              <td className="p-2 font-bold text-[#EAF0FF]">{s.scorecardRank}</td>
              <td className="p-2 text-[#EAF0FF]">{s.name}</td>
              <td className="p-2">{s.teamSize}</td>
              <td className="p-2">{s.activeRiders}</td>
              <td className="p-2">{s.noShowPercent}%</td>
              <td className="p-2">{s.achievementPercent}%</td>
              <td className="p-2">{s.utilizationPercent}%</td>
              <td className="p-2">{s.lostHoursDaily}</td>
              <td className="p-2">{s.lostTargetDaily}</td>
              <td className="p-2 text-emerald-300">{s.compositeScore}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DiagnosisPanel({ card }: { card: SupervisorScorecard }) {
  const d = card.bottomPerformerDiagnosis;
  if (!d) return null;
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-2 text-sm">
      <p className="text-amber-200 font-medium">{L.scorecardWhyLow}</p>
      <p className="text-[#EAF0FF]">{d.whyAr}</p>
      <p className="text-amber-200/90 font-medium mt-2">{L.scorecardMissingHours}</p>
      <p className="text-[#EAF0FF]">{d.missingHoursLabelAr}</p>
      <p className="text-amber-200/90 font-medium mt-2">{L.scorecardMainIssue}</p>
      <p className="text-[#EAF0FF]">{d.mainIssueAr}</p>
      <p className="text-emerald-300/90 font-medium mt-2">{L.recommendedAction}</p>
      <p className="text-emerald-200">{d.recommendedActionAr}</p>
    </div>
  );
}

function DrillDownPanel({ drillDown }: { drillDown: SupervisorScorecardDrillDown }) {
  return (
    <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-4 space-y-4">
      <h3 className="text-base font-semibold text-[#EAF0FF]">
        {L.scorecardDrillDown}: {drillDown.supervisorName}
      </h3>

      <div>
        <h4 className="text-sm font-medium text-[#94A3B8] mb-2">{L.scorecardKpiBreakdown}</h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="rounded-lg bg-white/5 p-2">
            <span className="text-[#64748B]">Team</span>
            <p className="text-[#EAF0FF] font-bold">{drillDown.kpiBreakdown.teamSize}</p>
          </div>
          <div className="rounded-lg bg-white/5 p-2">
            <span className="text-[#64748B]">Active</span>
            <p className="text-[#EAF0FF] font-bold">{drillDown.kpiBreakdown.activeRiders}</p>
          </div>
          <div className="rounded-lg bg-white/5 p-2">
            <span className="text-[#64748B]">No Show</span>
            <p className="text-[#EAF0FF] font-bold">{drillDown.kpiBreakdown.noShowPercent}%</p>
          </div>
          <div className="rounded-lg bg-white/5 p-2">
            <span className="text-[#64748B]">Achievement</span>
            <p className="text-[#EAF0FF] font-bold">{drillDown.kpiBreakdown.achievementPercent}%</p>
          </div>
          <div className="rounded-lg bg-white/5 p-2">
            <span className="text-[#64748B]">Utilization</span>
            <p className="text-[#EAF0FF] font-bold">{drillDown.kpiBreakdown.utilizationPercent}%</p>
          </div>
          <div className="rounded-lg bg-white/5 p-2">
            <span className="text-[#64748B]">Lost H/day</span>
            <p className="text-[#EAF0FF] font-bold">{drillDown.kpiBreakdown.lostHoursDaily}</p>
          </div>
          <div className="rounded-lg bg-white/5 p-2">
            <span className="text-[#64748B]">Lost Target</span>
            <p className="text-[#EAF0FF] font-bold">{drillDown.kpiBreakdown.lostTargetDaily}</p>
          </div>
          <div className="rounded-lg bg-white/5 p-2">
            <span className="text-[#64748B]">Resignations</span>
            <p className="text-[#EAF0FF] font-bold">{drillDown.kpiBreakdown.resignations}</p>
          </div>
        </div>
      </div>

      {drillDown.rootCauses.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-[#94A3B8] mb-2">{L.rootCauseAnalysis}</h4>
          <div className="space-y-2">
            {drillDown.rootCauses.map((rc) => (
              <div key={rc.kpiKey} className="rounded-lg border border-white/10 bg-white/5 p-3">
                <p className="font-medium text-[#EAF0FF]">{rc.kpiLabelAr}</p>
                <p className="text-xs text-[#94A3B8] mt-1">{rc.summaryAr}</p>
                <p className="text-xs text-cyan-300/80 mt-1">{formatKpiTrendSummary(rc.trend)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {drillDown.riderImpact.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-[#94A3B8] mb-2">{L.scorecardRiderImpact}</h4>
          <ul className="text-sm space-y-1 text-[#CBD5E1]">
            {drillDown.riderImpact.slice(0, 8).map((r) => (
              <li key={r.code}>
                {r.name} — {L.lostHoursCol}: {r.lostHoursDaily} · {L.noShowCol}: {r.noShowCount}
              </li>
            ))}
          </ul>
        </div>
      )}

      {drillDown.executiveActions.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-[#94A3B8] mb-2">{L.scorecardLinkedActions}</h4>
          <div className="space-y-2">
            {drillDown.executiveActions.map((a) => (
              <div key={a.id} className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm">
                <p className="text-[#EAF0FF]">{a.problemAr}</p>
                <p className="text-emerald-300/90 mt-1">
                  +{a.deduplicatedRecoveryHours} {L.recoveryPerDay} — {a.actionAr}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

type Tab = 'top' | 'bottom' | 'all';

export default function SupervisorScorecardsSection({
  scorecards,
}: {
  scorecards: SupervisorScorecardsReport;
}) {
  const [tab, setTab] = useState<Tab>('top');
  const [selectedCode, setSelectedCode] = useState<string | null>(null);

  const displayRows = useMemo(() => {
    if (tab === 'top') return scorecards.topPerformers;
    if (tab === 'bottom') return scorecards.bottomPerformers;
    return scorecards.all;
  }, [tab, scorecards]);

  const selectedCard =
    selectedCode != null
      ? scorecards.all.find((c) => c.code === selectedCode) ?? null
      : null;
  const drillDown =
    selectedCode != null ? scorecards.drillDownByCode[selectedCode] ?? null : null;

  return (
    <Section title={L.supervisorScorecards}>
      <p className="text-sm text-[#94A3B8]">{L.supervisorScorecardsSubtitle}</p>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['top', L.scorecardTop5],
            ['bottom', L.scorecardBottom5],
            ['all', L.scorecardAllRankings],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setTab(key);
              setSelectedCode(null);
            }}
            className={`rounded-lg px-3 py-1.5 text-sm border ${
              tab === key
                ? 'border-purple-500 bg-purple-500/20 text-purple-200'
                : 'border-white/10 text-[#94A3B8] hover:bg-white/5'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <ScorecardTable rows={displayRows} selectedCode={selectedCode} onSelect={setSelectedCode} />

      {tab === 'bottom' &&
        scorecards.bottomPerformers.map((c) => (
          <DiagnosisPanel key={c.code} card={c} />
        ))}

      {selectedCard && drillDown && (
        <>
          {tab !== 'bottom' && selectedCard.bottomPerformerDiagnosis && (
            <DiagnosisPanel card={selectedCard} />
          )}
          <DrillDownPanel drillDown={drillDown} />
        </>
      )}

      {!selectedCode && (
        <p className="text-xs text-[#64748B]">{L.scorecardClickHint}</p>
      )}
    </Section>
  );
}
