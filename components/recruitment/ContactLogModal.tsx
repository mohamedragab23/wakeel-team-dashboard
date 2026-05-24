'use client';

import { useState } from 'react';
import Button from '@/components/ui-v2/Button';
import type { Candidate } from '@/lib/recruitment/types';
import { CONTACT_STATUS_VALUES } from '@/lib/recruitment/types';

type Props = {
  candidate: Candidate | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
};

const inputClass =
  'w-full rounded-lg bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.12)] px-3 py-2 text-sm text-[#EAF0FF]';

export default function ContactLogModal({ candidate, open, onClose, onSaved }: Props) {
  const [contactStatus, setContactStatus] = useState<Candidate['contactStatus']>('تم التواصل');
  const [contactDate, setContactDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!open || !candidate) return null;

  const submit = async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/recruitment/candidates/${candidate.id}/contact`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ contactStatus, contactDate, notes }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'فشل التسجيل');
      onSaved();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'خطأ');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-[#0a0e18] border border-[rgba(255,255,255,0.12)] rounded-xl max-w-md w-full p-6">
        <h2 className="text-xl font-bold mb-2">تسجيل تواصل</h2>
        <p className="text-sm text-[rgba(234,240,255,0.7)] mb-4">
          {candidate.fullName} — {candidate.phone}
        </p>
        <div className="space-y-3">
          <label className="block">
            <span className="text-xs text-[rgba(234,240,255,0.65)]">نتيجة المكالمة</span>
            <select
              className={inputClass + ' mt-1'}
              value={contactStatus}
              onChange={(e) => setContactStatus(e.target.value as Candidate['contactStatus'])}
            >
              {CONTACT_STATUS_VALUES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-[rgba(234,240,255,0.65)]">تاريخ التواصل</span>
            <input
              type="date"
              className={inputClass + ' mt-1'}
              value={contactDate}
              onChange={(e) => setContactDate(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-xs text-[rgba(234,240,255,0.65)]">ملاحظات</span>
            <textarea
              className={inputClass + ' mt-1 min-h-[60px]'}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
        </div>
        {error && <p className="text-[#FB7185] text-sm mt-2">{error}</p>}
        <div className="flex gap-2 mt-6 justify-end">
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button variant="primary" onClick={submit} disabled={loading}>
            {loading ? 'جاري الحفظ...' : 'تسجيل'}
          </Button>
        </div>
      </div>
    </div>
  );
}
