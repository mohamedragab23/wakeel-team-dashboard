'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export type TextFilterOp = 'none' | 'contains' | 'equals' | 'startsWith' | 'endsWith' | 'notContains';
export type NumFilterOp =
  | 'none'
  | 'equals'
  | 'notEquals'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'between'
  | 'top10'
  | 'bottom10';

export type TextFilterState = { op: TextFilterOp; value: string };
export type NumFilterState = { op: NumFilterOp; value: string; value2: string };
export type AbsenceFilterState = { op: 'none' | 'equals'; value: '' | 'نعم' | 'لا' };

type Variant = 'text' | 'number' | 'absence';

export interface RidersExcelColumnMenuProps {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  variant: Variant;
  textFilter?: TextFilterState;
  numFilter?: NumFilterState;
  absenceFilter?: AbsenceFilterState;
  onTextChange?: (f: TextFilterState) => void;
  onNumChange?: (f: NumFilterState) => void;
  onAbsenceChange?: (f: AbsenceFilterState) => void;
  onSortAsc: () => void;
  onSortDesc: () => void;
  onClearSort?: () => void;
  sortDirection: 'asc' | 'desc' | null;
  ariaLabel: string;
}

export function defaultTextFilter(): TextFilterState {
  return { op: 'none', value: '' };
}

export function defaultNumFilter(): NumFilterState {
  return { op: 'none', value: '', value2: '' };
}

export function defaultAbsenceFilter(): AbsenceFilterState {
  return { op: 'none', value: '' };
}

