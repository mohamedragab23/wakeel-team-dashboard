'use client';

import { cn } from './cn';

export type TabItem<T extends string> = {
  value: T;
  label: string;
};

type Props<T extends string> = {
  items: Array<TabItem<T>>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
};

export default function Tabs<T extends string>({ items, value, onChange, className }: Props<T>) {
  return (
    <div
      className={cn(
        'inline-flex rounded-[var(--v2-radius-xl)] border border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.04)] p-1',
        className
      )}
      role="tablist"
      aria-label="Tabs"
    >
      {items.map((it) => {
        const active = it.value === value;
        return (
          <button
            key={it.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(it.value)}
            className={cn(
              'px-3 sm:px-4 py-2 rounded-[var(--v2-radius-lg)] text-xs sm:text-sm font-semibold transition-all',
              active
                ? 'bg-gradient-to-l from-[color:var(--v2-accent-cyan)] to-[color:var(--v2-accent-purple)] text-black shadow-[var(--v2-shadow-glow)]'
                : 'text-[rgba(234,240,255,0.70)] hover:text-[#EAF0FF]'
            )}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

