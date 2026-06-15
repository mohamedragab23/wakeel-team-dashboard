/**
 * Drop-in replacements for alert() in client pages using Toast.
 * Usage: const notify = usePageNotify(); notify.success('...');
 */
'use client';

import { useToast } from '@/lib/providers/ToastProvider';

export function usePageNotify() {
  const { showSuccess, showError, showWarning } = useToast();
  return {
    success: (text: string) => showSuccess(text.replace(/^✅\s*/, '')),
    error: (text: string) => showError(text.replace(/^❌\s*/, '')),
    warning: (text: string) => showWarning(text.replace(/^⚠️\s*/, '')),
  };
}
