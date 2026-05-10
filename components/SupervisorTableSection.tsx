'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
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

function getFullscreenElement(): Element | null {
  const d = document as Document & { webkitFullscreenElement?: Element | null };
  return document.fullscreenElement ?? d.webkitFullscreenElement ?? null;
}

async function requestOverlayFullscreen(el: HTMLElement): Promise<void> {
  const anyEl = el as HTMLElement & { webkitRequestFullscreen?: () => void };
  try {
    if (el.requestFullscreen) {
      await el.requestFullscreen();
      return;
    }
    if (anyEl.webkitRequestFullscreen) {
      anyEl.webkitRequestFullscreen();
    }
  } catch {
    /* سياسة المتصفح أو رفض المستخدم — نبقى على ملء نافذة العرض فقط */
  }
}

async function exitOverlayFullscreen(): Promise<void> {
  const d = document as Document & { webkitExitFullscreen?: () => void };
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    if (d.webkitExitFullscreen) {
      d.webkitExitFullscreen();
    }
  } catch {
    /* ignore */
  }
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

  const closeExpanded = useCallback(() => {
    void exitOverlayFullscreen();
    setExpanded(false);
  }, []);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeExpanded();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded, closeExpanded]);

  /** خروج المستخدم من Fullscreen عبر F11 أو زر المتصفح */
  useEffect(() => {
    if (!expanded) return;
    const onFsChange = () => {
      const el = rootRef.current;
      if (!el) return;
      const fsEl = getFullscreenElement();
      if (fsEl && fsEl !== el) return;
      if (!fsEl) setExpanded(false);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, [expanded]);

  useLayoutEffect(() => {
    if (!expanded) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [expanded]);

  useLayoutEffect(() => {
    if (!expanded) return;
    const el = rootRef.current;
    if (!el) return;
    void requestOverlayFullscreen(el);
    return () => {
      if (getFullscreenElement() === el) {
        void exitOverlayFullscreen();
      }
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

  const expandedShellClass = cn(
    'flex flex-col gap-3 min-h-0 min-w-0',
    'fixed top-0 left-0 right-0 bottom-0 z-[2147483646]',
    'h-[100dvh] w-screen max-w-[100vw] overflow-hidden',
    'bg-[#05070D] p-4 sm:p-6 text-[#EAF0FF]',
    'overscroll-none touch-pan-y'
  );

  const collapsedShellClass = cn('flex flex-col gap-3 min-w-0 min-h-0', className);

  const toolbar = (
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
  );

  const scrollArea = (
    <div
      className={cn(
        'min-h-0 min-w-0 flex-1',
        expanded ? 'overflow-auto rounded-lg border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.04)] p-2' : ''
      )}
    >
      {children}
    </div>
  );

  const collapsed = (
    <div ref={rootRef} className={collapsedShellClass}>
      {toolbar}
      {scrollArea}
    </div>
  );

  const overlay = (
    <div ref={rootRef} className={expandedShellClass} role="dialog" aria-modal="true" aria-label={title || 'جدول بعرض كامل'}>
      {toolbar}
      {scrollArea}
    </div>
  );

  return (
    <>
      {expanded ? (
        <div className="w-full shrink-0" style={{ height: placeholderHeight }} aria-hidden />
      ) : null}
      {expanded && typeof document !== 'undefined'
        ? createPortal(overlay, document.body)
        : collapsed}
    </>
  );
}
