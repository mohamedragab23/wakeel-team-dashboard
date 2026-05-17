'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

export type TextFilterOp = 'none' | 'values' | 'contains' | 'equals' | 'startsWith' | 'endsWith' | 'notContains';
export type NumFilterOp =
  | 'none'
  | 'values'
  | 'equals'
  | 'notEquals'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'between'
  | 'top10'
  | 'bottom10';

export type TextFilterState = { op: TextFilterOp; value: string; pickValues?: string[] | null };
export type NumFilterState = { op: NumFilterOp; value: string; value2: string; pickValues?: string[] | null };
export type AbsenceFilterState = {
  op: 'none' | 'equals' | 'values';
  value: '' | '1' | '0' | 'نعم' | 'لا';
  pickValues?: string[] | null;
};

type Variant = 'text' | 'number' | 'absence';

export interface RidersExcelColumnMenuProps {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  variant: Variant;
  /** Distinct values in column (Excel-style checklist) */
  valueOptions?: string[];
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

function isValueFilterActive(pickValues: string[] | null | undefined): boolean {
  return pickValues !== null && pickValues !== undefined;
}

function ValueChecklist({
  options,
  pickValues,
  onChange,
}: {
  options: string[];
  pickValues: string[] | null | undefined;
  onChange: (pick: string[] | null) => void;
}) {
  const [search, setSearch] = useState('');
  const allSelected = pickValues === null || pickValues === undefined;
  const selectedSet = useMemo(() => new Set(pickValues ?? options), [pickValues, options]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, search]);

  const toggle = (label: string) => {
    const base = allSelected ? [...options] : [...(pickValues ?? [])];
    const set = new Set(base);
    if (set.has(label)) set.delete(label);
    else set.add(label);
    const next = Array.from(set);
    if (next.length === 0) onChange([]);
    else if (next.length === options.length) onChange(null);
    else onChange(next);
  };

  const selectAll = () => onChange(null);
  const clearAll = () => onChange([]);

