'use client';

type ToastType = 'success' | 'error' | 'warning';

export interface ToastMessage {
  type: ToastType;
  text: string;
}

export default function Toast({
  message,
  position = 'bottom-left',
}: {
  message: ToastMessage | null;
  position?: 'bottom-left' | 'bottom-right';
}) {
  if (!message) return null;

  const positionClass = position === 'bottom-right' ? 'bottom-5 right-5' : 'bottom-5 left-5';
  const toneClass =
    message.type === 'success'
      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200'
      : message.type === 'warning'
        ? 'bg-amber-500/20 border-amber-500/40 text-amber-200'
        : 'bg-rose-500/20 border-rose-500/40 text-rose-200';

  return (
    <div className={`fixed ${positionClass} z-50`}>
      <div className={`min-w-[260px] max-w-[360px] px-4 py-3 rounded-xl shadow-lg border text-sm ${toneClass}`}>
        {message.text}
      </div>
    </div>
  );
}
