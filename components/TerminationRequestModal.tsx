'use client';

import { useEffect, useState } from 'react';
import { authFetch } from '@/lib/authFetch';
import AccessibleModal from '@/components/ui-v2/AccessibleModal';

type RiderRef = { code: string; name: string };

interface TerminationRequestModalProps {
  open: boolean;
  rider: RiderRef | null;
  onClose: () => void;
  onSuccess: () => void;
  onError: (message: string) => void;
}

/**
 * Owns its own textarea state so keystrokes never re-render the heavy
 * riders table page (that was causing typing lag in the reason field).
 */
export default function TerminationRequestModal({
  open,
  rider,
  onClose,
  onSuccess,
  onError,
}: TerminationRequestModalProps) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  // Reset when opened for a new rider / closed.
  useEffect(() => {
    if (open) {
      setReason('');
      setLoading(false);
    }
  }, [open, rider?.code]);

  const handleClose = () => {
    if (loading) return;
    setReason('');
    onClose();
  };

  const submit = async () => {
    if (!rider || !reason.trim()) {
      onError('الرجاء إدخال سبب الإقالة');
      return;
    }

    try {
      setLoading(true);
      const response = await authFetch('/api/termination-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          riderCode: rider.code?.toString().trim(),
          reason: reason.trim(),
        }),
      });
      const data = await response.json();
      if (data.success) {
        setReason('');
        onSuccess();
      } else {
        onError(data.error || 'فشل إرسال طلب الإقالة');
      }
    } catch (err: any) {
      onError(err?.message || 'حدث خطأ في الاتصال بالخادم');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AccessibleModal
      open={open && !!rider}
      onClose={handleClose}
      title="طلب إقالة مندوب"
      description={rider ? `${rider.name} (${rider.code})` : undefined}
    >
      {rider ? (
        <div className="space-y-4">
          <div>
            <label htmlFor="termination-reason" className="block text-sm font-medium text-[#EAF0FF] mb-2">
              سبب الإقالة <span className="text-red-400">*</span>
            </label>
            <textarea
              id="termination-reason"
              name="termination-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="أدخل سبب طلب الإقالة..."
              rows={4}
              autoFocus
              className="w-full px-4 py-2 border border-[rgba(255,255,255,0.15)] rounded-lg bg-[rgba(0,0,0,0.25)] text-[#EAF0FF] focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="px-4 py-2 border border-[rgba(255,255,255,0.2)] rounded-lg text-[#EAF0FF] hover:bg-[rgba(255,255,255,0.06)] disabled:opacity-50"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={loading || !reason.trim()}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              {loading ? 'جاري الإرسال...' : 'إرسال الطلب'}
            </button>
          </div>
        </div>
      ) : null}
    </AccessibleModal>
  );
}
