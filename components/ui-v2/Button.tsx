'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

type Variant = 'primary' | 'secondary' | 'ghost';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  variant?: Variant;
};

const variantClass: Record<Variant, string> = {
  primary:
    'bg-gradient-to-l from-[color:var(--v2-accent-cyan)] to-[color:var(--v2-accent-purple)] text-black shadow-[var(--v2-shadow-glow)]',
  secondary:
    'bg-[rgba(255,255,255,0.06)] text-[#EAF0FF] border border-[rgba(255,255,255,0.10)]',
  ghost: 'bg-transparent text-[#EAF0FF] hover:bg-[rgba(255,255,255,0.06)]',
};

export default function Button({
  leftIcon,
  rightIcon,
  variant = 'secondary',
  className,
  children,
  disabled,
  ...rest
}: Props) {
  return (
    <button
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-[var(--v2-radius-lg)] px-4 py-2 text-sm font-semibold',
        'transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[rgba(0,245,255,0.35)]',
        disabled ? 'opacity-50 cursor-not-allowed' : 'hover:brightness-110 active:brightness-95',
        variantClass[variant],
        className
      )}
      {...rest}
    >
      {leftIcon}
      <span className="truncate">{children}</span>
      {rightIcon}
    </button>
  );
}

