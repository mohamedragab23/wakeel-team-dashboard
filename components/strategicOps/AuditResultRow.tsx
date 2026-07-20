'use client';

import type { AuditResult } from '@/lib/strategicOps/audit';

type Props = {
  result: AuditResult;
  onClick?: (result: AuditResult) => void;
};

function statusStyles(status: AuditResult['status']): string {
  if (status === 'PASS') return 'bg-emerald-500/15 text-emerald-200 border-emerald-500/30';
  if (status === 'WARN') return 'bg-amber-500/15 text-amber-200 border-amber-500/30';
  return 'bg-red-500/15 text-red-200 border-red-500/30';
}

function statusIcon(status: AuditResult['status']): string {
  if (status === 'PASS') return '✓';
  if (status === 'WARN') return '⚠';
  return '✗';
}

export function AuditResultRow({ result, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={() => onClick?.(result)}
      className="w-full text-right rounded-xl border border-white/10 bg-black/20 hover:bg-white/5 px-3 py-2.5 transition-colors"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-bold ${statusStyles(result.status)}`}
          >
            {statusIcon(result.status)} {result.status}
          </span>
          <span className="text-sm text-[#EAF0FF] truncate">{result.kpi}</span>
        </div>
        <div className="text-[11px] text-[#94A3B8] flex flex-wrap gap-3">
          <span>
            Expected: <strong className="text-[#EAF0FF]">{result.expected}{result.unit}</strong>
          </span>
          <span>
            Calculated: <strong className="text-[#EAF0FF]">{result.calculated}{result.unit}</strong>
          </span>
          <span>
            Diff: {result.diff}
            {result.unit} ({result.pctDiff}%)
          </span>
        </div>
      </div>
    </button>
  );
}
