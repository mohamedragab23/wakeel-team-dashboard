'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import * as XLSX from 'xlsx';
import Button from '@/components/ui-v2/Button';
import { cn } from '@/components/ui-v2/cn';

export type SupervisorExportRow = Record<string, string | number | null | undefined>;

export interface SupervisorTableSectionProps {
  title?: string;
  fileNameBase: string;
  sheetName?: string;
  getExportRows?: () => SupervisorExportRow[];
  onExportExcel?: () => void | Promise<void>;
  exportDisabled?: boolean;
  /** Use gray buttons on white/light cards (e.g. riders page). */
  toolbarOnLight?: boolean;
  className?: string;
  children: ReactNode;
}

export default function SupervisorTableSection({
  title,
  fileNameBase,
  sheetName = 'Sheet1',
  getExportRows,
  onExportExcel,
  exportDisabled = false,
  toolbarOnLight = false,
  className,
  children,
}: SupervisorTableSectionProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [placeholderHeight, setPlaceholderHeight] = useState(0);

  const openExpanded = useCallback(() => {
    const h = rootRef.current?.getBoundingClientRect().height ?? 0;
    setPlaceholderHeight(h);
    setExpanded(true);
  }, []);

  const closeExpanded = useCallback(() => setExpanded(false), []);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeExpanded();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded, closeExpanded]);

  useLayoutEffect(() => {
    if (!expanded) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [expanded]);

  const canExport = Boolean(onExportExcel || getExportRows);
  const runExport = useCallback(async () => {
    if (onExportExcel) {
      await onExportExcel();
      return;
    }
    if (!getExportRows) return;
    const rows = getExportRows();
    if (!rows.length) return;
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31) || 'Sheet1');
    const day = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `${fileNameBase}-${day}.xlsx`);
  }, [onExportExcel, getExportRows, sheetName, fileNameBase]);

  const lightBtn =
    'inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold transition-colors border border-gray-300 text-gray-800 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed';

  return (
    <>
      {expanded ? (
        <div
          className="w-full shrink-0"
          style={{ height: placeholderHeight }}
          aria-hidden
        />
      ) : null}

      <div
        ref={rootRef}
        className={cn(
          'flex flex-col gap-3 min-w-0',
          expanded &&
            'fixed inset-0 z-[10000] overflow-hidden bg-[#05070D] p-4 sm:p-6 text-[#EAF0FF]',
          className
        )}
      >
        <div
          className={cn(
            'flex flex-wrap items-center justify-between gap-2 shrink-0',
            expanded && 'border-b border-[rgba(255,255,255,0.10)] pb-3'
          )}
        >
          {title ? (
            <h3
              className={cn(
                'text-base font-semibold min-w-0 break-words',
                toolbarOnLight && !expanded ? 'text-gray-800' : 'text-[#EAF0FF]'
              )}
            >
              {title}
            </h3>
          ) : (
            <span />
          )}
          <div className="flex flex-wrap items-center gap-2">
            {!expanded ? (
              toolbarOnLight ? (
                <>
                  <button type="button" className={lightBtn} onClick={openExpanded}>
                    عرض كامل
                  </button>
                  <button
                    type="button"
                    className={cn(lightBtn, 'bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-700')}
                    onClick={() => void runExport()}
                    disabled={!canExport || exportDisabled}
                  >
                    تصدير Excel
                  </button>
                </>
              ) : (
                <>
                  <Button type="button" variant="secondary" onClick={openExpanded}>
                    عرض كامل
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => void runExport()}
                    disabled={!canExport || exportDisabled}
                  >
                    تصدير Excel
                  </Button>
                </>
              )
            ) : toolbarOnLight ? (
              <>
                <button
                  type="button"
                  className={cn(lightBtn, 'border-[rgba(255,255,255,0.2)] bg-[rgba(255,255,255,0.08)] text-[#EAF0FF]')}
                  onClick={() => void runExport()}
                  disabled={!canExport || exportDisabled}
                >
                  تصدير Excel
                </button>
                <button
                  type="button"
                  className={cn(lightBtn, 'border-[rgba(255,255,255,0.2)] bg-[rgba(255,255,255,0.12)] text-[#EAF0FF]')}
                  onClick={closeExpanded}
                >
                  إغلاق
                </button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => void runExport()}
                  disabled={!canExport || exportDisabled}
                >
                  تصدير Excel
                </Button>
                <Button type="button" variant="primary" onClick={closeExpanded}>
                  إغلاق
                </Button>
              </>
            )}
          </div>
        </div>

        <div
          className={cn(
            'min-h-0 min-w-0',
            expanded ? 'flex-1 overflow-auto rounded-lg border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.04)] p-2' : ''
          )}
        >
          {children}
        </div>
      </div>
    </>
  );
}
