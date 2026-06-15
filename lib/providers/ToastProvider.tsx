'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import Toast, { type ToastMessage } from '@/components/ui-v2/Toast';

interface ToastContextValue {
  showToast: (type: ToastMessage['type'], text: string) => void;
  showSuccess: (text: string) => void;
  showError: (text: string) => void;
  showWarning: (text: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<ToastMessage | null>(null);

  const showToast = useCallback((type: ToastMessage['type'], text: string) => {
    setMessage({ type, text });
    window.setTimeout(() => setMessage(null), 4000);
  }, []);

  const showSuccess = useCallback((text: string) => showToast('success', text), [showToast]);
  const showError = useCallback((text: string) => showToast('error', text), [showToast]);
  const showWarning = useCallback((text: string) => showToast('warning', text), [showToast]);

  return (
    <ToastContext.Provider value={{ showToast, showSuccess, showError, showWarning }}>
      {children}
      <Toast message={message} position="bottom-right" />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      showToast: () => {},
      showSuccess: (text: string) => {
        if (typeof window !== 'undefined') window.alert(text);
      },
      showError: (text: string) => {
        if (typeof window !== 'undefined') window.alert(text);
      },
      showWarning: (text: string) => {
        if (typeof window !== 'undefined') window.alert(text);
      },
    };
  }
  return ctx;
}
