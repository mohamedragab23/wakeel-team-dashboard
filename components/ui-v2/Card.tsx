'use client';

import type { ReactNode } from 'react';
import { cn } from './cn';

type Props = {
  title?: ReactNode;
  subtitle?: ReactNode;
  rightSlot?: ReactNode;
  children?: ReactNode;
  className?: string;
};

export default function Card({ title, subtitle, rightSlot, children, className }: Props) {
  return (
    <section
      className={cn(
        'rounded-[var(--v2-radius-xl)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] shadow-[var(--v2-shadow-soft)]',
        'border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.06)]',
        'backdrop-blur-md',
        className
      )}
    >
      {(title || subtitle || rightSlot) && (
        <header className="flex items-start justify-between gap-3 px-4 sm:px-5 py-4 border-b border-[color:var(--v2-border)] border-b-[rgba(255,255,255,0.10)]">
          <div className="min-w-0">
            {title && (
              <h3 className="text-[#EAF0FF] font-medium text-sm sm:text-base break-words whitespace-normal">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="mt-1 text-xs sm:text-sm text-[rgba(234,240,255,0.70)] leading-5">{subtitle}</p>
            )}
          </div>
          {rightSlot && <div className="shrink-0">{rightSlot}</div>}
        </header>
      )}
      {children && <div className="px-4 sm:px-5 py-4">{children}</div>}
    </section>
  );
}

