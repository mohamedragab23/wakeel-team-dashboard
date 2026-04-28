'use client';

import type { ReactNode } from 'react';
import { cn } from './cn';

type Variant = 'default' | 'success' | 'warning' | 'danger' | 'info';

type Props = {
  children: ReactNode;
  variant?: Variant;
  className?: string;
};

const variantClass: Record<Variant, string> = {
  default:
    'border-[rgba(255,255,255,0.10)] bg-[rgba(255,255,255,0.06)] text-[#EAF0FF]',
  success: 'border-[rgba(52,211,153,0.35)] bg-[rgba(52,211,153,0.12)] text-[#34D399]',
  warning: 'border-[rgba(251,191,36,0.35)] bg-[rgba(251,191,36,0.12)] text-[#FBBF24]',
  danger: 'border-[rgba(251,113,133,0.35)] bg-[rgba(251,113,133,0.12)] text-[#FB7185]',
  info: 'border-[rgba(0,245,255,0.35)] bg-[rgba(0,245,255,0.10)] text-[#00F5FF]',
};

export default function Badge({ children, variant = 'default', className }: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold',
        variantClass[variant],
        className
      )}
    >
      {children}
    </span>
  );
}

