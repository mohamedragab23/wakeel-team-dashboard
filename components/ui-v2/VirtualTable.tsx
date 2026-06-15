'use client';

import { useMemo, useRef, useState, type ReactNode } from 'react';
import { getVirtualScrollItems } from '@/lib/performanceOptimizer';

interface VirtualTableProps<T> {
  items: T[];
  rowHeight?: number;
  maxHeight?: number;
  header: ReactNode;
  renderRow: (item: T, index: number) => ReactNode;
  emptyMessage?: string;
  className?: string;
}

export default function VirtualTable<T>({
  items,
  rowHeight = 52,
  maxHeight = 560,
  header,
  renderRow,
  emptyMessage = 'لا توجد بيانات',
  className = '',
}: VirtualTableProps<T>) {
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const virtual = useMemo(
    () => getVirtualScrollItems(items, rowHeight, scrollTop, maxHeight),
    [items, rowHeight, scrollTop, maxHeight]
  );

  if (items.length === 0) {
    return (
      <div className={`rounded-xl border border-[rgba(255,255,255,0.10)] overflow-hidden ${className}`}>
        {header}
        <div className="p-8 text-center text-[rgba(234,240,255,0.75)]">{emptyMessage}</div>
      </div>
    );
  }

  const useVirtual = items.length > 40;

  if (!useVirtual) {
    return (
      <div className={`rounded-xl border border-[rgba(255,255,255,0.10)] overflow-hidden ${className}`}>
        {header}
        <div className="overflow-x-auto">{items.map((item, i) => renderRow(item, i))}</div>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border border-[rgba(255,255,255,0.10)] overflow-hidden ${className}`}>
      {header}
      <div
        ref={containerRef}
        className="overflow-auto"
        style={{ maxHeight }}
        onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
      >
        <div style={{ height: virtual.totalHeight, position: 'relative' }}>
          <div style={{ transform: `translateY(${virtual.offsetY}px)` }}>
            {virtual.visibleItems.map((item, i) => renderRow(item, virtual.startIndex + i))}
          </div>
        </div>
      </div>
    </div>
  );
}