export function RidersExcelColumnMenu({
  isOpen,
  onOpen,
  onClose,
  variant,
  textFilter,
  numFilter,
  absenceFilter,
  onTextChange,
  onNumChange,
  onAbsenceChange,
  onSortAsc,
  onSortDesc,
  onClearSort,
  sortDirection,
  ariaLabel,
}: RidersExcelColumnMenuProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const updatePanelPosition = () => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const maxW = Math.min(288, typeof window !== 'undefined' ? window.innerWidth - 16 : 288);
    const left = Math.max(8, rect.right - maxW);
    const top = rect.bottom + 6;
    setPanelPos({ top, left, width: maxW });
  };

  useLayoutEffect(() => {
    if (!isOpen) {
      setPanelPos(null);
      return;
    }
    updatePanelPosition();
    const onWin = () => updatePanelPosition();
    window.addEventListener('resize', onWin);
    window.addEventListener('scroll', onWin, true);
    return () => {
      window.removeEventListener('resize', onWin);
      window.removeEventListener('scroll', onWin, true);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      const wrap = wrapRef.current;
      const panel = panelRef.current;
      if (wrap && wrap.contains(t)) return;
      if (panel && panel.contains(t)) return;
      onClose();
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [isOpen, onClose]);

  const hasActive =
    variant === 'text'
      ? textFilter && textFilter.op !== 'none'
      : variant === 'number'
        ? numFilter && numFilter.op !== 'none'
        : absenceFilter && absenceFilter.op !== 'none';

  return (
    <div className="relative inline-flex" ref={wrapRef}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        onClick={(e) => {
          e.stopPropagation();
          if (isOpen) onClose();
          else onOpen();
        }}
        className={`inline-flex h-7 w-7 items-center justify-center rounded border text-xs font-bold transition-colors ${
          hasActive || sortDirection
            ? 'border-blue-500 bg-blue-50 text-blue-700'
            : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
        }`}
      >
        ▼
      </button>
      {isOpen && panelPos && (
        <div
          ref={panelRef}
          className="fixed z-[80] rounded-lg border border-gray-200 bg-white p-3 text-right text-xs shadow-xl"
          dir="rtl"
          style={{
            top: panelPos.top,
            left: panelPos.left,
            width: panelPos.width,
            maxHeight: 'min(70vh, 28rem)',
            overflowY: 'auto',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-2 border-b border-gray-100 pb-2">
            <div className="mb-1 font-semibold text-gray-800">فرز</div>
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => onSortAsc()}
                className={`rounded px-2 py-1 ${sortDirection === 'asc' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800 hover:bg-gray-200'}`}
              >
                تصاعدي
              </button>
              <button
                type="button"
                onClick={() => onSortDesc()}
                className={`rounded px-2 py-1 ${sortDirection === 'desc' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800 hover:bg-gray-200'}`}
              >
                تنازلي
              </button>
              {onClearSort && sortDirection && (
                <button
                  type="button"
                  onClick={() => onClearSort()}
                  className="rounded px-2 py-1 text-gray-600 underline decoration-gray-400 hover:bg-gray-100"
                >
                  إلغاء الفرز
                </button>
              )}
            </div>
          </div>

          {variant === 'text' && textFilter && onTextChange && (
            <div className="space-y-2">
              <div className="font-semibold text-gray-800">فلتر النص</div>
              <select
                value={textFilter.op}
                onChange={(e) =>
                  onTextChange({ ...textFilter, op: e.target.value as TextFilterOp })
                }
                className="w-full rounded border border-gray-300 bg-white px-2 py-1.5"
              >
                <option value="none">(بدون فلتر)</option>
                <option value="contains">يحتوي على…</option>
                <option value="equals">يساوي…</option>
                <option value="startsWith">يبدأ بـ…</option>
                <option value="endsWith">ينتهي بـ…</option>
                <option value="notContains">لا يحتوي على…</option>
              </select>
              {textFilter.op !== 'none' && (
                <input
                  type="text"
                  value={textFilter.value}
                  onChange={(e) => onTextChange({ ...textFilter, value: e.target.value })}
                  placeholder="القيمة"
                  className="w-full rounded border border-gray-300 px-2 py-1.5"
                />
              )}
            </div>
          )}

          {variant === 'number' && numFilter && onNumChange && (
            <div className="space-y-2">
              <div className="font-semibold text-gray-800">فلتر الأرقام</div>
              <select
                value={numFilter.op}
                onChange={(e) => {
                  const op = e.target.value as NumFilterOp;
                  const next = { ...numFilter, op };
                  if (op === 'top10' || op === 'bottom10') {
                    next.value = '10';
                  }
                  onNumChange(next);
                }}
                className="w-full rounded border border-gray-300 bg-white px-2 py-1.5"
              >
                <option value="none">(بدون فلتر)</option>
                <option value="equals">يساوي…</option>
                <option value="notEquals">لا يساوي…</option>
                <option value="gt">أكبر من…</option>
                <option value="gte">أكبر أو يساوي…</option>
                <option value="lt">أصغر من…</option>
                <option value="lte">أصغر أو يساوي…</option>
                <option value="between">بين… و…</option>
                <option value="top10">أعلى N (قيمة)</option>
                <option value="bottom10">أدنى N (قيمة)</option>
              </select>
              {numFilter.op !== 'none' && numFilter.op !== 'top10' && numFilter.op !== 'bottom10' && (
                <input
                  type="number"
                  step="any"
                  value={numFilter.value}
                  onChange={(e) => onNumChange({ ...numFilter, value: e.target.value })}
                  placeholder="رقم"
                  className="w-full rounded border border-gray-300 px-2 py-1.5"
                />
              )}
              {numFilter.op === 'between' && (
                <input
                  type="number"
                  step="any"
                  value={numFilter.value2}
                  onChange={(e) => onNumChange({ ...numFilter, value2: e.target.value })}
                  placeholder="وإلى"
                  className="w-full rounded border border-gray-300 px-2 py-1.5"
                />
              )}
              {(numFilter.op === 'top10' || numFilter.op === 'bottom10') && (
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={numFilter.value || '10'}
                  onChange={(e) => onNumChange({ ...numFilter, value: e.target.value })}
                  placeholder="N (مثلاً 10)"
                  className="w-full rounded border border-gray-300 px-2 py-1.5"
                />
              )}
            </div>
          )}

          {variant === 'absence' && absenceFilter && onAbsenceChange && (
            <div className="space-y-2">
              <div className="font-semibold text-gray-800">الغياب</div>
              <select
                value={absenceFilter.op === 'none' ? 'none' : absenceFilter.value}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === 'none') onAbsenceChange({ op: 'none', value: '' });
                  else onAbsenceChange({ op: 'equals', value: v as 'نعم' | 'لا' });
                }}
                className="w-full rounded border border-gray-300 bg-white px-2 py-1.5"
              >
                <option value="none">الكل</option>
                <option value="نعم">نعم</option>
                <option value="لا">لا</option>
              </select>
            </div>
          )}

          <button
            type="button"
            className="mt-3 w-full rounded border border-gray-200 py-1.5 text-gray-700 hover:bg-gray-50"
            onClick={() => {
              if (variant === 'text' && onTextChange) onTextChange(defaultTextFilter());
              if (variant === 'number' && onNumChange) onNumChange(defaultNumFilter());
              if (variant === 'absence' && onAbsenceChange) onAbsenceChange(defaultAbsenceFilter());
            }}
          >
            مسح فلتر هذا العمود
          </button>
        </div>
      )}
    </div>
  );
}
