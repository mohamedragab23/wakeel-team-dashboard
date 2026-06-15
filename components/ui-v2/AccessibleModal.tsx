'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';

interface AccessibleModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  maxWidthClass?: string;
}

export default function AccessibleModal({
  open,
  onClose,
  title,
  description,
  children,
  maxWidthClass = 'max-w-lg',
}: AccessibleModalProps) {
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={`w-full ${maxWidthClass} rounded-xl border border-[rgba(255,255,255,0.12)] bg-[#0f1524] shadow-2xl outline-none`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-2 border-b border-[rgba(255,255,255,0.08)]">
          <h2 id={titleId} className="text-lg font-semibold text-[#EAF0FF]">
            {title}
          </h2>
          {description ? (
            <p id={descId} className="mt-1 text-sm text-[rgba(234,240,255,0.78)]">
              {description}
            </p>
          ) : null}
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