  return (
    <div className="space-y-2">
      <div className="font-semibold text-gray-900 text-[13px]">تحديد القيم</div>
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="بحث في القائمة…"
        className="w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      <div className="flex flex-wrap gap-1.5 text-[11px]">
        <button
          type="button"
          onClick={selectAll}
          className="rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-gray-800 hover:bg-gray-100"
        >
          تحديد الكل
        </button>
        <button
          type="button"
          onClick={clearAll}
          className="rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-gray-800 hover:bg-gray-100"
        >
          إلغاء الكل
        </button>
        {!allSelected && pickValues && (
          <span className="self-center text-gray-500 px-1">
            {pickValues.length} / {options.length}
          </span>
        )}
      </div>
      <div className="max-h-44 overflow-y-auto rounded-md border border-gray-200 bg-gray-50/80">
        {filtered.length === 0 ? (
          <p className="p-2 text-center text-gray-500 text-xs">لا توجد قيم مطابقة</p>
        ) : (
          <ul className="py-1">
            {filtered.map((label) => {
              const checked = allSelected || selectedSet.has(label);
              return (
                <li key={label}>
                  <label className="flex cursor-pointer items-center gap-2 px-2.5 py-1.5 hover:bg-white text-sm text-gray-900">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(label)}
                      className="h-4 w-4 shrink-0 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="truncate" title={label}>
                      {label}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export function RidersExcelColumnMenu({
  isOpen,
  onOpen,
  onClose,
  variant,
  valueOptions = [],
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
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const updatePanelPosition = () => {
    const btn = btnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const width = Math.min(300, Math.max(260, typeof window !== 'undefined' ? window.innerWidth - 16 : 300));
    let left = rect.right - width;
    left = Math.max(8, Math.min(left, (typeof window !== 'undefined' ? window.innerWidth : width) - width - 8));
    const top = rect.bottom + 2;
    setPanelPos({ top, left, width });
  };

  useLayoutEffect(() => {
    if (!isOpen) {
      setPanelPos(null);
      setShowAdvanced(false);
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
      if (btnRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      onClose();
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [isOpen, onClose]);

  const hasValuePick =
    variant === 'text'
      ? isValueFilterActive(textFilter?.pickValues)
      : variant === 'number'
        ? isValueFilterActive(numFilter?.pickValues)
        : isValueFilterActive(absenceFilter?.pickValues);

  const hasAdvanced =
    variant === 'text'
      ? textFilter && textFilter.op !== 'none' && textFilter.op !== 'values'
      : variant === 'number'
        ? numFilter && numFilter.op !== 'none' && numFilter.op !== 'values'
        : absenceFilter && absenceFilter.op === 'equals';

  const hasActive = hasValuePick || hasAdvanced || !!sortDirection;

  const applyValuePick = (pick: string[] | null) => {
    if (variant === 'text' && textFilter && onTextChange) {
      onTextChange({
        ...textFilter,
        op: pick === null ? 'none' : 'values',
        pickValues: pick,
      });
    } else if (variant === 'number' && numFilter && onNumChange) {
      onNumChange({
        ...numFilter,
        op: pick === null ? 'none' : 'values',
        pickValues: pick,
      });
    } else if (variant === 'absence' && absenceFilter && onAbsenceChange) {
      onAbsenceChange({
        ...absenceFilter,
        op: pick === null ? 'none' : 'values',
        pickValues: pick,
      });
    }
  };

  const currentPick =
    variant === 'text'
      ? textFilter?.pickValues
      : variant === 'number'
        ? numFilter?.pickValues
        : absenceFilter?.pickValues;

  return (
    <div className="relative inline-flex align-bottom">
      <button
        ref={btnRef}
        type="button"
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        onClick={(e) => {
          e.stopPropagation();
          if (isOpen) onClose();
          else onOpen();
        }}
        className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border text-[10px] font-bold leading-none transition-colors ${
          hasActive || sortDirection
            ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
            : 'border-gray-400 bg-white text-gray-700 hover:border-blue-500 hover:bg-blue-50'
        }`}
      >
        ▾
      </button>
      {isOpen && panelPos && (
        <div
          ref={panelRef}
          className="fixed z-[200] rounded-lg border-2 border-gray-300 bg-white text-right shadow-2xl"
          dir="rtl"
          style={{
            top: panelPos.top,
            left: panelPos.left,
            width: panelPos.width,
            maxHeight: 'min(75vh, 32rem)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="shrink-0 border-b border-gray-200 bg-gray-100 px-3 py-2">
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-600">فرز</div>
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => onSortAsc()}
                className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                  sortDirection === 'asc' ? 'bg-blue-600 text-white' : 'bg-white text-gray-800 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                أ → ي
              </button>
              <button
                type="button"
                onClick={() => onSortDesc()}
                className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                  sortDirection === 'desc' ? 'bg-blue-600 text-white' : 'bg-white text-gray-800 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                ي → أ
              </button>
              {onClearSort && sortDirection && (
                <button
                  type="button"
                  onClick={() => onClearSort()}
                  className="rounded-md px-2 py-1 text-xs text-gray-600 underline hover:text-gray-900"
                >
                  إلغاء الفرز
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 text-xs">
            {valueOptions.length > 0 ? (
              <ValueChecklist options={valueOptions} pickValues={currentPick} onChange={applyValuePick} />
            ) : (
              <p className="text-gray-500 text-center py-2">لا توجد قيم لعرضها</p>
            )}

            {variant === 'text' && textFilter && onTextChange && (
              <div className="mt-3 border-t border-gray-200 pt-2">
                <button
                  type="button"
                  className="flex w-full items-center justify-between text-[13px] font-semibold text-gray-800"
                  onClick={() => setShowAdvanced((s) => !s)}
                >
                  <span>فلتر متقدم (نص)</span>
                  <span>{showAdvanced ? '▲' : '▼'}</span>
                </button>
                {showAdvanced && (
                  <div className="mt-2 space-y-2">
                    <select
                      value={textFilter.op === 'values' ? 'none' : textFilter.op}
                      onChange={(e) =>
                        onTextChange({
                          ...textFilter,
                          op: e.target.value as TextFilterOp,
                          pickValues: undefined,
                        })
                      }
                      className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm"
                    >
                      <option value="none">بدون</option>
                      <option value="contains">يحتوي على…</option>
                      <option value="equals">يساوي…</option>
                      <option value="startsWith">يبدأ بـ…</option>
                      <option value="endsWith">ينتهي بـ…</option>
                      <option value="notContains">لا يحتوي على…</option>
                    </select>
                    {textFilter.op !== 'none' && textFilter.op !== 'values' && (
                      <input
                        type="text"
                        value={textFilter.value}
                        onChange={(e) => onTextChange({ ...textFilter, value: e.target.value })}
                        placeholder="القيمة"
                        className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                      />
                    )}
                  </div>
                )}
              </div>
            )}

            {variant === 'number' && numFilter && onNumChange && (
              <div className="mt-3 border-t border-gray-200 pt-2">
                <button
                  type="button"
                  className="flex w-full items-center justify-between text-[13px] font-semibold text-gray-800"
                  onClick={() => setShowAdvanced((s) => !s)}
                >
                  <span>فلتر متقدم (أرقام)</span>
                  <span>{showAdvanced ? '▲' : '▼'}</span>
                </button>
                {showAdvanced && (
                  <div className="mt-2 space-y-2">
                    <select
                      value={numFilter.op === 'values' ? 'none' : numFilter.op}
                      onChange={(e) => {
                        const op = e.target.value as NumFilterOp;
                        const next = { ...numFilter, op, pickValues: undefined };
                        if (op === 'top10' || op === 'bottom10') next.value = '10';
                        onNumChange(next);
                      }}
                      className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm"
                    >
                      <option value="none">بدون</option>
                      <option value="equals">يساوي…</option>
                      <option value="notEquals">لا يساوي…</option>
                      <option value="gt">أكبر من…</option>
                      <option value="gte">أكبر أو يساوي…</option>
                      <option value="lt">أصغر من…</option>
                      <option value="lte">أصغر أو يساوي…</option>
                      <option value="between">بين… و…</option>
                      <option value="top10">أعلى N</option>
                      <option value="bottom10">أدنى N</option>
                    </select>
                    {numFilter.op !== 'none' &&
                      numFilter.op !== 'values' &&
                      numFilter.op !== 'top10' &&
                      numFilter.op !== 'bottom10' && (
                        <input
                          type="number"
                          step="any"
                          value={numFilter.value}
                          onChange={(e) => onNumChange({ ...numFilter, value: e.target.value })}
                          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                        />
                      )}
                    {numFilter.op === 'between' && (
                      <input
                        type="number"
                        step="any"
                        value={numFilter.value2}
                        onChange={(e) => onNumChange({ ...numFilter, value2: e.target.value })}
                        placeholder="إلى"
                        className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                      />
                    )}
                    {(numFilter.op === 'top10' || numFilter.op === 'bottom10') && (
                      <input
                        type="number"
                        min={1}
                        value={numFilter.value || '10'}
                        onChange={(e) => onNumChange({ ...numFilter, value: e.target.value })}
                        className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                      />
                    )}
                  </div>
                )}
              </div>
            )}

            {variant === 'absence' && absenceFilter && onAbsenceChange && valueOptions.length === 0 && (
              <div className="mt-3 space-y-2">
                <div className="font-semibold text-gray-800">الغياب</div>
                <select
                  value={absenceFilter.op === 'none' ? 'none' : absenceFilter.value}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === 'none') onAbsenceChange({ op: 'none', value: '' });
                    else onAbsenceChange({ op: 'equals', value: v as '1' | '0' | 'نعم' | 'لا' });
                  }}
                  className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                >
                  <option value="none">الكل</option>
                  <option value="1">1</option>
                  <option value="0">0</option>
                </select>
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-gray-200 bg-gray-50 p-2">
            <button
              type="button"
              className="w-full rounded-md border border-gray-300 bg-white py-2 text-sm font-medium text-gray-800 hover:bg-gray-100"
              onClick={() => {
                if (variant === 'text' && onTextChange) onTextChange(defaultTextFilter());
                if (variant === 'number' && onNumChange) onNumChange(defaultNumFilter());
                if (variant === 'absence' && onAbsenceChange) onAbsenceChange(defaultAbsenceFilter());
              }}
            >
              مسح فلتر هذا العمود
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
